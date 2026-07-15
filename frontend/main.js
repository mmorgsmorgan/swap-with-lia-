import * as THREE from 'three';
import { parseEther } from 'viem';
import {
  connectWallet as web3Connect,
  switchChain,
  getBalances,
  getBalanceForChain,
  getPoolStats,
  getSwapQuote,
  getSwapQuoteWei,
  executeSwap,
  bridgeLockETH,
  bridgeBurnWETH,
  addLiquidityRITUAL,
  removeLiquidity,
  explorerTx,
  waitForTx,
  wethBalanceWei,
  checkBridgeStatus,
  checkReturnStatus,
} from './web3.js';
import { runLia } from './ai.js';

// ============================================================
// Three.js Animated Background
// ============================================================

function initBackground() {
  const canvas = document.getElementById('bg-canvas');
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform float uTime;
      uniform vec2 uMouse;
      uniform vec2 uResolution;
      varying vec2 vUv;

      void main() {
        vec2 uv = vUv;
        float aspect = uResolution.x / uResolution.y;
        vec2 p = vec2(uv.x * aspect, uv.y);
        float t = uTime * 0.15;

        vec2 m = (uMouse - 0.5) * 0.3;

        float w1 = sin(p.x * 2.0 + t + m.x * 3.0) * cos(p.y * 3.0 - t * 0.7) * 0.5;
        float w2 = sin(p.x * 3.5 - t * 0.8 + 1.5) * cos(p.y * 2.0 + t * 0.5 + m.y * 2.0) * 0.3;
        float w3 = sin(p.x * 1.5 + p.y * 2.5 + t * 0.6) * 0.4;
        float w4 = cos(p.x * 4.0 - p.y * 1.5 - t * 0.9 + 3.0) * 0.2;

        float wave = w1 + w2 + w3 + w4;

        vec3 bgDark = vec3(0.04, 0.02, 0.08);
        vec3 purple = vec3(0.12, 0.04, 0.22);
        vec3 emerald = vec3(0.02, 0.12, 0.10);
        vec3 blue = vec3(0.04, 0.06, 0.16);

        float n = wave * 0.5 + 0.5;
        vec3 color = bgDark;
        color += purple * smoothstep(0.3, 0.6, n) * 0.7;
        color += emerald * smoothstep(0.5, 0.8, n) * 0.5;
        color += blue * smoothstep(0.2, 0.5, 1.0 - n) * 0.4;

        float streak1 = smoothstep(0.02, 0.0, abs(wave - 0.1));
        float streak2 = smoothstep(0.03, 0.0, abs(wave + 0.2));
        color += vec3(0.35, 0.15, 0.65) * streak1 * 0.3;
        color += vec3(0.1, 0.5, 0.35) * streak2 * 0.25;

        float vig = 1.0 - smoothstep(0.2, 1.3, length(uv - 0.5) * 1.6);
        color *= vig;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  const mouse = new THREE.Vector2(0.5, 0.5);
  const targetMouse = new THREE.Vector2(0.5, 0.5);

  window.addEventListener('mousemove', (e) => {
    targetMouse.x = e.clientX / window.innerWidth;
    targetMouse.y = 1.0 - e.clientY / window.innerHeight;
  });

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    mat.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    mouse.lerp(targetMouse, 0.05);
    mat.uniforms.uTime.value = clock.getElapsedTime();
    mat.uniforms.uMouse.value = mouse;
    renderer.render(scene, camera);
  }

  animate();
}

// ============================================================
// Contract Addresses & Config
// ============================================================
const CONTRACTS = {
  ritual: {
    weth: '0xB0744700a04A33536B91604Bf5C423e3FB97883E',
    writual: '0xD542E471cB699b7A7C0dafE382E6Dc89506fcc18',
    swapRouter: '0xf27b0c56452443F5306C5904100A0fde6F23577B',
    liquidityPool: '0xe186d9A14C70302fe71d10fE225CE44CB076c285',
    bridgeMint: '0xC4b66348DfF821874C9B98aAb1775F8667EED7E9',
    crossChainSwap: '0xD05d9C7F68965Da382937f3F1760d13f69D887F3',
  },
  ethereumSepolia: { bridgeLock: '0x04fC7cDa5178fd86a0BbB3F6bbc1A765e0a8Fc35' },
  baseSepolia: { bridgeLock: '0xa7376704830A1d71cF45Ff698564656E79bf6B61' },
};

const CHAINS = {
  11155111: { name: 'Ethereum Sepolia', rpc: 'https://ethereum-sepolia-rpc.publicnode.com', symbol: 'ETH', explorer: 'https://sepolia.etherscan.io' },
  84532: { name: 'Base Sepolia', rpc: 'https://sepolia.base.org', symbol: 'ETH', explorer: 'https://sepolia.basescan.org' },
  1979: { name: 'Ritual', rpc: 'https://rpc.ritualfoundation.org', symbol: 'RITUAL', explorer: 'https://explorer.ritual.foundation' },
};

