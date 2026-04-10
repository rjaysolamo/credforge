"use client";

import "@mysten/dapp-kit/dist/index.css";

import {
  createNetworkConfig,
  SuiClientProvider,
  WalletProvider,
} from "@mysten/dapp-kit";
import { AuthProvider, EnokiClient, registerEnokiWallets } from "@mysten/enoki";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useEffect, useMemo } from "react";
import {
  ENOKI_API_KEY,
  ENOKI_FACEBOOK_CLIENT_ID,
  ENOKI_GOOGLE_CLIENT_ID,
  ENOKI_REDIRECT_URL,
  ENOKI_TWITCH_CLIENT_ID,
  NETWORK,
} from "@/lib/env";

const { networkConfig } = createNetworkConfig({
  mainnet: { url: getJsonRpcFullnodeUrl("mainnet"), network: "mainnet" },
  testnet: { url: getJsonRpcFullnodeUrl("testnet"), network: "testnet" },
  devnet: { url: getJsonRpcFullnodeUrl("devnet"), network: "devnet" },
});

const suiNetwork =
  NETWORK === "mainnet" || NETWORK === "devnet" ? NETWORK : "testnet";

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = useMemo(() => new QueryClient(), []);

  useEffect(() => {
    if (!ENOKI_API_KEY) return;

    let unregister: (() => void) | undefined;
    let mounted = true;

    async function initEnokiWallets() {
      const providers: Partial<
        Record<AuthProvider, { clientId: string; redirectUrl?: string }>
      > = {};

      if (ENOKI_GOOGLE_CLIENT_ID) {
        providers.google = {
          clientId: ENOKI_GOOGLE_CLIENT_ID,
          redirectUrl: ENOKI_REDIRECT_URL || undefined,
        };
      }
      if (ENOKI_FACEBOOK_CLIENT_ID) {
        providers.facebook = {
          clientId: ENOKI_FACEBOOK_CLIENT_ID,
          redirectUrl: ENOKI_REDIRECT_URL || undefined,
        };
      }
      if (ENOKI_TWITCH_CLIENT_ID) {
        providers.twitch = {
          clientId: ENOKI_TWITCH_CLIENT_ID,
          redirectUrl: ENOKI_REDIRECT_URL || undefined,
        };
      }

      // Fallback: auto-read enabled providers and client IDs from Enoki app config.
      if (Object.keys(providers).length === 0) {
        try {
          const app = await new EnokiClient({ apiKey: ENOKI_API_KEY }).getApp();
          for (const auth of app.authenticationProviders) {
            providers[auth.providerType] = {
              clientId: auth.clientId,
              redirectUrl: ENOKI_REDIRECT_URL || undefined,
            };
          }
        } catch (error) {
          console.error("Failed to auto-load Enoki providers from getApp()", error);
        }
      }

      if (!mounted || Object.keys(providers).length === 0) return;

      const result = registerEnokiWallets({
        apiKey: ENOKI_API_KEY,
        providers,
        network: suiNetwork,
        client: new SuiJsonRpcClient({
          url: getJsonRpcFullnodeUrl(suiNetwork),
          network: suiNetwork,
        }),
      });

      unregister = result.unregister;
    }

    initEnokiWallets();

    return () => {
      mounted = false;
      unregister?.();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider
        networks={networkConfig}
        defaultNetwork={suiNetwork}
      >
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
