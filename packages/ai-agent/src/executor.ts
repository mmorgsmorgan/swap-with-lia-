import { createPublicClient, http, formatEther, parseEther, encodeFunctionData } from 'viem';
import {
  CONTRACTS, WETH_ABI, SWAP_ROUTER_ABI, BRIDGE_LOCK_ABI, BRIDGE_MINT_ABI,
  ethereumSepolia, baseSepolia, ritualChain, CHAIN_IDS,
} from '@ritual-swap/config';
import type { ToolResult } from '@ritual-swap/config';

const ritualClient = createPublicClient({ chain: ritualChain, transport: http() });
const ethSepoliaClient = createPublicClient({ chain: ethereumSepolia, transport: http() });
const baseSepoliaClient = createPublicClient({ chain: baseSepolia, transport: http() });

function getClient(chainId: number) {
  switch (chainId) {
    case CHAIN_IDS.ETHEREUM_SEPOLIA: return ethSepoliaClient;
    case CHAIN_IDS.BASE_SEPOLIA: return baseSepoliaClient;
    case CHAIN_IDS.RITUAL: return ritualClient;
    default: throw new Error(`Unsupported chain: ${chainId}`);
  }
}

function getChainName(chainId: number): string {
  switch (chainId) {
    case CHAIN_IDS.ETHEREUM_SEPOLIA: return 'Ethereum Sepolia';
    case CHAIN_IDS.BASE_SEPOLIA: return 'Base Sepolia';
    case CHAIN_IDS.RITUAL: return 'Ritual';
    default: return `Chain ${chainId}`;
  }
}

function getBridgeLockAddress(chainId: number): `0x${string}` {
  if (chainId === CHAIN_IDS.ETHEREUM_SEPOLIA) return CONTRACTS.ethereumSepolia.bridgeLock;
  if (chainId === CHAIN_IDS.BASE_SEPOLIA) return CONTRACTS.baseSepolia.bridgeLock;
  throw new Error(`No BridgeLock on chain ${chainId}`);
}

export async function executeTool(
  toolName: string,
  params: Record<string, unknown>,
  userAddress: `0x${string}`
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'get_balances':
        return await getBalances(params.address as `0x${string}`);
      case 'get_swap_quote':
        return await getSwapQuote(params.direction as string, params.amount as string);
      case 'bridge_eth_to_weth':
        return buildBridgeETHToWETH(params.amount as string, params.sourceChainId as number, userAddress);
      case 'direct_swap_eth_to_ritual':
        return buildDirectSwap(params.amount as string, params.sourceChainId as number, userAddress);
      case 'swap_weth_to_ritual':
        return await buildSwapWETHToRitual(params.amount as string, userAddress);
      case 'swap_ritual_to_weth':
        return buildSwapRitualToWETH(params.amount as string, userAddress);
      case 'bridge_weth_to_eth':
        return buildBurnWETH(params.amount as string, params.destinationChainId as number, userAddress);
      case 'estimate_gas':
        return await estimateGas(params.operation as string, params.chainId as number);
      case 'get_pool_reserves':
        return await getPoolReserves();
      case 'get_exchange_rate':
        return await getExchangeRate();
      default:
        return { success: false, data: null, message: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, data: null, message: `Tool error: ${msg}` };
  }
}

// ==================== READ Tools ====================

async function getBalances(address: `0x${string}`): Promise<ToolResult> {
  const [ethSepBal, baseSepBal, ritualBal, wethBal] = await Promise.all([
    ethSepoliaClient.getBalance({ address }),
    baseSepoliaClient.getBalance({ address }),
    ritualClient.getBalance({ address }),
    ritualClient.readContract({
      address: CONTRACTS.ritual.weth,
      abi: WETH_ABI,
      functionName: 'balanceOf',
      args: [address],
    }) as Promise<bigint>,
  ]);

  const balances = {
    ethereumSepolia: { ETH: formatEther(ethSepBal), raw: ethSepBal.toString() },
    baseSepolia: { ETH: formatEther(baseSepBal), raw: baseSepBal.toString() },
    ritual: {
      RITUAL: formatEther(ritualBal),
      WETH: formatEther(wethBal),
      rawRITUAL: ritualBal.toString(),
      rawWETH: wethBal.toString(),
    },
  };

  return {
    success: true,
    data: balances,
    message: `Balances for ${address}:\n• Ethereum Sepolia: ${balances.ethereumSepolia.ETH} ETH\n• Base Sepolia: ${balances.baseSepolia.ETH} ETH\n• Ritual: ${balances.ritual.RITUAL} RITUAL, ${balances.ritual.WETH} WETH`,
  };
}

