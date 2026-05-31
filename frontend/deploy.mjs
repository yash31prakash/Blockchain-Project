/**
 * deploy.mjs — Deploys the Yield Vault Soroban contract to Stellar Testnet
 * 
 * This script:
 * 1. Generates a new Stellar keypair
 * 2. Funds it via Friendbot
 * 3. Uploads the compiled WASM to Stellar Testnet
 * 4. Deploys a contract instance from the uploaded WASM
 * 5. Initializes the contract with admin + native XLM token
 * 6. Writes the contract ID to frontend/.env.local
 * 
 * Usage: node deploy.mjs
 */

import * as StellarSdk from "@stellar/stellar-sdk";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.resolve(path.dirname(__filename), "..");

// Testnet configuration
const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
const FRIENDBOT_URL = "https://friendbot.stellar.org";

// Native XLM SAC (Stellar Asset Contract) address on testnet
const NATIVE_TOKEN_CONTRACT = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

// Path to compiled WASM
const WASM_PATH = path.join(__dirname, "contracts", "yield_vault.wasm");

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a transaction to be confirmed using the SDK's getTransaction.
 * Now works correctly with stellar-sdk v15.
 */
async function waitForTx(server, txHash, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = await server.getTransaction(txHash);
      if (result.status === "SUCCESS") {
        return result;
      } else if (result.status === "FAILED") {
        throw new Error(`Transaction failed: ${JSON.stringify(result)}`);
      } else {
        console.log(`[Attempt ${i+1}/${maxAttempts}] Status: ${result.status}`);
      }
    } catch (e) {
      if (e.message && e.message.includes("Transaction failed")) throw e;
      console.log(`[Attempt ${i+1}/${maxAttempts}] Waiting... (${e.message || 'not found'})`);
    }
    await sleep(5000);
  }
  throw new Error("Transaction timed out after 300 seconds");
}

