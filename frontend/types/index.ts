export interface VaultInfo {
  totalShares: string;      // outstanding vault shares in stroops
  totalBalance: string;     // total XLM pool balance in stroops
  sharePrice: string;       // price of 1 share in stroops
  token: string;            // native token contract address
  admin: string;            // admin address
}

export interface UserPosition {
  shares: string;           // user's share balance in stroops
  xlmValue: string;         // calculated XLM value of user's shares in stroops
  vaultPercentage: string;  // user's percentage of the vault total shares
}

export interface WalletState {
  connected: boolean;
  publicKey: string | null;
  xlmBalance: string;       // balance in stroops
  loading: boolean;
  error: string | null;
}
