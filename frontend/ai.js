// ============================================================
// Lia — AI Intent Engine (real, on-chain)
// ------------------------------------------------------------
// Two-stage brain:
//   1. LLM (OpenRouter) turns free-form language into a strict JSON
//      intent — this is the "AI" the user talks to.
//   2. A deterministic dispatcher executes that intent against LIVE
//      chain data via web3.js and returns actions the chat can
//      run through the wallet.
// If the LLM is unavailable (no key / network / bad JSON) it falls back
// to a local regex parser, so the dApp still works offline.
//
// The return contract consumed by the chat UI is: { text, action? }
//   action = { label, chainId, run: async () => txHash }
// ============================================================

import { parseEther } from 'viem';
import {
  getBalances,
  getPoolStats,
  getSwapQuoteWei,
  getSwapQuote,
  executeSwap,
  bridgeLockETH,
  bridgeBurnWETH,
  addLiquidityRITUAL,
  removeLiquidity,
} from './web3.js';

const CHAIN_NAMES = { 11155111: 'Ethereum Sepolia', 84532: 'Base Sepolia', 1979: 'Ritual' };
const fmt = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 6 });

const OPENROUTER_KEY = (import.meta.env && import.meta.env.VITE_OPENROUTER_API_KEY) || '';
const OPENROUTER_MODEL = (import.meta.env && import.meta.env.VITE_OPENROUTER_MODEL) || 'google/gemini-2.5-flash';

// ============================================================
// Stage 1a — LLM intent parsing (OpenRouter)
// ============================================================
const SYSTEM_PROMPT = `You are Lia, the assistant for "Swap with Lia", a cross-chain DEX across Ethereum Sepolia (11155111), Base Sepolia (84532) and Ritual (1979).
Tokens: ETH (native on Ethereum/Base), WETH (bridged ETH on Ritual, ERC20), RITUAL (native gas on Ritual). WRITUAL is the wrapped form used inside the pool.
Flows:
- Bridge ETH -> Ritual: lock ETH on source; user gets WETH, or native RITUAL if they want it (directSwap).
- Swap on Ritual DEX: WETH <-> RITUAL.
- Return: burn WETH on Ritual -> unlock ETH on a source chain.
- Liquidity: add/remove WETH+RITUAL, earn 0.3% fees, LP token is RSLP.

Respond with ONLY a single JSON object, no prose, matching:
{
  "kind": "balances" | "pool" | "quote" | "swap" | "bridge" | "return" | "add" | "remove" | "chat",
  "amount": number | null,        // primary amount (WETH for add, LP for remove, ETH for bridge, etc.)
  "amount2": number | null,       // RITUAL amount for "add" liquidity only
  "direction": "weth_to_ritual" | "ritual_to_weth" | null,  // for quote/swap
  "sourceChain": "ethereum" | "base" | null,  // for bridge
  "destChain": "ethereum" | "base" | null,    // for return
  "wantRitual": true | false | null,          // bridge: true if user wants native RITUAL out
  "reply": string                             // one short, friendly sentence for the user
}
Rules: never invent amounts (use null if unspecified). Bridging always targets Ritual. If the user wants RITUAL from ETH -> kind="bridge", wantRitual=true. Withdraw/return to a source chain -> kind="return". Provide/add liquidity -> kind="add" (amount=WETH, amount2=RITUAL). Greetings or general questions -> kind="chat" with a helpful reply.`;

