export const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet";

export const PACKAGE_ID =
  process.env.NEXT_PUBLIC_PACKAGE_ID ??
  "0xc19171760aff5329b45e7315682fb1c3b12e588938494d686397731b261adc2d";

export const REGISTRY_ID =
  process.env.NEXT_PUBLIC_REGISTRY_ID ??
  "0x7263d6fa45f3073f0f5332e1ce1ec1d1181c19c571b1fd768eeea222dbc35f19";

export const MODULE = `${PACKAGE_ID}::credforge`;

export const TARGETS = {
  registerIssuer: `${MODULE}::register_issuer`,
  addIssuerToRegistry: `${MODULE}::add_issuer_to_registry`,
  issueCredential: `${MODULE}::issue_credential`,
  batchIssue: `${MODULE}::batch_issue`,
  revokeCredential: `${MODULE}::revoke_credential`,
} as const;
