"use client";

import {
  useConnectWallet,
  useCurrentAccount,
  useCurrentWallet,
  useDisconnectWallet,
  useSignAndExecuteTransaction,
  useSuiClient,
  useSuiClientQuery,
  useWallets,
} from "@mysten/dapp-kit";
import { isEnokiWallet, isGoogleWallet } from "@mysten/enoki";
import { Transaction } from "@mysten/sui/transactions";
import clsx from "clsx";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useEnokiBootstrap } from "@/app/providers";
import { asIssuerList, shortId, toBytes } from "@/lib/codec";
import { CREDENTIAL_TYPE, REGISTRY_ID, TARGETS } from "@/lib/env";

type CredentialRow = {
  objectId: string;
  recipient: string;
  issuer: string;
  credentialType: string;
  metadataHash: string;
  issuedAt: string;
  revoked: boolean;
};

type ParsedQr = {
  registryId: string;
  issuerId: string;
  credentialType: string;
  metadataHash: string;
};

const FULL_NAME_STORAGE_KEY = "credforge_full_name";
const PROFILE_IMAGE_STORAGE_KEY = "credforge_profile_image";

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

function parseQrPayload(raw: string): ParsedQr | null {
  const value = raw.trim();
  if (!value) return null;

  try {
    if (value.startsWith("http://") || value.startsWith("https://")) {
      const url = new URL(value);
      const registryId =
        url.searchParams.get("registryId") ??
        url.searchParams.get("registry") ??
        "";
      const issuerId =
        url.searchParams.get("issuerId") ??
        url.searchParams.get("issuer") ??
        "";
      const credentialType =
        url.searchParams.get("credentialType") ??
        url.searchParams.get("type") ??
        "course";
      const metadataHash =
        url.searchParams.get("metadataHash") ??
        url.searchParams.get("hash") ??
        "";

      if (!registryId || !issuerId || !metadataHash) return null;
      return { registryId, issuerId, credentialType, metadataHash };
    }

    const json = JSON.parse(value) as Record<string, unknown>;
    const registryId =
      String(json.registryId ?? json.registry ?? "").trim();
    const issuerId = String(json.issuerId ?? json.issuer ?? "").trim();
    const credentialType =
      String(json.credentialType ?? json.type ?? "course").trim() || "course";
    const metadataHash =
      String(json.metadataHash ?? json.hash ?? "").trim();

    if (!registryId || !issuerId || !metadataHash) return null;
    return { registryId, issuerId, credentialType, metadataHash };
  } catch {
    return null;
  }
}

function withFullNameMetadata(metadataHash: string, fullName: string): string {
  const name = fullName.trim();
  if (!name) return metadataHash;
  const encoded = encodeURIComponent(name);
  const value = metadataHash.trim();
  if (!value) return value;

  if (value.includes("{{full_name}}")) {
    return value.replaceAll("{{full_name}}", encoded);
  }
  if (value.includes("{full_name}")) {
    return value.replaceAll("{full_name}", encoded);
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const url = new URL(value);
      if (!url.searchParams.get("full_name")) {
        url.searchParams.set("full_name", name);
      }
      return url.toString();
    } catch {
      return value;
    }
  }
  return value;
}