const TOKENS = {
  1979: [
    { symbol: 'WETH', name: 'Wrapped ETH (Bridged)', icon: 'Ξ', address: CONTRACTS.ritual.weth, decimals: 18 },
    { symbol: 'RITUAL', name: 'Native RITUAL', icon: '◈', address: null, decimals: 18, isNative: true },
  ],
  11155111: [
    { symbol: 'ETH', name: 'Ether', icon: 'Ξ', address: null, decimals: 18, isNative: true },
  ],
  84532: [
    { symbol: 'ETH', name: 'Ether', icon: 'Ξ', address: null, decimals: 18, isNative: true },
  ],
};

// ============================================================
// App State
// ============================================================
let state = {
  wallet: null,
  fromChainId: 11155111,
  toChainId: 1979,
  fromToken: TOKENS[11155111][0],
  toToken: TOKENS[1979][1],
  activeTab: 'dex',
  selectingFor: null,
  balances: null,
};

const CHAIN_DOT_CLASS = { 11155111: 'eth', 84532: 'base', 1979: 'ritual' };

// ============================================================
// Tab Navigation
// ============================================================
function initTabs() {
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(link.dataset.tab);
    });
  });
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.nav-link').forEach((l) => l.classList.remove('active'));
  document.querySelector(`.nav-link[data-tab="${tab}"]`)?.classList.add('active');
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
  document.getElementById(`tab-${tab}`)?.classList.add('active');
}

// ============================================================
// Chain Selectors (Bridge Flow)
// ============================================================
const CHAIN_OPTIONS = [
  { id: 11155111, name: 'Ethereum Sepolia', dot: 'eth' },
  { id: 84532, name: 'Base Sepolia', dot: 'base' },
  { id: 1979, name: 'Ritual Chain', dot: 'ritual' },
];

let fromDD, toDD;

// Custom dropdown component (replaces the native <select> so it matches the design).
function initChainDropdown(rootId, onChange) {
  const root = document.getElementById(rootId);
  if (!root) return null;
  const trigger = root.querySelector('.chain-dd-trigger');
  const menu = root.querySelector('.chain-dd-menu');
  const labelEl = trigger.querySelector('.chain-dd-label');
  const dotEl = trigger.querySelector('.chain-dot');
  let value = parseInt(root.dataset.value);
  let disabled = new Set();

  function render() {
    menu.innerHTML = CHAIN_OPTIONS.map((o) => `
      <button class="chain-dd-option ${o.id === value ? 'selected' : ''}" data-id="${o.id}" ${disabled.has(o.id) ? 'disabled' : ''} role="option">
        <span class="chain-dot ${o.dot}"></span>
        <span>${o.name}</span>
        <svg class="chain-dd-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </button>`).join('');
    menu.querySelectorAll('.chain-dd-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.hasAttribute('disabled')) return;
        setValue(parseInt(btn.dataset.id));
        close();
        onChange(value);
      });
    });
    const cur = CHAIN_OPTIONS.find((o) => o.id === value);
    if (cur) { labelEl.textContent = cur.name; dotEl.className = 'chain-dot ' + cur.dot; }
  }

  function open() { root.classList.add('open'); trigger.setAttribute('aria-expanded', 'true'); }
  function close() { root.classList.remove('open'); trigger.setAttribute('aria-expanded', 'false'); }
  function setValue(id) { value = id; root.dataset.value = id; render(); }
  function setDisabled(ids) { disabled = new Set(ids); render(); }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = !root.classList.contains('open');
    document.querySelectorAll('.chain-dd.open').forEach((el) => el.classList.remove('open'));
    if (willOpen) open();
  });
  document.addEventListener('click', (e) => { if (!root.contains(e.target)) close(); });

  render();
  return { get value() { return value; }, setValue, setDisabled, close };
}

function initChainSelector() {
  fromDD = initChainDropdown('from-chain-dd', (id) => {
    state.fromChainId = id;
    enforceValidRoute('from');
    updateToChainOptions();
    updateTokensForRoute();
    updateQuote();
  });
  toDD = initChainDropdown('to-chain-dd', (id) => {
    state.toChainId = id;
    enforceValidRoute('to');
    updateFromChainOptions();
    updateTokensForRoute();
    updateQuote();
  });
}

function enforceValidRoute(changed) {
  // Valid routes: ETH↔Ritual, Base↔Ritual, Ritual↔Ritual. No ETH↔Base.
  if (changed === 'from') {
    if (state.fromChainId !== 1979 && state.toChainId !== 1979) {
      state.toChainId = 1979;
      toDD?.setValue(1979);
    }
  } else {
    if (state.toChainId !== 1979 && state.fromChainId !== 1979) {
      state.fromChainId = 1979;
      fromDD?.setValue(1979);
    }
  }
}

function updateToChainOptions() {
  // If source is ETH/Base, destination must be Ritual.
  toDD?.setDisabled(state.fromChainId !== 1979 ? [11155111, 84532] : []);
}

function updateFromChainOptions() {
  // If destination is ETH/Base, source must be Ritual.
  fromDD?.setDisabled(state.toChainId !== 1979 ? [11155111, 84532] : []);
}

