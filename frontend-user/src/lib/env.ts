export const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet";

export const PACKAGE_ID =
  process.env.NEXT_PUBLIC_PACKAGE_ID ??
  "0xc19171760aff5329b45e7315682fb1c3b12e588938494d686397731b261adc2d";

export const REGISTRY_ID =
  process.env.NEXT_PUBLIC_REGISTRY_ID ??
  "0x7263d6fa45f3073f0f5332e1ce1ec1d1181c19c571b1fd768eeea222dbc35f19";
export const ENOKI_API_KEY = process.env.NEXT_PUBLIC_ENOKI_API_KEY ?? "";
export const ENOKI_GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_ENOKI_GOOGLE_CLIENT_ID ?? "";
export const ENOKI_FACEBOOK_CLIENT_ID =
  process.env.NEXT_PUBLIC_ENOKI_FACEBOOK_CLIENT_ID ?? "";
export const ENOKI_TWITCH_CLIENT_ID =
  process.env.NEXT_PUBLIC_ENOKI_TWITCH_CLIENT_ID ?? "";
export const ENOKI_REDIRECT_URL =
  process.env.NEXT_PUBLIC_ENOKI_REDIRECT_URL ?? "";

export const MODULE = `${PACKAGE_ID}::credforge`;
export const TARGETS = {
  issueCredential: `${MODULE}::issue_credential`,
} as const;

export const CREDENTIAL_TYPE = `${PACKAGE_ID}::credforge::Credential`;
