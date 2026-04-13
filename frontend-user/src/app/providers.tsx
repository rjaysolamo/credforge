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
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
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

type EnokiBootstrapState = {
  ready: boolean;
  error: string | null;
};

const EnokiBootstrapContext = createContext<EnokiBootstrapState>({
  ready: false,
  error: null,
});

export function useEnokiBootstrap() {
  return useContext(EnokiBootstrapContext);
}

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = useMemo(() => new QueryClient(), []);
  const [bootstrapState, setBootstrapState] = useState<EnokiBootstrapState>({
    ready: false,
    error: null,
  });

  useEffect(() => {
    if (!ENOKI_API_KEY) {
      setBootstrapState({
        ready: false,
        error: "Missing NEXT_PUBLIC_ENOKI_API_KEY.",
      });
      return;
    }

    if (ENOKI_API_KEY.startsWith("enoki_private_")) {
      setBootstrapState({
        ready: false,
        error:
          "NEXT_PUBLIC_ENOKI_API_KEY is using a private key. Use your Enoki public key in browser apps.",
      });
      return;
    }

    let unregister: (() => void) | undefined;
    let mounted = true;
    setBootstrapState({ ready: false, error: null });

    const explicitRedirectUrl = ENOKI_REDIRECT_URL.trim() || undefined;

    async function initEnokiWallets() {
      const providers: Partial<
        Record<AuthProvider, { clientId: string; redirectUrl?: string }>
      > = {};

      if (ENOKI_GOOGLE_CLIENT_ID) {
        providers.google = explicitRedirectUrl
          ? { clientId: ENOKI_GOOGLE_CLIENT_ID, redirectUrl: explicitRedirectUrl }
          : { clientId: ENOKI_GOOGLE_CLIENT_ID };
      }
      if (ENOKI_FACEBOOK_CLIENT_ID) {
        providers.facebook = explicitRedirectUrl
          ? { clientId: ENOKI_FACEBOOK_CLIENT_ID, redirectUrl: explicitRedirectUrl }
          : { clientId: ENOKI_FACEBOOK_CLIENT_ID };
      }
      if (ENOKI_TWITCH_CLIENT_ID) {
        providers.twitch = explicitRedirectUrl
          ? { clientId: ENOKI_TWITCH_CLIENT_ID, redirectUrl: explicitRedirectUrl }
          : { clientId: ENOKI_TWITCH_CLIENT_ID };
      }

      // Fallback: auto-read enabled providers and client IDs from Enoki app config.
      if (Object.keys(providers).length === 0) {
        try {
          const app = await new EnokiClient({ apiKey: ENOKI_API_KEY }).getApp();
          for (const auth of app.authenticationProviders) {
            providers[auth.providerType] = explicitRedirectUrl
              ? { clientId: auth.clientId, redirectUrl: explicitRedirectUrl }
              : { clientId: auth.clientId };
          }
        } catch (error) {
          console.error("Failed to auto-load Enoki providers from getApp()", error);
        }
      }

      if (!mounted) return;

      if (!providers.google) {
        setBootstrapState({
          ready: false,
          error:
            "Google provider is not configured. Set NEXT_PUBLIC_ENOKI_GOOGLE_CLIENT_ID or enable Google in Enoki.",
        });
        return;
      }

      try {
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
        setBootstrapState({ ready: true, error: null });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Enoki wallet registration failed.";
        setBootstrapState({ ready: false, error: message });
      }
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
        <WalletProvider autoConnect={false}>
          <EnokiBootstrapContext.Provider value={bootstrapState}>
            {children}
          </EnokiBootstrapContext.Provider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
