export const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet";

export const PACKAGE_ID =
  process.env.NEXT_PUBLIC_PACKAGE_ID ??
  "0x2ac10462cd4540eb887cc2bdcfac10c66cff082efb6b7ba731798921827fa5c9";

export const REGISTRY_ID =
  process.env.NEXT_PUBLIC_REGISTRY_ID ??
  "0x156587b6931f8378ecb51b23e3e4070cab051b83b6cf282d51cfa605bfc359f4";

export const MODULE = `${PACKAGE_ID}::credforge`;

export const TARGETS = {
  registerIssuer: `${MODULE}::register_issuer`,
  addIssuerToRegistry: `${MODULE}::add_issuer_to_registry`,
  issueCredential: `${MODULE}::issue_credential`,
  batchIssue: `${MODULE}::batch_issue`,
  revokeCredential: `${MODULE}::revoke_credential`,
} as const;
