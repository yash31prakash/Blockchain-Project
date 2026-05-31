import * as StellarSdk from "@stellar/stellar-sdk";
import { signAndSubmitTransaction, TESTNET_HORIZON } from "./stellar";
import { VaultInfo } from "../types";

// Load configuration from environment variables
const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID || "";
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://soroban-testnet.stellar.org";
const PASSPHRASE = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || "Test SDF Network ; September 2015";

/**
 * Helper to convert a public key string into a Soroban Address ScVal
 */
function addressToScVal(address: string): StellarSdk.xdr.ScVal {
  return StellarSdk.nativeToScVal(StellarSdk.Address.fromString(address));
}

/**
 * Helper to convert a number/bigint/string amount into a Soroban i128 ScVal
 */
function i128ToScVal(value: string | bigint | number): StellarSdk.xdr.ScVal {
  return StellarSdk.nativeToScVal(BigInt(value), { type: "i128" });
}

/**
 * General read-only contract simulation helper.
 * Builds a dummy transaction, simulates it using the Soroban RPC, and parses the returned ScVal.
 */
async function simulateContractCall(method: string, args: StellarSdk.xdr.ScVal[]): Promise<any> {
  if (!CONTRACT_ID) {
    throw new Error("NEXT_PUBLIC_CONTRACT_ID is not configured in .env.local");
  }

  const server = new StellarSdk.rpc.Server(RPC_URL);
  
  // Create a dummy transaction for simulation
  const dummyAccount = new StellarSdk.Account(
    "GAW3WGVFXI4RZPMEIQWIZJ6EPPAB5RL45ENP2DQYL7ETWJREGZ2XYRIC",
    "0"
  );

  const contract = new StellarSdk.Contract(CONTRACT_ID);
  const transaction = new StellarSdk.TransactionBuilder(dummyAccount, {
    fee: "100000",
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const simulation = await server.simulateTransaction(transaction);

  const simAny = simulation as any;
  if (simAny.error) {
    throw new Error(`Simulation failed: ${simAny.error}`);
  }

  // Extract return value from simulation result
  let retval: StellarSdk.xdr.ScVal | undefined;
  if (simAny.result) {
    retval = simAny.result.retval;
  } else if (simAny.results && simAny.results[0]) {
    retval = simAny.results[0].retval;
  }

  if (!retval) {
    throw new Error("No return value received from simulation.");
  }

  return StellarSdk.scValToNative(retval);
}

/**
 * General contract write transaction helper.
 * Fetches user sequence, builds tx, simulates to get footprint/resources, compiles fee, 
 * signs with Freighter, and submits to Horizon.
 */
async function executeContractWrite(
  userAddress: string,
  method: string,
  args: StellarSdk.xdr.ScVal[]
): Promise<any> {
  if (!CONTRACT_ID) {
    throw new Error("NEXT_PUBLIC_CONTRACT_ID is not configured in .env.local");
  }

  const server = new StellarSdk.rpc.Server(RPC_URL);
  const horizonServer = new StellarSdk.Horizon.Server(TESTNET_HORIZON);

  // 1. Fetch user's current account state from Horizon (for sequence numbers)
  const account = await horizonServer.loadAccount(userAddress);

  // 2. Build initial transaction containing the Soroban call operation
  const contract = new StellarSdk.Contract(CONTRACT_ID);
  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: "100000", // Placeholder fee, will be updated by simulation assembly
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  // 3. Simulate the transaction to determine footprint and fee requirements
  const simulation = await server.simulateTransaction(transaction);

  const simAny = simulation as any;
  if (simAny.error) {
    throw new Error(`Simulation failed: ${simAny.error}`);
  }

  // 4. Assemble the transaction by attaching Soroban footprint and fees
  const assembledTx = StellarSdk.rpc.assembleTransaction(transaction, simulation).build() as any;

  // 5. Convert to transaction XDR
  const xdr = assembledTx.toXDR();

  // 6. Sign and submit via Freighter
  const response = await signAndSubmitTransaction(xdr);
  return response;
}

/* ==========================================================================
   Public Contract Method Integrations
   ========================================================================== */

/**
 * Fetches general vault information (Total Shares, Total Pool Balance, Share Price, addresses)
 */
export async function getVaultInfo(): Promise<VaultInfo> {
  const result = await simulateContractCall("get_vault_info", []);
  
  return {
    totalShares: result.total_shares.toString(),
    totalBalance: result.total_balance.toString(),
    sharePrice: result.share_price.toString(),
    token: result.token,
    admin: result.admin,
  };
}

/**
 * Fetches the share balance owned by a specific account (in Stroops)
 */
export async function getShares(userAddress: string): Promise<string> {
  const result = await simulateContractCall("get_shares", [addressToScVal(userAddress)]);
  return result.toString();
}

/**
 * Initializes the contract with an admin and token address
 */
export async function initialize(adminAddress: string, tokenAddress: string): Promise<any> {
  return await executeContractWrite(adminAddress, "initialize", [
    addressToScVal(adminAddress),
    addressToScVal(tokenAddress),
  ]);
}

/**
 * Deposits XLM (in Stroops) from user into the vault
 */
export async function deposit(userAddress: string, amountStroops: string): Promise<any> {
  return await executeContractWrite(userAddress, "deposit", [
    addressToScVal(userAddress),
    i128ToScVal(amountStroops),
  ]);
}

/**
 * Withdraws XLM by burning shares (in Stroops)
 */
export async function withdraw(userAddress: string, sharesStroops: string): Promise<any> {
  return await executeContractWrite(userAddress, "withdraw", [
    addressToScVal(userAddress),
    i128ToScVal(sharesStroops),
  ]);
}

/**
 * Admin action: Accrues yield by depositing XLM (in Stroops) without minting shares
 */
export async function accrueYield(adminAddress: string, amountStroops: string): Promise<any> {
  return await executeContractWrite(adminAddress, "accrue_yield", [
    addressToScVal(adminAddress),
    i128ToScVal(amountStroops),
  ]);
}
