import { createPublicClient, http, parseAbiItem, type PublicClient, formatEther } from 'viem';
import { config } from './config.js';
import { BRIDGE_LOCK_ABI, BRIDGE_MINT_ABI } from '@ritual-swap/config';
import { NonceDB } from './db.js';

export interface LockEvent {
  sender: `0x${string}`;
  amount: bigint;
  destinationChainId: bigint;
  recipient: `0x${string}`;
  nonce: bigint;
  directSwap: boolean;
  txHash: `0x${string}`;
  sourceChainId: number;
  blockNumber: bigint;
}

export interface BurnForUnlockEvent {
  sender: `0x${string}`;
  amount: bigint;
  destinationChainId: bigint;
  nonce: bigint;
  txHash: `0x${string}`;
  blockNumber: bigint;
}

const LOCKED_EVENT = parseAbiItem(
  'event Locked(address indexed sender, uint256 amount, uint256 destinationChainId, address indexed recipient, uint256 nonce, bool directSwap)'
);

const BURN_EVENT = parseAbiItem(
  'event BurnForUnlock(address indexed sender, uint256 amount, uint256 destinationChainId, uint256 nonce)'
);

/**
 * Monitors multiple chains for bridge events using polling with getLogs.
 */
export class ChainMonitor {
  private clients: Map<number, PublicClient> = new Map();
  private db: NonceDB;

  constructor(db: NonceDB) {
    this.db = db;

    // Create clients for source chains
    this.clients.set(
      config.chains.ethereumSepolia.chainId,
      createPublicClient({ transport: http(config.chains.ethereumSepolia.rpc) })
    );
    this.clients.set(
      config.chains.baseSepolia.chainId,
      createPublicClient({ transport: http(config.chains.baseSepolia.rpc) })
    );
    // Ritual client for burn events
    this.clients.set(
      config.chains.ritual.chainId,
      createPublicClient({ transport: http(config.chains.ritual.rpc) })
    );
  }

  /**
   * Poll for Locked events on a source chain (Ethereum Sepolia or Base Sepolia)
   */
  async pollLockedEvents(chainId: number): Promise<LockEvent[]> {
    const client = this.clients.get(chainId);
    if (!client) throw new Error(`No client for chain ${chainId}`);

    const bridgeLockAddress = chainId === config.chains.ethereumSepolia.chainId
      ? config.chains.ethereumSepolia.bridgeLockAddress
      : config.chains.baseSepolia.bridgeLockAddress;

    if (!bridgeLockAddress) return [];

    const currentBlock = await client.getBlockNumber();
    const lastBlock = this.db.getLastBlock(chainId, 'lock');
    const fromBlock = lastBlock ? lastBlock + 1n : currentBlock - 20n; // small first-run lookback (public RPCs reject deep getLogs)

    if (fromBlock > currentBlock) return [];

    const logs = await client.getLogs({
      address: bridgeLockAddress,
      event: LOCKED_EVENT,
      fromBlock,
      toBlock: currentBlock,
    });

    this.db.setLastBlock(chainId, 'lock', currentBlock);

    return logs.map((log) => ({
      sender: log.args.sender!,
      amount: log.args.amount!,
      destinationChainId: log.args.destinationChainId!,
      recipient: log.args.recipient!,
      nonce: log.args.nonce!,
      directSwap: log.args.directSwap!,
      txHash: log.transactionHash!,
      sourceChainId: chainId,
      blockNumber: log.blockNumber!,
    }));
  }

  /**
   * Poll for BurnForUnlock events on Ritual chain
   */
  async pollBurnEvents(): Promise<BurnForUnlockEvent[]> {
    const client = this.clients.get(config.chains.ritual.chainId);
    if (!client) throw new Error('No Ritual client');

    const bridgeMintAddress = config.chains.ritual.bridgeMintAddress;
    if (!bridgeMintAddress) return [];

    const currentBlock = await client.getBlockNumber();
    const lastBlock = this.db.getLastBlock(config.chains.ritual.chainId, 'burn');
    const fromBlock = lastBlock ? lastBlock + 1n : currentBlock - 20n;

    if (fromBlock > currentBlock) return [];

    const logs = await client.getLogs({
      address: bridgeMintAddress,
      event: BURN_EVENT,
      fromBlock,
      toBlock: currentBlock,
    });

    this.db.setLastBlock(config.chains.ritual.chainId, 'burn', currentBlock);

    return logs.map((log) => ({
      sender: log.args.sender!,
      amount: log.args.amount!,
      destinationChainId: log.args.destinationChainId!,
      nonce: log.args.nonce!,
      txHash: log.transactionHash!,
      blockNumber: log.blockNumber!,
    }));
  }

  getClient(chainId: number): PublicClient | undefined {
    return this.clients.get(chainId);
  }
}
