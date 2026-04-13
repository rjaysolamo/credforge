"use client";

import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { FormEvent, useMemo, useState } from "react";
import { MODULE, PACKAGE_ID, REGISTRY_ID, TARGETS } from "@/lib/env";
import { shortId, toBytes } from "@/lib/codec";

type TxState = {
  type: "idle" | "loading" | "success" | "error";
  message: string;
};

const initialTxState: TxState = {
  type: "idle",
  message: "",
};

function isHexAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{1,64}$/.test(value.trim());
}

function isZeroObjectId(value: string): boolean {
  return /^0x0+$/.test(value.trim());
}

function toVecArg(value: string): string {
  return `[${toBytes(value).join(",")}]`;
}

function splitCommand(input: string): string[] {
  const matches = input.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return matches.map((token) =>
    token.startsWith('"') || token.startsWith("'") ? token.slice(1, -1) : token,
  );
}

async function ensureObjectType(
  client: ReturnType<typeof useSuiClient>,
  objectId: string,
  expectedSuffix: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const object = await client.getObject({
      id: objectId,
      options: { showType: true },
    });
    const objectType = String(object.data?.type ?? "");
    if (!objectType.endsWith(expectedSuffix)) {
      return {
        ok: false,
        message: `Expected ${expectedSuffix}, got ${objectType || "unknown type"}.`,
      };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Object lookup failed.";
    return { ok: false, message };
  }
}

function asIssuerList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  const maybeContents = (raw as { fields?: { contents?: unknown[] } })?.fields?.contents;
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

function helpText(): string[] {
  return [
    "Commands:",
    "  help",
    "  clear",
    "  show config",
    "  set registry <registry_object_id>",
    "  set issuer <issuer_object_id>",
    '  register "<issuer name>"',
    "  trust add <issuer_address>",
    "  trust check <issuer_address>",
    "  issue <recipient_address> <credential_url> [credential_type]",
  ];
}

