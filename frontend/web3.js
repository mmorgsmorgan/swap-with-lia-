// ============================================================
// Web3 Integration (viem) — Wallet, Balances, Transactions
// ------------------------------------------------------------
// This module replaces the hand-rolled selector encoding in web3.js.
// Every contract call now goes through viem with the canonical ABIs
// from packages/config, so 4-byte selectors are derived correctly
// instead of being hardcoded (the old file had almost all of them wrong,
// which is why the Pool tab, quotes, swaps and bridge all silently failed).
// ============================================================

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  defineChain,
  parseEther,
  formatEther,
  keccak256,
  encodeAbiParameters,
  parseEventLogs,
} from 'viem';

// ---- Chains (mirrors packages/config/src/chains.ts) ----
export const ethereumSepolia = defineChain({
  id: 11155111,
  name: 'Ethereum Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://ethereum-sepolia-rpc.publicnode.com'] } },
  blockExplorers: { default: { name: 'Etherscan', url: 'https://sepolia.etherscan.io' } },
  testnet: true,
});

export const baseSepolia = defineChain({
  id: 84532,
  name: 'Base Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://sepolia.base.org'] } },
  blockExplorers: { default: { name: 'BaseScan', url: 'https://sepolia.basescan.org' } },
  testnet: true,
});

export const ritualChain = defineChain({
  id: 1979,
  name: 'Ritual',
  nativeCurrency: { name: 'RITUAL', symbol: 'RITUAL', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.ritualfoundation.org'] } },
  blockExplorers: { default: { name: 'Ritual Explorer', url: 'https://explorer.ritual.foundation' } },
  testnet: true,
});

const CHAINS_BY_ID = {
  11155111: ethereumSepolia,
  84532: baseSepolia,
  1979: ritualChain,
};

// ---- Contract addresses (mirrors packages/config/src/contracts.ts) ----
export const CONTRACTS = {
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

// ---- Minimal ABIs (subset of packages/config, only what the UI needs) ----
const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'o', type: 'address' }, { name: 's', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'v', type: 'uint256' }], outputs: [{ type: 'bool' }] },
];

const SWAP_ROUTER_ABI = [
  { type: 'function', name: 'getPoolReserves', stateMutability: 'view', inputs: [], outputs: [{ name: 'reserveWETH', type: 'uint256' }, { name: 'reserveWRITUAL', type: 'uint256' }] },
  { type: 'function', name: 'getQuoteWETHToRITUAL', stateMutability: 'view', inputs: [{ name: 'amountWETHIn', type: 'uint256' }], outputs: [{ name: 'ritualOut', type: 'uint256' }] },
  { type: 'function', name: 'getQuoteRITUALToWETH', stateMutability: 'view', inputs: [{ name: 'amountRITUALIn', type: 'uint256' }], outputs: [{ name: 'wethOut', type: 'uint256' }] },
  { type: 'function', name: 'swapExactWETHForRITUAL', stateMutability: 'nonpayable', inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'minAmountOut', type: 'uint256' }], outputs: [{ name: 'amountOut', type: 'uint256' }] },
  { type: 'function', name: 'swapExactRITUALForWETH', stateMutability: 'payable', inputs: [{ name: 'minAmountOut', type: 'uint256' }], outputs: [{ name: 'amountOut', type: 'uint256' }] },
  { type: 'function', name: 'addLiquidityRITUAL', stateMutability: 'payable', inputs: [{ name: 'amountWETH', type: 'uint256' }], outputs: [{ name: 'liquidity', type: 'uint256' }] },
  { type: 'function', name: 'removeLiquidityRITUAL', stateMutability: 'nonpayable', inputs: [{ name: 'liquidity', type: 'uint256' }, { name: 'minAmountWETH', type: 'uint256' }, { name: 'minAmountRITUAL', type: 'uint256' }], outputs: [{ type: 'uint256' }, { type: 'uint256' }] },
];

