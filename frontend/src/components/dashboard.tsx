"use client";

import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
  useSuiClientQuery,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import clsx from "clsx";
import { FormEvent, useMemo, useState } from "react";
import { PACKAGE_ID, REGISTRY_ID, TARGETS } from "@/lib/env";
import { shortId, toBytes } from "@/lib/codec";

type TxState = {
  type: "idle" | "loading" | "success" | "error";
  message: string;
};

const initialTxState: TxState = {
  type: "idle",
  message: "",
};

function asIssuerList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];

  const maybeContents = (raw as { fields?: { contents?: unknown[] } })?.fields
    ?.contents;
  if (Array.isArray(maybeContents)) {
    return maybeContents.filter((v): v is string => typeof v === "string");
  }

  return [];
}

function statusClass(type: TxState["type"]): string {
  if (type === "success") return "status success";
  if (type === "error") return "status error";
  if (type === "loading") return "status loading";
  return "status";
}

function formatIssuedAt(value: string): string {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return "-";
  const ms = raw < 100_000_000_000 ? raw * 1000 : raw;
  return new Date(ms).toLocaleString();
}

function toIpfsUrl(hash: string): string {
  const value = hash.trim();
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${value.replace("ipfs://", "")}`;
  }
  return `https://ipfs.io/ipfs/${value}`;
}

