import { createPublicClient, http, formatEther } from 'viem';
import { config } from './config.js';
import { SWAP_ROUTER_ABI } from '@ritual-swap/config';

const ritualClient = createPublicClient({
  transport: http(config.chains.ritual.rpc),
});

/**
 * Calculate minimum output for a WETH→RITUAL swap with slippage protection.
 */
export async function calculateMinOutput(
  wethAmount: bigint,
  slippageBps: number = config.bridge.defaultSlippageBps
): Promise<{ expectedOutput: bigint; minOutput: bigint }> {
  try {
    const expectedOutput = await ritualClient.readContract({
      address: config.chains.ritual.swapRouterAddress,
      abi: SWAP_ROUTER_ABI,
      functionName: 'getQuoteWETHToRITUAL',
      args: [wethAmount],
    }) as bigint;

    // Apply slippage: minOutput = expected * (10000 - slippageBps) / 10000
    const minOutput = (expectedOutput * BigInt(10000 - slippageBps)) / 10000n;

    console.log(
      `  📊 Swap quote: ${formatEther(wethAmount)} WETH → ${formatEther(expectedOutput)} RITUAL ` +
      `(min: ${formatEther(minOutput)}, slippage: ${slippageBps / 100}%)`
    );

    return { expectedOutput, minOutput };
  } catch (error) {
    console.error('  ⚠️ Failed to get swap quote, using minOutput=0 (accept any):', error);
    return { expectedOutput: 0n, minOutput: 0n };
  }
}

/**
 * Check if swap should fallback to standard bridge (e.g. pool has no liquidity).
 */
export function shouldFallback(expectedOutput: bigint): boolean {
  return expectedOutput === 0n;
}
