"use client";

import {
  useConnectWallet,
  useCurrentAccount,
  useCurrentWallet,
  useDisconnectWallet,
  useSuiClient,
  useSuiClientQuery,
  useWallets,
} from "@mysten/dapp-kit";
import {
  isEnokiWallet,
  isFacebookWallet,
  isGoogleWallet,
  isTwitchWallet,
} from "@mysten/enoki";
import clsx from "clsx";
import { FormEvent, useMemo, useState } from "react";
import { asIssuerList, shortId } from "@/lib/codec";
import { CREDENTIAL_TYPE, PACKAGE_ID, REGISTRY_ID } from "@/lib/env";

type CredentialRow = {
  objectId: string;
  recipient: string;
  issuer: string;
  credentialType: string;
  issuedAt: string;
  revoked: boolean;
};

export function UserDashboard() {
  const client = useSuiClient();
  const wallets = useWallets();
  const { currentWallet, isConnected, isConnecting } = useCurrentWallet();
  const currentAccount = useCurrentAccount();
  const { mutateAsync: connectWallet } = useConnectWallet();
  const { mutate: disconnectWallet } = useDisconnectWallet();

  const [registryId, setRegistryId] = useState(REGISTRY_ID);
  const [issuerToCheck, setIssuerToCheck] = useState("");
  const [trustResult, setTrustResult] = useState<null | boolean>(null);
  const [trustMessage, setTrustMessage] = useState("");
  const [suiAddress, setSuiAddress] = useState("");
  const [status, setStatus] = useState("");
  const [sessionJwtAvailable, setSessionJwtAvailable] = useState<boolean | null>(null);

  const enokiWallets = useMemo(() => wallets.filter((w) => isEnokiWallet(w)), [wallets]);
  const googleWallet = useMemo(() => enokiWallets.find((w) => isGoogleWallet(w)), [enokiWallets]);
  const facebookWallet = useMemo(() => enokiWallets.find((w) => isFacebookWallet(w)), [enokiWallets]);
  const twitchWallet = useMemo(() => enokiWallets.find((w) => isTwitchWallet(w)), [enokiWallets]);

  const lookupOwner = suiAddress || currentAccount?.address || "";

  const credentialsQuery = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: lookupOwner || "0x0",
      filter: { StructType: CREDENTIAL_TYPE },
      options: { showContent: true, showType: true },
    },
    { enabled: !!lookupOwner },
  );

  const rows = useMemo<CredentialRow[]>(() => {
    return (credentialsQuery.data?.data ?? []).map((item) => {
      const content = item.data?.content as
        | { fields?: Record<string, unknown> }
        | undefined;
      const fields = content?.fields ?? {};

      return {
        objectId: item.data?.objectId ?? "",
        recipient: String(fields.recipient ?? ""),
        issuer: String(fields.issuer ?? ""),
        credentialType: String(fields.credential_type ?? ""),
        issuedAt: String(fields.issued_at ?? ""),
        revoked: Boolean(fields.revoked ?? false),
      };
    });
  }, [credentialsQuery.data?.data]);

  async function signInWith(wallet: (typeof enokiWallets)[number] | undefined) {
    if (!wallet) {
      setStatus("Requested Enoki provider is not configured.");
      return;
    }

    try {
      setStatus("Signing in...");
      await connectWallet({ wallet });
      setStatus("Signed in successfully.");
      await refreshEnokiSession();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sign-in failed.");
    }
  }

  async function refreshEnokiSession() {
    try {
      const feature = (currentWallet as any)?.features?.["enoki:getSession"];
      if (!feature?.getSession) {
        setSessionJwtAvailable(null);
        return;
      }

      const session = await feature.getSession();
      setSessionJwtAvailable(Boolean(session?.jwt));
    } catch {
      setSessionJwtAvailable(null);
    }
  }

  async function checkIssuerTrust(event: FormEvent) {
    event.preventDefault();
    setTrustResult(null);
    setTrustMessage("");

    if (!registryId || !issuerToCheck) {
      setTrustMessage("Enter both registry and issuer address.");
      return;
    }

    try {
      const registry = await client.getObject({
        id: registryId,
        options: { showContent: true },
      });

      const fields = (registry.data?.content as { fields?: Record<string, unknown> })
        ?.fields;
      const issuers = asIssuerList(fields?.issuers);
      const trusted = issuers.includes(issuerToCheck);
      setTrustResult(trusted);
      setTrustMessage(trusted ? "Issuer is trusted." : "Issuer is not trusted.");
    } catch (error) {
      setTrustMessage(
        error instanceof Error
          ? `Trust check failed: ${error.message}`
          : "Trust check failed.",
      );
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="tag">CredForge User Portal</p>
        <h1>Your Verifiable Credentials</h1>
        <p className="heroSubtitle">
          Sign in with zkLogin using Enoki, then inspect your issued credentials and
          verify issuer trust directly from on-chain registry data.
        </p>

        <div className="heroRow">
          <button
            type="button"
            onClick={() => signInWith(googleWallet)}
            disabled={isConnecting}
          >
            Continue with Google
          </button>
          <button
            type="button"
            onClick={() => signInWith(facebookWallet)}
            disabled={isConnecting}
          >
            Continue with Facebook
          </button>
          <button
            type="button"
            onClick={() => signInWith(twitchWallet)}
            disabled={isConnecting}
          >
            Continue with Twitch
          </button>
          {isConnected ? (
            <button type="button" className="secondary" onClick={() => disconnectWallet()}>
              Sign Out
            </button>
          ) : null}
        </div>

        <div className="metaStrip">
          <span className={clsx("pill", isConnected ? "okPill" : "warnPill")}>
            {isConnected ? "Connected" : "Not Connected"}
          </span>
          <span className="pill">Providers: {enokiWallets.length}</span>
          <span className="pill">
            Account:{" "}
            {currentAccount?.address ? shortId(currentAccount.address) : "Not connected"}
          </span>
        </div>

        {enokiWallets.length === 0 ? (
          <p className="hint warning">
            No Enoki wallets found. Check `NEXT_PUBLIC_ENOKI_API_KEY`, OAuth client IDs, allowed
            origins, and redirect URL in Enoki/Google console.
          </p>
        ) : null}
        {status ? <p className="hint">{status}</p> : null}
      </section>

      <section className="grid">
        <article className="card">
          <h2>Registry</h2>
          <label>
            Registry Object ID
            <input
              value={registryId}
              onChange={(event) => setRegistryId(event.target.value.trim())}
              placeholder="0x..."
            />
          </label>
          <p className="hint">
            Package: <code>{shortId(PACKAGE_ID, 8)}</code>
          </p>
        </article>

        <article className="card wide">
          <h2>Address To View</h2>
          <p className="hint cardHint">
            Leave empty to use your currently connected zkLogin address.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              credentialsQuery.refetch();
            }}
            className="trustForm"
          >
            <input
              value={suiAddress}
              onChange={(event) => setSuiAddress(event.target.value.trim())}
              placeholder="Optional Sui address (defaults to connected zkLogin account)"
            />
            <button type="submit">Load</button>
          </form>
          <p className="hint">
            Sponsored tx readiness (optional):{" "}
            {sessionJwtAvailable === null ? "Unknown" : sessionJwtAvailable ? "JWT session available" : "No JWT in session"}
          </p>
          <button type="button" className="secondary" onClick={refreshEnokiSession}>
            Refresh Enoki Session
          </button>
        </article>

        <article className="card wide">
          <h2>Check Issuer Trust</h2>
          <form onSubmit={checkIssuerTrust} className="trustForm">
            <input
              value={issuerToCheck}
              onChange={(event) => setIssuerToCheck(event.target.value.trim())}
              placeholder="Issuer address (0x...)"
            />
            <button type="submit">Verify</button>
          </form>
          {trustMessage ? (
            <p className={clsx("status", trustResult === true && "ok", trustResult === false && "bad")}>
              {trustMessage}
            </p>
          ) : null}
        </article>
      </section>

      <section className="card">
        <h2>Credentials</h2>
        {credentialsQuery.isLoading ? <p>Loading...</p> : null}
        {!credentialsQuery.isLoading && !lookupOwner ? (
          <p className="hint">Sign in first or enter a Sui address.</p>
        ) : null}
        {!credentialsQuery.isLoading && lookupOwner && rows.length === 0 ? (
          <p className="hint">No credentials found.</p>
        ) : null}

        {rows.length > 0 ? (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Credential ID</th>
                  <th>Type</th>
                  <th>Issuer</th>
                  <th>Recipient</th>
                  <th>Issued At</th>
                  <th>Revoked</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.objectId}>
                    <td>{shortId(row.objectId)}</td>
                    <td>{row.credentialType || "-"}</td>
                    <td>{shortId(row.issuer)}</td>
                    <td>{shortId(row.recipient)}</td>
                    <td>{row.issuedAt || "-"}</td>
                    <td className={row.revoked ? "badText" : "okText"}>
                      {row.revoked ? "Revoked" : "Active"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}