async function llmIntent(message, ctx) {
  if (!OPENROUTER_KEY) return null;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'https://ritual-swap.local',
        'X-Title': 'Swap with Lia',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Connected wallet: ${ctx?.wallet || 'not connected'}\nUser message: ${message}` },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    let txt = data?.choices?.[0]?.message?.content;
    if (!txt) return null;
    txt = txt.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    return normalizeIntent(JSON.parse(txt));
  } catch {
    return null;
  }
}

function toNum(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

function normalizeIntent(p) {
  if (!p || typeof p !== 'object' || !p.kind) return null;
  const dir = p.direction === 'weth_to_ritual' ? true : p.direction === 'ritual_to_weth' ? false : null;
  return {
    kind: p.kind,
    amount: toNum(p.amount),
    amount2: toNum(p.amount2),
    dir,
    src: p.sourceChain === 'base' ? 84532 : p.sourceChain === 'ethereum' ? 11155111 : null,
    dest: p.destChain === 'base' ? 84532 : p.destChain === 'ethereum' ? 11155111 : null,
    wantRitual: typeof p.wantRitual === 'boolean' ? p.wantRitual : null,
    reply: typeof p.reply === 'string' ? p.reply : '',
  };
}

// ============================================================
// Stage 1b — local regex fallback (no key / offline)
// ============================================================
function numbersIn(text) { return (text.match(/\d+(?:\.\d+)?/g) || []).map(Number); }
function hasToken(text, token) { return new RegExp(`\\b${token}\\b`, 'i').test(text); }
function localDirection(text) {
  const t = text.toLowerCase();
  if (/ritual\s*(?:->|→|to|for|into)\s*weth/.test(t)) return false;
  if (/weth\s*(?:->|→|to|for|into)\s*ritual/.test(t)) return true;
  const wi = t.indexOf('weth'), ri = t.indexOf('ritual');
  if (wi === -1 && ri === -1) return null;
  if (wi === -1) return false;
  if (ri === -1) return true;
  return wi < ri;
}

function localIntent(text) {
  const t = text.toLowerCase();
  const nums = numbersIn(text);
  const amt = nums.length ? nums[0] : null;
  const src = /\bbase\b/i.test(text) ? 84532 : 11155111;
  const dest = /\bbase\b/i.test(text) ? 84532 : 11155111;

  if (/\b(balance|balances|holdings|portfolio|how much do i)\b/.test(t)) return { kind: 'balances' };
  if (/\b(pool|reserves|rate|price|exchange rate)\b/.test(t) && !/\badd\b|\bremove\b|\bprovide\b/.test(t)) return { kind: 'pool' };
  if ((/\badd\b.*\bliquid/.test(t)) || (/\bprovide\b/.test(t) && /liquid/.test(t))) return { kind: 'add', amount: nums[0] ?? null, amount2: nums[1] ?? null };
  if (/\bremove\b.*\bliquid|\bwithdraw\b.*\blp|\bremove\b.*\blp|\bburn\b.*\blp/.test(t)) return { kind: 'remove', amount: amt };
  if (/\b(return|withdraw|unlock)\b/.test(t) && hasToken(t, 'weth')) return { kind: 'return', amount: amt, dest };
  if (/\bburn\b/.test(t) && hasToken(t, 'weth')) return { kind: 'return', amount: amt, dest };
  if (/\bbridge\b/.test(t) || (/\bmove\b/.test(t) && hasToken(t, 'eth') && /ritual/.test(t))) {
    const wantRitual = /native|to ritual|for ritual|and swap|as ritual/i.test(text) && !/to weth|as weth/i.test(text);
    return { kind: 'bridge', amount: amt, src, wantRitual };
  }
  if (/\b(swap|convert|trade|exchange|sell|buy)\b/.test(t) && (hasToken(t, 'weth') || hasToken(t, 'ritual'))) return { kind: 'swap', amount: amt, dir: localDirection(text) };
  if (/\b(quote|how much|estimate|worth)\b/.test(t) && (hasToken(t, 'weth') || hasToken(t, 'ritual'))) return { kind: 'quote', amount: amt, dir: localDirection(text) };
  return { kind: 'chat' };
}

// ============================================================
// Stage 2 — dispatch an intent to live on-chain reads / actions
// ============================================================
function needWallet() {
  return { text: `Please **connect your wallet** first (top-right) so I can do that on-chain.` };
}
const HELP_TEXT =
  `I'm **Lia** — I read live chain data and can execute for you. Try:\n\n` +
  `• *"What are my balances?"*\n` +
  `• *"Quote 0.1 WETH to RITUAL"*\n` +
  `• *"Swap 0.1 WETH to RITUAL"*\n` +
  `• *"Bridge 0.05 ETH from Base to Ritual"*\n` +
  `• *"Add liquidity 0.1 WETH and 0.004 RITUAL"*\n` +
  `• *"Return 0.1 WETH to Ethereum"*\n` +
  `• *"Show the pool rate"*`;

async function dispatchIntent(intent, ctx) {
  const wallet = ctx?.wallet;
  const pre = intent.reply ? intent.reply.trim() + '\n\n' : '';

  switch (intent.kind) {
    case 'balances': {
      if (!wallet) return needWallet();
      const b = await getBalances(wallet);
      return {
        text:
          `Here are your live balances:\n\n` +
          `• **ETH (Sepolia)**: ${fmt(b.ethSepolia)}\n` +
          `• **ETH (Base)**: ${fmt(b.ethBase)}\n` +
          `• **RITUAL (native)**: ${fmt(b.ritual)}\n` +
          `• **WETH (Ritual)**: ${fmt(b.weth)}\n` +
          `• **LP tokens**: ${fmt(b.lp)} RSLP`,
      };
    }

    case 'pool': {
      const s = await getPoolStats();
      const ritualPerWeth = s.reserveWETH > 0 ? s.reserveWRITUAL / s.reserveWETH : 0;
      return {
        text:
          pre +
          `Live WETH/WRITUAL pool on Ritual:\n\n` +
          `• **Reserves**: ${fmt(s.reserveWETH)} WETH / ${fmt(s.reserveWRITUAL)} WRITUAL\n` +
          `• **Rate**: 1 WETH ≈ ${fmt(ritualPerWeth)} RITUAL  (1 RITUAL ≈ ${fmt(s.rate)} WETH)\n` +
          `• **Total LP supply**: ${fmt(s.totalSupply)} RSLP`,
      };
    }

    case 'quote': {
      if (intent.amount == null || intent.dir == null) return { text: pre + `Tell me an amount and direction, e.g. *"quote 0.1 WETH to RITUAL"*.` };
      const quote = await getSwapQuote(intent.amount, intent.dir);
      return { text: `${pre}**${fmt(intent.amount)} ${intent.dir ? 'WETH' : 'RITUAL'}** ≈ **${fmt(quote)} ${intent.dir ? 'RITUAL' : 'WETH'}** right now.` };
    }

    case 'swap': {
      if (intent.amount == null || intent.dir == null) return { text: pre + `Tell me the amount and direction, e.g. *"swap 0.1 WETH to RITUAL"*.` };
      const inSym = intent.dir ? 'WETH' : 'RITUAL';
      const outSym = intent.dir ? 'RITUAL' : 'WETH';
      const quote = await getSwapQuote(intent.amount, intent.dir);
      if (!wallet) return { text: `${pre}**${fmt(intent.amount)} ${inSym}** ≈ **${fmt(quote)} ${outSym}** now. Connect your wallet and I'll execute it.` };
      const quoteWei = await getSwapQuoteWei(parseEther(String(intent.amount)), intent.dir);
      const minOutWei = (quoteWei * 99n) / 100n;
      return {
        text: `${pre}Swap **${fmt(intent.amount)} ${inSym} → ~${fmt(quote)} ${outSym}** (1% slippage). Confirm below${intent.dir ? " — I'll approve WETH first" : ''}.`,
        action: { label: `Swap ${fmt(intent.amount)} ${inSym} → ${outSym}`, chainId: 1979, run: () => executeSwap(intent.dir, intent.amount, minOutWei) },
      };
    }

    case 'bridge': {
      if (intent.amount == null) return { text: pre + `How much ETH should I bridge? e.g. *"bridge 0.1 ETH from Base to Ritual"*.` };
      if (!wallet) return needWallet();
      const src = intent.src || 11155111;
      const wantRitual = !!intent.wantRitual;
      const pathTxt = wantRitual
        ? `lock ETH → auto-bridge → auto-swap → you receive **RITUAL**`
        : `lock ETH → relayer mints **WETH** on Ritual`;
      return {
        text: `${pre}Bridge **${fmt(intent.amount)} ETH** from ${CHAIN_NAMES[src]}: ${pathTxt}. ~60s via relayer.`,
        action: { label: `Bridge ${fmt(intent.amount)} ETH → Ritual`, chainId: src, run: () => bridgeLockETH(src, intent.amount, wallet, wantRitual) },
      };
    }

    case 'return': {
      if (intent.amount == null) return { text: pre + `How much WETH should I burn to unlock ETH? e.g. *"return 0.1 WETH to Base"*.` };
      if (!wallet) return needWallet();
      const dest = intent.dest || 11155111;
      return {
        text: `${pre}Burn **${fmt(intent.amount)} WETH** on Ritual → relayer unlocks **${fmt(intent.amount)} ETH** on ${CHAIN_NAMES[dest]} (~60s). I'll approve WETH first.`,
        action: { label: `Burn ${fmt(intent.amount)} WETH → ${CHAIN_NAMES[dest]}`, chainId: 1979, run: () => bridgeBurnWETH(intent.amount, dest) },
      };
    }

    case 'add': {
      if (intent.amount == null || intent.amount2 == null) return { text: pre + `To add liquidity, give me both sides, e.g. *"add liquidity 0.1 WETH and 0.004 RITUAL"*.` };
      if (!wallet) return needWallet();
      return {
        text: `${pre}Add **${fmt(intent.amount)} WETH + ${fmt(intent.amount2)} RITUAL** to the pool. Confirm below — I'll approve WETH then deposit both.`,
        action: { label: `Add ${fmt(intent.amount)} WETH + ${fmt(intent.amount2)} RITUAL`, chainId: 1979, run: () => addLiquidityRITUAL(intent.amount, intent.amount2) },
      };
    }

    case 'remove': {
      if (intent.amount == null) return { text: pre + `How many LP tokens (RSLP) should I remove? e.g. *"remove 0.05 LP"*.` };
      if (!wallet) return needWallet();
      const s = await getPoolStats();
      const share = s.totalSupply > 0 ? intent.amount / s.totalSupply : 0;
      return {
        text: `${pre}Remove **${fmt(intent.amount)} RSLP** (~${(share * 100).toFixed(2)}% of the pool) → ~**${fmt(s.reserveWETH * share)} WETH + ${fmt(s.reserveWRITUAL * share)} RITUAL**.`,
        action: { label: `Remove ${fmt(intent.amount)} LP`, chainId: 1979, run: () => removeLiquidity(intent.amount) },
      };
    }

    case 'chat':
    default:
      return { text: intent.reply ? intent.reply : HELP_TEXT };
  }
}

// ============================================================
// Public entry
// ============================================================
export async function runLia(message, ctx) {
  const text = (message || '').trim();
  if (!text) return { text: HELP_TEXT };
  try {
    const intent = (await llmIntent(text, ctx)) || localIntent(text);
    return await dispatchIntent(intent, ctx);
  } catch (err) {
    return { text: `⚠️ ${err?.shortMessage || err?.message || 'Something went wrong.'}` };
  }
}
