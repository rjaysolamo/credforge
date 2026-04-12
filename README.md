# CredForge

CredForge is a Sui-based credential platform for issuing **wallet-owned, non-transferable** credentials (SBT) to users.

It includes:
- A Move smart contract (`sources/credforge.move`) for registry, issuer, and credential logic.
- An **Admin Portal** (`frontend/`) for issuer operations and credential minting.
- A **User Portal** (`frontend-user/`) for social sign-in and viewing owned credentials.

## What It Does

- Registry admins create a registry and whitelist trusted issuer addresses.
- Issuer admins mint credentials directly to recipient wallet addresses.
- Credentials are on-chain objects (`Credential`) with metadata pointers (for example IPFS URLs).
- Users view their credentials in the user portal.

## Repository Structure

- `sources/credforge.move`: Move module and core logic.
- `tests/credforge_tests.move`: Move tests.
- `frontend/`: Admin Next.js app.
- `frontend-user/`: User Next.js app with Enoki social sign-in.
- `Move.toml`: Move package config.

## Current Testnet Deployment

- Package ID: `0xc19171760aff5329b45e7315682fb1c3b12e588938494d686397731b261adc2d`
- Registry ID: `0x7263d6fa45f3073f0f5332e1ce1ec1d1181c19c571b1fd768eeea222dbc35f19`
- Issuer Object ID: `0x716eadcef27e37290ac2ef60bbaf158ed16786ef4df2d4157dc65ecb383f1198`
- Network: `testnet`

## Credential Model (Important)

`Credential` is defined as `has key` (without `store`) and is transferred to recipient addresses with:

- `transfer::transfer(credential, recipient)`

This makes credentials wallet-owned and non-transferable via normal public transfer paths.

## Requirements

- Node.js 18+
- npm
- Sui CLI

## Local Development

### 1) Install dependencies

```bash
cd frontend && npm install
cd ../frontend-user && npm install
```

### 2) Configure environment variables

Admin app:

```bash
cp frontend/.env.example frontend/.env
```

User app:

```bash
cp frontend-user/.env.example frontend-user/.env
```

`frontend-user/.env` OAuth-related variables:
- `NEXT_PUBLIC_ENOKI_API_KEY`
- `NEXT_PUBLIC_ENOKI_GOOGLE_CLIENT_ID`
- `NEXT_PUBLIC_ENOKI_FACEBOOK_CLIENT_ID`
- `NEXT_PUBLIC_ENOKI_REDIRECT_URL` (for local dev: `http://localhost:3000`)

### 3) Run apps

Admin portal:

```bash
cd frontend
npm run dev
```

User portal:

```bash
cd frontend-user
npm run dev
```

## Google OAuth Setup (redirect_uri_mismatch fix)

In Google Cloud Console for your OAuth client:

- Add `http://localhost:3000` to **Authorized JavaScript origins**.
- Add `http://localhost:3000` (and optionally `http://localhost:3000/`) to **Authorized redirect URIs**.

Then restart `frontend-user` dev server.

## Move Commands

Build package:

```bash
sui move build
```

Publish package:

```bash
sui client publish --gas-budget 300000000
```

Create registry:

```bash
sui client call \
  --package <PACKAGE_ID> \
  --module credforge \
  --function create_registry \
  --gas-budget 10000000
```

Register issuer:

```bash
sui client call \
  --package <PACKAGE_ID> \
  --module credforge \
  --function register_issuer \
  --args '[67,114,101,100,70,111,114,103,101,32,73,115,115,117,101,114]' \
  --gas-budget 10000000
```

Whitelist issuer address in registry:

```bash
sui client call \
  --package <PACKAGE_ID> \
  --module credforge \
  --function add_issuer_to_registry \
  --args <REGISTRY_ID> <ISSUER_ADMIN_ADDRESS> \
  --gas-budget 10000000
```

Issue credential:

```bash
sui client call \
  --package <PACKAGE_ID> \
  --module credforge \
  --function issue_credential \
  --args <REGISTRY_ID> <ISSUER_OBJECT_ID> <RECIPIENT_ADDRESS> <TYPE_VEC_U8> <METADATA_VEC_U8> \
  --gas-budget 10000000
```

## Known Limitations

- Current `revoke_credential` signature requires mutable access to a wallet-owned `Credential`, so issuer-side revoke from admin UI is not currently practical without contract/API adjustments.
- `sui move test` may fail in this repo due to duplicate dev address assignment in `Move.toml` (`credforge = 0x0` under both `[addresses]` and `[dev-addresses]`).

## License

No license declared yet.
