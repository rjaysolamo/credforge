export const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet";

export const PACKAGE_ID =
  process.env.NEXT_PUBLIC_PACKAGE_ID ??
  "0x0919628afc8c1b899147ffee9ac126dedb64211b909e07028e1b0ba24d77d802";

export const REGISTRY_ID = process.env.NEXT_PUBLIC_REGISTRY_ID ?? "";
export const ENOKI_API_KEY = process.env.NEXT_PUBLIC_ENOKI_API_KEY ?? "";
export const ENOKI_GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_ENOKI_GOOGLE_CLIENT_ID ?? "";
export const ENOKI_FACEBOOK_CLIENT_ID =
  process.env.NEXT_PUBLIC_ENOKI_FACEBOOK_CLIENT_ID ?? "";
export const ENOKI_TWITCH_CLIENT_ID =
  process.env.NEXT_PUBLIC_ENOKI_TWITCH_CLIENT_ID ?? "";
export const ENOKI_REDIRECT_URL =
  process.env.NEXT_PUBLIC_ENOKI_REDIRECT_URL ?? "";

export const CREDENTIAL_TYPE = `${PACKAGE_ID}::credforge::Credential`;