async function getSwapQuote(direction: string, amount: string): Promise<ToolResult> {
  const amountBn = BigInt(amount);
  const fnName = direction === 'weth_to_ritual' ? 'getQuoteWETHToRITUAL' : 'getQuoteRITUALToWETH';

  const result = await ritualClient.readContract({
    address: CONTRACTS.ritual.swapRouter,
    abi: SWAP_ROUTER_ABI,
    functionName: fnName,
    args: [amountBn],
  }) as bigint;

  const inSymbol = direction === 'weth_to_ritual' ? 'WETH' : 'RITUAL';
  const outSymbol = direction === 'weth_to_ritual' ? 'RITUAL' : 'WETH';

  return {
    success: true,
    data: { amountIn: amount, amountOut: result.toString(), direction },
    message: `Quote: ${formatEther(amountBn)} ${inSymbol} → ${formatEther(result)} ${outSymbol}`,
  };
}

async function getPoolReserves(): Promise<ToolResult> {
  const [reserveWETH, reserveWRITUAL] = await ritualClient.readContract({
    address: CONTRACTS.ritual.swapRouter,
    abi: SWAP_ROUTER_ABI,
    functionName: 'getPoolReserves',
  }) as [bigint, bigint];

  return {
    success: true,
    data: { reserveWETH: reserveWETH.toString(), reserveWRITUAL: reserveWRITUAL.toString() },
    message: `Pool reserves:\n• WETH: ${formatEther(reserveWETH)}\n• WRITUAL: ${formatEther(reserveWRITUAL)}\n• Rate: ~${(Number(reserveWETH) / Number(reserveWRITUAL)).toFixed(2)} WETH per RITUAL`,
  };
}

async function getExchangeRate(): Promise<ToolResult> {
  const oneRitual = parseEther('1');
  const wethOut = await ritualClient.readContract({
    address: CONTRACTS.ritual.swapRouter,
    abi: SWAP_ROUTER_ABI,
    functionName: 'getQuoteRITUALToWETH',
    args: [oneRitual],
  }) as bigint;

  const oneWeth = parseEther('1');
  const ritualOut = await ritualClient.readContract({
    address: CONTRACTS.ritual.swapRouter,
    abi: SWAP_ROUTER_ABI,
    functionName: 'getQuoteWETHToRITUAL',
    args: [oneWeth],
  }) as bigint;

  return {
    success: true,
    data: { wethPerRitual: formatEther(wethOut), ritualPerWeth: formatEther(ritualOut) },
    message: `Exchange rates:\n• 1 RITUAL = ${formatEther(wethOut)} WETH\n• 1 WETH = ${formatEther(ritualOut)} RITUAL`,
  };
}

async function estimateGas(operation: string, chainId: number): Promise<ToolResult> {
  // Rough gas estimates per operation
  const estimates: Record<string, bigint> = {
    lock_eth: 60000n,
    swap_weth_ritual: 150000n,
    swap_ritual_weth: 150000n,
    burn_weth: 80000n,
    approve: 46000n,
  };

  const gasUnits = estimates[operation] ?? 100000n;
  const client = getClient(chainId);
  const gasPrice = await client.getGasPrice();
  const gasCost = gasUnits * gasPrice;

  return {
    success: true,
    data: { gasUnits: gasUnits.toString(), gasPrice: gasPrice.toString(), gasCost: gasCost.toString() },
    message: `Gas estimate for ${operation} on ${getChainName(chainId)}:\n• Gas units: ${gasUnits}\n• Gas price: ${formatEther(gasPrice)} (in native token per gas)\n• Total cost: ~${formatEther(gasCost)} native token`,
  };
}

// ==================== WRITE Tools (return unsigned tx data) ====================

