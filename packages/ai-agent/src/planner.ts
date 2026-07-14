import { ExecutionPath, type TransactionPlan, type TransactionStep } from '@ritual-swap/config';
import { CHAIN_IDS } from '@ritual-swap/config';

export function planForwardRoute(
  amount: bigint,
  sourceChainId: number,
  wantRitual: boolean
): TransactionPlan {
  const chainName = sourceChainId === CHAIN_IDS.ETHEREUM_SEPOLIA ? 'Ethereum Sepolia' : 'Base Sepolia';

  if (wantRitual) {
    // Path 2: Direct swap — single lock tx with directSwap=true
    return {
      steps: [
        {
          id: 1,
          action: 'lock_eth_direct',
          description: `Lock ETH on ${chainName} with direct swap flag. The relayer will automatically bridge to WETH and swap to RITUAL on Ritual.`,
          chainId: sourceChainId,
          status: 'pending',
          tokenSymbol: 'ETH',
          amount,
          gasEstimate: 65000n,
        },
      ],
      totalGasEstimate: 65000n,
      estimatedTimeSeconds: 120,
    };
  }

  // Path 1: Bridge to WETH only
  return {
    steps: [
      {
        id: 1,
        action: 'lock_eth',
        description: `Lock ETH on ${chainName}. The relayer will mint WETH on Ritual.`,
        chainId: sourceChainId,
        status: 'pending',
        tokenSymbol: 'ETH',
        amount,
        gasEstimate: 60000n,
      },
    ],
    totalGasEstimate: 60000n,
    estimatedTimeSeconds: 60,
  };
}

export function planReturnRoute(
  ritualAmount: bigint,
  destinationChainId: number
): TransactionPlan {
  const chainName = destinationChainId === CHAIN_IDS.ETHEREUM_SEPOLIA ? 'Ethereum Sepolia' : 'Base Sepolia';

  return {
    steps: [
      {
        id: 1,
        action: 'swap_ritual_to_weth',
        description: `Swap RITUAL → WETH on the Ritual DEX.`,
        chainId: CHAIN_IDS.RITUAL,
        status: 'pending',
        tokenSymbol: 'RITUAL',
        amount: ritualAmount,
        gasEstimate: 150000n,
      },
      {
        id: 2,
        action: 'approve_weth',
        description: `Approve BridgeMint to spend your WETH.`,
        chainId: CHAIN_IDS.RITUAL,
        status: 'pending',
        tokenSymbol: 'WETH',
        gasEstimate: 46000n,
      },
      {
        id: 3,
        action: 'burn_weth',
        description: `Burn WETH on Ritual. The relayer will unlock ETH on ${chainName}.`,
        chainId: CHAIN_IDS.RITUAL,
        status: 'pending',
        tokenSymbol: 'WETH',
        gasEstimate: 80000n,
      },
    ],
    totalGasEstimate: 276000n,
    estimatedTimeSeconds: 180,
  };
}

export function recommendPath(userIntent: string): ExecutionPath {
  const lower = userIntent.toLowerCase();
  const bridgeKeywords = ['bridge', 'weth', 'wrapped eth', 'only bridge', 'just bridge'];
  const swapKeywords = ['swap', 'move', 'convert', 'buy ritual', 'get ritual', 'send', 'transfer'];

  if (bridgeKeywords.some((kw) => lower.includes(kw))) {
    return ExecutionPath.BRIDGE_TO_WETH;
  }
  if (swapKeywords.some((kw) => lower.includes(kw))) {
    return ExecutionPath.DIRECT_SWAP;
  }
  // Default to direct swap for simplicity
  return ExecutionPath.DIRECT_SWAP;
}

export function formatPlan(plan: TransactionPlan): string {
  const lines = plan.steps.map((s) => {
    const status = s.status === 'completed' ? '✅' : s.status === 'executing' ? '⏳' : '⬜';
    return `${status} Step ${s.id}: ${s.description}`;
  });

  lines.push(`\n⏱️ Estimated time: ~${plan.estimatedTimeSeconds}s`);
  return lines.join('\n');
}