export function Dashboard() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const [registryId, setRegistryId] = useState(REGISTRY_ID);
  const [issuerId, setIssuerId] = useState("");
  const [command, setCommand] = useState("help");
  const [logs, setLogs] = useState<string[]>([
    "CredForge Admin CLI mode enabled.",
    "Type 'help' to see available commands.",
  ]);
  const [txState, setTxState] = useState<TxState>(initialTxState);
  const [lastCliCommand, setLastCliCommand] = useState("");
  const [copyState, setCopyState] = useState("");

  const walletLabel = useMemo(() => account?.address ?? "(not connected)", [account?.address]);

  function appendLog(line: string) {
    setLogs((prev) => [...prev.slice(-199), line]);
  }

  async function copyLastCliCommand() {
    if (!lastCliCommand) return;
    try {
      await navigator.clipboard.writeText(lastCliCommand);
      setCopyState("CLI command copied.");
    } catch {
      setCopyState("Copy failed. Select and copy manually.");
    }
  }

  function composeSuiCall(functionName: string, args: string[]): string {
    return [
      "sui client call",
      `--package ${PACKAGE_ID}`,
      "--module credforge",
      `--function ${functionName}`,
      `--args ${args.join(" ")}`,
      "--gas-budget 100000000",
    ].join(" ");
  }

  async function execute(
    label: string,
    build: (tx: Transaction) => void,
    cliCommand: string,
  ): Promise<string> {
    if (!account?.address) {
      throw new Error("Connect wallet first.");
    }

    try {
      setTxState({ type: "loading", message: `${label} in progress...` });
      setLastCliCommand(cliCommand);
      setCopyState("");

      const tx = new Transaction();
      build(tx);
      tx.setGasBudget(100_000_000);

      const result = (await signAndExecuteTransaction({
        transaction: tx,
      })) as { digest?: string };

      const digest = result?.digest ?? "";
      setTxState({
        type: "success",
        message: `${label} sent. Digest: ${digest || "submitted"}`,
      });
      return digest;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transaction failed.";
      setTxState({ type: "error", message: `${label} failed: ${message}` });
      throw new Error(message);
    }
  }

  async function runCommand(raw: string) {
    const input = raw.trim();
    if (!input) return;

    appendLog(`$ ${input}`);
    const parts = splitCommand(input);
    const [cmd = "", sub = "", ...rest] = parts;
    const commandLower = cmd.toLowerCase();
    const subLower = sub.toLowerCase();

    if (commandLower === "help") {
      helpText().forEach(appendLog);
      return;
    }

    if (commandLower === "clear") {
      setLogs([
        "CredForge Admin CLI mode enabled.",
        "Type 'help' to see available commands.",
      ]);
      return;
    }

    if (commandLower === "show" && subLower === "config") {
      appendLog(`module:   ${MODULE}`);
      appendLog(`wallet:   ${walletLabel}`);
      appendLog(`registry: ${registryId || "(unset)"}`);
      appendLog(`issuer:   ${issuerId || "(unset)"}`);
      return;
    }

    if (commandLower === "set" && subLower === "registry") {
      const nextRegistryId = rest[0] ?? "";
      if (!isHexAddress(nextRegistryId) || isZeroObjectId(nextRegistryId)) {
        throw new Error("Invalid registry object id.");
      }
      setRegistryId(nextRegistryId);
      appendLog(`ok: registry set to ${shortId(nextRegistryId)}`);
      return;
    }

    if (commandLower === "set" && subLower === "issuer") {
      const nextIssuerId = rest[0] ?? "";
      if (!isHexAddress(nextIssuerId) || isZeroObjectId(nextIssuerId)) {
        throw new Error("Invalid issuer object id.");
      }
      setIssuerId(nextIssuerId);
      appendLog(`ok: issuer set to ${shortId(nextIssuerId)}`);
      return;
    }

    if (commandLower === "register") {
      const issuerName = [sub, ...rest].join(" ").trim();
      if (!issuerName) throw new Error("Missing issuer name.");

      const cliCommand = composeSuiCall("register_issuer", [
        `"${toVecArg(issuerName)}"`,
      ]);
      const digest = await execute(
        "Register issuer",
        (tx) => {
          tx.moveCall({
            target: TARGETS.registerIssuer,
            arguments: [tx.pure.vector("u8", toBytes(issuerName))],
          });
        },
        cliCommand,
      );

      appendLog(`ok: register issuer submitted ${digest || "(submitted)"}`);
      appendLog(`cli: ${cliCommand}`);
      return;
    }

    if (commandLower === "trust" && subLower === "add") {
      const issuerAddress = rest[0] ?? "";
      if (!isHexAddress(registryId) || isZeroObjectId(registryId)) {
        throw new Error("Set a valid registry object id first.");
      }
      if (!isHexAddress(issuerAddress) || isZeroObjectId(issuerAddress)) {
        throw new Error("Invalid issuer address.");
      }

      const cliCommand = composeSuiCall("add_issuer_to_registry", [registryId, issuerAddress]);
      const digest = await execute(
        "Whitelist issuer",
        (tx) => {
          tx.moveCall({
            target: TARGETS.addIssuerToRegistry,
            arguments: [tx.object(registryId), tx.pure.address(issuerAddress)],
          });
        },
        cliCommand,
      );

      appendLog(`ok: issuer trusted ${shortId(issuerAddress)} (${digest || "submitted"})`);
      appendLog(`cli: ${cliCommand}`);
      return;
    }

    if (commandLower === "trust" && subLower === "check") {
      const trustCheckAddress = rest[0] ?? "";
      if (!isHexAddress(registryId) || isZeroObjectId(registryId)) {
        throw new Error("Set a valid registry object id first.");
      }
      if (!isHexAddress(trustCheckAddress) || isZeroObjectId(trustCheckAddress)) {
        throw new Error("Invalid issuer address.");
      }

      const object = await client.getObject({ id: registryId, options: { showContent: true } });
      const fields = (object.data?.content as { fields?: Record<string, unknown> })?.fields;
      const issuers = asIssuerList(fields?.issuers);
      const trusted = issuers.includes(trustCheckAddress);
      appendLog(trusted ? "ok: trusted issuer" : "ok: not trusted");
      return;
    }

    if (commandLower === "issue") {
      const recipient = sub;
      const metadataHash = rest[0] ?? "";
      const credentialType = rest[1] ?? "SBT_NFT";

      if (!isHexAddress(registryId) || isZeroObjectId(registryId)) {
        throw new Error("Set a valid registry object id first.");
      }
      if (!isHexAddress(issuerId) || isZeroObjectId(issuerId)) {
        throw new Error("Set a valid issuer object id first.");
      }
      if (!isHexAddress(recipient) || isZeroObjectId(recipient)) {
        throw new Error("Invalid recipient address.");
      }
      if (!metadataHash.trim()) {
        throw new Error("Missing credential URL/metadata hash.");
      }

      const registryCheck = await ensureObjectType(client, registryId, "::credforge::Registry");
      if (!registryCheck.ok) {
        throw new Error(`Registry object invalid. ${registryCheck.message ?? ""}`.trim());
      }

      const issuerCheck = await ensureObjectType(client, issuerId, "::credforge::Issuer");
      if (!issuerCheck.ok) {
        throw new Error(`Issuer object invalid. ${issuerCheck.message ?? ""}`.trim());
      }

      const cliCommand = composeSuiCall("issue_credential", [
        registryId,
        issuerId,
        recipient,
        `"${toVecArg(credentialType)}"`,
        `"${toVecArg(metadataHash)}"`,
      ]);

      const digest = await execute(
        "Issue credential",
        (tx) => {
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
        },
        cliCommand,
      );

      appendLog(`ok: issued to ${shortId(recipient)} digest=${digest || "submitted"}`);
      appendLog(`cli: ${cliCommand}`);
      return;
    }

    throw new Error("Unknown command. Type 'help'.");
  }

  async function onRunCommand(event: FormEvent) {
    event.preventDefault();
    try {
      await runCommand(command);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Command failed.";
      appendLog(`error: ${message}`);
      setTxState({ type: "error", message });
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="kicker">CredForge on Sui</p>
        <h1>Credential Registry Admin CLI</h1>
        <p className="heroCopy">
          <code>sui client call</code> commands.
        </p>
        <div className="heroMeta">
          <ConnectButton />
        </div>
      </section>

      <section className="grid cliGrid">
        <article className="card">
          <h2>CLI Config</h2>
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
          <p className="hint">Set once, then run commands in the terminal panel.</p>
        </article>

        <article className="card wide cliCard">
          <h2>Terminal</h2>
          <div className="stepsInline">
            <p><strong>Admin / Issuer Step-by-Step</strong></p>
            <p>Connect your admin wallet using the button at the top.</p>
            <p>Set config once: <code>set registry 0x...</code> and <code>set issuer 0x...</code>.</p>
            <p>If issuer object does not exist yet, run: <code>register &quot;Your Issuer Name&quot;</code></p>
            <p>Whitelist issuer admin address in registry: <code>trust add 0x...</code></p>
            <p>Verify issuer trust before minting: <code>trust check 0x...</code></p>
            <p>Issue credential SBT/NFT: <code>issue 0xRecipient https://.../ipfs/... SBT_NFT</code></p>
            <p>Copy the generated command from the panel above for logs or external CLI reuse.</p>
            <p>Share the digest shown in Status so the user can verify on SuiScan testnet.</p>
            <p><strong>Issuer SBT/NFT Flow (To Issue Users)</strong></p>
            <p>1. Connect the issuer admin wallet (must match issuer object admin).</p>
            <p>2. Confirm registry and issuer IDs are set in CLI config.</p>
            <p>3. Confirm issuer is trusted in registry: <code>trust check 0xIssuerAdminAddress</code>.</p>
            <p>4. Prepare user recipient Sui address + certificate IPFS URL.</p>
            <p>5. Run issuance command: <code>issue 0xUserAddress https://.../ipfs/... SBT_NFT</code>.</p>
            <p>6. After success, copy digest and send tx link to user for proof.</p>
          </div>
          <div className="terminalOutput" role="log" aria-live="polite">
            {logs.map((line, index) => (
              <p key={`${index}-${line}`}>{line}</p>
            ))}
          </div>
          <form onSubmit={onRunCommand} className="cliForm">
            <label>
              Command
              <input
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="issue 0x... https://.../ipfs/... SBT_NFT"
              />
            </label>
            <button type="submit" className="cta">Run Command</button>
          </form>
          <p className="hint cliHint">
            Tip: use quotes for spaces, e.g. <code>register &quot;CredForge Issuer&quot;</code>
          </p>
          <div className="cliQuickActions">
            <button type="button" onClick={() => setCommand("help")}>help</button>
            <button type="button" onClick={() => setCommand("show config")}>show config</button>
            <button
              type="button"
              onClick={() =>
                setCommand(
                  "issue 0x853a550d288b57445646b7380cd084328426c36691d457e14d0f7fe3ffeca327 https://rose-imaginative-lion-87.mypinata.cloud/ipfs/<CID> SBT_NFT",
                )
              }
            >
              issue template
            </button>
            <button type="button" onClick={() => setCommand("clear")}>clear</button>
          </div>
        </article>

        <article className="card wide cliCommandCard">
          <h2>Generated Sui CLI Command</h2>
          <textarea value={lastCliCommand} readOnly className="cliCommandBox" />
          <div className="cliCommandActions">
            <button type="button" onClick={copyLastCliCommand} disabled={!lastCliCommand}>
              Copy CLI Command
            </button>
            {copyState ? <span className="hint">{copyState}</span> : null}
          </div>
        </article>

      </section>

      {txState.message ? (
        <section className={statusClass(txState.type)}>
          <strong>Status:</strong> {txState.message}
        </section>
      ) : null}
    </main>
  );
}