function updateTokensForRoute() {
  const fromTokens = TOKENS[state.fromChainId] || [];
  const toTokens = TOKENS[state.toChainId] || [];
  state.fromToken = fromTokens[0];

  if (state.fromChainId === state.toChainId && state.fromChainId === 1979) {
    // Same-chain Ritual swap: keep the current WETH/RITUAL pair (so a flip
    // actually reverses direction) as long as it's a valid opposing pair.
    const fs = state.fromToken?.symbol, ts = state.toToken?.symbol;
    const validPair = (fs === 'WETH' && ts === 'RITUAL') || (fs === 'RITUAL' && ts === 'WETH');
    if (!validPair) {
      state.fromToken = TOKENS[1979][0];
      state.toToken = TOKENS[1979][1];
    }
  } else if (state.toChainId === 1979) {
    state.toToken = toTokens.length > 1 ? toTokens[1] : toTokens[0];
  } else {
    state.fromToken = TOKENS[1979][0];
    state.toToken = toTokens[0];
  }
  updateTokenDisplay();
  updateBalanceDisplay();
  updateSwapButton();
}

function updateTokenDisplay() {
  document.getElementById('from-token-name').textContent = state.fromToken?.symbol || '—';
  document.getElementById('to-token-name').textContent = state.toToken?.symbol || '—';
  const fromIcon = document.querySelector('#from-token-btn .token-icon');
  const toIcon = document.querySelector('#to-token-btn .token-icon');
  if (fromIcon) fromIcon.textContent = state.fromToken?.icon || '?';
  if (toIcon) toIcon.textContent = state.toToken?.icon || '?';
}

// ============================================================
// Swap Direction (flip chains)
// ============================================================
function initSwapDirection() {
  document.getElementById('swap-direction-btn')?.addEventListener('click', () => {
    const tempChain = state.fromChainId;
    state.fromChainId = state.toChainId;
    state.toChainId = tempChain;

    // Flip the tokens as well so direction actually reverses (and the balance
    // labels follow); updateTokensForRoute() then reconciles them to the route.
    const tempTok = state.fromToken;
    state.fromToken = state.toToken;
    state.toToken = tempTok;

    fromDD?.setValue(state.fromChainId);
    toDD?.setValue(state.toChainId);
    updateToChainOptions();
    updateFromChainOptions();
    updateTokensForRoute();

    const fromInput = document.getElementById('from-amount');
    const toInput = document.getElementById('to-amount');
    const tempVal = fromInput.value;
    fromInput.value = toInput.value;
    toInput.value = tempVal;

    updateQuote();
    updateBalanceDisplay();
  });
}

// ============================================================
// Token Modal
// ============================================================
function initTokenModal() {
  document.getElementById('from-token-btn')?.addEventListener('click', () => openTokenModal('from'));
  document.getElementById('to-token-btn')?.addEventListener('click', () => openTokenModal('to'));
  document.getElementById('modal-close')?.addEventListener('click', closeTokenModal);
  document.getElementById('token-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'token-modal') closeTokenModal();
  });
}

function openTokenModal(selectFor) {
  state.selectingFor = selectFor;
  const modal = document.getElementById('token-modal');
  const list = document.getElementById('token-list');
  const chainId = selectFor === 'from' ? state.fromChainId : state.toChainId;
  const tokens = TOKENS[chainId] || [];

  list.innerHTML = tokens.map((t) => `
    <button class="token-option" data-symbol="${t.symbol}">
      <span class="token-option-icon">${t.icon}</span>
      <div class="token-option-info">
        <div class="token-option-symbol">${t.symbol}</div>
        <div class="token-option-name">${t.name}</div>
      </div>
    </button>
  `).join('');

  list.querySelectorAll('.token-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      const symbol = opt.dataset.symbol;
      const token = tokens.find((t) => t.symbol === symbol);
      if (token) {
        if (state.selectingFor === 'from') state.fromToken = token;
        else state.toToken = token;
        updateTokenDisplay();
        updateBalanceDisplay();
        closeTokenModal();
        updateQuote();
      }
    });
  });

  modal.style.display = 'flex';
}

function closeTokenModal() {
  document.getElementById('token-modal').style.display = 'none';
}

// ============================================================
// Swap Quote
// ============================================================
function initSwapInput() {
  const fromInput = document.getElementById('from-amount');
  let debounce;
  fromInput?.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(updateQuote, 300);
    updateSwapButton();
  });

  document.getElementById('from-max')?.addEventListener('click', () => {
    if (!state.balances) return;
    let bal = 0;
    let isNative = true;
    if (state.fromChainId === 11155111) bal = state.balances.ethSepolia;
    else if (state.fromChainId === 84532) bal = state.balances.ethBase;
    else if (state.fromChainId === 1979) {
      if (state.fromToken?.symbol === 'WETH') { bal = state.balances.weth; isNative = false; }
      else bal = state.balances.ritual;
    }
    // keep a little native for gas
    const usable = isNative ? Math.max(0, bal - 0.001) : bal;
    document.getElementById('from-amount').value = usable > 0 ? String(usable) : '';
    updateQuote();
  });
}

