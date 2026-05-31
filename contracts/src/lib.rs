#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, symbol_short, token, Address, Env,
};

// Constant for 1 XLM represented in Stroops (10,000,000 stroops = 1 XLM)
const ONE_XLM: i128 = 10_000_000;

/// Storage keys for the vault state
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    TotalShares,
    TotalBalance,
    Shares(Address),
    Initialized,
}

/// Struct that holds overall metrics of the yield vault
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct VaultInfo {
    pub total_shares: i128,
    pub total_balance: i128,
    pub share_price: i128, // expressed in stroops (value of 1 share in stroops)
    pub token: Address,
    pub admin: Address,
}

/// Error codes returned by the smart contract
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    InsufficientShares = 5,
    MathError = 6,
}

#[contract]
pub struct YieldVault;

#[contractimpl]
impl YieldVault {
    /// Initializes the Yield Vault contract with an Admin and a Token (typically native XLM on Testnet)
    pub fn initialize(env: Env, admin: Address, token: Address) -> Result<(), Error> {
        let storage = env.storage().persistent();
        
        // Ensure the contract is not already initialized
        if storage.has(&DataKey::Initialized) {
            return Err(Error::AlreadyInitialized);
        }

        // Store configuration and initial state
        storage.set(&DataKey::Initialized, &true);
        storage.set(&DataKey::Admin, &admin);
        storage.set(&DataKey::Token, &token);
        storage.set(&DataKey::TotalShares, &0i128);
        storage.set(&DataKey::TotalBalance, &0i128);

        // Emit an initialization event
        env.events().publish(
            (symbol_short!("init"),),
            (admin, token),
        );

        Ok(())
    }

    /// Deposits an amount of XLM into the vault in exchange for minted shares.
    /// Formula: Shares = Amount * TotalShares / TotalBalance (or Shares = Amount if first deposit)
    pub fn deposit(env: Env, user: Address, amount: i128) -> Result<i128, Error> {
        // Enforce user authentication
        user.require_auth();

        let storage = env.storage().persistent();
        if !storage.has(&DataKey::Initialized) {
            return Err(Error::NotInitialized);
        }

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let token_address = storage.get::<_, Address>(&DataKey::Token).unwrap();
        let mut total_shares = storage.get::<_, i128>(&DataKey::TotalShares).unwrap_or(0);
        let mut total_balance = storage.get::<_, i128>(&DataKey::TotalBalance).unwrap_or(0);

        // Calculate the number of shares to mint
        let shares_to_mint = if total_shares == 0 {
            amount
        } else {
            // Safe multiplication and division using checked math (or direct if within limits)
            match (amount * total_shares).checked_div(total_balance) {
                Some(val) => val,
                None => return Err(Error::MathError),
            }
        };

        if shares_to_mint <= 0 {
            return Err(Error::InvalidAmount);
        }

        // Transfer XLM from user to the vault contract
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&user, &env.current_contract_address(), &amount);

        // Update state
        let user_key = DataKey::Shares(user.clone());
        let current_user_shares = storage.get::<_, i128>(&user_key).unwrap_or(0);
        
        total_shares += shares_to_mint;
        total_balance += amount;

        storage.set(&user_key, &(current_user_shares + shares_to_mint));
        storage.set(&DataKey::TotalShares, &total_shares);
        storage.set(&DataKey::TotalBalance, &total_balance);

        // Emit a deposit event
        env.events().publish(
            (symbol_short!("deposit"), user),
            (amount, shares_to_mint),
        );

