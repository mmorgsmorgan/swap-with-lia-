import { keccak256, encodeAbiParameters, type Hex } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

/**
 * Handles all cryptographic signing for bridge relay operations.
 * Signs messages that are verified on-chain by BridgeMint, CrossChainSwap, and BridgeLock.
 *
 * v2: hashes use abi.encode (not encodePacked) and bind the verifying contract address
 * (+ chainId) so a signature can't be replayed against a different deployment.
 */
export class RelayerSigner {
  private account: PrivateKeyAccount;

  constructor(privateKey: `0x${string}`) {
    this.account = privateKeyToAccount(privateKey);
  }

  get address(): `0x${string}` {
    return this.account.address;
  }

  /**
   * BridgeMint.mintWETH — keccak256(abi.encode(recipient, amount, sourceChainId, nonce, bridgeMint, chainId))
   */
  async signMintMessage(
    recipient: `0x${string}`,
    amount: bigint,
    sourceChainId: number,
    nonce: bigint,
    bridgeMint: `0x${string}`,
    mintChainId: number
  ): Promise<Hex> {
    const messageHash = keccak256(
      encodeAbiParameters(
        [{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }],
        [recipient, amount, BigInt(sourceChainId), nonce, bridgeMint, BigInt(mintChainId)]
      )
    );
    return await this.account.signMessage({ message: { raw: messageHash } });
  }

  /**
   * CrossChainSwap.bridgeAndSwap — keccak256(abi.encode(recipient, wethAmount, minRitualOut, sourceChainId, nonce, ccs, chainId))
   */
  async signSwapMessage(
    recipient: `0x${string}`,
    wethAmount: bigint,
    minRitualOut: bigint,
    sourceChainId: number,
    nonce: bigint,
    crossChainSwap: `0x${string}`,
    swapChainId: number
  ): Promise<Hex> {
    const messageHash = keccak256(
      encodeAbiParameters(
        [{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }],
        [recipient, wethAmount, minRitualOut, BigInt(sourceChainId), nonce, crossChainSwap, BigInt(swapChainId)]
      )
    );
    return await this.account.signMessage({ message: { raw: messageHash } });
  }

  /**
   * BridgeLock.unlockETH — keccak256(abi.encode(recipient, amount, nonce, chainId, bridgeLock))
   */
  async signUnlockMessage(
    recipient: `0x${string}`,
    amount: bigint,
    nonce: bigint,
    chainId: number,
    bridgeLock: `0x${string}`
  ): Promise<Hex> {
    const messageHash = keccak256(
      encodeAbiParameters(
        [{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address' }],
        [recipient, amount, nonce, BigInt(chainId), bridgeLock]
      )
    );
    return await this.account.signMessage({ message: { raw: messageHash } });
  }
}