export function Dashboard() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const [registryId, setRegistryId] = useState(REGISTRY_ID);
  const [issuerId, setIssuerId] = useState("");
  const [recipient, setRecipient] = useState(
    "0x0919628afc8c1b899147ffee9ac126dedb64211b909e07028e1b0ba24d77d802",
  );
  const [credentialType, setCredentialType] = useState("course");
  const [metadataHash, setMetadataHash] = useState("");
  const [issuerName, setIssuerName] = useState("CredForge Issuer");
  const [issuerToWhitelist, setIssuerToWhitelist] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [trustCheckAddress, setTrustCheckAddress] = useState("");
  const [trustCheckResult, setTrustCheckResult] = useState<null | boolean>(null);
  const [txState, setTxState] = useState<TxState>(initialTxState);

  const credentialsQuery = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: account?.address ?? "0x0",
      filter: {
        StructType: `${PACKAGE_ID}::credforge::Credential`,
      },
      options: {
        showContent: true,
        showType: true,
      },
    },
    {
      enabled: !!account?.address,
    },
  );

  const credentialRows = useMemo(() => {
    return (credentialsQuery.data?.data ?? []).map((item) => {
      const content = item.data?.content as
        | { fields?: Record<string, unknown> }
        | undefined;
      const fields = content?.fields ?? {};

      return {
        objectId: item.data?.objectId ?? "",
        issuer: String(fields.issuer ?? ""),
        recipient: String(fields.recipient ?? ""),
        revoked: Boolean(fields.revoked ?? false),
        issuedAt: String(fields.issued_at ?? ""),
        credentialType: String(fields.credential_type ?? ""),
        metadataHash: String(fields.metadata_hash ?? ""),
      };
    });
  }, [credentialsQuery.data?.data]);

  async function execute(label: string, build: (tx: Transaction) => void) {
    if (!account?.address) {
      setTxState({ type: "error", message: "Connect wallet first." });
      return;
    }

    try {
      setTxState({ type: "loading", message: `${label} in progress...` });
      const tx = new Transaction();
      build(tx);
      tx.setGasBudget(100_000_000);

      const result = (await signAndExecuteTransaction({
        transaction: tx,
      })) as { digest?: string };

      setTxState({
        type: "success",
        message: `${label} sent. Digest: ${result?.digest ?? "submitted"}`,
      });

      credentialsQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transaction failed.";
      setTxState({ type: "error", message: `${label} failed: ${message}` });
    }
  }

  async function onRegisterIssuer(event: FormEvent) {
    event.preventDefault();
    await execute("Register issuer", (tx) => {
      tx.moveCall({
        target: TARGETS.registerIssuer,
        arguments: [tx.pure.vector("u8", toBytes(issuerName))],
      });
    });
  }

  async function onWhitelistIssuer(event: FormEvent) {
    event.preventDefault();
    await execute("Whitelist issuer", (tx) => {
      tx.moveCall({
        target: TARGETS.addIssuerToRegistry,
        arguments: [
          tx.object(registryId),
          tx.pure.address(issuerToWhitelist),
        ],
      });
    });
  }

  async function onIssueCredential(event: FormEvent) {
    event.preventDefault();
    await execute("Issue credential", (tx) => {
      tx.moveCall({
        target: TARGETS.issueCredential,
        arguments: [
          tx.object(registryId),
          tx.object(issuerId),
          tx.pure.address(recipient),
          tx.pure.vector("u8", toBytes(credentialType)),
          tx.pure.vector("u8", toBytes(metadataHash)),
        ],
      });
    });
  }

  async function onRevokeCredential(event: FormEvent) {
    event.preventDefault();
    await execute("Revoke credential", (tx) => {
      tx.moveCall({
        target: TARGETS.revokeCredential,
        arguments: [tx.object(credentialId), tx.object(issuerId)],
      });
    });
  }

  async function onCheckTrust(event: FormEvent) {
    event.preventDefault();

    try {
      const object = await client.getObject({
        id: registryId,
        options: { showContent: true },
      });

      const fields = (object.data?.content as { fields?: Record<string, unknown> })
        ?.fields;
      const issuers = asIssuerList(fields?.issuers);
      setTrustCheckResult(issuers.includes(trustCheckAddress));
    } catch {
      setTrustCheckResult(null);
      setTxState({
        type: "error",
        message: "Trust check failed. Verify registry object id.",
      });
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="kicker">CredForge on Sui</p>
        <h1>Credential Registry Admin</h1>
        <p className="heroCopy">
          Manage issuer onboarding, trust controls, credential issuance, and
          revocation from one admin workspace.
        </p>
        <div className="heroMeta">
          <ConnectButton />
          <span>
            Account: {account?.address ? shortId(account.address) : "Not connected"}
          </span>
        </div>
        <div className="heroPills">
          <span className="miniPill">
            Package: <code>{shortId(PACKAGE_ID, 8)}</code>
          </span>
          <span className="miniPill">
            Connected Credentials: {credentialRows.length}
          </span>
          <span className="miniPill">
            Registry: {registryId ? shortId(registryId) : "Not set"}
          </span>
        </div>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Shared Config</h2>
          <label>
            Registry Object ID
            <input
              value={registryId}
              onChange={(event) => setRegistryId(event.target.value.trim())}
              placeholder="0x..."
            />
          </label>
          <label>
            Issuer Object ID
            <input
              value={issuerId}
              onChange={(event) => setIssuerId(event.target.value.trim())}
              placeholder="0x..."
            />
          </label>
          <p className="hint">
            Keep these IDs accurate before running issuer, issue, revoke, or trust actions.
          </p>
        </article>

        <article className="card actionCard">
          <h2>1. Register Issuer</h2>
          <p className="hint cardLead">Create an on-chain issuer object with your wallet as admin.</p>
          <form onSubmit={onRegisterIssuer}>
            <label>
              Issuer Name
              <input
                value={issuerName}
                onChange={(event) => setIssuerName(event.target.value)}
                placeholder="My University"
              />
            </label>
            <button type="submit" className="cta">Register Issuer</button>
          </form>
        </article>

        <article className="card actionCard">
          <h2>2. Whitelist Issuer</h2>
          <p className="hint cardLead">Allow only trusted issuer addresses to issue credentials.</p>
          <form onSubmit={onWhitelistIssuer}>
            <label>
              Issuer Address
              <input
                value={issuerToWhitelist}
                onChange={(event) => setIssuerToWhitelist(event.target.value.trim())}
                placeholder="0x..."
              />
            </label>
            <button type="submit" className="cta">Whitelist Issuer</button>
          </form>
        </article>

        <article className="card wide actionCard">
          <h2>3. Issue Credential</h2>
          <p className="hint cardLead">Mint a soulbound credential directly to the recipient wallet.</p>
          <form onSubmit={onIssueCredential} className="columns2">
            <label>
              Recipient
              <input
                value={recipient}
                onChange={(event) => setRecipient(event.target.value.trim())}
                placeholder="0x..."
              />
            </label>
            <label>
              Credential Type
              <input
                value={credentialType}
                onChange={(event) => setCredentialType(event.target.value)}
                placeholder="course | event | mentorship"
              />
            </label>
            <label className="full">
              Metadata Hash
              <input
                value={metadataHash}
                onChange={(event) => setMetadataHash(event.target.value)}
                placeholder="sha256/ipfs-hash pointer"
              />
            </label>
            <button type="submit" className="full">
              Issue Soulbound Credential
            </button>
          </form>
        </article>

        <article className="card actionCard">
          <h2>4. Revoke</h2>
          <p className="hint cardLead">Mark a credential as revoked while keeping its on-chain record.</p>
          <form onSubmit={onRevokeCredential}>
            <label>
              Credential Object ID
              <input
                value={credentialId}
                onChange={(event) => setCredentialId(event.target.value.trim())}
                placeholder="0x..."
              />
            </label>
            <button type="submit" className="cta">Revoke Credential</button>
          </form>
        </article>

        <article className="card actionCard">
          <h2>5. Check Trust</h2>
          <p className="hint cardLead">Check whether an issuer address exists in your registry whitelist.</p>
          <form onSubmit={onCheckTrust}>
            <label>
              Issuer Address
              <input
                value={trustCheckAddress}
                onChange={(event) => setTrustCheckAddress(event.target.value.trim())}
                placeholder="0x..."
              />
            </label>
            <button type="submit" className="cta">Verify Trust</button>
          </form>
          {trustCheckResult !== null ? (
            <p className={clsx("trust", trustCheckResult ? "ok" : "bad")}>
              {trustCheckResult ? "Trusted issuer" : "Not trusted"}
            </p>
          ) : null}
        </article>
      </section>

      <section className={statusClass(txState.type)}>
        <strong>Status:</strong> {txState.message || "Ready"}
      </section>

      <section className="card">
        <h2>Owned Credentials</h2>
        {credentialsQuery.isLoading ? <p>Loading credentials...</p> : null}
        {!credentialsQuery.isLoading && credentialRows.length === 0 ? (
          <p className="hint">No credentials found for connected wallet.</p>
        ) : null}
        {credentialRows.length > 0 ? (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Object</th>
                  <th>Type</th>
                  <th>Certificate</th>
                  <th>Issuer</th>
                  <th>Recipient</th>
                  <th>Issued At (ms)</th>
                  <th>Revoked</th>
                </tr>
              </thead>
              <tbody>
                {credentialRows.map((row) => (
                  <tr key={row.objectId}>
                    <td title={row.objectId}>{shortId(row.objectId)}</td>
                    <td>{row.credentialType}</td>
                    <td>
                      {row.metadataHash ? (
                        <a href={toIpfsUrl(row.metadataHash)} target="_blank" rel="noreferrer">
                          <img
                            className="certThumb"
                            src={toIpfsUrl(row.metadataHash)}
                            alt="Certificate"
                          />
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td title={row.issuer}>{shortId(row.issuer)}</td>
                    <td title={row.recipient}>{shortId(row.recipient)}</td>
                    <td>{formatIssuedAt(row.issuedAt)}</td>
                    <td>
                      <span className={clsx("badge", row.revoked ? "revoked" : "active")}>
                        {row.revoked ? "Revoked" : "Active"}
                      </span>
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