async function updateQuote() {
  const amount = document.getElementById('from-amount')?.value;
  if (!amount || parseFloat(amount) <= 0) {
    document.getElementById('to-amount').value = '';
    document.getElementById('price-info').style.display = 'none';
    return;
  }

  const isSameChain = state.fromChainId === state.toChainId;
  const isBridgeToRitual = state.toChainId === 1979 && state.fromChainId !== 1979;
  const isBridgeFromRitual = state.fromChainId === 1979 && state.toChainId !== 1979;

  if (isSameChain && state.fromChainId === 1979) {
    try {
      const isWethToRitual = state.fromToken?.symbol === 'WETH';
      const out = await getSwapQuote(amount, isWethToRitual);
      document.getElementById('to-amount').value = out.toFixed(6);
      document.getElementById('route-info').textContent = isWethToRitual
        ? 'WETH → WRITUAL → RITUAL'
        : 'RITUAL → WRITUAL → WETH';
      document.getElementById('exchange-rate').textContent =
        `1 ${state.fromToken.symbol} = ${(out / parseFloat(amount)).toFixed(4)} ${state.toToken.symbol}`;
      document.getElementById('est-time').textContent = '~5 seconds';
      document.getElementById('price-info').style.display = 'block';
    } catch (err) {
      console.error('Quote error:', err);
    }
  } else if (isBridgeToRitual) {
    const directSwap = state.toToken?.symbol === 'RITUAL';
    if (directSwap) {
      try {
        const out = await getSwapQuote(amount, true);
        document.getElementById('to-amount').value = out.toFixed(6);
      } catch { document.getElementById('to-amount').value = parseFloat(amount).toFixed(6); }
      document.getElementById('route-info').textContent =
        `${CHAINS[state.fromChainId].name} → Lock ETH → Mint WETH → Swap → RITUAL`;
    } else {
      document.getElementById('to-amount').value = parseFloat(amount).toFixed(6);
      document.getElementById('route-info').textContent =
        `${CHAINS[state.fromChainId].name} → Lock ETH → Mint WETH on Ritual`;
    }
    document.getElementById('exchange-rate').textContent = directSwap ? 'Live pool rate' : '1 ETH = 1 WETH';
    document.getElementById('est-time').textContent = '~60 seconds (relayer)';
    document.getElementById('price-info').style.display = 'block';
  } else if (isBridgeFromRitual) {
    const fromIsRitual = state.fromToken?.symbol === 'RITUAL';
    if (fromIsRitual) {
      // RITUAL must be swapped to WETH through the pool first, then burned 1:1 to ETH.
      try {
        const wethOut = await getSwapQuote(amount, false); // RITUAL → WETH (pool)
        document.getElementById('to-amount').value = wethOut.toFixed(6);
        document.getElementById('exchange-rate').textContent =
          `1 RITUAL ≈ ${(wethOut / parseFloat(amount)).toFixed(4)} ETH (pool)`;
      } catch {
        document.getElementById('to-amount').value = '';
        document.getElementById('exchange-rate').textContent = 'Live pool rate';
      }
      document.getElementById('route-info').textContent =
        `Ritual → Swap RITUAL→WETH → Burn → Unlock ETH on ${CHAINS[state.toChainId].name}`;
    } else {
      // WETH burns 1:1 to ETH.
      document.getElementById('to-amount').value = parseFloat(amount).toFixed(6);
      document.getElementById('route-info').textContent =
        `Ritual → Burn WETH → Unlock ETH on ${CHAINS[state.toChainId].name}`;
      document.getElementById('exchange-rate').textContent = '1 WETH = 1 ETH';
    }
    document.getElementById('est-time').textContent = '~60 seconds (relayer)';
    document.getElementById('price-info').style.display = 'block';
  } else {
    document.getElementById('to-amount').value = amount;
    document.getElementById('price-info').style.display = 'none';
  }

  updateSwapButton();
}

function updateSwapButton() {
  const btn = document.getElementById('swap-btn');
  const amount = document.getElementById('from-amount')?.value;
  const isBridge = state.fromChainId !== state.toChainId;

  if (!state.wallet) {
    btn.innerHTML = '<span>Connect Wallet</span>';
    btn.disabled = true;
  } else if (!amount || parseFloat(amount) <= 0) {
    btn.innerHTML = '<span>Enter an amount</span>';
    btn.disabled = true;
  } else if (isBridge) {
    const fromName = CHAINS[state.fromChainId]?.name || 'Source';
    const toName = CHAINS[state.toChainId]?.name || 'Dest';
    btn.innerHTML = `<span>Bridge ${fromName} → ${toName}</span>`;
    btn.disabled = false;
  } else {
    btn.innerHTML = '<span>Swap</span>';
    btn.disabled = false;
  }
}

// ============================================================
// Wallet Connection (MetaMask / EIP-1193)
// ============================================================
function showToast(msg, type = 'info', link) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  if (link) {
    toast.innerHTML = `${msg} <a href="${link}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">view ↗</a>`;
  } else {
    toast.textContent = msg;
  }
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 7000);
}

function initWallet() {
  const btn = document.getElementById('connect-wallet');
  btn?.addEventListener('click', doConnect);

  document.getElementById('swap-btn')?.addEventListener('click', async () => {
    if (!state.wallet) { await doConnect(); return; }
    await executeSwapOrBridge();
  });

  if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        state.wallet = null;
        const b = document.getElementById('connect-wallet');
        b.classList.remove('connected');
        b.querySelector('.btn-text').textContent = 'Connect Wallet';
        updateSwapButton();
      } else {
        state.wallet = accounts[0];
        updateWalletUI();
        loadAllBalances();
      }
    });
    window.ethereum.on('chainChanged', () => loadAllBalances());
  }
}

