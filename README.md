# Astraea Yield Vault (Auto-Compounding Savings)

A complete, working full-stack decentralized application built on the **Stellar network** using **Soroban smart contracts** and a modern **Next.js 14** web frontend. This project implements a secure, auto-compounding savings vault where users can deposit Testnet XLM to mint interest-bearing shares. As yield is injected into the pool (simulating staking rewards, lending yields, or compound interest), the underlying pool grows relative to outstanding shares. Users can burn their shares to withdraw their proportional share of the vault's assets, capturing their compounded yield.

**Deployed Contract ID (Testnet)**: `CDBYXWNYOO322YDZD3U53HZHBFOY5DFC5GGEFRDPCK3B7GDO6FJLHMSJ`
**Explorer Link**: [https://stellar.expert/explorer/testnet/contract/CDBYXWNYOO322YDZD3U53HZHBFOY5DFC5GGEFRDPCK3B7GDO6FJLHMSJ](https://stellar.expert/explorer/testnet/contract/CDBYXWNYOO322YDZD3U53HZHBFOY5DFC5GGEFRDPCK3B7GDO6FJLHMSJ)

---

## Tech Stack

*   **Smart Contract**: Rust, Soroban SDK (v21.0.0), `#![no_std]` environment
*   **Web Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Lucide Icons
*   **Stellar Integration**: `@stellar/stellar-sdk` (v12+), `@stellar/freighter-api` (v2.1+)
*   **Development Network**: Stellar Testnet Only

---

## Prerequisites

Before setting up, make sure you have the following installed on your machine:

1.  **Rust & Cargo**:
    ```bash
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
    ```
2.  **WebAssembly compilation target**:
    ```bash
    rustup target add wasm32-unknown-unknown
    ```
3.  **Stellar CLI (v21.0.0+)**:
    ```bash
    cargo install --locked stellar-cli --features opt
    ```
4.  **Node.js**: Version 18 or higher.
5.  **Freighter Wallet Extension**: Install from [freighter.app](https://www.freighter.app/) in your browser.

---

## Project Structure

```
yield-vault/
├── contracts/                  # Soroban Smart Contract Workspace
│   ├── Cargo.toml              # Rust configuration specifying Soroban SDK 21.0.0
│   └── src/
│       └── lib.rs              # Contract implementation & unit tests
├── frontend/                   # Next.js Web Application
│   ├── app/
│   │   ├── globals.css         # Tailwind & custom CSS animations
│   │   ├── layout.tsx          # Next.js Root Layout with SEO tags
│   │   └── page.tsx            # Main Dashboard entrypoint
│   ├── components/
│   │   ├── WalletConnect.tsx   # Connects Freighter, queries balances, triggers Friendbot
│   │   └── MainFeature.tsx     # Handles deposit, withdraw, and yield accrual simulation
│   ├── lib/
│   │   ├── stellar.ts          # Wallet & Horizon interactions
│   │   └── contract.ts         # Client wrapper for Soroban RPC transactions
│   ├── types/
│   │   └── index.ts            # TypeScript interfaces
│   ├── package.json            # Node.js dependencies
│   ├── tailwind.config.ts      # Tailwind styling boundaries
│   ├── postcss.config.js       # PostCSS plugins
│   ├── next.config.mjs         # Next.js compilation settings
│   └── .env.example            # Environment variables blueprint
└── README.md                   # This instruction manual
```

---

## Step 1 — Build the Smart Contract

1.  Navigate into the `contracts` directory:
    ```bash
    cd contracts
    ```
2.  Build the contract targeting the Wasm architecture:
    ```bash
    cargo build --target wasm32-unknown-unknown --release
    ```

This produces a highly-optimized WebAssembly bytecode file at:
`contracts/target/wasm32-unknown-unknown/release/yield_vault.wasm`

---

## Step 2 — Set Up a Testnet Identity

To deploy contracts on the Stellar Testnet, you must have a local cryptographic identity (keypair) funded with testnet XLM.

1.  Generate a global developer keypair called `my-key`:
    ```bash
    stellar keys generate --global my-key --network testnet
    ```
2.  Inspect the public key address generated for your key:
    ```bash
    stellar keys address my-key
    ```

*Note: The Stellar CLI automatically requests testnet funding for new keys using the Stellar Friendbot service, so your account will arrive funded with 10,000 XLM.*

---

## Step 3 — Deploy Contract to Testnet

1.  Execute the contract deployment transaction:
    ```bash
    stellar contract deploy \
      --wasm target/wasm32-unknown-unknown/release/yield_vault.wasm \
      --source my-key \
      --network testnet
    ```
2.  The command will output a **Contract ID** starting with `C` (e.g. `CDLZFC3...`). **Copy this Contract ID** immediately; you will need it in Step 5.

---

## Step 4 — Install Frontend Dependencies

1.  Navigate into the `frontend` directory:
    ```bash
    cd ../frontend
    ```
2.  Install all project packages:
    ```bash
    npm install
    ```

This will download `@stellar/stellar-sdk`, `@stellar/freighter-api`, React, Tailwind, and canvas-confetti helper systems.

---

## Step 5 — Configure Environment Variables

1.  Create a local environment configuration file:
    ```bash
    cp .env.example .env.local
    ```
2.  Open `.env.local` and paste your deployed Contract ID from Step 3 into the field:
    ```env
    NEXT_PUBLIC_CONTRACT_ID=CDBYXWNYOO322YDZD3U53HZHBFOY5DFC5GGEFRDPCK3B7GDO6FJLHMSJ
    ```

---

## Step 6 — Run the Frontend

1.  Boot up the Next.js development server:
    ```bash
    npm run dev
    ```
2.  Open your browser and navigate to: [http://localhost:3000](http://localhost:3000)

---

## Step 7 — Using the App

Follow these steps to demonstrate the auto-compounding savings features:

1.  **Configure Freighter**:
    *   Open your Freighter browser extension.
    *   Click on **Settings** (gear icon) → **Network** → Toggle network to **Testnet**.
2.  **Connect Wallet**:
    *   Click **Connect Wallet** in the top-right corner of the application.
    *   Accept the connection request in the Freighter window.
    *   Your truncated address and Testnet balance (e.g. `10,000 XLM`) will display in the header.
3.  **Fund Wallet (if needed)**:
    *   If your connected wallet is empty or new, click **Get Testnet XLM** next to your balance.
    *   The interface will call Friendbot and automatically fund your Freighter address.
4.  **Initialize the Vault (First time only)**:
    *   If the vault contract has just been deployed, the UI will display an **Initialize Contract** panel.
    *   Click **Initialize Contract as Admin**. Freighter will prompt you to sign the initialization, designating you as the administrative owner and hooking native XLM as the vault token.
5.  **Deposit XLM**:
    *   In the *Interact with Yield Vault* card, enter an amount of XLM to deposit (e.g. `50 XLM`).
    *   Click **Deposit XLM** and approve the transaction in Freighter.
    *   Upon confirmation, a confetti animation will fire! Your "My Position Value" will update, and the "Total Value Locked" will show the deposited XLM. You will receive equivalent shares.
6.  **Simulate Compound Yield (Admin Compounding)**:
    *   Scroll to the *Simulate Compound Interest* panel.
    *   Input a yield amount (e.g. `10 XLM`) and click **Inject Yield & Compound**.
    *   Approve the transaction in Freighter.
    *   **Observe the Magic**: Instantly, the *Share Conversion Price* increases! Even though you didn't deposit more XLM, your *My Position Value* has instantly grown because each share you hold is now worth more underlying XLM!
7.  **Withdraw XLM**:
    *   Enter the number of shares to redeem in the *Withdraw Shares* input field.
    *   Click **Withdraw XLM** and approve the Freighter transaction.
    *   The contract will burn your shares and transfer your original XLM plus the earned simulated yield directly into your Freighter account.

---

## Smart Contract Functions

The `YieldVault` smart contract exposes the following core functions:

| Function Name | Parameters | Type | Description |
| :--- | :--- | :--- | :--- |
| `initialize` | `admin: Address`, `token: Address` | **Write** | Sets the administrator and Native XLM token addresses. Run once. |
| `deposit` | `user: Address`, `amount: i128` | **Write** | Accepts XLM stroops from `user`, computes proportional shares, mints shares, and increments the pool balance. |
| `withdraw` | `user: Address`, `shares: i128` | **Write** | Burns `shares` from `user`, computes proportional underlying XLM amount, and transfers it to the user. |
| `accrue_yield` | `admin: Address`, `amount: i128` | **Write** | Transfers XLM stroops from the `admin` into the vault without minting any shares. Elevates the share conversion price. |
| `get_shares` | `user: Address` | **Read** | Returns the number of vault shares (in Stroops) held by the given user address. |
| `get_vault_info` | *None* | **Read** | Returns `VaultInfo` containing total shares, total pool balance, current share price, admin, and token address. |

---

## Common Errors & Fixes

*   **"Transaction simulation failed: NotInitialized"**
    *   *Cause*: The contract has been deployed but not initialized.
    *   *Fix*: Connect the Freighter wallet that deployed the contract and click **Initialize Contract as Admin** in the web dashboard.
*   **"Freighter not found" / "Freighter wallet extension not detected"**
    *   *Cause*: The Freighter extension is not installed or enabled.
    *   *Fix*: Go to [freighter.app](https://www.freighter.app/), install the extension, unlock it, and reload the browser page.
*   **"Account not found" / transaction failing for new Freighter account**
    *   *Cause*: Your Freighter account is brand new and has not been activated on the Testnet ledger.
    *   *Fix*: Click the **Get Testnet XLM** button in the header. Friendbot will send 10,000 XLM, automatically activating your account on-chain.
*   **"wasm32 target not found" when compiling**
    *   *Cause*: Rust does not know how to compile to WebAssembly.
    *   *Fix*: Run `rustup target add wasm32-unknown-unknown` in your shell and retry building the contract.

---

## Testnet Resources

*   **Stellar Testnet Explorer**: Inspect transactions, accounts, and ledger states at [StellarExpert Testnet](https://stellar.expert/explorer/testnet).
*   **Stellar Laboratory**: Test manual transaction building and explore RPC endpoints at the [Stellar Laboratory](https://lab.stellar.org).
*   **Friendbot Faucet**: Directly request funds via API: `https://friendbot.stellar.org/?addr=YOUR_PUBLIC_KEY`.
