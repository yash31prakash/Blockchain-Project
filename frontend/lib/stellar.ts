import * as StellarSdk from "@stellar/stellar-sdk";
import { isConnected, getPublicKey, signTransaction } from "@stellar/freighter-api";

// Testnet constants
export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
export const TESTNET_HORIZON = "https://horizon-testnet.stellar.org";
export const TESTNET_RPC = "https://soroban-testnet.stellar.org";

/**
 * Returns the network configurations pointing strictly to Stellar Testnet
 */
export function getNetworkConfig() {
  return {
    rpcUrl: TESTNET_RPC,
    networkPassphrase: TESTNET_PASSPHRASE,
    horizonUrl: TESTNET_HORIZON,
  };
}

/**
 * Checks Freighter wallet status and gets the public key
 */
export async function getFreighterPublicKey(): Promise<string> {
  const connected = await isConnected();
  if (!connected) {
    throw new Error("Freighter wallet extension not detected. Please install Freighter.");
  }
  
  try {
    const publicKey = await getPublicKey();
    if (!publicKey) {
      throw new Error("No public key returned. Please unlock Freighter and authorize this site.");
    }
    return publicKey;
  } catch (err: any) {
    throw new Error(err.message || "Failed to retrieve public key from Freighter.");
  }
}

/**
 * Funds the specified public key using Stellar's Testnet Friendbot
 */
export async function fundWithFriendbot(publicKey: string): Promise<boolean> {
  try {
    const response = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(publicKey)}`);
    if (!response.ok) {
      throw new Error(`Friendbot failed with status ${response.status}`);
    }
    return true;
  } catch (err: any) {
    console.error("Friendbot funding error:", err);
    throw new Error(err.message || "Failed to fund account via Friendbot.");
  }
}

/**
 * Gets the native XLM balance (in Stroops) for the given public key
 */
export async function getXlmBalance(publicKey: string): Promise<string> {
  try {
    const horizonServer = new StellarSdk.Horizon.Server(TESTNET_HORIZON);
    const account = await horizonServer.loadAccount(publicKey);
    const nativeBalance = account.balances.find((b) => b.asset_type === "native");
    if (nativeBalance) {
      // Native balance is in XLM. Multiply by 10,000,000 to get Stroops.
      const amountFloat = parseFloat(nativeBalance.balance);
      const stroops = Math.round(amountFloat * 10000000).toString();
      return stroops;
    }
    return "0";
  } catch (err: any) {
    // If the account does not exist on-chain yet, it will return a 404
    if (err.response && err.response.status === 404) {
      return "0";
    }
    console.error("Error fetching balance:", err);
    return "0";
  }
}

/**
 * Signs a transaction XDR string with Freighter and submits it to the Soroban RPC server
 */
export async function signAndSubmitTransaction(xdr: string): Promise<any> {
  try {
    const connected = await isConnected();
    if (!connected) {
      throw new Error("Freighter wallet not connected.");
    }

    // Request signature from Freighter
    const signedXdr = await signTransaction(xdr, {
      network: "TESTNET",
    });

    if (!signedXdr) {
      throw new Error("Transaction signing was rejected or failed.");
    }

    // Build transaction object and submit to Soroban RPC
    const rpcServer = new StellarSdk.rpc.Server(TESTNET_RPC);
    const transaction = StellarSdk.TransactionBuilder.fromXDR(signedXdr, TESTNET_PASSPHRASE);
    const response = await rpcServer.sendTransaction(transaction);
    
    if (response.status === "ERROR") {
      throw new Error(`Submission error: ${JSON.stringify(response)}`);
    }

    // Poll for completion
    let attempts = 0;
    while (attempts < 30) {
      const txResult = await rpcServer.getTransaction(response.hash);
      if (txResult.status === "SUCCESS") {
        return txResult;
      } else if (txResult.status === "FAILED") {
        throw new Error(`Transaction failed on chain: ${JSON.stringify(txResult)}`);
      }
      // NOT_FOUND means it's still pending
      await new Promise(resolve => setTimeout(resolve, 3000));
      attempts++;
    }
    
    throw new Error("Transaction timed out after 90 seconds.");
  } catch (err: any) {
    console.error("Transaction submission failed:", err);
    throw new Error(err.message || "Failed to sign or submit transaction.");
  }
}
