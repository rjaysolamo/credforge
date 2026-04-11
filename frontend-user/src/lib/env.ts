export const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet";

export const PACKAGE_ID =
  process.env.NEXT_PUBLIC_PACKAGE_ID ??
  "0x1ec5860e8e833eed86696b261504d1d60ab5d470f393e6fa7b19ffcbed4fb59a";

export const REGISTRY_ID =
  process.env.NEXT_PUBLIC_REGISTRY_ID ??
  "0x9eb6db567df86b0acb0a791f5f3ea9dbdb5aac197e036ee2ec21e4ae4dd09fe1";
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