async function main() {
  console.log("=== Yield Vault Deployment Script ===\n");

  // 1. Generate keypair
  const keypair = StellarSdk.Keypair.random();
  const publicKey = keypair.publicKey();
  const secretKey = keypair.secret();

  console.log("1. Generated deployment keypair:");
  console.log(`   Public Key:  ${publicKey}`);
  console.log(`   Secret Key:  ${secretKey}\n`);

  // 2. Fund via Friendbot
  console.log("2. Funding account via Friendbot...");
  const fundResponse = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);
  if (!fundResponse.ok) {
    throw new Error(`Friendbot failed: ${fundResponse.status} ${await fundResponse.text()}`);
  }
  console.log("   ✅ Account funded with 10,000 XLM\n");

  // Give the network a moment to propagate
  await sleep(5000);

  // 3. Read WASM binary and compute hash locally
  console.log("3. Reading compiled WASM...");
  if (!fs.existsSync(WASM_PATH)) {
    throw new Error(`WASM file not found at: ${WASM_PATH}`);
  }
  const wasmBuffer = fs.readFileSync(WASM_PATH);
  console.log(`   ✅ WASM loaded: ${wasmBuffer.length} bytes`);

  // Compute WASM hash locally (sha256) - this is what Soroban uses
  const wasmHash = crypto.createHash("sha256").update(wasmBuffer).digest();
  const wasmHashHex = wasmHash.toString("hex");
  console.log(`   WASM hash (sha256): ${wasmHashHex}\n`);

  // Set up RPC server (using v15 rpc namespace)
  const rpcServer = new StellarSdk.rpc.Server(RPC_URL);

  // 4. Upload WASM to Stellar
  console.log("4. Uploading WASM to Stellar Testnet...");
  const account = await rpcServer.getAccount(publicKey);

  const uploadOp = StellarSdk.Operation.uploadContractWasm({ wasm: wasmBuffer });
  const uploadTx = new StellarSdk.TransactionBuilder(account, {
    fee: "10000000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(uploadOp)
    .setTimeout(120)
    .build();

  const uploadSim = await rpcServer.simulateTransaction(uploadTx);
  if (StellarSdk.rpc.Api.isSimulationError(uploadSim)) {
    throw new Error(`Upload simulation failed: ${JSON.stringify(uploadSim)}`);
  }
  
  const assembledUpload = StellarSdk.rpc.assembleTransaction(uploadTx, uploadSim).build();
  assembledUpload.sign(keypair);
  
  const uploadResult = await rpcServer.sendTransaction(assembledUpload);
  console.log(`   Tx hash: ${uploadResult.hash}`);
  
  if (uploadResult.status === "ERROR") {
    throw new Error(`Upload submission error: ${JSON.stringify(uploadResult)}`);
  }
  
  await waitForTx(rpcServer, uploadResult.hash);
  console.log(`   ✅ WASM uploaded! Hash: ${wasmHashHex}\n`);

  // 5. Deploy contract instance
  console.log("5. Deploying contract instance...");
  await sleep(3000);
  
  const account2 = await rpcServer.getAccount(publicKey);
  
  const deployOp = StellarSdk.Operation.createCustomContract({
    address: new StellarSdk.Address(publicKey),
    wasmHash: wasmHash,
  });
  
  const deployTx = new StellarSdk.TransactionBuilder(account2, {
    fee: "10000000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(deployOp)
    .setTimeout(120)
    .build();

  const deploySim = await rpcServer.simulateTransaction(deployTx);
  if (StellarSdk.rpc.Api.isSimulationError(deploySim)) {
    throw new Error(`Deploy simulation failed: ${JSON.stringify(deploySim)}`);
  }

  const assembledDeploy = StellarSdk.rpc.assembleTransaction(deployTx, deploySim).build();
  assembledDeploy.sign(keypair);

  const deployResult = await rpcServer.sendTransaction(assembledDeploy);
  console.log(`   Tx hash: ${deployResult.hash}`);
  
  if (deployResult.status === "ERROR") {
    throw new Error(`Deploy submission error: ${JSON.stringify(deployResult)}`);
  }

  const deployFinal = await waitForTx(rpcServer, deployResult.hash);
  
  // Extract contract ID - the returnValue is an ScVal containing the contract address
  let contractId;
  try {
    // Try using the SDK to parse the return value directly
    const contractAddress = StellarSdk.Address.fromScVal(deployFinal.returnValue);
    contractId = contractAddress.toString();
  } catch (e) {
    // Fallback: extract from resultMetaXdr  
    console.log(`   Note: Direct parsing failed (${e.message}), trying alternative extraction...`);
    
    // Use raw RPC to get the result and extract contract ID from the resultXdr
    const rawResponse = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "getTransaction",
        params: { hash: deployResult.hash }
      })
    });
    const rawJson = await rawResponse.json();
    const resultXdr = rawJson.result.resultXdr;
    const resultBuf = Buffer.from(resultXdr, "base64");
    
    // Search for contract address pattern: SCV_ADDRESS(13) + SC_ADDRESS_TYPE_CONTRACT(1) + 32 bytes
    for (let i = 0; i < resultBuf.length - 40; i++) {
      if (resultBuf.readUInt32BE(i) === 13 && resultBuf.readUInt32BE(i + 4) === 1) {
        const contractHash = resultBuf.slice(i + 8, i + 40);
        contractId = StellarSdk.StrKey.encodeContract(contractHash);
        break;
      }
    }
    
    if (!contractId) {
      throw new Error("Could not extract contract ID from deployment result");
    }
  }
  
  console.log(`   ✅ Contract deployed! ID: ${contractId}\n`);

  // 6. Initialize the contract
  console.log("6. Initializing contract...");
  await sleep(3000);
  
  const account3 = await rpcServer.getAccount(publicKey);
  
  const contract = new StellarSdk.Contract(contractId);
  
  // Create address ScVals - Address handles both G... (account) and C... (contract) addresses
  const adminAddr = new StellarSdk.Address(publicKey);
  const tokenAddr = new StellarSdk.Address(NATIVE_TOKEN_CONTRACT);
  
  const initTx = new StellarSdk.TransactionBuilder(account3, {
    fee: "10000000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "initialize",
        adminAddr.toScVal(),
        tokenAddr.toScVal()
      )
    )
    .setTimeout(60)
    .build();

  const initSim = await rpcServer.simulateTransaction(initTx);
  if (StellarSdk.rpc.Api.isSimulationError(initSim)) {
    throw new Error(`Init simulation failed: ${JSON.stringify(initSim)}`);
  }

  const assembledInit = StellarSdk.rpc.assembleTransaction(initTx, initSim).build();
  assembledInit.sign(keypair);

  const initResult = await rpcServer.sendTransaction(assembledInit);
  console.log(`   Tx hash: ${initResult.hash}`);
  
  if (initResult.status === "ERROR") {
    throw new Error(`Init submission error: ${JSON.stringify(initResult)}`);
  }

  await waitForTx(rpcServer, initResult.hash);
  console.log("   ✅ Contract initialized!\n");

  // 7. Write .env.local
  console.log("7. Writing contract ID to frontend/.env.local...");
  const envContent = `# Yield Vault DApp Configuration
# Auto-generated by deploy.mjs on ${new Date().toISOString()}

# Deployed Soroban smart contract ID on Testnet
NEXT_PUBLIC_CONTRACT_ID=${contractId}

# Network Passphrase for Stellar Testnet
NEXT_PUBLIC_NETWORK_PASSPHRASE=Test SDF Network ; September 2015

# Stellar RPC URL for contract simulation and submissions
NEXT_PUBLIC_RPC_URL=https://soroban-testnet.stellar.org

# Horizon URL for account details and balance lookups
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
`;
  const envPath = path.join(__dirname, "frontend", ".env.local");
  fs.writeFileSync(envPath, envContent, "utf8");
  console.log(`   ✅ Written to: ${envPath}\n`);

  // 8. Write deployment info to a JSON file for reference
  const deployInfo = {
    deployedAt: new Date().toISOString(),
    network: "testnet",
    contractId,
    wasmHash: wasmHashHex,
    adminPublicKey: publicKey,
    adminSecretKey: secretKey,
    nativeTokenContract: NATIVE_TOKEN_CONTRACT,
  };
  
  const deployInfoPath = path.join(__dirname, "deployment-info.json");
  fs.writeFileSync(deployInfoPath, JSON.stringify(deployInfo, null, 2), "utf8");
  console.log(`   📋 Deployment info saved to: ${deployInfoPath}\n`);

  console.log("=== DEPLOYMENT COMPLETE ===");
  console.log(`Contract ID: ${contractId}`);
  console.log(`Admin:       ${publicKey}`);
  console.log(`\nYou can now start the frontend with: cd frontend && npm run dev`);
}

main().catch((err) => {
  console.error("\n❌ DEPLOYMENT FAILED:", err.message || err);
  process.exit(1);
});
