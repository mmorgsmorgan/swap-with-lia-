import { createWalletClient, createPublicClient, http, formatEther, type WalletClient, type PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as nodeHttp from 'node:http';
import { config, validateConfig } from './config.js';
import { RelayerSigner } from './signer.js';
import { NonceDB } from './db.js';
import { ChainMonitor, type LockEvent, type BurnForUnlockEvent } from './monitor.js';
import { calculateMinOutput, shouldFallback } from './slippage.js';
import {
  BRIDGE_MINT_ABI, CROSS_CHAIN_SWAP_ABI, BRIDGE_LOCK_ABI,
  ritualChain, ethereumSepolia, baseSepolia,
} from '@ritual-swap/config';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getChainName(chainId: number): string {
  switch (chainId) {
    case 11155111: return 'Ethereum Sepolia';
    case 84532: return 'Base Sepolia';
    case 1979: return 'Ritual';
    default: return `Chain ${chainId}`;
  }
}

class BridgeRelayer {
  private signer: RelayerSigner;
  private db: NonceDB;
  private monitor: ChainMonitor;
  private running = false;

  // Wallet clients for sending transactions
  private ritualWallet: WalletClient;
  private ethSepoliaWallet: WalletClient;
  private baseSepoliaWallet: WalletClient;

  // Public clients for waiting on receipts
  private ritualPublic: PublicClient;
  private ethSepoliaPublic: PublicClient;
  private baseSepoliaPublic: PublicClient;

  constructor() {
    const account = privateKeyToAccount(config.relayerPrivateKey);

    this.signer = new RelayerSigner(config.relayerPrivateKey);
    this.db = new NonceDB(config.db.path);
    this.monitor = new ChainMonitor(this.db);

    this.ritualWallet = createWalletClient({
      account,
      chain: ritualChain,
      transport: http(config.chains.ritual.rpc),
    });
    this.ethSepoliaWallet = createWalletClient({
      account,
      chain: ethereumSepolia,
      transport: http(config.chains.ethereumSepolia.rpc),
    });
    this.baseSepoliaWallet = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(config.chains.baseSepolia.rpc),
    });

    this.ritualPublic = createPublicClient({ chain: ritualChain, transport: http(config.chains.ritual.rpc) });
    this.ethSepoliaPublic = createPublicClient({ chain: ethereumSepolia, transport: http(config.chains.ethereumSepolia.rpc) });
    this.baseSepoliaPublic = createPublicClient({ chain: baseSepolia, transport: http(config.chains.baseSepolia.rpc) });
  }

  async start(): Promise<void> {
    console.log('🚀 Bridge Relayer starting...');
    console.log(`📍 Relayer address: ${this.signer.address}`);
    console.log(`⏱️  Poll interval: ${config.polling.intervalMs}ms`);
    console.log(`📡 Ethereum Sepolia RPC: ${config.chains.ethereumSepolia.rpc}`);
    console.log(`📡 Base Sepolia RPC: ${config.chains.baseSepolia.rpc}`);
    console.log(`📡 Ritual RPC: ${config.chains.ritual.rpc}`);

    this.running = true;
    this.startHealthServer();
    await this.pollLoop();
  }

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        // Poll source chains for Locked events
        await this.processLockedEvents(config.chains.ethereumSepolia.chainId);
        await this.processLockedEvents(config.chains.baseSepolia.chainId);

        // Poll Ritual for BurnForUnlock events (return trips)
        await this.processBurnEvents();
      } catch (error) {
        console.error('❌ Poll cycle error:', error instanceof Error ? error.message : error);
      }

      await sleep(config.polling.intervalMs);
    }
  }

  // ==================== Forward: Lock → Mint/Swap ====================

  private async processLockedEvents(sourceChainId: number): Promise<void> {
    const events = await this.monitor.pollLockedEvents(sourceChainId);

    for (const event of events) {
      if (this.db.isProcessed(sourceChainId, event.nonce, 'lock')) continue;

      console.log(
        `\n📥 New Lock event on ${getChainName(sourceChainId)}: ` +
        `${formatEther(event.amount)} ETH, nonce=${event.nonce}, ` +
        `directSwap=${event.directSwap}, recipient=${event.recipient}`
      );

      this.db.markProcessing(sourceChainId, event.nonce, 'lock', event.txHash);

      try {
        if (event.directSwap) {
          await this.handleDirectSwap(event);
        } else {
          await this.handleStandardBridge(event);
        }
      } catch (error) {
        console.error(
          `  ❌ Failed to relay lock nonce=${event.nonce}:`,
          error instanceof Error ? error.message : error
        );
        this.db.markFailed(sourceChainId, event.nonce, 'lock');
      }
    }
  }

  /**
   * Path 1: Standard bridge — mint WETH to recipient on Ritual
   */
  private async handleStandardBridge(event: LockEvent): Promise<void> {
    console.log(`  🌉 Standard bridge: ${formatEther(event.amount)} ETH → WETH for ${event.recipient}`);

    // Sign mint message
    const signature = await this.signer.signMintMessage(
      event.recipient,
      event.amount,
      event.sourceChainId,
      event.nonce,
      config.chains.ritual.bridgeMintAddress,
      config.chains.ritual.chainId
    );

    // Send mintWETH transaction on Ritual
    const txHash = await this.ritualWallet.writeContract({
      chain: ritualChain,
      account: this.ritualWallet.account!,
      address: config.chains.ritual.bridgeMintAddress,
      abi: BRIDGE_MINT_ABI,
      functionName: 'mintWETH',
      args: [event.recipient, event.amount, BigInt(event.sourceChainId), event.nonce, signature],
    });

    console.log(`  📤 Mint tx sent: ${txHash}`);

    // Wait for confirmation
    const receipt = await this.ritualPublic.waitForTransactionReceipt({
      hash: txHash,
      confirmations: config.polling.confirmations,
    });

    if (receipt.status === 'success') {
      console.log(`  ✅ Minted ${formatEther(event.amount)} WETH to ${event.recipient}`);
      this.db.markCompleted(event.sourceChainId, event.nonce, 'lock', txHash);
    } else {
      console.error(`  ❌ Mint tx reverted: ${txHash}`);
      this.db.markFailed(event.sourceChainId, event.nonce, 'lock');
    }
  }

  /**
   * Path 2: Direct swap — mint WETH + swap to RITUAL atomically
   */
  private async handleDirectSwap(event: LockEvent): Promise<void> {
    console.log(`  ⚡ Direct swap: ${formatEther(event.amount)} ETH → RITUAL for ${event.recipient}`);

    // Calculate slippage-protected minimum output
    const { expectedOutput, minOutput } = await calculateMinOutput(event.amount);

    if (shouldFallback(expectedOutput)) {
      console.log('  ⚠️ Pool has no liquidity, falling back to standard bridge');
      await this.handleStandardBridge(event);
      return;
    }

    // Sign swap message
    const signature = await this.signer.signSwapMessage(
      event.recipient,
      event.amount,
      minOutput,
      event.sourceChainId,
      event.nonce,
      config.chains.ritual.crossChainSwapAddress,
      config.chains.ritual.chainId
    );

    // Send bridgeAndSwap transaction on Ritual
    const txHash = await this.ritualWallet.writeContract({
      chain: ritualChain,
      account: this.ritualWallet.account!,
      address: config.chains.ritual.crossChainSwapAddress,
      abi: CROSS_CHAIN_SWAP_ABI,
      functionName: 'bridgeAndSwap',
      args: [event.recipient, event.amount, minOutput, BigInt(event.sourceChainId), event.nonce, signature],
    });

    console.log(`  📤 CrossChainSwap tx sent: ${txHash}`);

    const receipt = await this.ritualPublic.waitForTransactionReceipt({
      hash: txHash,
      confirmations: config.polling.confirmations,
    });

    if (receipt.status === 'success') {
      console.log(`  ✅ Direct swap completed for ${event.recipient}`);
      this.db.markCompleted(event.sourceChainId, event.nonce, 'lock', txHash);
    } else {
      console.error(`  ❌ CrossChainSwap tx reverted: ${txHash}`);
      this.db.markFailed(event.sourceChainId, event.nonce, 'lock');
    }
  }

  // ==================== Return: Burn → Unlock ====================

  private async processBurnEvents(): Promise<void> {
    const events = await this.monitor.pollBurnEvents();

    for (const event of events) {
      const ritualChainId = config.chains.ritual.chainId;
      if (this.db.isProcessed(ritualChainId, event.nonce, 'burn')) continue;

      console.log(
        `\n🔥 New BurnForUnlock on Ritual: ${formatEther(event.amount)} WETH, ` +
        `nonce=${event.nonce}, dest=${getChainName(Number(event.destinationChainId))}`
      );

      this.db.markProcessing(ritualChainId, event.nonce, 'burn', event.txHash);

      try {
        await this.handleUnlock(event);
      } catch (error) {
        console.error(
          `  ❌ Failed to unlock nonce=${event.nonce}:`,
          error instanceof Error ? error.message : error
        );
        this.db.markFailed(ritualChainId, event.nonce, 'burn');
      }
    }
  }

  /**
   * Return trip: unlock ETH on destination chain after WETH burn on Ritual
   */
  private async handleUnlock(event: BurnForUnlockEvent): Promise<void> {
    const destChainId = Number(event.destinationChainId);
    console.log(`  🔓 Unlocking ${formatEther(event.amount)} ETH on ${getChainName(destChainId)}`);

    // Pick the right wallet and public client
    let wallet: WalletClient;
    let publicClient: PublicClient;
    let bridgeLockAddress: `0x${string}`;

    if (destChainId === config.chains.ethereumSepolia.chainId) {
      wallet = this.ethSepoliaWallet;
      publicClient = this.ethSepoliaPublic;
      bridgeLockAddress = config.chains.ethereumSepolia.bridgeLockAddress;
    } else if (destChainId === config.chains.baseSepolia.chainId) {
      wallet = this.baseSepoliaWallet;
      publicClient = this.baseSepoliaPublic;
      bridgeLockAddress = config.chains.baseSepolia.bridgeLockAddress;
    } else {
      throw new Error(`Unsupported destination chain: ${destChainId}`);
    }

    // Sign unlock message (bound to the destination BridgeLock address)
    const signature = await this.signer.signUnlockMessage(
      event.sender,
      event.amount,
      event.nonce,
      destChainId,
      bridgeLockAddress
    );

    // Send unlockETH transaction
    const txHash = await wallet.writeContract({
      chain: destChainId === config.chains.ethereumSepolia.chainId ? ethereumSepolia : baseSepolia,
      account: wallet.account!,
      address: bridgeLockAddress,
      abi: BRIDGE_LOCK_ABI,
      functionName: 'unlockETH',
      args: [event.sender, event.amount, event.nonce, signature],
    });

    console.log(`  📤 Unlock tx sent: ${txHash}`);

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: config.polling.confirmations,
    });

    if (receipt.status === 'success') {
      console.log(`  ✅ Unlocked ${formatEther(event.amount)} ETH to ${event.sender} on ${getChainName(destChainId)}`);

      // ETH released — now burn the escrowed WETH on Ritual (finalize the return).
      // Only after this does the WETH actually leave supply; if unlock had failed we
      // would skip this and the user could reclaim their escrowed WETH after the timeout.
      try {
        const finalizeTx = await this.ritualWallet.writeContract({
          chain: ritualChain,
          account: this.ritualWallet.account!,
          address: config.chains.ritual.bridgeMintAddress,
          abi: BRIDGE_MINT_ABI,
          functionName: 'finalizeReturn',
          args: [event.nonce],
        });
        await this.ritualPublic.waitForTransactionReceipt({ hash: finalizeTx });
        console.log(`  🔥 Finalized return nonce=${event.nonce} (escrow burned): ${finalizeTx}`);
      } catch (err) {
        console.error(`  ⚠️ Unlock succeeded but finalizeReturn failed for nonce=${event.nonce}:`, err instanceof Error ? err.message : err);
      }

      this.db.markCompleted(config.chains.ritual.chainId, event.nonce, 'burn', txHash);
    } else {
      console.error(`  ❌ Unlock tx reverted: ${txHash}`);
      this.db.markFailed(config.chains.ritual.chainId, event.nonce, 'burn');
    }
  }

  // ==================== Health Server ====================

  private startHealthServer(): void {
    const server = nodeHttp.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'healthy',
          relayer: this.signer.address,
          running: this.running,
          chains: {
            ethereumSepolia: config.chains.ethereumSepolia.chainId,
            baseSepolia: config.chains.baseSepolia.chainId,
            ritual: config.chains.ritual.chainId,
          },
          timestamp: new Date().toISOString(),
        }));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(config.health.port, () => {
      console.log(`🏥 Health server on http://localhost:${config.health.port}/health`);
    });
  }

  stop(): void {
    console.log('\n🛑 Relayer shutting down...');
    this.running = false;
    this.db.close();
  }
}

// ==================== Main ====================

validateConfig();

const relayer = new BridgeRelayer();
relayer.start().catch((err) => {
  console.error('💀 Fatal error:', err);
  process.exit(1);
});

process.on('SIGINT', () => { relayer.stop(); process.exit(0); });
process.on('SIGTERM', () => { relayer.stop(); process.exit(0); });
