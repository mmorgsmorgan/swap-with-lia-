import { defineChain } from 'viem';

export const ethereumSepolia = defineChain({
  id: 11155111,
  name: 'Ethereum Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://ethereum-sepolia-rpc.publicnode.com'] },
  },
  blockExplorers: {
    default: { name: 'Etherscan', url: 'https://sepolia.etherscan.io' },
  },
  testnet: true,
});

export const baseSepolia = defineChain({
  id: 84532,
  name: 'Base Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://sepolia.base.org'] },
  },
  blockExplorers: {
    default: { name: 'BaseScan', url: 'https://sepolia.basescan.org' },
  },
  testnet: true,
});

export const ritualChain = defineChain({
  id: 1979,
  name: 'Ritual',
  nativeCurrency: { name: 'RITUAL', symbol: 'RITUAL', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.ritualfoundation.org'] },
  },
  blockExplorers: {
    default: { name: 'Ritual Explorer', url: 'https://explorer.ritual.foundation' },
  },
  testnet: true,
});

export const SUPPORTED_CHAINS = [ethereumSepolia, baseSepolia, ritualChain] as const;

export const CHAIN_IDS = {
  ETHEREUM_SEPOLIA: 11155111,
  BASE_SEPOLIA: 84532,
  RITUAL: 1979,
} as const;

export function getChainById(chainId: number) {
  return SUPPORTED_CHAINS.find((c) => c.id === chainId);
}

export function isSourceChain(chainId: number): boolean {
  return chainId === CHAIN_IDS.ETHEREUM_SEPOLIA || chainId === CHAIN_IDS.BASE_SEPOLIA;
}
