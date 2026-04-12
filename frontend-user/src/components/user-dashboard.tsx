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
import { isEnokiWallet, isGoogleWallet } from "@mysten/enoki";
import clsx from "clsx";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useEnokiBootstrap } from "@/app/providers";
import { asIssuerList, shortId } from "@/lib/codec";
import { REGISTRY_ID } from "@/lib/env";

type CredentialRow = {
  objectId: string;
  recipient: string;
  issuer: string;
  credentialType: string;
  metadataHash: string;
  issuedAt: string;
  revoked: boolean;
};

const FULL_NAME_STORAGE_KEY = "credforge_full_name";
const PROFILE_IMAGE_STORAGE_KEY = "credforge_profile_image";

function SuiLogoMark() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="11" fill="#6FBCF0" />
      <path
        d="M12 4.7c2.85 3.26 5.8 5.85 5.8 9.14A5.8 5.8 0 0 1 12 19.64a5.8 5.8 0 0 1-5.8-5.8c0-3.29 2.95-5.88 5.8-9.14z"
        fill="none"
        stroke="#fff"
        strokeWidth="1.5"
      />
      <path
        d="M8.95 13.25c1 .64 2 .89 3.05.89 1.06 0 2.07-.25 3.1-.89"
        fill="none"
        stroke="#fff"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M9.35 15.83c.86.45 1.74.64 2.65.64.92 0 1.82-.19 2.7-.64"
        fill="none"
        stroke="#fff"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function decodeMaybeBytes(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((v) => typeof v === "number")) {
    try {
      return new TextDecoder().decode(new Uint8Array(value as number[]));
    } catch {
      return String(value);
    }
  }
  return String(value ?? "");
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

function ipfsCandidates(value: string): string[] {
  const raw = value.trim();
  if (!raw) return [];
  if (raw.startsWith("http://") || raw.startsWith("https://")) return [raw];

  const ipfsPath = raw.startsWith("ipfs://") ? raw.replace("ipfs://", "") : raw;
  const gateways = [
    "https://dweb.link/ipfs/",
    "https://ipfs.io/ipfs/",
    "https://gateway.pinata.cloud/ipfs/",
  ];
  return gateways.map((base) => `${base}${ipfsPath}`);
}

async function resolveCredentialImage(metadataHash: string): Promise<string> {
  const directCandidates = ipfsCandidates(metadataHash);
  if (directCandidates.length === 0) return "";

  for (const url of directCandidates) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const contentType = (response.headers.get("content-type") || "").toLowerCase();

      if (contentType.startsWith("image/")) {
        return url;
      }

      if (contentType.includes("json")) {
        const json = (await response.json()) as Record<string, unknown>;
        const imageValue = String(
          json.image ??
            json.image_url ??
            json.certificate_image ??
            json.animation_url ??
            "",
        ).trim();
        if (!imageValue) continue;
        const imageCandidates = ipfsCandidates(imageValue);
        if (imageCandidates.length > 0) return imageCandidates[0];
      }
    } catch {
      // Try next gateway/candidate.
    }
  }

  return directCandidates[0];
}

