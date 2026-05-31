"use client";

import React, { useState, useEffect } from "react";
import WalletConnect from "../components/WalletConnect";
import MainFeature from "../components/MainFeature";
import { getFreighterPublicKey, getXlmBalance } from "../lib/stellar";

export default function Home() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [xlmBalance, setXlmBalance] = useState<string>("0");
  const [walletLoading, setWalletLoading] = useState(false);

  // Handle wallet connection
  const handleConnect = async () => {
    setWalletLoading(true);
    try {
      const pubKey = await getFreighterPublicKey();
      setPublicKey(pubKey);
      
      // Load current native XLM balance from Horizon
      const bal = await getXlmBalance(pubKey);
      setXlmBalance(bal);
    } catch (err: any) {
      console.error("Wallet connection failed:", err);
      alert(err.message || "Failed to retrieve account from Freighter.");
    } finally {
      setWalletLoading(false);
    }
  };

  // Handle wallet disconnection
  const handleDisconnect = () => {
    setPublicKey(null);
    setXlmBalance("0");
  };

  // Keep wallet balance synchronized
  const handleRefreshBalance = async () => {
    if (publicKey) {
      const bal = await getXlmBalance(publicKey);
      setXlmBalance(bal);
    }
  };

  return (
    <main className="min-h-screen py-10 px-4 sm:px-6 lg:px-8 relative overflow-hidden bg-background">
      {/* Premium ambient backdrop glows */}
      <div className="absolute top-[-15%] left-[-15%] w-[60%] h-[60%] bg-indigo-500/5 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-[-15%] right-[-15%] w-[60%] h-[60%] bg-purple-500/5 rounded-full blur-[140px] pointer-events-none"></div>

      <div className="relative max-w-7xl mx-auto space-y-4">
        {/* Header containing Wallet Connector */}
        <WalletConnect
          publicKey={publicKey}
          xlmBalance={xlmBalance}
          loading={walletLoading}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onRefreshBalance={handleRefreshBalance}
        />

        {/* Main Feature Container */}
        <MainFeature
          publicKey={publicKey}
          xlmBalance={xlmBalance}
          onRefreshBalance={handleRefreshBalance}
        />
      </div>

      {/* Footer */}
      <footer className="mt-24 border-t border-white/5 pt-8 text-center text-xs text-indigo-300/40">
        <p>© 2026 Astraea Yield Vault. Built strictly for Stellar Testnet.</p>
        <p className="mt-1 font-mono">Soroban Smart Contract Engine v21.0.0 • Next.js 14 App Router</p>
      </footer>
    </main>
  );
}