async function doConnect() {
  try {
    const addr = await web3Connect();
    if (addr) {
      state.wallet = addr;
      updateWalletUI();
      loadAllBalances();
      updateSwapButton();
      renderHistory();
    }
  } catch (err) {
    console.error('Wallet connect error:', err);
    showToast('Failed to connect wallet', 'error');
  }
}

function updateWalletUI() {
  const btn = document.getElementById('connect-wallet');
  btn.classList.add('connected');
  btn.querySelector('.btn-text').textContent =
    `${state.wallet.slice(0, 6)}…${state.wallet.slice(-4)}`;
}

// ============================================================
// Balances
// ============================================================
async function loadAllBalances() {
  if (!state.wallet) return;
  try {
    const bals = await getBalances(state.wallet);
    state.balances = bals;
    updateBalanceDisplay();

    document.getElementById('pool-weth-balance').textContent = `Balance: ${bals.weth.toFixed(4)}`;
    document.getElementById('pool-ritual-balance').textContent = `Balance: ${bals.ritual.toFixed(4)}`;
    document.getElementById('pool-lp-balance').textContent = `Balance: ${bals.lp.toFixed(6)}`;

    if (bals.lp > 0) {
      document.getElementById('your-position').style.display = 'block';
      document.getElementById('your-lp').textContent = bals.lp.toFixed(6) + ' RSLP';
    } else {
      document.getElementById('your-position').style.display = 'none';
    }
    loadPoolStats();
  } catch (err) {
    console.error('Balance error:', err);
  }
}

function balanceFor(side) {
  const bals = state.balances;
  const chainId = side === 'from' ? state.fromChainId : state.toChainId;
  const token = side === 'from' ? state.fromToken : state.toToken;
  if (!bals) return null;
  if (chainId === 11155111) return { amt: bals.ethSepolia, sym: 'ETH' };
  if (chainId === 84532) return { amt: bals.ethBase, sym: 'ETH' };
  // Ritual: WETH or native RITUAL depending on the selected token
  if (token?.symbol === 'WETH') return { amt: bals.weth, sym: 'WETH' };
  return { amt: bals.ritual, sym: 'RITUAL' };
}

function renderBalance(elId, side) {
  const el = document.getElementById(elId);
  if (!el) return;
  const b = balanceFor(side);
  if (!b) { el.textContent = 'Balance: —'; return; }
  el.innerHTML = `Balance: <span class="bal-amt">${b.amt.toFixed(4)}</span> ${b.sym}`;
}

function updateBalanceDisplay() {
  renderBalance('from-balance', 'from');
  renderBalance('to-balance', 'to');
}

