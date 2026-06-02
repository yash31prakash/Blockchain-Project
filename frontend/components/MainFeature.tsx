"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  ArrowDownLeft,
  ArrowUpRight,
  Info,
  Loader2,
  Award,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Percent,
  Compass,
} from "lucide-react";
import confetti from "canvas-confetti";
import { getVaultInfo, getShares, deposit, withdraw, accrueYield, initialize } from "../lib/contract";
import { getXlmBalance } from "../lib/stellar";
import { VaultInfo, UserPosition } from "../types";

// Native Stellar token contract ID on Testnet
const NATIVE_TOKEN_CONTRACT = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

interface MainFeatureProps {
  publicKey: string | null;
  xlmBalance: string; // stroops
  onRefreshBalance: () => Promise<void>;
}

export default function MainFeature({ publicKey, xlmBalance, onRefreshBalance }: MainFeatureProps) {
  const [vaultInfo, setVaultInfo] = useState<VaultInfo | null>(null);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [notInitialized, setNotInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [yieldAmount, setYieldAmount] = useState("");

  // Action status states
  const [actionLoading, setActionLoading] = useState(false);
  const [actionType, setActionType] = useState<"deposit" | "withdraw" | "yield" | "init" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Conversion helpers
  const stroopsToXlm = (stroops: string | bigint | number) => {
    return Number(stroops) / 10000000;
  };

  const xlmToStroops = (xlm: string | number) => {
    return Math.round(Number(xlm) * 10000000).toString();
  };

  const formatBigNumber = (stroops: string, decimals = 2) => {
    const xlm = stroopsToXlm(stroops);
    return xlm.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  // Fetch all vault and position data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch vault state
      const info = await getVaultInfo();
      setVaultInfo(info);
      setNotInitialized(false);

      // 2. Fetch user's shares & compute position if logged in
      if (publicKey) {
        const userSharesStroops = await getShares(publicKey);
        const totalSharesStroops = BigInt(info.totalShares);
        const totalBalanceStroops = BigInt(info.totalBalance);
        
        let xlmValue = "0";
        let vaultPercentage = "0";

        if (userSharesStroops !== "0" && totalSharesStroops > 0n) {
          // XLM value = (userShares * totalBalance) / totalShares
          const calculatedXlm = (BigInt(userSharesStroops) * totalBalanceStroops) / totalSharesStroops;
          xlmValue = calculatedXlm.toString();

          // Percentage = (userShares * 100) / totalShares
          const calculatedPct = (BigInt(userSharesStroops) * 10000n) / totalSharesStroops; // with 2 decimal precision
          vaultPercentage = (Number(calculatedPct) / 100).toFixed(2);
        }

        setUserPosition({
          shares: userSharesStroops,
          xlmValue,
          vaultPercentage,
        });
      } else {
        setUserPosition(null);
      }
    } catch (err: any) {
      console.error("Fetch data error:", err);
      // Check if simulation error is due to not initialized
      if (err.message?.includes("NotInitialized") || err.message?.includes("Error(Contract, #1)")) {
        setNotInitialized(true);
      } else {
        setError(err.message || "Failed to load yield vault contract data.");
      }
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handlers
  const handleInitialize = async () => {
    if (!publicKey) return;
    setActionLoading(true);
    setActionType("init");
    setActionError(null);
    setActionSuccess(null);
    try {
      await initialize(publicKey, NATIVE_TOKEN_CONTRACT);
      setActionSuccess("Yield Vault successfully initialized! Admin is set to your connected wallet.");
      setNotInitialized(false);
      await fetchData();
    } catch (err: any) {
      setActionError(err.message || "Failed to initialize vault contract.");
    } finally {
      setActionLoading(false);
      setActionType(null);
    }
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey || !depositAmount) return;
    setActionLoading(true);
    setActionType("deposit");
    setActionError(null);
    setActionSuccess(null);

    const amountStroops = xlmToStroops(depositAmount);

    // Validate balance
    if (BigInt(amountStroops) > BigInt(xlmBalance)) {
      setActionError("Insufficient XLM balance in Freighter wallet.");
      setActionLoading(false);
      return;
    }

    try {
      await deposit(publicKey, amountStroops);
      
      // Celebrate!
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });

      setActionSuccess(`Deposited ${depositAmount} XLM into the savings vault!`);
      setDepositAmount("");
      await onRefreshBalance();
      await fetchData();
    } catch (err: any) {
      setActionError(err.message || "Deposit transaction failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey || !withdrawAmount) return;
    setActionLoading(true);
    setActionType("withdraw");
    setActionError(null);
    setActionSuccess(null);

    const sharesStroops = xlmToStroops(withdrawAmount);

    // Validate shares
    if (!userPosition || BigInt(sharesStroops) > BigInt(userPosition.shares)) {
      setActionError("Insufficient shares owned.");
      setActionLoading(false);
      return;
    }

    try {
      await withdraw(publicKey, sharesStroops);
      
      setActionSuccess(`Successfully burned shares and withdrew underlying XLM!`);
      setWithdrawAmount("");
      await onRefreshBalance();
      await fetchData();
    } catch (err: any) {
      setActionError(err.message || "Withdrawal transaction failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccrueYield = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey || !yieldAmount) return;
    setActionLoading(true);
    setActionType("yield");
    setActionError(null);
    setActionSuccess(null);

    const amountStroops = xlmToStroops(yieldAmount);

    // Validate balance
    if (BigInt(amountStroops) > BigInt(xlmBalance)) {
      setActionError("Insufficient XLM balance for yield simulation.");
      setActionLoading(false);
      return;
    }

    try {
      await accrueYield(publicKey, amountStroops);
      
      confetti({
        particleCount: 40,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
      });
      confetti({
        particleCount: 40,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
      });

      setActionSuccess(`Simulated yield accrual! Added ${yieldAmount} XLM directly to the pool.`);
      setYieldAmount("");
      await onRefreshBalance();
      await fetchData();
    } catch (err: any) {
      setActionError(err.message || "Accruing yield failed. Verify if you are the contract Admin.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetMaxDeposit = () => {
    const balance = BigInt(xlmBalance);
    // Keep 1 XLM buffer for fee reserves
    const buffer = 10000000n;
    if (balance <= buffer) {
      setDepositAmount("0");
    } else {
      setDepositAmount(stroopsToXlm(balance - buffer).toString());
    }
  };

  const handleSetMaxWithdraw = () => {
    if (userPosition) {
      setWithdrawAmount(stroopsToXlm(userPosition.shares).toString());
    }
  };

  if (loading && !vaultInfo && !notInitialized) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-indigo-200">
        <Loader2 className="h-10 w-10 animate-spin mb-4 text-indigo-500" />
        <span className="font-semibold text-lg tracking-wide animate-pulse">
          Fetching Vault Analytics from Stellar Testnet...
        </span>
      </div>
    );
  }

  // --- INITIALIZATION SCREEN ---
  if (notInitialized) {
    return (
      <div className="w-full max-w-3xl mx-auto p-8 rounded-3xl border border-white/10 bg-card backdrop-blur-md shadow-2xl relative z-10 text-center animate-fadeIn">
        <div className="mx-auto w-16 h-16 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl flex items-center justify-center mb-6">
          <Compass className="h-8 w-8 text-indigo-400 animate-spin" style={{ animationDuration: '6s' }} />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Uninitialized Savings Vault</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-sm leading-relaxed">
          The Yield Vault smart contract is deployed on Testnet but needs to be initialized. 
          The wallet that initializes the contract will be registered as the administrative controller.
        </p>

        {publicKey ? (
          <div className="space-y-4">
            <button
              onClick={handleInitialize}
              disabled={actionLoading}
              className="px-8 py-3.5 rounded-xl font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 transition-all duration-300 shadow-lg shadow-indigo-950 flex items-center justify-center mx-auto space-x-2"
            >
              {actionLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Initializing...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-5 w-5" />
                  <span>Initialize Contract as Admin</span>
                </>
              )}
            </button>
            <p className="text-xs text-indigo-400 font-mono">
              Admin Wallet: {publicKey.slice(0, 8)}...{publicKey.slice(-8)}
            </p>
          </div>
        ) : (
          <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-300 text-sm max-w-sm mx-auto">
            Please connect your Freighter wallet in the header above to initialize the vault.
          </div>
        )}

        {actionError && (
          <div className="mt-6 p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-sm">
            {actionError}
          </div>
        )}
      </div>
    );
  }

  // --- STANDARD DASHBOARD ---
  const sharePriceXlm = vaultInfo ? stroopsToXlm(vaultInfo.sharePrice) : 1;
  const totalBalanceNumber = vaultInfo ? stroopsToXlm(vaultInfo.totalBalance) : 0;
  const isVaultAdmin = publicKey && vaultInfo && publicKey === vaultInfo.admin;

  return (
    <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10 animate-fadeIn">
      {/* 1. TOP METRICS GRID (Full Width) */}
      <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Metric 1: TVL */}
        <div className="p-6 rounded-2xl border border-white/10 bg-card backdrop-blur-md hover:border-indigo-500/20 transition-all duration-300 shadow-xl group">
          <div className="flex justify-between items-start mb-3">
            <span className="text-sm font-semibold text-gray-400 tracking-wide">Total Value Locked (TVL)</span>
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl group-hover:bg-indigo-500/20 transition-colors">
              <TrendingUp className="h-5 w-5 text-indigo-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white font-mono">
            {vaultInfo ? formatBigNumber(vaultInfo.totalBalance) : "0.00"}{" "}
            <span className="text-indigo-400 font-sans text-sm">XLM</span>
          </div>
          <p className="text-xs text-indigo-300/60 mt-1 font-medium">Underlying pool backing all shares</p>
        </div>

        {/* Metric 2: Share Price */}
        <div className="p-6 rounded-2xl border border-white/10 bg-card backdrop-blur-md hover:border-purple-500/20 transition-all duration-300 shadow-xl group">
          <div className="flex justify-between items-start mb-3">
            <span className="text-sm font-semibold text-gray-400 tracking-wide">Share Conversion Price</span>
            <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-xl group-hover:bg-purple-500/20 transition-colors">
              <Sparkles className="h-5 w-5 text-purple-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white font-mono">
            {sharePriceXlm.toFixed(4)}{" "}
            <span className="text-purple-400 font-sans text-sm">XLM/Share</span>
          </div>
          <p className="text-xs text-purple-300/60 mt-1 font-medium">
            {sharePriceXlm > 1.0 
              ? `🔥 Up ${( (sharePriceXlm - 1.0) * 100 ).toFixed(2)}% from par` 
              : "⭐ Shares trade 1:1 at par"}
          </p>
        </div>

        {/* Metric 3: Total Shares */}
        <div className="p-6 rounded-2xl border border-white/10 bg-card backdrop-blur-md hover:border-pink-500/20 transition-all duration-300 shadow-xl group">
          <div className="flex justify-between items-start mb-3">
            <span className="text-sm font-semibold text-gray-400 tracking-wide">Total Shares Minted</span>
            <div className="p-2 bg-pink-500/10 border border-pink-500/20 rounded-xl group-hover:bg-pink-500/20 transition-colors">
              <Award className="h-5 w-5 text-pink-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white font-mono">
            {vaultInfo ? formatBigNumber(vaultInfo.totalShares) : "0.00"}{" "}
            <span className="text-pink-400 font-sans text-sm">SHARES</span>
          </div>
          <p className="text-xs text-pink-300/60 mt-1 font-medium">Total supply of vault shares</p>
        </div>

        {/* Metric 4: User Position */}
        <div className="p-6 rounded-2xl border border-indigo-500/25 bg-indigo-950/20 backdrop-blur-md shadow-2xl group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/10 rounded-full blur-2xl"></div>
          <div className="flex justify-between items-start mb-3">
            <span className="text-sm font-semibold text-indigo-300 tracking-wide">My Position Value</span>
            <div className="p-2 bg-indigo-500/20 border border-indigo-500/40 rounded-xl">
              <Percent className="h-5 w-5 text-indigo-300" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white font-mono">
            {userPosition ? formatBigNumber(userPosition.xlmValue) : "0.00"}{" "}
            <span className="text-indigo-400 font-sans text-sm">XLM</span>
          </div>
          <p className="text-xs text-indigo-300 mt-1 font-semibold flex items-center">
            {userPosition && userPosition.shares !== "0" ? (
              <>
                <span>{formatBigNumber(userPosition.shares)} Shares ({userPosition.vaultPercentage}%)</span>
              </>
            ) : (
              <span className="text-indigo-400/50">No deposits active</span>
            )}
          </p>
        </div>
      </div>

      {/* 2. TRANSACTION AND INTERACTION CARDS (Main columns) */}
      <div className="lg:col-span-2 space-y-8">
        
        {/* Deposit/Withdraw Panel */}
        <div className="p-6 sm:p-8 rounded-3xl border border-white/10 bg-card backdrop-blur-md shadow-2xl">
          <div className="border-b border-white/10 pb-6 mb-6">
            <h2 className="text-xl font-bold text-white mb-1">Interact with Yield Vault</h2>
            <p className="text-xs text-gray-400">Deposit XLM to mint interest-bearing shares, or withdraw to redeem them back into XLM.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            
            {/* Deposit Box */}
            <form onSubmit={handleDeposit} className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-sm font-bold text-indigo-300 flex items-center space-x-1.5">
                  <ArrowDownLeft className="h-4 w-4 text-emerald-400" />
                  <span>Deposit XLM</span>
                </label>
                {publicKey && (
                  <button
                    type="button"
                    onClick={handleSetMaxDeposit}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-bold transition-colors"
                  >
                    Use Max
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0.0000001"
                  placeholder="0.00 XLM"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  disabled={actionLoading || !publicKey}
                  className="w-full bg-white/5 border border-white/10 focus:border-indigo-500 rounded-xl px-4 py-3 text-white font-mono placeholder-gray-500 text-sm focus:outline-none transition-all duration-300"
                />
                <span className="absolute right-4 top-3.5 text-xs text-gray-400 font-bold">XLM</span>
              </div>
              {depositAmount && vaultInfo && (
                <div className="text-xs text-gray-400 font-semibold px-1">
                  Est. shares received:{" "}
                  <span className="text-emerald-400 font-mono">
                    {sharePriceXlm > 0 
                      ? (Number(depositAmount) / sharePriceXlm).toFixed(4)
                      : depositAmount}{" "}
                    Shares
                  </span>
                </div>
              )}
              <button
                type="submit"
                disabled={actionLoading || !publicKey || !depositAmount}
                className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 disabled:opacity-50 transition-all duration-300 shadow-md flex items-center justify-center space-x-2"
              >
                {actionLoading && actionType === "deposit" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Signing Deposit...</span>
                  </>
                ) : (
                  <span>Deposit XLM</span>
                )}
              </button>
            </form>

            {/* Withdraw Box */}
            <form onSubmit={handleWithdraw} className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-sm font-bold text-indigo-300 flex items-center space-x-1.5">
                  <ArrowUpRight className="h-4 w-4 text-rose-400" />
                  <span>Withdraw Shares</span>
                </label>
                {publicKey && userPosition && userPosition.shares !== "0" && (
                  <button
                    type="button"
                    onClick={handleSetMaxWithdraw}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-bold transition-colors"
                  >
                    Withdraw Max
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0.0000001"
                  placeholder="0.00 Shares"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  disabled={actionLoading || !publicKey}
                  className="w-full bg-white/5 border border-white/10 focus:border-indigo-500 rounded-xl px-4 py-3 text-white font-mono placeholder-gray-500 text-sm focus:outline-none transition-all duration-300"
                />
                <span className="absolute right-4 top-3.5 text-xs text-gray-400 font-bold">SHARES</span>
              </div>
              {withdrawAmount && (
                <div className="text-xs text-gray-400 font-semibold px-1">
                  Est. XLM returned:{" "}
                  <span className="text-rose-400 font-mono">
                    {(Number(withdrawAmount) * sharePriceXlm).toFixed(4)} XLM
                  </span>
                </div>
              )}
              <button
                type="submit"
                disabled={actionLoading || !publicKey || !withdrawAmount}
                className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-indigo-600 to-rose-600 hover:from-indigo-500 hover:to-rose-500 disabled:opacity-50 transition-all duration-300 shadow-md flex items-center justify-center space-x-2"
              >
                {actionLoading && actionType === "withdraw" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Signing Withdrawal...</span>
                  </>
                ) : (
                  <span>Withdraw XLM</span>
                )}
              </button>
            </form>

          </div>

          {!publicKey && (
            <div className="mt-6 p-4 text-center rounded-xl bg-indigo-500/5 border border-indigo-500/10 text-indigo-300 text-xs font-semibold">
              ⚠️ Please connect your Freighter wallet in the header to transact.
            </div>
          )}

          {actionSuccess && (
            <div className="mt-6 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-emerald-300 text-xs font-semibold animate-fadeIn">
              🎉 {actionSuccess}
            </div>
          )}

          {actionError && (
            <div className="mt-6 p-3 rounded-xl border border-red-500/30 bg-red-500/5 text-red-300 text-xs font-semibold animate-fadeIn">
              ❌ {actionError}
            </div>
          )}
        </div>

        {/* 3. SIMULATE COMPOUNDING (Interactive Simulation Card) */}
        <div className="p-6 sm:p-8 rounded-3xl border border-white/10 bg-card backdrop-blur-md shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-3xl"></div>
          
          <div className="border-b border-white/10 pb-6 mb-6">
            <div className="flex items-center space-x-2 text-indigo-300 mb-1">
              <Sparkles className="h-5 w-5 text-indigo-400 animate-pulse" />
              <h2 className="text-xl font-bold text-white">Simulate Compound Interest</h2>
            </div>
            <p className="text-xs text-gray-400">
              Simulate interest accrual! In Soroban, yield is generated by injecting XLM into the vault. This elevates the conversion price, earning yield for all current depositors.
            </p>
          </div>

          <form onSubmit={handleAccrueYield} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 w-full space-y-2">
                <label className="text-xs font-bold text-gray-300">
                  Simulated Interest Amount to Inject (XLM)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min="0.0000001"
                    placeholder="Enter yield amount (e.g. 10 XLM)"
                    value={yieldAmount}
                    onChange={(e) => setYieldAmount(e.target.value)}
                    disabled={actionLoading || !publicKey}
                    className="w-full bg-white/5 border border-white/10 focus:border-indigo-500 rounded-xl px-4 py-3 text-white font-mono placeholder-gray-500 text-sm focus:outline-none transition-all duration-300"
                  />
                  <span className="absolute right-4 top-3.5 text-xs text-gray-400 font-bold">XLM</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={actionLoading || !publicKey || !yieldAmount}
                className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 transition-all duration-300 shadow-md flex items-center justify-center space-x-2 whitespace-nowrap active:scale-95"
              >
                {actionLoading && actionType === "yield" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Adding Yield...</span>
                  </>
                ) : (
                  <>
                    <span>Inject Yield & Compound</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>

            {/* Explain admin rules */}
            <div className="p-3 rounded-xl border border-white/5 bg-white/5 flex items-start space-x-2 text-xs text-gray-400 leading-relaxed">
              <Info className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
              <div>
                <span>
                  **Demo Mode**: Any account can act as the simulation administrator on Testnet if they are the designated admin of the contract. 
                  Currently, the admin address is: 
                </span>
                <span className="text-indigo-300 font-mono block mt-1 break-all select-all">
                  {vaultInfo?.admin || "Loading..."}
                </span>
                {!isVaultAdmin && publicKey && (
                  <span className="text-amber-300 block mt-1 font-semibold">
                    ⚠️ Note: You are connected as a viewer. Only the admin address above can inject yield!
                  </span>
                )}
              </div>
            </div>
          </form>
        </div>

      </div>

      {/* 4. EDU CARD (Sidebar column) */}
      <div className="lg:col-span-1 space-y-8">
        
        {/* Info card */}
        <div className="p-6 rounded-3xl border border-white/10 bg-card backdrop-blur-md shadow-2xl space-y-6">
          <h3 className="text-lg font-bold text-indigo-300 flex items-center space-x-2 border-b border-white/10 pb-4">
            <Compass className="h-5 w-5 text-indigo-400" />
            <span>How it Works</span>
          </h3>

          <ul className="space-y-5 text-xs text-gray-300 leading-relaxed">
            <li className="flex items-start space-x-3">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-[10px] font-bold flex-shrink-0">
                1
              </div>
              <div>
                <p className="font-bold text-white mb-0.5">Deposit XLM</p>
                <p>When you deposit, the contract mints shares to you based on the current exchange rate. If you are first, shares equal your deposited XLM 1:1.</p>
              </div>
            </li>
            
            <li className="flex items-start space-x-3">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400 text-[10px] font-bold flex-shrink-0">
                2
              </div>
              <div>
                <p className="font-bold text-white mb-0.5">Yield compounds</p>
                <p>As the vault accumulates interest (XLM is added via the admin simulation), the pool balance increases but the total shares stay identical.</p>
              </div>
            </li>

            <li className="flex items-start space-x-3">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-pink-500/10 border border-pink-500/30 text-pink-400 text-[10px] font-bold flex-shrink-0">
                3
              </div>
              <div>
                <p className="font-bold text-white mb-0.5">Withdraw & capture gain</p>
                <p>Because the pool balance grows and shares do not, **each share becomes exchangeable for MORE XLM**. When you burn shares, you withdraw your original deposit plus compounded gains.</p>
              </div>
            </li>
          </ul>

          <div className="p-4 rounded-xl border border-white/5 bg-gradient-to-br from-indigo-950/20 to-purple-950/20">
            <h4 className="font-bold text-xs text-white mb-2 flex items-center space-x-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Smart Contract Verified</span>
            </h4>
            <p className="text-[10px] text-gray-400 leading-normal">
              Built on the secure, stateful **Soroban Smart Contract engine**. Total pool balance cannot be drained, and each user can only burn their proportional share.
            </p>
          </div>
        </div>

        {/* Global Error Panel */}
        {error && (
          <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-red-300 text-xs">
            <p className="font-bold mb-1">DApp Syncing Error</p>
            <p className="font-mono leading-normal">{error}</p>
            <button
              onClick={fetchData}
              className="mt-3 text-indigo-400 font-bold hover:text-indigo-300 transition-colors block text-left"
            >
              🔄 Retry connection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