export function UserDashboard() {
  const { ready: enokiReady, error: enokiError } = useEnokiBootstrap();
  const client = useSuiClient();
  const wallets = useWallets();
  const { isConnected, isConnecting } = useCurrentWallet();
  const currentAccount = useCurrentAccount();
  const { mutateAsync: connectWallet } = useConnectWallet();
  const { mutate: disconnectWallet } = useDisconnectWallet();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const [registryId] = useState(REGISTRY_ID);
  const [issuerToCheck, setIssuerToCheck] = useState("");
  const [trustResult, setTrustResult] = useState<null | boolean>(null);
  const [trustMessage, setTrustMessage] = useState("");
  const [status, setStatus] = useState("");
  const [signInAttempted, setSignInAttempted] = useState(false);

  const [scanRunning, setScanRunning] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [imageByObjectId, setImageByObjectId] = useState<Record<string, string>>({});
  const [fullName, setFullName] = useState("");
  const [fullNameSaved, setFullNameSaved] = useState("");
  const [isNameLocked, setIsNameLocked] = useState(false);
  const [previewImage, setPreviewImage] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const [profileImageMessage, setProfileImageMessage] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

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

  function stopScanner() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setScanRunning(false);
  }

  useEffect(() => {
    return () => stopScanner();
  }, []);

  async function startScanner() {
    if (scanRunning) return;

    const Detector = (window as Window & { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;

    if (!Detector) {
      setStatus("QR scanning is not supported in this browser. Use Chrome on mobile/desktop.");
      return;
    }

    try {
      setStatus("Opening camera...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      streamRef.current = stream;
      if (!videoRef.current) return;

      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const detector = new Detector({ formats: ["qr_code"] });
      setScanRunning(true);

      const loop = async () => {
        if (!videoRef.current) return;

        try {
          const codes = await detector.detect(videoRef.current);
          const qrValue = codes.find((c) => typeof c.rawValue === "string")?.rawValue;

          if (qrValue) {
            const parsed = parseQrPayload(qrValue);
            if (!parsed) {
              setStatus("Invalid QR format for minting.");
              stopScanner();
              return;
            }

            await mintFromParsedQr(parsed);
            stopScanner();
            return;
          }
        } catch {
          // Ignore transient detection errors and keep scanning.
        }

        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Camera access failed.";
      setStatus(`Unable to start camera: ${message}`);
      stopScanner();
    }
  }

  async function mintFromParsedQr(parsed: ParsedQr) {
    if (!connectedAddress) {
      setStatus("Connect your account first.");
      return;
    }
    if (!fullName.trim() || fullName.trim().length < 3) {
      setStatus("Enter your full name before minting.");
      return;
    }

    try {
      setStatus("Mint transaction in progress...");
      const metadataHashWithName = withFullNameMetadata(parsed.metadataHash, fullName);

      const tx = new Transaction();
      tx.moveCall({
        target: TARGETS.issueCredential,
        arguments: [
          tx.object(parsed.registryId),
          tx.object(parsed.issuerId),
          tx.pure.address(connectedAddress),
          tx.pure.vector("u8", toBytes(parsed.credentialType || "course")),
          tx.pure.vector("u8", toBytes(metadataHashWithName)),
        ],
      });
      tx.setGasBudget(100_000_000);

      const result = (await signAndExecuteTransaction({ transaction: tx })) as {
        digest?: string;
      };

      setStatus(`Mint submitted. Digest: ${result.digest ?? "submitted"}`);
      credentialsQuery.refetch();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Mint failed.";
      setStatus(`Mint failed: ${message}`);
    }
  }

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
      setStatus("Profile ready. You can mint your credential now.");
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
          <h1>Your Credentials</h1>
          <p className="heroSubtitle">
            Sign in with Google to view your Sui credentials and verify trusted issuers.
          </p>
          <ul className="authList">
            <li className="authPoint">Secure Sui zkLogin with your Google account</li>
            <li className="authPoint">View active and revoked credentials in one place</li>
            <li className="authPoint">Check if an issuer is trusted by your registry</li>
          </ul>

          <div className="heroRow">
            <button type="button" onClick={signIn} disabled={isConnecting}>
              {isConnecting ? "Connecting..." : "Continue with Google"}
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
            <h1>Your Credentials</h1>
            <p className="heroSubtitle">
              Connected with Google. Scan your certification QR and mint to your Sui wallet.
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

            <article className="card scanCard sideCol">
              <div className="scanActions">
                <button type="button" onClick={startScanner} disabled={scanRunning}>
                  Mint
                </button>
              </div>

              {scanRunning ? (
                <video ref={videoRef} className="scannerVideo hiddenScanner" playsInline muted />
              ) : null}
            </article>

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