// ============================================================
// Execute Swap or Bridge
// ============================================================
async function executeSwapOrBridge() {
  const amount = document.getElementById('from-amount')?.value;
  if (!amount || parseFloat(amount) <= 0) return;

  const btn = document.getElementById('swap-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span>⏳ Confirming...</span>';
  btn.disabled = true;

  try {
    const isSameChain = state.fromChainId === state.toChainId;
    const isBridgeToRitual = state.toChainId === 1979 && state.fromChainId !== 1979;
    const isBridgeFromRitual = state.fromChainId === 1979 && state.toChainId !== 1979;

    if (isSameChain && state.fromChainId === 1979) {
      const isWethToRitual = state.fromToken?.symbol === 'WETH';
      const outSym = isWethToRitual ? 'RITUAL' : 'WETH';
      const quoteWei = await getSwapQuoteWei(parseEther(amount), isWethToRitual);
      const minOutWei = (quoteWei * 99n) / 100n; // 1% slippage, precise
      const txHash = await executeSwap(isWethToRitual, amount, minOutWei);
      showToast('Swap submitted!', 'success', explorerTx(1979, txHash));
      trackTx(recordTx({ type: 'swap', summary: `Swap ${amount} ${state.fromToken.symbol} → ${outSym}`, hash: txHash, chainId: 1979 }), 1979, txHash);
    } else if (isBridgeToRitual) {
      const directSwap = state.toToken?.symbol === 'RITUAL';
      const txHash = await bridgeLockETH(state.fromChainId, amount, state.wallet, directSwap);
      showToast('Bridge submitted — wait ~60s for the relayer.', 'success', explorerTx(state.fromChainId, txHash));
      recordTx({ type: 'bridge', summary: `Bridge ${amount} ETH → ${directSwap ? 'RITUAL' : 'WETH'} on Ritual`, hash: txHash, chainId: state.fromChainId, status: 'pending', note: 'Awaiting relayer (~60s)' });
    } else if (isBridgeFromRitual) {
      if (state.fromToken?.symbol === 'RITUAL') {
        // Two steps: swap RITUAL → WETH through the pool, then burn the WETH we received.
        const quoteWei = await getSwapQuoteWei(parseEther(amount), false);
        const minOutWei = (quoteWei * 99n) / 100n;
        const before = await wethBalanceWei(state.wallet);
        btn.innerHTML = '<span>⏳ 1/2 Swapping RITUAL → WETH...</span>';
        const swapTx = await executeSwap(false, amount, minOutWei);
        trackTx(recordTx({ type: 'swap', summary: `Swap ${amount} RITUAL → WETH`, hash: swapTx, chainId: 1979 }), 1979, swapTx);
        await waitForTx(1979, swapTx);
        const after = await wethBalanceWei(state.wallet);
        const received = after - before;
        if (received <= 0n) throw new Error('Swap produced no WETH');
        btn.innerHTML = '<span>⏳ 2/2 Burning WETH → ETH...</span>';
        const burnTx = await bridgeBurnWETH(received, state.toChainId);
        showToast('Swap + burn submitted — wait ~60s for the relayer.', 'success', explorerTx(1979, burnTx));
        recordTx({ type: 'burn', summary: `Return ${(Number(received) / 1e18).toFixed(4)} WETH → ETH on ${CHAINS[state.toChainId].name}`, hash: burnTx, chainId: 1979, status: 'pending', note: 'Awaiting relayer (~60s)' });
      } else {
        // WETH burns 1:1 to ETH.
        const txHash = await bridgeBurnWETH(amount, state.toChainId);
        showToast('Burn submitted — wait ~60s for the relayer.', 'success', explorerTx(1979, txHash));
        recordTx({ type: 'burn', summary: `Return ${amount} WETH → ETH on ${CHAINS[state.toChainId].name}`, hash: txHash, chainId: 1979, status: 'pending', note: 'Awaiting relayer (~60s)' });
      }
    }

    setTimeout(loadAllBalances, 6000);
  } catch (err) {
    console.error('TX error:', err);
    showToast(err.shortMessage || err.message || 'Transaction failed', 'error');
  }

  btn.innerHTML = originalText;
  btn.disabled = false;
}

// ============================================================
// Pool Stats & Liquidity
// ============================================================
async function loadPoolStats() {
  try {
    const stats = await getPoolStats();
    if (!stats) return;

    document.getElementById('pool-weth').textContent = stats.reserveWETH.toFixed(4) + ' WETH';
    document.getElementById('pool-writual').textContent = stats.reserveWRITUAL.toFixed(4) + ' WRITUAL';
    document.getElementById('pool-rate').textContent = stats.rate.toFixed(4) + ' WETH/RITUAL';
    document.getElementById('pool-lp').textContent = stats.totalSupply.toFixed(4) + ' RSLP';

    if (state.balances?.lp > 0 && stats.totalSupply > 0) {
      const share = (state.balances.lp / stats.totalSupply) * 100;
      document.getElementById('your-share').textContent = share.toFixed(2) + '%';
    }
  } catch (err) {
    console.error('Pool stats error:', err);
  }
}

function initPool() {
  document.getElementById('pool-add-tab')?.addEventListener('click', () => {
    document.getElementById('pool-add-form').style.display = 'block';
    document.getElementById('pool-remove-form').style.display = 'none';
    document.getElementById('pool-add-tab').classList.add('active');
    document.getElementById('pool-remove-tab').classList.remove('active');
  });

  document.getElementById('pool-remove-tab')?.addEventListener('click', () => {
    document.getElementById('pool-add-form').style.display = 'none';
    document.getElementById('pool-remove-form').style.display = 'block';
    document.getElementById('pool-remove-tab').classList.add('active');
    document.getElementById('pool-add-tab').classList.remove('active');
  });

  document.getElementById('add-liquidity-btn')?.addEventListener('click', async () => {
    if (!state.wallet) { await doConnect(); return; }
    const wethAmt = document.getElementById('pool-weth-input')?.value;
    const ritualAmt = document.getElementById('pool-ritual-input')?.value;
    if (!wethAmt || !ritualAmt || parseFloat(wethAmt) <= 0 || parseFloat(ritualAmt) <= 0) {
      showToast('Enter both amounts', 'error');
      return;
    }
    const btn = document.getElementById('add-liquidity-btn');
    try {
      btn.textContent = '⏳ Confirming...';
      btn.disabled = true;
      const txHash = await addLiquidityRITUAL(wethAmt, ritualAmt);
      showToast('Liquidity added!', 'success', explorerTx(1979, txHash));
      trackTx(recordTx({ type: 'add', summary: `Add ${wethAmt} WETH + ${ritualAmt} RITUAL`, hash: txHash, chainId: 1979 }), 1979, txHash);
      setTimeout(() => { loadPoolStats(); loadAllBalances(); }, 6000);
    } catch (err) {
      showToast(err.shortMessage || err.message || 'Failed to add liquidity', 'error');
    } finally {
      btn.textContent = 'Add Liquidity';
      btn.disabled = false;
    }
  });

  document.getElementById('remove-liquidity-btn')?.addEventListener('click', async () => {
    if (!state.wallet) { await doConnect(); return; }
    const lpAmt = document.getElementById('pool-lp-input')?.value;
    if (!lpAmt || parseFloat(lpAmt) <= 0) {
      showToast('Enter LP amount to remove', 'error');
      return;
    }
    const btn = document.getElementById('remove-liquidity-btn');
    try {
      btn.textContent = '⏳ Confirming...';
      btn.disabled = true;
      const txHash = await removeLiquidity(lpAmt);
      showToast('Liquidity removed!', 'success', explorerTx(1979, txHash));
      trackTx(recordTx({ type: 'remove', summary: `Remove ${lpAmt} LP`, hash: txHash, chainId: 1979 }), 1979, txHash);
      setTimeout(() => { loadPoolStats(); loadAllBalances(); }, 6000);
    } catch (err) {
      showToast(err.shortMessage || err.message || 'Failed to remove liquidity', 'error');
    } finally {
      btn.textContent = 'Remove Liquidity';
      btn.disabled = false;
    }
  });

  document.getElementById('pool-lp-input')?.addEventListener('input', async () => {
    const lpAmt = parseFloat(document.getElementById('pool-lp-input').value || '0');
    if (lpAmt <= 0) { document.getElementById('remove-estimate').textContent = '— WETH + — RITUAL'; return; }
    const stats = await getPoolStats();
    if (stats && stats.totalSupply > 0) {
      const share = lpAmt / stats.totalSupply;
      const wethOut = (stats.reserveWETH * share).toFixed(6);
      const ritualOut = (stats.reserveWRITUAL * share).toFixed(6);
      document.getElementById('remove-estimate').textContent = `${wethOut} WETH + ${ritualOut} RITUAL`;
    }
  });
}

// ============================================================
// AI Chat — wired to the real on-chain intent engine (ai.js)
// ============================================================
function initAIChat() {
  const input = document.getElementById('ai-input');
  const sendBtn = document.getElementById('ai-send');

  sendBtn?.addEventListener('click', () => sendAIMessage());
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAIMessage();
    }
  });
}

