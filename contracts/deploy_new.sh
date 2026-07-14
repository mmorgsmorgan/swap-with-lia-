#!/bin/bash
set -e
export PATH="/home/chief/.foundry/bin:/usr/bin:/bin:$PATH"

export DEPLOYER_PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY:?set DEPLOYER_PRIVATE_KEY env var}"
DEPLOYER_ADDRESS=$(cast wallet address --private-key $DEPLOYER_PRIVATE_KEY)
export RELAYER_ADDRESS=$DEPLOYER_ADDRESS
export RITUAL_RPC="https://rpc.ritualfoundation.org"
export ETH_SEPOLIA_RPC="https://ethereum-sepolia-rpc.publicnode.com"
export BASE_SEPOLIA_RPC="https://sepolia.base.org"

echo "Deployer Address: $DEPLOYER_ADDRESS"

echo "Deploying to Ritual..."
forge script script/Deploy.s.sol:DeployRitual --rpc-url $RITUAL_RPC --broadcast --skip-simulation -vvv > deploy_ritual_new.log || echo "Ritual deploy failed"

echo "Deploying to ETH Sepolia..."
forge script script/Deploy.s.sol:DeploySourceChain --rpc-url $ETH_SEPOLIA_RPC --broadcast --skip-simulation -vvv > deploy_eth_new.log || echo "ETH deploy failed"

echo "Deploying to Base Sepolia..."
forge script script/Deploy.s.sol:DeploySourceChain --rpc-url $BASE_SEPOLIA_RPC --broadcast --skip-simulation -vvv > deploy_base_new.log || echo "Base deploy failed"

echo "--- RITUAL DEPLOYMENT RESULTS ---"
cat deploy_ritual_new.log | grep -E "===" -A 10 || true

echo "--- ETH SEPOLIA DEPLOYMENT RESULTS ---"
cat deploy_eth_new.log | grep -E "===" -A 3 || true

echo "--- BASE SEPOLIA DEPLOYMENT RESULTS ---"
cat deploy_base_new.log | grep -E "===" -A 3 || true