function buildBridgeETHToWETH(amount: string, sourceChainId: number, userAddress: `0x${string}`): ToolResult {
  const data = encodeFunctionData({
    abi: BRIDGE_LOCK_ABI,
    functionName: 'lockETH',
    args: [BigInt(CHAIN_IDS.RITUAL), userAddress, false],
  });

  return {
    success: true,
    data: { action: 'bridge_eth_to_weth', amount, sourceChainId },
    message: `Transaction ready: Lock ${formatEther(BigInt(amount))} ETH on ${getChainName(sourceChainId)} → receive WETH on Ritual.\nPlease confirm to sign.`,
    transaction: {
      to: getBridgeLockAddress(sourceChainId),
      data,
      value: BigInt(amount),
      chainId: sourceChainId,
    },
  };
}

function buildDirectSwap(amount: string, sourceChainId: number, userAddress: `0x${string}`): ToolResult {
  const data = encodeFunctionData({
    abi: BRIDGE_LOCK_ABI,
    functionName: 'lockETH',
    args: [BigInt(CHAIN_IDS.RITUAL), userAddress, true],
  });

  return {
    success: true,
    data: { action: 'direct_swap', amount, sourceChainId },
    message: `Transaction ready: Lock ${formatEther(BigInt(amount))} ETH on ${getChainName(sourceChainId)} → auto-bridge+swap → receive RITUAL on Ritual.\nPlease confirm to sign.`,
    transaction: {
      to: getBridgeLockAddress(sourceChainId),
      data,
      value: BigInt(amount),
      chainId: sourceChainId,
    },
  };
}

async function buildSwapWETHToRitual(amount: string, userAddress: `0x${string}`): Promise<ToolResult> {
  const amountBn = BigInt(amount);
  const quote = await ritualClient.readContract({
    address: CONTRACTS.ritual.swapRouter,
    abi: SWAP_ROUTER_ABI,
    functionName: 'getQuoteWETHToRITUAL',
    args: [amountBn],
  }) as bigint;

  // 1% slippage
  const minOut = quote * 99n / 100n;

  const data = encodeFunctionData({
    abi: SWAP_ROUTER_ABI,
    functionName: 'swapExactWETHForRITUAL',
    args: [amountBn, minOut],
  });

  return {
    success: true,
    data: { action: 'swap_weth_to_ritual', amountIn: amount, estimatedOut: quote.toString(), minOut: minOut.toString() },
    message: `Transaction ready: Swap ${formatEther(amountBn)} WETH → ~${formatEther(quote)} RITUAL (min: ${formatEther(minOut)}, 1% slippage).\nNote: You must first approve WETH spending. Confirm to sign.`,
    transaction: {
      to: CONTRACTS.ritual.swapRouter,
      data,
      value: 0n,
      chainId: CHAIN_IDS.RITUAL,
    },
  };
}

function buildSwapRitualToWETH(amount: string, userAddress: `0x${string}`): ToolResult {
  const amountBn = BigInt(amount);
  const data = encodeFunctionData({
    abi: SWAP_ROUTER_ABI,
    functionName: 'swapExactRITUALForWETH',
    args: [0n], // minAmountOut=0 for now; frontend can adjust
  });

  return {
    success: true,
    data: { action: 'swap_ritual_to_weth', amount },
    message: `Transaction ready: Swap ${formatEther(amountBn)} RITUAL → WETH on Ritual DEX.\nConfirm to sign.`,
    transaction: {
      to: CONTRACTS.ritual.swapRouter,
      data,
      value: amountBn,
      chainId: CHAIN_IDS.RITUAL,
    },
  };
}

function buildBurnWETH(amount: string, destinationChainId: number, userAddress: `0x${string}`): ToolResult {
  const amountBn = BigInt(amount);
  const data = encodeFunctionData({
    abi: BRIDGE_MINT_ABI,
    functionName: 'burnWETH',
    args: [amountBn, BigInt(destinationChainId)],
  });

  return {
    success: true,
    data: { action: 'burn_weth', amount, destinationChainId },
    message: `Transaction ready: Burn ${formatEther(amountBn)} WETH on Ritual → relayer will unlock ETH on ${getChainName(destinationChainId)}.\nNote: You must first approve WETH spending for BridgeMint. Confirm to sign.`,
    transaction: {
      to: CONTRACTS.ritual.bridgeMint,
      data,
      value: 0n,
      chainId: CHAIN_IDS.RITUAL,
    },
  };
}
