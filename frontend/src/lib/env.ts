export const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet";

export const PACKAGE_ID =
  process.env.NEXT_PUBLIC_PACKAGE_ID ??
  "0x0919628afc8c1b899147ffee9ac126dedb64211b909e07028e1b0ba24d77d802";

export const REGISTRY_ID = process.env.NEXT_PUBLIC_REGISTRY_ID ?? "";

export const MODULE = `${PACKAGE_ID}::credforge`;

export const TARGETS = {
  registerIssuer: `${MODULE}::register_issuer`,
  addIssuerToRegistry: `${MODULE}::add_issuer_to_registry`,
  issueCredential: `${MODULE}::issue_credential`,
  batchIssue: `${MODULE}::batch_issue`,
  revokeCredential: `${MODULE}::revoke_credential`,
} as const;
