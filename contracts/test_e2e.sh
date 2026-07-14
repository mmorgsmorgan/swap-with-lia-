#!/bin/bash
set -e
export PATH="/home/chief/.foundry/bin:/usr/bin:/bin:$PATH"

PK="${DEPLOYER_PRIVATE_KEY:?set DEPLOYER_PRIVATE_KEY env var}"
RPC="https://rpc.ritualfoundation.org"
WETH="0xB0744700a04A33536B91604Bf5C423e3FB97883E"
ROUTER="0xf27b0c56452443F5306C5904100A0fde6F23577B"
WALLET="0xa328965678467d9C039Ec9eafA9362E488469200"

echo "=== E2E Test Suite for Ritual Swap ==="
echo ""

# Test 1: Mint 5 WETH to wallet
echo "--- Test 1: Mint 5 WETH ---"
TX1=$(cast send $WETH "mint(address,uint256)" $WALLET 5000000000000000000 --rpc-url $RPC --private-key $PK --json 2>&1)
echo "$TX1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  Status: {d[\"status\"]}, TX: {d[\"transactionHash\"]}')" 2>/dev/null || echo "  TX sent"

# Check WETH balance
echo "--- WETH Balance ---"
BAL=$(cast call $WETH "balanceOf(address)(uint256)" $WALLET --rpc-url $RPC)
echo "  WETH balance: $BAL"

# Test 2: Approve Router to spend WETH
echo ""
echo "--- Test 2: Approve Router ---"
TX2=$(cast send $WETH "approve(address,uint256)" $ROUTER 5000000000000000000 --rpc-url $RPC --private-key $PK --json 2>&1)
echo "$TX2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  Status: {d[\"status\"]}, TX: {d[\"transactionHash\"]}')" 2>/dev/null || echo "  TX sent"

# Test 3: Swap 2 WETH → RITUAL via swapExactWETHForRITUAL
echo ""
echo "--- Test 3: Swap 2 WETH → RITUAL ---"
QUOTE=$(cast call $ROUTER "getQuoteWETHToRITUAL(uint256)(uint256)" 2000000000000000000 --rpc-url $RPC)
echo "  Quote: 2 WETH → $QUOTE RITUAL"
# Set min output to 0 for testing
TX3=$(cast send $ROUTER "swapExactWETHForRITUAL(uint256,uint256)" 2000000000000000000 0 --rpc-url $RPC --private-key $PK --json 2>&1)
echo "$TX3" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  Status: {d[\"status\"]}, TX: {d[\"transactionHash\"]}')" 2>/dev/null || echo "  TX sent"

# Check balances after swap
echo ""
echo "--- Post-Swap Balances ---"
WETH_BAL=$(cast call $WETH "balanceOf(address)(uint256)" $WALLET --rpc-url $RPC)
RITUAL_BAL=$(cast balance $WALLET --rpc-url $RPC --ether)
echo "  WETH: $WETH_BAL"
echo "  RITUAL: $RITUAL_BAL"

# Test 4: Swap RITUAL → WETH via swapExactRITUALForWETH (send 0.01 RITUAL)
echo ""
echo "--- Test 4: Swap 0.01 RITUAL → WETH ---"
TX4=$(cast send $ROUTER "swapExactRITUALForWETH(uint256)" 0 --value 10000000000000000 --rpc-url $RPC --private-key $PK --json 2>&1)
echo "$TX4" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  Status: {d[\"status\"]}, TX: {d[\"transactionHash\"]}')" 2>/dev/null || echo "  TX sent"

# Final balances
echo ""
echo "--- Final Balances ---"
WETH_BAL2=$(cast call $WETH "balanceOf(address)(uint256)" $WALLET --rpc-url $RPC)
RITUAL_BAL2=$(cast balance $WALLET --rpc-url $RPC --ether)
echo "  WETH: $WETH_BAL2"
echo "  RITUAL: $RITUAL_BAL2"

# Pool reserves
echo ""
echo "--- Pool Reserves After Tests ---"
cast call $ROUTER "getPoolReserves()(uint256,uint256)" --rpc-url $RPC

# Test 5: Lock ETH on Base Sepolia (cross-chain bridge test)
echo ""
echo "--- Test 5: Lock 0.001 ETH on Base Sepolia (Bridge Test) ---"
BASE_RPC="https://sepolia.base.org"
BRIDGE_LOCK="0x15a3CDbf88c50Fab60A1D0f71E9186ab2c012444"
TX5=$(cast send $BRIDGE_LOCK "lockETH(uint256,address,bool)" 1979 $WALLET false --value 1000000000000000 --rpc-url $BASE_RPC --private-key $PK --json 2>&1)
echo "$TX5" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  Status: {d[\"status\"]}, TX: {d[\"transactionHash\"]}')" 2>/dev/null || echo "  TX sent"

echo ""
echo "=== ALL E2E TESTS COMPLETE ==="
