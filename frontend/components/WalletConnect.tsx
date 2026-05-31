"use client";

import React, { useState } from "react";
import { Wallet, LogOut, Coins, Loader2, Copy, Check, ShieldAlert } from "lucide-react";
import { fundWithFriendbot } from "../lib/stellar";

interface WalletConnectProps {
  publicKey: string | null;
  xlmBalance: string; // stroops
  loading: boolean;
  onConnect: () => Promise<void>;
  onDisconnect: () => void;
  onRefreshBalance: () => Promise<void>;
}

export default function WalletConnect({
  publicKey,
  xlmBalance,
  loading,
  onConnect,
  onDisconnect,
  onRefreshBalance,
}: WalletConnectProps) {
  const [funding, setFunding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fundStatus, setFundStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Convert stroops back to XLM (divide by 10,000,000)
  const formatXlm = (stroopsStr: string) => {
    const stroops = BigInt(stroopsStr || "0");
    const xlm = Number(stroops) / 10000000;
    return xlm.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 7 });
  };

  const handleCopy = () => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGetTestnetXlm = async () => {
    if (!publicKey) return;
    setFunding(true);
    setFundStatus(null);
    try {
      await fundWithFriendbot(publicKey);
      setFundStatus({
        success: true,
        message: "Successfully funded! 10,000 XLM added.",
      });
      // Refresh balance after funding
      await onRefreshBalance();
    } catch (err: any) {
      setFundStatus({
        success: false,
        message: err.message || "Friendbot funding failed.",
      });
    } finally {
      setFunding(false);
    }
  };

  const truncateKey = (key: string) => {
    return `${key.slice(0, 6)}...${key.slice(-6)}`;
  };

  return (
    <header className="w-full max-w-7xl mx-auto mb-8 relative z-10">
      <div className="flex flex-col md:flex-row items-center justify-between p-5 rounded-2xl border border-white/10 bg-card backdrop-blur-md shadow-2xl transition-all duration-300 hover:border-purple-500/20">
        {/* Brand logo & Stellar identity */}
        <div className="flex items-center space-x-3 mb-4 md:mb-0">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-500/20 animate-pulse">
            <Coins className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white via-indigo-200 to-purple-300 bg-clip-text text-transparent">
              Astraea Yield Vault
            </h1>
            <p className="text-xs text-indigo-400 font-medium tracking-wider">
              AUTO-COMPOUNDING SAVINGS • STELLAR TESTNET
            </p>
          </div>
        </div>

        {/* Action controls */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {publicKey ? (
            <>
              {/* Account Address Card */}
              <div className="flex items-center space-x-2 px-4 py-2.5 rounded-xl border border-white/5 bg-white/5 backdrop-blur-sm text-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                <span className="text-gray-300 font-mono" title={publicKey}>
                  {truncateKey(publicKey)}
                </span>
                <button
                  onClick={handleCopy}
                  className="p-1 hover:text-indigo-400 text-gray-400 transition-colors"
                  aria-label="Copy Address"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>

              {/* Account Balance Card */}
              <div className="flex items-center space-x-2 px-4 py-2.5 rounded-xl border border-indigo-500/10 bg-indigo-500/5 text-sm">
                <span className="text-indigo-300 font-semibold">Balance:</span>
                <span className="text-white font-bold font-mono">
                  {formatXlm(xlmBalance)} XLM
                </span>
              </div>

              {/* Friendbot Funding Button */}
              <button
                onClick={handleGetTestnetXlm}
                disabled={funding}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-50 transition-all duration-300 shadow-lg shadow-emerald-950/20 active:scale-95"
              >
                {funding ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Funding...</span>
                  </>
                ) : (
                  <>
                    <Coins className="h-4 w-4" />
                    <span>Get Testnet XLM</span>
                  </>
                )}
              </button>

              {/* Disconnect Button */}
              <button
                onClick={onDisconnect}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-300 hover:text-white border border-white/10 hover:border-red-500/30 hover:bg-red-500/10 transition-all duration-300 active:scale-95"
              >
                <LogOut className="h-4 w-4" />
                <span>Disconnect</span>
              </button>
            </>
          ) : (
            /* Connect Button */
            <button
              onClick={onConnect}
              disabled={loading}
              className="flex items-center space-x-2.5 px-6 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-indigo-800 disabled:to-purple-800 shadow-xl shadow-indigo-950/50 active:scale-95 transition-all duration-300"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Connecting Freighter...</span>
                </>
              ) : (
                <>
                  <Wallet className="h-4 w-4" />
                  <span>Connect Wallet</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Friendbot Status Banner */}
      {fundStatus && (
        <div
          className={`mt-3 p-3 rounded-xl border flex items-center space-x-2 text-xs font-semibold animate-fadeIn ${
            fundStatus.success
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-red-500/10 border-red-500/30 text-red-300"
          }`}
        >
          {fundStatus.success ? (
            <Check className="h-4 w-4 flex-shrink-0" />
          ) : (
            <ShieldAlert className="h-4 w-4 flex-shrink-0" />
          )}
          <span>{fundStatus.message}</span>
        </div>
      )}
    </header>
  );
}
