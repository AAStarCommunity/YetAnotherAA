"use client";

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";
import { Account, Transfer, TokenBalance } from "@/lib/types";
import { accountAPI, transferAPI, paymasterAPI, tokenAPI, userTokenAPI } from "@/lib/api";
import { getStoredAuth } from "@/lib/auth";

interface DashboardData {
  account: Account | null;
  transfers: Transfer[];
  paymasters: any[];
  tokenBalances: TokenBalance[];
  lastUpdated: Date | null;
}

interface DashboardContextType {
  data: DashboardData;
  loading: boolean;
  loadDashboardData: (force?: boolean) => Promise<void>;
  refreshBalance: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

const getInitialData = (): DashboardData => {
  if (typeof window !== "undefined") {
    const cached = sessionStorage.getItem("dashboardData");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // Convert lastUpdated string back to Date
        if (parsed.lastUpdated) {
          parsed.lastUpdated = new Date(parsed.lastUpdated);
        }
        return parsed;
      } catch {
        // If parsing fails, return default
      }
    }
  }
  return {
    account: null,
    transfers: [],
    paymasters: [],
    tokenBalances: [],
    lastUpdated: null,
  };
};

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardData>(getInitialData);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(() => {
    if (typeof window !== "undefined") {
      // Only treat the cache as authoritative if it actually has an account. A cached
      // "no account yet" state must NOT short-circuit the fetch — otherwise an account
      // created after that cache (e.g. via create-with-guardians) never shows up until
      // the session is cleared.
      if (sessionStorage.getItem("dashboardDataLoaded") !== "true") return false;
      try {
        return !!JSON.parse(sessionStorage.getItem("dashboardData") || "{}").account;
      } catch {
        return false;
      }
    }
    return false;
  });
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const { user } = getStoredAuth();
      return user?.id || null;
    }
    return null;
  });

  // Monitor user changes and reset data when user changes
  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkUserChange = () => {
      const { user } = getStoredAuth();
      const newUserId = user?.id || null;

      // If user changed (including logout), reset all data
      if (newUserId !== currentUserId) {
        setCurrentUserId(newUserId);
        setData(getInitialData());
        setHasLoaded(false);
      }
    };

    // Check immediately
    checkUserChange();

    // Set up interval to check for user changes
    const interval = setInterval(checkUserChange, 500);

    return () => clearInterval(interval);
  }, [currentUserId]);

  const loadDashboardData = useCallback(
    async (force = false) => {
      // Skip loading if already loaded and not forced
      if (hasLoaded && !force) {
        return;
      }

      setLoading(true);
      try {
        let accountData = null;

        // Try to get account
        try {
          const accountResponse = await accountAPI.getAccount();
          accountData = accountResponse.data;
        } catch {
          accountData = null;
        }

        // Get transfer history
        let transfersData: Transfer[] = [];
        try {
          const transferResponse = await transferAPI.getHistory(1, 5);
          transfersData = transferResponse.data.transfers;
        } catch {
          transfersData = [];
        }

        // Get available paymasters
        let paymastersData: any[] = [];
        try {
          const paymasterResponse = await paymasterAPI.getAvailable();
          paymastersData = paymasterResponse.data;
        } catch {
          paymastersData = [];
        }

        // Get token balances for user's added tokens
        let tokenBalancesData: TokenBalance[] = [];
        if (accountData?.address) {
          try {
            // Get user's added tokens
            const userTokensResponse = await userTokenAPI.getUserTokens({});
            const userTokens = userTokensResponse.data;

            // Get balance for each user token
            const balancePromises = userTokens.map(async (userToken: any) => {
              try {
                const balanceResponse = await tokenAPI.getTokenBalance(userToken.address);
                return balanceResponse.data;
              } catch (error) {
                console.error(`Failed to get balance for ${userToken.symbol}:`, error);
                return null;
              }
            });

            const balances = await Promise.all(balancePromises);
            tokenBalancesData = balances.filter(b => b !== null);
          } catch (error) {
            console.error("Failed to load user token balances:", error);
            tokenBalancesData = [];
          }
        }

        const newData = {
          account: accountData,
          transfers: transfersData,
          paymasters: paymastersData,
          tokenBalances: tokenBalancesData,
          lastUpdated: new Date(),
        };
        setData(newData);
        // Only cache as "loaded" once an account exists; never make a no-account
        // state sticky (so a freshly-created account is picked up on the next load).
        if (accountData) {
          setHasLoaded(true);
          if (typeof window !== "undefined") {
            sessionStorage.setItem("dashboardDataLoaded", "true");
            sessionStorage.setItem("dashboardData", JSON.stringify(newData));
          }
        } else {
          setHasLoaded(false);
          if (typeof window !== "undefined") {
            sessionStorage.removeItem("dashboardDataLoaded");
            sessionStorage.removeItem("dashboardData");
          }
        }
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
      } finally {
        setLoading(false);
      }
    },
    [hasLoaded]
  );

  const refreshBalance = useCallback(async () => {
    try {
      const accountResponse = await accountAPI.getAccount();

      // Get updated token balances for user's added tokens
      let tokenBalancesData: TokenBalance[] = [];
      if (accountResponse.data?.address) {
        try {
          // Get user's added tokens
          const userTokensResponse = await userTokenAPI.getUserTokens({});
          const userTokens = userTokensResponse.data;

          // Get balance for each user token
          const balancePromises = userTokens.map(async (userToken: any) => {
            try {
              const balanceResponse = await tokenAPI.getTokenBalance(userToken.address);
              return balanceResponse.data;
            } catch (error) {
              console.error(`Failed to get balance for ${userToken.symbol}:`, error);
              return null;
            }
          });

          const balances = await Promise.all(balancePromises);
          tokenBalancesData = balances.filter(b => b !== null);
        } catch (error) {
          console.error("Failed to refresh user token balances:", error);
          tokenBalancesData = data.tokenBalances;
        }
      }

      const newData = {
        ...data,
        account: accountResponse.data,
        tokenBalances: tokenBalancesData,
        lastUpdated: new Date(),
      };
      setData(newData);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("dashboardData", JSON.stringify(newData));
      }
    } catch (error) {
      console.error("Failed to refresh balance:", error);
      throw error;
    }
  }, [data.tokenBalances]);

  return (
    <DashboardContext.Provider value={{ data, loading, loadDashboardData, refreshBalance }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return context;
}
