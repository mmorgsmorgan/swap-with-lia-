import { CONTRACTS } from './contracts.js';
import { CHAIN_IDS } from './chains.js';

export interface TokenDefinition {
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  address?: `0x${string}`;
  isNative: boolean;
  internal?: boolean; // Hidden from user-facing UI
  logo?: string;
}

export const TOKENS: Record<string, TokenDefinition> = {
  ETH_ETHEREUM_SEPOLIA: {
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
    chainId: CHAIN_IDS.ETHEREUM_SEPOLIA,
    isNative: true,
  },
  ETH_BASE_SEPOLIA: {
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
    chainId: CHAIN_IDS.BASE_SEPOLIA,
    isNative: true,
  },
  WETH_RITUAL: {
    symbol: 'WETH',
    name: 'Wrapped ETH (Bridged)',
    decimals: 18,
    chainId: CHAIN_IDS.RITUAL,
    address: CONTRACTS.ritual.weth,
    isNative: false,
  },
  RITUAL_NATIVE: {
    symbol: 'RITUAL',
    name: 'RITUAL',
    decimals: 18,
    chainId: CHAIN_IDS.RITUAL,
    isNative: true,
  },
  WRITUAL: {
    symbol: 'WRITUAL',
    name: 'Wrapped RITUAL',
    decimals: 18,
    chainId: CHAIN_IDS.RITUAL,
    address: CONTRACTS.ritual.writual,
    isNative: false,
    internal: true, // Hidden from users — router handles wrapping
  },
};

/** Cross-chain bridge mapping: source chain ETH → WETH on Ritual */
export const BRIDGE_MAPPING: Record<number, {
  nativeToken: string;
  bridgedToken: string;
  ritualAddress: `0x${string}`;
}> = {
  [CHAIN_IDS.ETHEREUM_SEPOLIA]: {
    nativeToken: 'ETH',
    bridgedToken: 'WETH',
    ritualAddress: CONTRACTS.ritual.weth,
  },
  [CHAIN_IDS.BASE_SEPOLIA]: {
    nativeToken: 'ETH',
    bridgedToken: 'WETH',
    ritualAddress: CONTRACTS.ritual.weth,
  },
};

/** Fixed exchange rate: 20 WETH = 1 RITUAL (set by pool liquidity) */
export const EXCHANGE_RATE = {
  wethPerRitual: 20n,
} as const;

/** Get user-facing tokens for a chain (excludes internal tokens) */
export function getTokensForChain(chainId: number): TokenDefinition[] {
  return Object.values(TOKENS).filter(
    (t) => t.chainId === chainId && !t.internal
  );
}
