# Ritual Swap — Hybrid DEX + AI Intent Platform

Cross-chain decentralized exchange with traditional DEX + AI-powered intent interface.

## Chains
- Ethereum Sepolia (11155111)
- Base Sepolia (84532)
- Ritual (1979)

## Architecture
- `contracts/` — Foundry smart contracts (WETH, WRITUAL, SwapRouter, Bridge, etc.)
- `packages/config/` — Shared chain config, ABIs, addresses
- `packages/ai-agent/` — AI agent tools & orchestration
- `services/relayer/` — Bridge relayer service

## Quick Start

```bash
# Contracts
cd contracts && forge build && forge test

# Relayer
cd services/relayer && npm install && npm run dev

# Full test
npm run test:contracts
```

## Token Flow
```
ETH (Sepolia) → lock → WETH (Ritual) → swap → RITUAL
RITUAL → swap → WETH → burn → ETH (Sepolia)
```

Exchange rate: 20 WETH = 1 RITUAL