const BRIDGE_LOCK_ABI = [
  { type: 'function', name: 'lockETH', stateMutability: 'payable', inputs: [{ name: 'destinationChainId', type: 'uint256' }, { name: 'recipient', type: 'address' }, { name: 'directSwap', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'nonce', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
];

const BRIDGE_MINT_ABI = [
  { type: 'function', name: 'burnWETH', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }, { name: 'destinationChainId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'nonce', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'processedMints', stateMutability: 'view', inputs: [{ type: 'bytes32' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'pendingReturns', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ name: 'user', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'destinationChainId', type: 'uint256' }, { name: 'initiatedAt', type: 'uint256' }, { name: 'settled', type: 'bool' }] },
];

const CROSS_CHAIN_SWAP_ABI = [
  { type: 'function', name: 'processedSwaps', stateMutability: 'view', inputs: [{ type: 'bytes32' }], outputs: [{ type: 'bool' }] },
];

// ---- Clients ----
const publicClients = {
  11155111: createPublicClient({ chain: ethereumSepolia, transport: http() }),
  84532: createPublicClient({ chain: baseSepolia, transport: http() }),
  1979: createPublicClient({ chain: ritualChain, transport: http() }),
};

let account = null;

function walletClientFor(chainId) {
  if (!window.ethereum) throw new Error('No wallet found. Install MetaMask.');
  return createWalletClient({
    account,
    chain: CHAINS_BY_ID[chainId],
    transport: custom(window.ethereum),
  });
}

// ---- Wallet ----
export async function connectWallet() {
  if (!window.ethereum) {
    alert('Please install MetaMask or another Web3 wallet.');
    return null;
  }
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  account = accounts[0] || null;
  return account;
}

export function getAccount() {
  return account;
}

export async function switchChain(chainId) {
  const chain = CHAINS_BY_ID[chainId];
  if (!chain) return;
  const hexId = '0x' + chainId.toString(16);
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexId }],
    });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: hexId,
          chainName: chain.name,
          rpcUrls: chain.rpcUrls.default.http,
          nativeCurrency: chain.nativeCurrency,
          blockExplorerUrls: [chain.blockExplorers.default.url],
        }],
      });
    } else {
      throw err;
    }
  }
}

export function getWalletChainId() {
  if (!window.ethereum) return null;
  return parseInt(window.ethereum.chainId, 16);
}

// ---- Balances ----
export async function getBalances(address) {
  // allSettled so one flaky RPC (e.g. a rate-limited public node) can't
  // blank every balance — each field falls back to 0n independently.
  const results = await Promise.allSettled([
    publicClients[11155111].getBalance({ address }),
    publicClients[84532].getBalance({ address }),
    publicClients[1979].getBalance({ address }),
    publicClients[1979].readContract({ address: CONTRACTS.ritual.weth, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }),
    publicClients[1979].readContract({ address: CONTRACTS.ritual.liquidityPool, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }),
  ]);
  const val = (i) => (results[i].status === 'fulfilled' ? results[i].value : 0n);
  results.forEach((r, i) => { if (r.status === 'rejected') console.warn(`balance[${i}] failed:`, r.reason?.shortMessage || r.reason?.message); });
  const [ethSepolia, ethBase, ritual, weth, lp] = [val(0), val(1), val(2), val(3), val(4)];
  return {
    ethSepolia: Number(formatEther(ethSepolia)),
    ethBase: Number(formatEther(ethBase)),
    ritual: Number(formatEther(ritual)),
    weth: Number(formatEther(weth)),
    lp: Number(formatEther(lp)),
    // raw bigints for precise math
    raw: { ethSepolia, ethBase, ritual, weth, lp },
  };
}

export async function getBalanceForChain(address, chainId) {
  const native = await publicClients[chainId].getBalance({ address });
  if (chainId === 1979) {
    const weth = await publicClients[1979].readContract({ address: CONTRACTS.ritual.weth, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] });
    return { native: Number(formatEther(native)), weth: Number(formatEther(weth)) };
  }
  return { native: Number(formatEther(native)) };
}

// ---- Pool Stats ----
export async function getPoolStats() {
  const [reserves, totalSupply] = await Promise.all([
    publicClients[1979].readContract({ address: CONTRACTS.ritual.swapRouter, abi: SWAP_ROUTER_ABI, functionName: 'getPoolReserves' }),
    publicClients[1979].readContract({ address: CONTRACTS.ritual.liquidityPool, abi: ERC20_ABI, functionName: 'totalSupply' }),
  ]);
  const reserveWETH = reserves[0];
  const reserveWRITUAL = reserves[1];
  return {
    reserveWETH: Number(formatEther(reserveWETH)),
    reserveWRITUAL: Number(formatEther(reserveWRITUAL)),
    totalSupply: Number(formatEther(totalSupply)),
    rate: reserveWRITUAL > 0n ? Number(formatEther(reserveWETH)) / Number(formatEther(reserveWRITUAL)) : 0,
    raw: { reserveWETH, reserveWRITUAL, totalSupply },
  };
}

// ---- Swap Quote ----
// Returns bigint output amount for a bigint input (precise).
export async function getSwapQuoteWei(amountInWei, isWethToRitual) {
  if (amountInWei <= 0n) return 0n;
  return await publicClients[1979].readContract({
    address: CONTRACTS.ritual.swapRouter,
    abi: SWAP_ROUTER_ABI,
    functionName: isWethToRitual ? 'getQuoteWETHToRITUAL' : 'getQuoteRITUALToWETH',
    args: [amountInWei],
  });
}