        Ok(shares_to_mint)
    }

    /// Withdraws user's XLM from the vault by burning their shares.
    /// Formula: Amount = Shares * TotalBalance / TotalShares
    pub fn withdraw(env: Env, user: Address, shares: i128) -> Result<i128, Error> {
        // Enforce user authentication
        user.require_auth();

        let storage = env.storage().persistent();
        if !storage.has(&DataKey::Initialized) {
            return Err(Error::NotInitialized);
        }

        if shares <= 0 {
            return Err(Error::InvalidAmount);
        }

        let user_key = DataKey::Shares(user.clone());
        let current_user_shares = storage.get::<_, i128>(&user_key).unwrap_or(0);
        if current_user_shares < shares {
            return Err(Error::InsufficientShares);
        }

        let token_address = storage.get::<_, Address>(&DataKey::Token).unwrap();
        let mut total_shares = storage.get::<_, i128>(&DataKey::TotalShares).unwrap_or(0);
        let mut total_balance = storage.get::<_, i128>(&DataKey::TotalBalance).unwrap_or(0);

        // Calculate proportional XLM amount to return to the user
        let amount_to_withdraw = match (shares * total_balance).checked_div(total_shares) {
            Some(val) => val,
            None => return Err(Error::MathError),
        };

        // Transfer XLM from the vault contract back to the user
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &user, &amount_to_withdraw);

        // Update state
        total_shares -= shares;
        total_balance -= amount_to_withdraw;

        storage.set(&user_key, &(current_user_shares - shares));
        storage.set(&DataKey::TotalShares, &total_shares);
        storage.set(&DataKey::TotalBalance, &total_balance);

        // Emit a withdrawal event
        env.events().publish(
            (symbol_short!("withdraw"), user),
            (shares, amount_to_withdraw),
        );

        Ok(amount_to_withdraw)
    }

    /// Simulates yield accrual by transferring a specified amount of XLM from the caller to the vault.
    /// This increments the pool balance without minting any new shares, raising the price per share.
    /// Anyone can donate yield to the vault.
    pub fn accrue_yield(env: Env, caller: Address, amount: i128) -> Result<i128, Error> {
        // Enforce caller authentication
        caller.require_auth();

        let storage = env.storage().persistent();
        if !storage.has(&DataKey::Initialized) {
            return Err(Error::NotInitialized);
        }

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let token_address = storage.get::<_, Address>(&DataKey::Token).unwrap();
        let mut total_balance = storage.get::<_, i128>(&DataKey::TotalBalance).unwrap_or(0);

        // Transfer yield XLM from the caller into the vault contract
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&caller, &env.current_contract_address(), &amount);

        // Update total balance
        total_balance += amount;
        storage.set(&DataKey::TotalBalance, &total_balance);

        // Emit yield accrued event
        env.events().publish(
            (symbol_short!("yield"),),
            (amount, total_balance),
        );

        Ok(total_balance)
    }

    /// Gets the number of shares owned by a specific address
    pub fn get_shares(env: Env, user: Address) -> i128 {
        let storage = env.storage().persistent();
        storage.get::<_, i128>(&DataKey::Shares(user)).unwrap_or(0)
    }

    /// Returns general information about the vault state
    pub fn get_vault_info(env: Env) -> Result<VaultInfo, Error> {
        let storage = env.storage().persistent();
        if !storage.has(&DataKey::Initialized) {
            return Err(Error::NotInitialized);
        }

        let total_shares = storage.get::<_, i128>(&DataKey::TotalShares).unwrap_or(0);
        let total_balance = storage.get::<_, i128>(&DataKey::TotalBalance).unwrap_or(0);
        let token = storage.get::<_, Address>(&DataKey::Token).unwrap();
        let admin = storage.get::<_, Address>(&DataKey::Admin).unwrap();

        // Share price = TotalBalance * ONE_XLM / TotalShares.
        // Expressed in Stroops, showing how many Stroops 1 share is worth.
        let share_price = if total_shares == 0 {
            ONE_XLM
        } else {
            match (total_balance * ONE_XLM).checked_div(total_shares) {
                Some(val) => val,
                None => return Err(Error::MathError),
            }
        };

        Ok(VaultInfo {
            total_shares,
            total_balance,
            share_price,
            token,
            admin,
        })
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, token, Address, Env};

    #[test]
    fn test_vault_flow() {
        let env = Env::default();
        env.mock_all_auths();

        // Generate addresses
        let admin = Address::generate(&env);
        let user = Address::generate(&env);

        // Deploy native/token contract using non-deprecated v2 method
        let token_contract_id = env.register_stellar_asset_contract_v2(admin.clone()).address();
        let token_admin_client = token::StellarAssetClient::new(&env, &token_contract_id);

        // Register vault contract
        let vault_contract_id = env.register_contract(None, YieldVault);
        let vault_client = YieldVaultClient::new(&env, &vault_contract_id);

        // Initialize contract
        vault_client.initialize(&admin, &token_contract_id);

        // Fund user and admin with token balances using StellarAssetClient
        token_admin_client.mint(&user, &100_000_000); // 10 XLM
        token_admin_client.mint(&admin, &50_000_000);   // 5 XLM

        // Verify initial vault metrics
        let info = vault_client.get_vault_info();
        assert_eq!(info.total_shares, 0);
        assert_eq!(info.total_balance, 0);
        assert_eq!(info.share_price, ONE_XLM); // 1.0 share price

        // --- Deposit 1 ---
        // User deposits 40,000,000 Stroops (4 XLM)
        let shares1 = vault_client.deposit(&user, &40_000_000);
        assert_eq!(shares1, 40_000_000); // 1:1 first deposit
        assert_eq!(vault_client.get_shares(&user), 40_000_000);

        let info = vault_client.get_vault_info();
        assert_eq!(info.total_shares, 40_000_000);
        assert_eq!(info.total_balance, 40_000_000);
        assert_eq!(info.share_price, ONE_XLM); // 1.0 share price

        // --- Accrue Yield ---
        // Admin adds 10,000,000 Stroops (1 XLM) as yield
        vault_client.accrue_yield(&admin, &10_000_000);

        let info = vault_client.get_vault_info();
        assert_eq!(info.total_shares, 40_000_000);
        assert_eq!(info.total_balance, 50_000_000);
        // Price should increase: (50_000_000 * 10_000_000) / 40_000_000 = 12_500_000 (1.25 XLM per share)
        assert_eq!(info.share_price, 12_500_000);

        // --- Deposit 2 (Different Exchange Rate) ---
        // User deposits another 25,000_000 Stroops (2.5 XLM)
        // Shares to mint: 25,000_000 * 40_000_000 / 50_000_000 = 20_000_000 shares
        let shares2 = vault_client.deposit(&user, &25_000_000);
        assert_eq!(shares2, 20_000_000);
        assert_eq!(vault_client.get_shares(&user), 60_000_000); // 40M + 20M

        let info = vault_client.get_vault_info();
        assert_eq!(info.total_shares, 60_000_000);
        assert_eq!(info.total_balance, 75_000_000);
        assert_eq!(info.share_price, 12_500_000); // Share price remains 1.25

        // --- Withdraw ---
        // User withdraws 30,000_000 shares (half of their holdings)
        // XLM to receive: 30,000_000 * 75,000_000 / 60_000_000 = 37_500_000 Stroops (3.75 XLM)
        let withdrawn = vault_client.withdraw(&user, &30_000_000);
        assert_eq!(withdrawn, 37_500_000);

        let info = vault_client.get_vault_info();
        assert_eq!(info.total_shares, 30_000_000);
        assert_eq!(info.total_balance, 37_500_000);
        assert_eq!(vault_client.get_shares(&user), 30_000_000);
    }
}