export function UserDashboard() {
  const { ready: enokiReady, error: enokiError } = useEnokiBootstrap();
  const client = useSuiClient();
  const wallets = useWallets();
  const { isConnected, isConnecting } = useCurrentWallet();
  const currentAccount = useCurrentAccount();
  const { mutateAsync: connectWallet } = useConnectWallet();
  const { mutate: disconnectWallet } = useDisconnectWallet();

  const [registryId] = useState(REGISTRY_ID);
  const [issuerToCheck, setIssuerToCheck] = useState("");
  const [trustResult, setTrustResult] = useState<null | boolean>(null);
  const [trustMessage, setTrustMessage] = useState("");
  const [status, setStatus] = useState("");
  const [signInAttempted, setSignInAttempted] = useState(false);

  const [copyMessage, setCopyMessage] = useState("");
  const [imageByObjectId, setImageByObjectId] = useState<Record<string, string>>({});
  const [fullName, setFullName] = useState("");
  const [fullNameSaved, setFullNameSaved] = useState("");
  const [isNameLocked, setIsNameLocked] = useState(false);
  const [previewImage, setPreviewImage] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const [profileImageMessage, setProfileImageMessage] = useState("");

  const enokiWallets = useMemo(() => wallets.filter((w) => isEnokiWallet(w)), [wallets]);
  const googleWallet = useMemo(
    () =>
      enokiWallets.find((w) => {
        if (isGoogleWallet(w)) return true;
        const name = String((w as { name?: string }).name ?? "").toLowerCase();
        const id = String((w as { id?: string }).id ?? "").toLowerCase();
        return name.includes("google") || id.includes("google");
      }),
    [enokiWallets],
  );
  const lookupOwner = currentAccount?.address || "";
  const connectedAddress = currentAccount?.address ?? "";

  const credentialsQuery = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: lookupOwner || "0x0",
      options: { showContent: true, showType: true },
    },
    { enabled: !!lookupOwner },
  );

  const rows = useMemo<CredentialRow[]>(() => {
    return (credentialsQuery.data?.data ?? [])
      .filter((item) => {
        const objectType = String(item.data?.type ?? "");
        return objectType.endsWith("::credforge::Credential");
      })
      .map((item) => {
      const content = item.data?.content as
        | { fields?: Record<string, unknown> }
        | undefined;
      const fields = content?.fields ?? {};

      return {
        objectId: item.data?.objectId ?? "",
        recipient: String(fields.recipient ?? ""),
        issuer: String(fields.issuer ?? ""),
        credentialType: decodeMaybeBytes(fields.credential_type),
        metadataHash: decodeMaybeBytes(fields.metadata_hash),
        issuedAt: String(fields.issued_at ?? ""),
        revoked: Boolean(fields.revoked ?? false),
      };
    });
  }, [credentialsQuery.data?.data]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(FULL_NAME_STORAGE_KEY) || "";
      if (saved) {
        setFullName(saved);
        setIsNameLocked(true);
        setFullNameSaved("Full name saved.");
      }
    } catch {
      // Ignore localStorage read issues.
    }
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PROFILE_IMAGE_STORAGE_KEY) || "";
      if (saved) setProfileImage(saved);
    } catch {
      // Ignore localStorage read issues.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadImages() {
      const missing = rows.filter(
        (row) => row.metadataHash && !imageByObjectId[row.objectId],
      );
      if (missing.length === 0) return;

      const entries = await Promise.all(
        missing.map(async (row) => {
          const imageUrl = await resolveCredentialImage(row.metadataHash);
          return [row.objectId, imageUrl] as const;
        }),
      );

      if (cancelled) return;
      setImageByObjectId((prev) => {
        const next = { ...prev };
        for (const [objectId, imageUrl] of entries) {
          next[objectId] = imageUrl;
        }
        return next;
      });
    }

    loadImages();
    return () => {
      cancelled = true;
    };
  }, [rows, imageByObjectId]);

  function saveFullName() {
    const value = fullName.trim();
    if (!value || value.length < 3) {
      setStatus("Please provide your full name (at least 3 characters).");
      return;
    }
    try {
      window.localStorage.setItem(FULL_NAME_STORAGE_KEY, value);
      setFullName(value);
      setFullNameSaved("Full name saved.");
      setIsNameLocked(true);
      setStatus("Profile ready. Issuers can now mint credentials to this wallet.");
    } catch {
      setFullNameSaved("Unable to persist full name in browser storage.");
    }
  }

  function onProfileImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileImageMessage("Please select an image file.");
      return;
    }
    if (file.size > 2_000_000) {
      setProfileImageMessage("Image too large. Use a file under 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) return;
      setProfileImage(result);
      setProfileImageMessage("Profile photo updated.");
      try {
        window.localStorage.setItem(PROFILE_IMAGE_STORAGE_KEY, result);
      } catch {
        setProfileImageMessage("Profile photo set, but could not be saved.");
      }
    };
    reader.readAsDataURL(file);
  }

  function clearProfileImage() {
    setProfileImage("");
    setProfileImageMessage("Profile photo cleared.");
    try {
      window.localStorage.removeItem(PROFILE_IMAGE_STORAGE_KEY);
    } catch {
      // Ignore localStorage failures.
    }
  }

  async function copyWalletAddress() {
    if (!connectedAddress) return;
    try {
      await navigator.clipboard.writeText(connectedAddress);
      setCopyMessage("Wallet address copied.");
    } catch {
      setCopyMessage("Copy failed. Please copy manually.");
    }
  }

  async function signIn() {
    setSignInAttempted(true);
    const wallet = googleWallet;

    if (!enokiReady) {
      setStatus(enokiError ?? "Google sign-in is still initializing. Try again.");
      return;
    }

    if (!wallet) {
      setStatus("Google provider is not available. Check Enoki + OAuth config.");
      return;
    }

    try {
      setStatus("Signing in...");
      await connectWallet({ wallet });
      setStatus("Signed in successfully.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Sign-in failed. Check popup permissions and OAuth config.";
      setStatus(`Sign-in failed: ${message}`);
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

      const fields = (registry.data?.content as { fields?: Record<string, unknown> })?.fields;
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
      {!isConnected ? (
        <section className="hero authHero">
          <p className="tag">CredForge</p>
          <div className="titleWithLogo">
            <span className="suiLogo" aria-hidden="true">
              <SuiLogoMark />
            </span>
            <h1>Your Credentials Onchain</h1>
          </div>
          <p className="heroSubtitle">
            Sign in with Google to view your Sui credentials and verify trusted issuers.
          </p>
          <p className="authWelcome">
            Welcome to CredForge. Sign in to access your wallet-linked credentials, preview
            your certificates, and verify issuer trust in one simple dashboard.
          </p>

          <div className="heroRow">
            <button type="button" className="googleButton" onClick={signIn} disabled={isConnecting}>
              <span className="googleIcon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12 10.2v3.92h5.45c-.24 1.26-.95 2.33-2.02 3.04l3.27 2.53c1.9-1.75 3-4.32 3-7.39 0-.71-.06-1.4-.18-2.06H12z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 22c2.7 0 4.97-.89 6.63-2.41l-3.27-2.53c-.9.6-2.05.95-3.36.95-2.58 0-4.77-1.74-5.56-4.07H3.06v2.61A10 10 0 0 0 12 22z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M6.44 13.94a6.02 6.02 0 0 1 0-3.88V7.45H3.06a10 10 0 0 0 0 9.1l3.38-2.61z"
                  />
                  <path
                    fill="#4285F4"
                    d="M12 5.99c1.47 0 2.79.5 3.83 1.47l2.87-2.87A9.6 9.6 0 0 0 12 2 10 10 0 0 0 3.06 7.45l3.38 2.61C7.23 7.73 9.42 5.99 12 5.99z"
                  />
                </svg>
              </span>
              <span>{isConnecting ? "Connecting..." : "Continue with Google"}</span>
            </button>
          </div>

          {enokiError ? <p className="hint warning">{enokiError}</p> : null}
          {status ? <p className="hint">{status}</p> : null}
          {signInAttempted && enokiWallets.length === 0 && !enokiError ? (
            <p className="hint warning">
              Google sign-in is not configured yet. Set Enoki API key + Google OAuth and try again.
            </p>
          ) : null}
        </section>
      ) : (
        <>
          <section className="hero">
            <p className="tag">CredForge</p>
            <div className="titleWithLogo">
              <span className="suiLogo" aria-hidden="true">
                <SuiLogoMark />
              </span>
              <h1>Your Credentials Onchain</h1>
            </div>
            <p className="heroSubtitle">
              Connected with Google. Issued credentials will appear in this wallet automatically.
            </p>

            <div className="heroRow">
              <button type="button" className="secondary" onClick={() => disconnectWallet()}>
                Sign Out
              </button>
            </div>

            <div className="metaStrip">
              <span className="pill walletPill">
                <span>Account: {connectedAddress ? shortId(connectedAddress) : "Not connected"}</span>
                <button
                  type="button"
                  className="copyIconButton"
                  onClick={copyWalletAddress}
                  aria-label="Copy wallet address"
                  title="Copy wallet address"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="9" y="3" width="12" height="14" rx="2" />
                    <rect x="3" y="7" width="12" height="14" rx="2" />
                  </svg>
                </button>
              </span>
              <span className="pill">
                Credentials: {rows.length}
              </span>
            </div>
            <div className="profileRow">
              <div className="profilePicBlock">
                <div className="profilePic">
                  {profileImage ? (
                    <img src={profileImage} alt="Profile" />
                  ) : (
                    <span>+</span>
                  )}
                </div>
                {!profileImage ? (
                  <div className="profilePicActions">
                    <label className="profilePicLabel">
                      <input type="file" accept="image/*" onChange={onProfileImageChange} />
                      Upload Photo
                    </label>
                  </div>
                ) : null}
              </div>
              {isNameLocked ? (
                <div className="nameDisplay">{fullName}</div>
              ) : (
                <>
                  <input
                    value={fullName}
                    onChange={(event) => {
                      setFullName(event.target.value);
                      if (fullNameSaved) setFullNameSaved("");
                      if (isNameLocked) setIsNameLocked(false);
                    }}
                    placeholder="Full name for certificate"
                  />
                  <button type="button" className="secondary" onClick={saveFullName}>
                    Save Name
                  </button>
                </>
              )}
            </div>
            {profileImageMessage ? <p className="hint">{profileImageMessage}</p> : null}
            {status ? <p className="hint">{status}</p> : null}
          </section>

          <section className="dashboardGrid">
            <section className="card credentialsCard mainCol">
              <h2>My Credentials</h2>
              {credentialsQuery.isLoading ? <p className="hint">Loading credentials...</p> : null}
              {credentialsQuery.error ? (
                <p className="hint warning">
                  Failed to load credentials. Check the address/network and try again.
                </p>
              ) : null}
              {!credentialsQuery.isLoading && !lookupOwner ? (
                <p className="hint">Sign in first or enter a Sui address.</p>
              ) : null}
              {!credentialsQuery.isLoading && lookupOwner && rows.length === 0 ? (
                <p className="hint emptyState">No credentials found for this address.</p>
              ) : null}

              {rows.length > 0 ? (
                <>
                  <div className="credentialList">
                    {rows.map((row) => (
                      <article key={`mobile-${row.objectId}`} className="credentialItem">
                        <div className="credentialTop">
                          <strong>{row.credentialType || "Credential"}</strong>
                          <span className={clsx("badge", row.revoked ? "badText" : "okText")}>
                            {row.revoked ? "Revoked" : "Active"}
                          </span>
                        </div>
                        <div className="credentialMedia">
                          {row.metadataHash ? (
                            <button
                              type="button"
                              className="imageButton"
                              onClick={() =>
                                setPreviewImage(imageByObjectId[row.objectId] || toIpfsUrl(row.metadataHash))
                              }
                            >
                              <img
                                className="certThumb"
                                src={imageByObjectId[row.objectId] || toIpfsUrl(row.metadataHash)}
                                alt="Certificate"
                              />
                            </button>
                          ) : (
                            <span>-</span>
                          )}
                        </div>
                        <p><strong>ID:</strong> {shortId(row.objectId)}</p>
                        <p><strong>Issuer:</strong> {shortId(row.issuer)}</p>
                        <p><strong>Recipient:</strong> {shortId(row.recipient)}</p>
                        <p><strong>Issued:</strong> {formatIssuedAt(row.issuedAt)}</p>
                      </article>
                    ))}
                  </div>
                  <div className="tableWrap desktopTable">
                    <table>
                      <thead>
                        <tr>
                          <th>Credential ID</th>
                          <th>Type</th>
                          <th>Certificate</th>
                          <th>Issuer</th>
                          <th>Recipient</th>
                          <th>Issued At</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.objectId}>
                            <td title={row.objectId}>{shortId(row.objectId)}</td>
                            <td>{row.credentialType || "-"}</td>
                            <td>
                              {row.metadataHash ? (
                                <button
                                  type="button"
                                  className="imageButton"
                                  onClick={() =>
                                    setPreviewImage(imageByObjectId[row.objectId] || toIpfsUrl(row.metadataHash))
                                  }
                                >
                                  <img
                                    className="certThumb"
                                    src={imageByObjectId[row.objectId] || toIpfsUrl(row.metadataHash)}
                                    alt="Certificate"
                                  />
                                </button>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td title={row.issuer}>{shortId(row.issuer)}</td>
                            <td title={row.recipient}>{shortId(row.recipient)}</td>
                            <td>{formatIssuedAt(row.issuedAt)}</td>
                            <td>
                              <span className={clsx("badge", row.revoked ? "badText" : "okText")}>
                                {row.revoked ? "Revoked" : "Active"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </section>

            <article className="card verifyCard sideCol">
              <h2>Verify Issuer</h2>
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
          {previewImage ? (
            <div className="imageModal" onClick={() => setPreviewImage("")}>
              <div className="imageModalCard" onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className="secondary closeModal"
                  onClick={() => setPreviewImage("")}
                >
                  Close
                </button>
                <img src={previewImage} alt="Credential preview" className="imageModalPreview" />
              </div>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
