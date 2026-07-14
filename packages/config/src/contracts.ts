// ============================================================
// Contract Addresses (populate after deployment)
// ============================================================

export const CONTRACTS = {
  ritual: {
    weth: '0xB0744700a04A33536B91604Bf5C423e3FB97883E' as `0x${string}`,
    writual: '0xD542E471cB699b7A7C0dafE382E6Dc89506fcc18' as `0x${string}`,
    swapRouter: '0xf27b0c56452443F5306C5904100A0fde6F23577B' as `0x${string}`,
    liquidityPool: '0xe186d9A14C70302fe71d10fE225CE44CB076c285' as `0x${string}`,
    bridgeMint: '0xC4b66348DfF821874C9B98aAb1775F8667EED7E9' as `0x${string}`,
    crossChainSwap: '0xD05d9C7F68965Da382937f3F1760d13f69D887F3' as `0x${string}`,
    intentExecutor: '0x353C91dCA37089da3A4e522224175EA3d2178E39' as `0x${string}`,
    treasury: '0x8210cd445fB88AFEcc9062b19e0ee499b12a8b34' as `0x${string}`,
  },
  ethereumSepolia: {
    bridgeLock: '0x04fC7cDa5178fd86a0BbB3F6bbc1A765e0a8Fc35' as `0x${string}`,
  },
  baseSepolia: {
    bridgeLock: '0xa7376704830A1d71cF45Ff698564656E79bf6B61' as `0x${string}`,
  },
} as const;

// ============================================================
// ABIs
// ============================================================