// Convenience wrapper: number in, number out.
export async function getSwapQuote(amountIn, isWethToRitual) {
  if (!amountIn || parseFloat(amountIn) <= 0) return 0;
  const out = await getSwapQuoteWei(parseEther(String(amountIn)), isWethToRitual);
  return Number(formatEther(out));
}

// ---- Approvals ----
// Approve max once so subsequent swaps/burns are a single wallet transaction
// instead of approve + action every time.
const MAX_UINT256 = 2n ** 256n - 1n;
async function ensureAllowance(token, owner, spender, amountWei) {
  const current = await publicClients[1979].readContract({
    address: token, abi: ERC20_ABI, functionName: 'allowance', args: [owner, spender],
  });
  if (current >= amountWei) return;
  const wallet = walletClientFor(1979);
  const hash = await wallet.writeContract({
    address: token, abi: ERC20_ABI, functionName: 'approve', args: [spender, MAX_UINT256],
  });
  await publicClients[1979].waitForTransactionReceipt({ hash });
}

// ---- Execute Swap on Ritual ----
// minOut may be a bigint (preferred) or a number.
export async function executeSwap(isWethToRitual, amountIn, minOut) {
  await switchChain(1979);
  const amountWei = parseEther(String(amountIn));
  const minOutWei = typeof minOut === 'bigint' ? minOut : parseEther(String(minOut || 0));
  const wallet = walletClientFor(1979);

  if (isWethToRitual) {
    await ensureAllowance(CONTRACTS.ritual.weth, account, CONTRACTS.ritual.swapRouter, amountWei);
    return await wallet.writeContract({
      address: CONTRACTS.ritual.swapRouter,
      abi: SWAP_ROUTER_ABI,
      functionName: 'swapExactWETHForRITUAL',
      args: [amountWei, minOutWei],
    });
  }
  // RITUAL → WETH (native payable)
  return await wallet.writeContract({
    address: CONTRACTS.ritual.swapRouter,
    abi: SWAP_ROUTER_ABI,
    functionName: 'swapExactRITUALForWETH',
    args: [minOutWei],
    value: amountWei,
  });
}

// ---- Bridge: Lock ETH (source chain → Ritual) ----
export async function bridgeLockETH(fromChainId, amount, recipient, directSwap) {
  await switchChain(fromChainId);
  const amountWei = parseEther(String(amount));
  const bridgeLock = fromChainId === 84532
    ? CONTRACTS.baseSepolia.bridgeLock
    : CONTRACTS.ethereumSepolia.bridgeLock;
  const wallet = walletClientFor(fromChainId);
  // Pre-estimate gas via our RPC — MetaMask's internal estimation sometimes
  // returns null on testnets and crashes with "Cannot destructure 'gasLimit'".
  const gas = await publicClients[fromChainId].estimateContractGas({
    address: bridgeLock,
    abi: BRIDGE_LOCK_ABI,
    functionName: 'lockETH',
    args: [1979n, recipient, !!directSwap],
    value: amountWei,
    account,
  }).then((g) => (g * 12n) / 10n).catch(() => 150000n);
  return await wallet.writeContract({
    address: bridgeLock,
    abi: BRIDGE_LOCK_ABI,
    functionName: 'lockETH',
    args: [1979n, recipient, !!directSwap],
    value: amountWei,
    gas,
  });
}

// ---- Bridge: Burn WETH (Ritual → source chain) ----
// `amount` may be a decimal string/number or a bigint (wei).
export async function bridgeBurnWETH(amount, destinationChainId) {
  await switchChain(1979);
  const amountWei = typeof amount === 'bigint' ? amount : parseEther(String(amount));
  await ensureAllowance(CONTRACTS.ritual.weth, account, CONTRACTS.ritual.bridgeMint, amountWei);
  const wallet = walletClientFor(1979);
  return await wallet.writeContract({
    address: CONTRACTS.ritual.bridgeMint,
    abi: BRIDGE_MINT_ABI,
    functionName: 'burnWETH',
    args: [amountWei, BigInt(destinationChainId)],
  });
}

// Wait for a tx to confirm on a given chain.
export async function waitForTx(chainId, hash) {
  return publicClients[chainId].waitForTransactionReceipt({ hash });
}

// Raw WETH balance (wei) on Ritual — used to measure swap output precisely.
export async function wethBalanceWei(address) {
  return publicClients[1979].readContract({
    address: CONTRACTS.ritual.weth, abi: ERC20_ABI, functionName: 'balanceOf', args: [address],
  });
}