async function sendAIMessage() {
  const input = document.getElementById('ai-input');
  const message = input?.value?.trim();
  if (!message) return;

  addChatMessage('user', message);
  input.value = '';

  const chatEl = document.getElementById('ai-chat');
  const typingEl = document.createElement('div');
  typingEl.className = 'ai-message assistant';
  typingEl.id = 'ai-typing';
  typingEl.innerHTML = `
    <div class="ai-avatar"><span>✦</span></div>
    <div class="ai-bubble">
      <div class="ai-typing"><span></span><span></span><span></span></div>
    </div>
  `;
  chatEl.appendChild(typingEl);
  chatEl.scrollTop = chatEl.scrollHeight;

  let result;
  try {
    result = await runLia(message, { wallet: state.wallet });
  } catch (err) {
    result = { text: `⚠️ ${err?.message || 'Something went wrong.'}` };
  }
  document.getElementById('ai-typing')?.remove();
  addChatMessage('assistant', result.text, result.action);
}

function addChatMessage(role, content, action) {
  const chatEl = document.getElementById('ai-chat');
  const msgEl = document.createElement('div');
  msgEl.className = `ai-message ${role}`;

  const avatar = role === 'assistant' ? '✦' : '👤';
  const html = String(content)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');

  msgEl.innerHTML = `
    <div class="ai-avatar"><span>${avatar}</span></div>
    <div class="ai-bubble"><p>${html}</p></div>
  `;

  if (action && role === 'assistant') {
    const bubble = msgEl.querySelector('.ai-bubble');
    const actBtn = document.createElement('button');
    actBtn.className = 'btn btn-swap';
    actBtn.style.marginTop = '10px';
    actBtn.textContent = action.label || 'Confirm & Execute';
    actBtn.addEventListener('click', async () => {
      if (!state.wallet) { await doConnect(); if (!state.wallet) return; }
      actBtn.disabled = true;
      const orig = actBtn.textContent;
      actBtn.textContent = '⏳ Confirming...';
      try {
        const txHash = await action.run();
        const chainId = action.chainId || 1979;
        showToast('Transaction submitted!', 'success', explorerTx(chainId, txHash));
        const relayerPath = /bridge|burn|return/i.test(action.label || '');
        recordTx({ type: 'ai', summary: `Lia: ${action.label}`, hash: txHash, chainId, status: relayerPath ? 'pending' : 'submitted', note: relayerPath ? 'Awaiting relayer (~60s)' : '' });
        if (!relayerPath) trackTx(loadTxs()[0].id, chainId, txHash);
        actBtn.textContent = '✅ Submitted';
        addChatMessage('assistant', `Done — tx \`${String(txHash).slice(0, 12)}…\` submitted. I'll refresh your balances shortly.`);
        setTimeout(() => { loadAllBalances(); loadPoolStats(); }, 6000);
      } catch (err) {
        actBtn.disabled = false;
        actBtn.textContent = orig;
        showToast(err.shortMessage || err.message || 'Transaction failed', 'error');
        addChatMessage('assistant', `⚠️ ${err.shortMessage || err.message || 'Transaction failed or was rejected.'}`);
      }
    });
    bubble.appendChild(actBtn);
  }

  chatEl.appendChild(msgEl);
  chatEl.scrollTop = chatEl.scrollHeight;
}

// ============================================================
// Transaction History (persisted in localStorage, per wallet)
// ============================================================
const TX_ICONS = { swap: '⇄', bridge: '🌉', burn: '🔥', add: '➕', remove: '➖', ai: '✦' };

function txKey() {
  return `ritualswap_txs_${(state.wallet || 'anon').toLowerCase()}`;
}
function loadTxs() {
  try { return JSON.parse(localStorage.getItem(txKey()) || '[]'); } catch { return []; }
}
function saveTxs(txs) {
  try { localStorage.setItem(txKey(), JSON.stringify(txs.slice(0, 100))); } catch {}
}