export const WETH_ABI = [
  { type: 'constructor', inputs: [{ name: 'admin', type: 'address' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'mint', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'burn', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'burnFrom', inputs: [{ name: 'account', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'name', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'totalSupply', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'transfer', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'transferFrom', inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'MINTER_ROLE', inputs: [], outputs: [{ type: 'bytes32' }], stateMutability: 'view' },
  { type: 'function', name: 'hasRole', inputs: [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'event', name: 'Transfer', inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'value', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'Approval', inputs: [{ name: 'owner', type: 'address', indexed: true }, { name: 'spender', type: 'address', indexed: true }, { name: 'value', type: 'uint256', indexed: false }] },
] as const;

export const WRITUAL_ABI = [
  { type: 'function', name: 'deposit', inputs: [], outputs: [], stateMutability: 'payable' },
  { type: 'function', name: 'withdraw', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'name', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'totalSupply', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'transfer', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'event', name: 'Deposit', inputs: [{ name: 'dst', type: 'address', indexed: true }, { name: 'wad', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'Withdrawal', inputs: [{ name: 'src', type: 'address', indexed: true }, { name: 'wad', type: 'uint256', indexed: false }] },
] as const;

export const SWAP_ROUTER_ABI = [
  { type: 'constructor', inputs: [{ name: '_weth', type: 'address' }, { name: '_writual', type: 'address' }, { name: '_pool', type: 'address' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'addLiquidity', inputs: [{ name: 'amountWETH', type: 'uint256' }, { name: 'amountWRITUAL', type: 'uint256' }, { name: 'minLiquidity', type: 'uint256' }], outputs: [{ name: 'liquidity', type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'addLiquidityRITUAL', inputs: [{ name: 'amountWETH', type: 'uint256' }], outputs: [{ name: 'liquidity', type: 'uint256' }], stateMutability: 'payable' },
  { type: 'function', name: 'removeLiquidity', inputs: [{ name: 'liquidity', type: 'uint256' }, { name: 'minAmountWETH', type: 'uint256' }, { name: 'minAmountWRITUAL', type: 'uint256' }], outputs: [{ type: 'uint256' }, { type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'swapExactWETHForRITUAL', inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'minAmountOut', type: 'uint256' }], outputs: [{ name: 'amountOut', type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'swapExactRITUALForWETH', inputs: [{ name: 'minAmountOut', type: 'uint256' }], outputs: [{ name: 'amountOut', type: 'uint256' }], stateMutability: 'payable' },
  { type: 'function', name: 'swapExactTokensForTokens', inputs: [{ name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' }, { name: 'amountIn', type: 'uint256' }, { name: 'minAmountOut', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getAmountOut', inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'reserveIn', type: 'uint256' }, { name: 'reserveOut', type: 'uint256' }], outputs: [{ name: 'amountOut', type: 'uint256' }], stateMutability: 'pure' },
  { type: 'function', name: 'getPoolReserves', inputs: [], outputs: [{ name: 'reserveWETH', type: 'uint256' }, { name: 'reserveWRITUAL', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getQuoteWETHToRITUAL', inputs: [{ name: 'amountWETHIn', type: 'uint256' }], outputs: [{ name: 'ritualOut', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getQuoteRITUALToWETH', inputs: [{ name: 'amountRITUALIn', type: 'uint256' }], outputs: [{ name: 'wethOut', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'pool', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'weth', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'writual', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
] as const;

export const LIQUIDITY_POOL_ABI = [
  { type: 'function', name: 'initialize', inputs: [{ name: '_token0', type: 'address' }, { name: '_token1', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'mint', inputs: [{ name: 'to', type: 'address' }], outputs: [{ name: 'liquidity', type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'burn', inputs: [{ name: 'to', type: 'address' }], outputs: [{ name: 'amount0', type: 'uint256' }, { name: 'amount1', type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'swap', inputs: [{ name: 'amount0Out', type: 'uint256' }, { name: 'amount1Out', type: 'uint256' }, { name: 'to', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getReserves', inputs: [], outputs: [{ name: '_reserve0', type: 'uint112' }, { name: '_reserve1', type: 'uint112' }, { name: '_blockTimestampLast', type: 'uint32' }], stateMutability: 'view' },
  { type: 'function', name: 'sync', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'token0', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'token1', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'totalSupply', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'event', name: 'Mint', inputs: [{ name: 'sender', type: 'address', indexed: true }, { name: 'amount0', type: 'uint256', indexed: false }, { name: 'amount1', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'Burn', inputs: [{ name: 'sender', type: 'address', indexed: true }, { name: 'amount0', type: 'uint256', indexed: false }, { name: 'amount1', type: 'uint256', indexed: false }, { name: 'to', type: 'address', indexed: true }] },
  { type: 'event', name: 'Swap', inputs: [{ name: 'sender', type: 'address', indexed: true }, { name: 'amount0In', type: 'uint256', indexed: false }, { name: 'amount1In', type: 'uint256', indexed: false }, { name: 'amount0Out', type: 'uint256', indexed: false }, { name: 'amount1Out', type: 'uint256', indexed: false }, { name: 'to', type: 'address', indexed: true }] },
  { type: 'event', name: 'Sync', inputs: [{ name: 'reserve0', type: 'uint112', indexed: false }, { name: 'reserve1', type: 'uint112', indexed: false }] },
] as const;

export const BRIDGE_LOCK_ABI = [
  { type: 'constructor', inputs: [{ name: '_relayer', type: 'address' }, { name: 'admin', type: 'address' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'lockETH', inputs: [{ name: 'destinationChainId', type: 'uint256' }, { name: 'recipient', type: 'address' }, { name: 'directSwap', type: 'bool' }], outputs: [], stateMutability: 'payable' },
  { type: 'function', name: 'unlockETH', inputs: [{ name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: '_nonce', type: 'uint256' }, { name: 'signature', type: 'bytes' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'nonce', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'processedNonces', inputs: [{ name: '', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'relayer', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'pause', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'unpause', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'event', name: 'Locked', inputs: [{ name: 'sender', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }, { name: 'destinationChainId', type: 'uint256', indexed: false }, { name: 'recipient', type: 'address', indexed: true }, { name: 'nonce', type: 'uint256', indexed: false }, { name: 'directSwap', type: 'bool', indexed: false }] },
  { type: 'event', name: 'Unlocked', inputs: [{ name: 'recipient', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }, { name: 'nonce', type: 'uint256', indexed: false }] },
] as const;

export const BRIDGE_MINT_ABI = [
  { type: 'constructor', inputs: [{ name: '_weth', type: 'address' }, { name: '_relayer', type: 'address' }, { name: 'admin', type: 'address' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'mintWETH', inputs: [{ name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'sourceChainId', type: 'uint256' }, { name: '_nonce', type: 'uint256' }, { name: 'signature', type: 'bytes' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'burnWETH', inputs: [{ name: 'amount', type: 'uint256' }, { name: 'destinationChainId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'finalizeReturn', inputs: [{ name: '_nonce', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'reclaimReturn', inputs: [{ name: '_nonce', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'pendingReturns', inputs: [{ name: '', type: 'uint256' }], outputs: [{ name: 'user', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'destinationChainId', type: 'uint256' }, { name: 'initiatedAt', type: 'uint256' }, { name: 'settled', type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'nonce', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'processedMints', inputs: [{ name: '', type: 'bytes32' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'relayer', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'event', name: 'Minted', inputs: [{ name: 'recipient', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }, { name: 'sourceChainId', type: 'uint256', indexed: false }, { name: 'nonce', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'BurnForUnlock', inputs: [{ name: 'sender', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }, { name: 'destinationChainId', type: 'uint256', indexed: false }, { name: 'nonce', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'ReturnFinalized', inputs: [{ name: 'nonce', type: 'uint256', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'ReturnReclaimed', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }, { name: 'nonce', type: 'uint256', indexed: false }] },
] as const;

export const CROSS_CHAIN_SWAP_ABI = [
  { type: 'constructor', inputs: [{ name: '_weth', type: 'address' }, { name: '_swapRouter', type: 'address' }, { name: '_relayer', type: 'address' }, { name: 'admin', type: 'address' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'bridgeAndSwap', inputs: [{ name: 'recipient', type: 'address' }, { name: 'wethAmount', type: 'uint256' }, { name: 'minRitualOut', type: 'uint256' }, { name: 'sourceChainId', type: 'uint256' }, { name: '_nonce', type: 'uint256' }, { name: 'signature', type: 'bytes' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'processedSwaps', inputs: [{ name: '', type: 'bytes32' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'relayer', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'event', name: 'CrossChainSwapExecuted', inputs: [{ name: 'recipient', type: 'address', indexed: true }, { name: 'wethAmount', type: 'uint256', indexed: false }, { name: 'ritualOut', type: 'uint256', indexed: false }, { name: 'sourceChainId', type: 'uint256', indexed: false }, { name: 'nonce', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'CrossChainSwapFallback', inputs: [{ name: 'recipient', type: 'address', indexed: true }, { name: 'wethAmount', type: 'uint256', indexed: false }, { name: 'sourceChainId', type: 'uint256', indexed: false }, { name: 'nonce', type: 'uint256', indexed: false }, { name: 'reason', type: 'string', indexed: false }] },
] as const;
