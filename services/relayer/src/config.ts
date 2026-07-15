import 'dotenv/config';

export const config = {
  relayerPrivateKey: (process.env.RELAYER_PRIVATE_KEY ?? '') as `0x${string}`,

  chains: {
    ethereumSepolia: {
      chainId: 11155111,
      rpc: process.env.ETHEREUM_SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com',
      bridgeLockAddress: (process.env.ETH_SEPOLIA_BRIDGE_LOCK ?? '') as `0x${string}`,
    },
    baseSepolia: {
      chainId: 84532,
      rpc: process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org',
      bridgeLockAddress: (process.env.BASE_SEPOLIA_BRIDGE_LOCK ?? '') as `0x${string}`,
    },
    ritual: {
      chainId: 1979,
      rpc: process.env.RITUAL_RPC || 'https://rpc.ritualfoundation.org',
      bridgeMintAddress: (process.env.RITUAL_BRIDGE_MINT ?? '') as `0x${string}`,
      crossChainSwapAddress: (process.env.RITUAL_CROSS_CHAIN_SWAP ?? '') as `0x${string}`,
      swapRouterAddress: (process.env.RITUAL_SWAP_ROUTER ?? '') as `0x${string}`,
    },
  },

  polling: {
    intervalMs: parseInt(process.env.POLL_INTERVAL_MS || '5000'),
    confirmations: parseInt(process.env.CONFIRMATIONS || '1'),
  },

  bridge: {
    minAmount: 0n,
    maxAmount: BigInt(process.env.MAX_BRIDGE_AMOUNT || '1000000000000000000000'), // 1000 ETH
    defaultSlippageBps: parseInt(process.env.SLIPPAGE_BPS || '100'), // 1%
  },

  health: {
    // Railway/Render inject PORT and probe it — prefer it over our own setting.
    port: parseInt(process.env.PORT || process.env.HEALTH_PORT || '3001'),
  },

  db: {
    path: process.env.DB_PATH || './relayer.db',
  },
};

export function validateConfig(): void {
  const errors: string[] = [];
  if (!config.relayerPrivateKey || !config.relayerPrivateKey.startsWith('0x')) {
    errors.push('RELAYER_PRIVATE_KEY is required and must start with 0x');
  }
  if (!config.chains.ethereumSepolia.bridgeLockAddress) {
    errors.push('ETH_SEPOLIA_BRIDGE_LOCK is required');
  }
  if (!config.chains.ritual.bridgeMintAddress) {
    errors.push('RITUAL_BRIDGE_MINT is required');
  }
  if (!config.chains.ritual.crossChainSwapAddress) {
    errors.push('RITUAL_CROSS_CHAIN_SWAP is required');
  }
  if (errors.length > 0) {
    console.error('❌ Configuration errors:');
    errors.forEach((e) => console.error(`  • ${e}`));
    process.exit(1);
  }
}