// Add a record. Returns its id so status can be updated later.
function recordTx({ type, summary, hash, chainId, status = 'submitted', note = '' }) {
  const txs = loadTxs();
  const id = `${Date.now()}-${Math.floor(performance.now())}`;
  txs.unshift({ id, type, summary, hash: hash || null, chainId: chainId || 1979, status, note, ts: Date.now() });
  saveTxs(txs);
  renderHistory();
  return id;
}
function updateTxStatus(id, status, note) {
  const txs = loadTxs();
  const row = txs.find((t) => t.id === id);
  if (!row) return;
  row.status = status;
  if (note !== undefined) row.note = note;
  saveTxs(txs);
  renderHistory();
}
// Wait for a self-completing (on-Ritual) tx and mark it confirmed/failed.
async function trackTx(id, chainId, hash) {
  try {
    const rcpt = await waitForTx(chainId, hash);
    updateTxStatus(id, rcpt.status === 'success' ? 'confirmed' : 'failed');
    setTimeout(loadAllBalances, 1500);
  } catch {
    updateTxStatus(id, 'failed');
  }
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function renderHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;
  const txs = loadTxs();
  if (!txs.length) {
    list.innerHTML = `<div class="history-empty">No transactions yet. Your swaps, bridges and liquidity actions will show up here.</div>`;
    return;
  }
  list.innerHTML = txs.map((t) => {
    const link = t.hash ? `<a class="history-link" href="${explorerTx(t.chainId, t.hash)}" target="_blank" rel="noopener">${String(t.hash).slice(0, 10)}… ↗</a>` : '';
    const sub = [t.note, timeAgo(t.ts)].filter(Boolean).join(' · ');
    return `
      <div class="history-row">
        <div class="history-icon">${TX_ICONS[t.type] || '•'}</div>
        <div class="history-main">
          <div class="history-type">${t.summary}</div>
          <div class="history-sub">${sub}</div>
        </div>
        <div class="history-right">
          <span class="history-status ${t.status}">${t.status}</span>
          ${link}
        </div>
      </div>`;
  }).join('');
}

function initHistory() {
  document.getElementById('history-clear')?.addEventListener('click', () => {
    if (confirm('Clear transaction history for this wallet?')) { saveTxs([]); renderHistory(); }
  });
  // Rescue rows an older build mislabeled: 'unknown' used to be treated as
  // permanently unverifiable, but for fresh txs it just meant RPC lag.
  // Put recent ones back to 'pending' so the poller re-resolves them.
  const txs = loadTxs();
  let rescued = false;
  for (const t of txs) {
    if (t.status === 'failed' && t.note === 'Unverifiable (old bridge contract)' && Date.now() - t.ts < 24 * 60 * 60 * 1000) {
      t.status = 'pending';
      t.note = 'Awaiting relayer (~60s)';
      rescued = true;
    }
  }
  if (rescued) saveTxs(txs);
  renderHistory();
}

// Poll relayer-dependent 'pending' entries and resolve them against the chain:
// bridges via BridgeMint.processedMints, returns via pendingReturns[nonce].settled.
// Also refreshes balances whenever something completes, so the DEX card updates
// without a manual page refresh.
let resolvingPending = false;
async function resolvePendingTxs() {
  if (resolvingPending) return;
  const txs = loadTxs();
  const pending = txs.filter((t) => t.status === 'pending' && t.hash);
  if (!pending.length) return;
  resolvingPending = true;
  try {
    let anyResolved = false;
    for (const t of pending) {
      let status = 'pending';
      try {
        if (t.type === 'burn' || (t.type === 'ai' && /burn|return/i.test(t.summary))) {
          status = await checkReturnStatus(t.hash);
        } else {
          status = await checkBridgeStatus(t.chainId, t.hash);
        }
      } catch { continue; }
      if (status === 'confirmed' || status === 'failed') {
        updateTxStatus(t.id, status, status === 'confirmed' ? 'Relayer completed' : 'Did not complete');
        anyResolved = true;
      } else if (status === 'unknown') {
        // 'unknown' right after submit just means the receipt isn't indexed yet
        // (RPC lag) — keep polling. Only give up on entries that stayed
        // unverifiable for 10+ minutes (e.g. txs against the old bridge contracts).
        if (Date.now() - t.ts > 10 * 60 * 1000) {
          updateTxStatus(t.id, 'failed', 'Unverifiable (old bridge contract)');
        }
      }
    }
    if (anyResolved) loadAllBalances();
  } finally {
    resolvingPending = false;
  }
}

// ============================================================
// Init
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initBackground();
  initTabs();
  initChainSelector();
  initSwapDirection();
  initTokenModal();
  initSwapInput();
  initWallet();
  initAIChat();
  initPool();
  initHistory();
  updateTokensForRoute();
  updateToChainOptions();
  updateFromChainOptions();
  loadPoolStats();

  setInterval(loadPoolStats, 30000);
  // Keep balances fresh while connected (10s), and resolve pending
  // relayer-dependent history entries against the chain (12s).
  setInterval(() => { if (state.wallet) loadAllBalances(); }, 10000);
  setInterval(resolvePendingTxs, 12000);
  resolvePendingTxs();
});
