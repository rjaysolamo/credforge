export const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet";

export const PACKAGE_ID =
  process.env.NEXT_PUBLIC_PACKAGE_ID ??
  "0x8a083dab2646af64d9132f2afa957abb7fe5436885f2587e9315beede4927c24";

export const REGISTRY_ID =
  process.env.NEXT_PUBLIC_REGISTRY_ID ??
  "0x9eb6db567df86b0acb0a791f5f3ea9dbdb5aac197e036ee2ec21e4ae4dd09fe1";

export const MODULE = `${PACKAGE_ID}::credforge`;

export const TARGETS = {
  registerIssuer: `${MODULE}::register_issuer`,
  addIssuerToRegistry: `${MODULE}::add_issuer_to_registry`,
  issueCredential: `${MODULE}::issue_credential`,
  batchIssue: `${MODULE}::batch_issue`,
  revokeCredential: `${MODULE}::revoke_credential`,
} as const;
