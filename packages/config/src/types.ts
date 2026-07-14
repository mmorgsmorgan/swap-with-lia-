export enum ExecutionPath {
  BRIDGE_TO_WETH = 'bridge_to_weth',
  DIRECT_SWAP = 'direct_swap',
}

export enum BridgeStatus {
  PENDING = 'pending',
  LOCKED = 'locked',
  RELAYING = 'relaying',
  MINTED = 'minted',
  SWAPPING = 'swapping',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface BridgeRequest {
  sender: `0x${string}`;
  recipient: `0x${string}`;
  amount: bigint;
  sourceChainId: number;
  destinationChainId: number;
  directSwap: boolean;
  nonce: bigint;
  txHash: `0x${string}`;
}

export interface SwapQuote {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint;
  priceImpact: number;
  fee: bigint;
  executionPath: ExecutionPath;
}

export interface TransactionPlan {
  steps: TransactionStep[];
  totalGasEstimate: bigint;
  estimatedTimeSeconds: number;
}

export interface TransactionStep {
  id: number;
  action: string;
  description: string;
  chainId: number;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  txHash?: `0x${string}`;
  tokenSymbol?: string;
  amount?: bigint;
  gasEstimate?: bigint;
}

export interface PoolReserves {
  reserveWETH: bigint;
  reserveWRITUAL: bigint;
  totalLPSupply: bigint;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolResults?: ToolResult[];
  timestamp: number;
}

export interface ToolResult {
  success: boolean;
  data: unknown;
  message: string;
  transaction?: UnsignedTransaction;
}

export interface UnsignedTransaction {
  to: `0x${string}`;
  data?: `0x${string}`;
  value: bigint;
  chainId: number;
}
