import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_balances',
      description: 'Get wallet balances across all supported chains (ETH on Ethereum Sepolia, ETH on Base Sepolia, WETH on Ritual, RITUAL native balance)',
      parameters: {
        type: 'object',
        properties: {
          address: { type: 'string', description: 'Wallet address (0x...)' },
        },
        required: ['address'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_swap_quote',
      description: 'Get a quote for swapping between WETH and RITUAL on the Ritual DEX',
      parameters: {
        type: 'object',
        properties: {
          direction: {
            type: 'string',
            enum: ['weth_to_ritual', 'ritual_to_weth'],
            description: 'Swap direction',
          },
          amount: { type: 'string', description: 'Amount in wei (e.g. "1000000000000000000" for 1 token)' },
        },
        required: ['direction', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bridge_eth_to_weth',
      description: 'Bridge ETH from a source chain (Ethereum Sepolia or Base Sepolia) to WETH on Ritual. Path 1: user receives WETH on Ritual.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'string', description: 'Amount of ETH in wei' },
          sourceChainId: { type: 'number', enum: [11155111, 84532], description: 'Source chain ID' },
        },
        required: ['amount', 'sourceChainId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'direct_swap_eth_to_ritual',
      description: 'Direct cross-chain swap: ETH on source chain → native RITUAL on Ritual. Path 2: atomic bridge+swap. Recommended for users who want RITUAL.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'string', description: 'Amount of ETH in wei' },
          sourceChainId: { type: 'number', enum: [11155111, 84532], description: 'Source chain ID' },
        },
        required: ['amount', 'sourceChainId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'swap_weth_to_ritual',
      description: 'Swap WETH → native RITUAL on the Ritual DEX',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'string', description: 'Amount of WETH in wei' },
        },
        required: ['amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'swap_ritual_to_weth',
      description: 'Swap native RITUAL → WETH on the Ritual DEX',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'string', description: 'Amount of RITUAL in wei' },
        },
        required: ['amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bridge_weth_to_eth',
      description: 'Burn WETH on Ritual to unlock ETH on a source chain (return trip). User must first swap RITUAL → WETH if they hold RITUAL.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'string', description: 'Amount of WETH to burn in wei' },
          destinationChainId: { type: 'number', enum: [11155111, 84532], description: 'Destination chain to unlock ETH on' },
        },
        required: ['amount', 'destinationChainId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'estimate_gas',
      description: 'Estimate gas cost for an operation on a specific chain',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['lock_eth', 'swap_weth_ritual', 'swap_ritual_weth', 'burn_weth', 'approve'],
            description: 'Operation type',
          },
          chainId: { type: 'number', description: 'Chain ID to estimate on' },
        },
        required: ['operation', 'chainId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pool_reserves',
      description: 'Get current WETH/WRITUAL pool reserves and calculate the effective exchange rate',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_exchange_rate',
      description: 'Get the current WETH:RITUAL exchange rate based on pool reserves',
      parameters: { type: 'object', properties: {} },
    },
  },
];