// ---- Pool: Add Liquidity with native RITUAL ----
export async function addLiquidityRITUAL(amountWETH, amountRITUAL) {
  await switchChain(1979);
  const weiWETH = parseEther(String(amountWETH));
  const weiRITUAL = parseEther(String(amountRITUAL));
  await ensureAllowance(CONTRACTS.ritual.weth, account, CONTRACTS.ritual.swapRouter, weiWETH);
  const wallet = walletClientFor(1979);
  return await wallet.writeContract({
    address: CONTRACTS.ritual.swapRouter,
    abi: SWAP_ROUTER_ABI,
    functionName: 'addLiquidityRITUAL',
    args: [weiWETH],
    value: weiRITUAL,
  });
}

// ---- Pool: Remove Liquidity (returns WETH + native RITUAL) ----
export async function removeLiquidity(lpAmount) {
  await switchChain(1979);
  const weiLP = parseEther(String(lpAmount));
  await ensureAllowance(CONTRACTS.ritual.liquidityPool, account, CONTRACTS.ritual.swapRouter, weiLP);
  const wallet = walletClientFor(1979);
  return await wallet.writeContract({
    address: CONTRACTS.ritual.swapRouter,
    abi: SWAP_ROUTER_ABI,
    functionName: 'removeLiquidityRITUAL',
    args: [weiLP, 0n, 0n],
  });
}

export function explorerTx(chainId, hash) {
  const chain = CHAINS_BY_ID[chainId] || ritualChain;
  return `${chain.blockExplorers.default.url}/tx/${hash}`;
}

// ============================================================
// Relayer-progress checks — resolve whether a bridge/return that
// the History tab shows as "pending" has actually completed on-chain.
// ============================================================

const LOCKED_EVENT = [{
  type: 'event', name: 'Locked',
  inputs: [
    { name: 'sender', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false },
    { name: 'destinationChainId', type: 'uint256', indexed: false },
    { name: 'recipient', type: 'address', indexed: true },
    { name: 'nonce', type: 'uint256', indexed: false },
    { name: 'directSwap', type: 'bool', indexed: false },
  ],
}];

const BURN_EVENT = [{
  type: 'event', name: 'BurnForUnlock',
  inputs: [
    { name: 'sender', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false },
    { name: 'destinationChainId', type: 'uint256', indexed: false },
    { name: 'nonce', type: 'uint256', indexed: false },
  ],
}];

// Forward bridge (lockETH tx on a source chain): plain locks are processed by
// BridgeMint (processedMints); directSwap locks are processed by CrossChainSwap
// (processedSwaps) — BridgeMint never marks those, so check the right contract.
export async function checkBridgeStatus(sourceChainId, lockTxHash) {
  const receipt = await publicClients[sourceChainId].getTransactionReceipt({ hash: lockTxHash }).catch(() => null);
  if (!receipt) return 'unknown';
  if (receipt.status !== 'success') return 'failed';
  const logs = parseEventLogs({ abi: LOCKED_EVENT, logs: receipt.logs });
  if (!logs.length) return 'unknown';
  const { nonce, directSwap } = logs[0].args;
  const key = keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [BigInt(sourceChainId), nonce]));
  const done = directSwap
    ? await publicClients[1979].readContract({
        address: CONTRACTS.ritual.crossChainSwap, abi: CROSS_CHAIN_SWAP_ABI, functionName: 'processedSwaps', args: [key],
      })
    : await publicClients[1979].readContract({
        address: CONTRACTS.ritual.bridgeMint, abi: BRIDGE_MINT_ABI, functionName: 'processedMints', args: [key],
      });
  return done ? 'confirmed' : 'pending';
}

// Return trip (burnWETH tx on Ritual): completed once the escrow is settled
// (relayer ran finalizeReturn after unlocking ETH on the destination).
export async function checkReturnStatus(burnTxHash) {
  const receipt = await publicClients[1979].getTransactionReceipt({ hash: burnTxHash }).catch(() => null);
  if (!receipt) return 'unknown';
  if (receipt.status !== 'success') return 'failed';
  // Only trust events emitted by the CURRENT BridgeMint — a burn against an old
  // deployment shares nonce numbering and would otherwise collide.
  const ours = receipt.logs.filter((l) => l.address.toLowerCase() === CONTRACTS.ritual.bridgeMint.toLowerCase());
  const logs = parseEventLogs({ abi: BURN_EVENT, logs: ours });
  if (!logs.length) return 'unknown';
  const nonce = logs[0].args.nonce;
  const ret = await publicClients[1979].readContract({
    address: CONTRACTS.ritual.bridgeMint, abi: BRIDGE_MINT_ABI, functionName: 'pendingReturns', args: [nonce],
  });
  return ret[4] ? 'confirmed' : 'pending'; // [4] = settled
}
