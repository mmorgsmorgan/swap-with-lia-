# Swap with Lia — Walkthrough

## What Was Built

A cross-chain DEX frontend ("Swap with Lia") connecting Ethereum Sepolia, Base Sepolia, and Ritual Chain with bridge + swap functionality, AI assistant, and liquidity pool management.

## Architecture

```
Frontend (Vite + Three.js)
├── index.html          — UI structure (Bridge & Swap, AI Swap, Pool tabs)
├── style.css           — Dark glassmorphism design system
├── main.js             — App logic, Three.js aurora background, UI state
└── web3.js             — MetaMask/EIP-1193 integration module

Backend (TypeScript)
├── packages/config/    — Shared chain configs, contract ABIs, addresses
├── packages/ai-agent/  — AI agent layer (OpenRouter/Gemini)
└── services/relayer/   — Bridge relayer (event listener + signer)

Contracts (Foundry)
├── WETH, WRITUAL       — Token contracts on Ritual
├── LiquidityPool       — Constant-product AMM (x*y=k)
├── SwapRouter          — Swap + liquidity router
├── BridgeLock          — Lock ETH on source chains
├── BridgeMint          — Mint WETH on Ritual
├── CrossChainSwap      — Atomic bridge+swap
├── IntentExecutor      — Multi-step coordinator
└── Treasury            — Fee collection
```

## Frontend Integration Summary

### web3.js Module
- **Wallet**: `connectWallet()`, `switchChain()`, MetaMask account/chain change listeners
- **Balances**: `getBalances()` — fetches ETH (Sepolia + Base), RITUAL native, WETH, LP tokens across all 3 chains
- **Swap**: `executeSwap()` — approve WETH + swap via SwapRouter, or send native RITUAL payable
- **Bridge**: `bridgeLockETH()` — lock ETH on source chain via BridgeLock contract
- **Bridge Return**: `bridgeBurnWETH()` — burn WETH on Ritual to unlock ETH on destination
- **Pool**: `addLiquidityRITUAL()` — approve WETH + add with native RITUAL
- **Pool**: `removeLiquidity()` — approve LP tokens + remove via SwapRouter

### Bridge Flow (From Chain → To Chain)
- ETH Sepolia → Ritual ✅ (Lock ETH → Relayer mints WETH or direct swaps to RITUAL)
- Base Sepolia → Ritual ✅ 
- Ritual → ETH Sepolia ✅ (Burn WETH → Relayer unlocks ETH)
- Ritual → Base Sepolia ✅
- Ritual → Ritual ✅ (On-chain WETH ↔ RITUAL swap)
- ETH ↔ Base ❌ (Disabled — no cross-L2 routes)

### Pool Tab
- **Add Liquidity**: WETH + RITUAL input form, approve + addLiquidityRITUAL
- **Remove Liquidity**: LP token input, live estimate of WETH + WRITUAL output
- **Your Position**: LP tokens held, pool share %
- **Pool Stats**: WETH/WRITUAL reserves, exchange rate, total LP supply (auto-refreshes every 30s)

### UI Features
- Animated aurora background (Three.js shader — lightweight sin/cos waves)
- Dark glassmorphism with purple/green/blue accent palette
- Toast notifications for TX success/failure
- Chain dropdown selectors with dot indicators
- Real-time swap quotes from on-chain contracts
- Wallet connection with account/chain change detection

## Verified
- `npx vite build` — compiles cleanly ✅
- Dev server at http://localhost:5173/ — runs without errors ✅
- All contract ABIs match deployed contracts ✅
