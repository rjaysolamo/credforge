module credforge::credforge;

use sui::event;

public struct Issuer has key, store {
    id: UID,
    name: vector<u8>,
    admin: address,
}

public struct Credential has key {
    id: UID,
    recipient: address,
    issuer: address,
    credential_type: vector<u8>,
    metadata_hash: vector<u8>,
    issued_at: u64,
    revoked: bool,
}

public struct Registry has key {
    id: UID,
    admin: address,
    issuers: vector<address>,
}

public struct CredentialIssued has copy, drop {
    credential_id: ID,
    recipient: address,
}

public struct CredentialRevoked has copy, drop {
    credential_id: ID,
}

const E_NOT_REGISTRY_ADMIN: u64 = 0;
const E_ISSUER_ALREADY_WHITELISTED: u64 = 1;
const E_NOT_ISSUER_ADMIN: u64 = 2;
const E_BATCH_LENGTH_MISMATCH: u64 = 3;
const E_ISSUER_MISMATCH: u64 = 4;
const E_ISSUER_NOT_TRUSTED: u64 = 5;

public fun create_registry(ctx: &mut TxContext) {
    let registry = Registry {
        id: object::new(ctx),
        admin: tx_context::sender(ctx),
        issuers: vector[],
    };

    transfer::share_object(registry);
}

public fun register_issuer(
    name: vector<u8>,
    ctx: &mut TxContext,
) {
    let issuer = Issuer {
        id: object::new(ctx),
        name,
        admin: tx_context::sender(ctx),
    };

    transfer::share_object(issuer);
}

public fun add_issuer_to_registry(
    registry: &mut Registry,
    issuer_addr: address,
    ctx: &TxContext,
) {
    assert!(tx_context::sender(ctx) == registry.admin, E_NOT_REGISTRY_ADMIN);
    assert!(
        !vector::contains(&registry.issuers, &issuer_addr),
        E_ISSUER_ALREADY_WHITELISTED
    );

    vector::push_back(&mut registry.issuers, issuer_addr);
}

/// ----------------------
/// ISSUE (SOULBOUND)
/// ----------------------

public fun issue_credential(
    registry: &Registry,
    issuer: &Issuer,
    recipient: address,
    credential_type: vector<u8>,
    metadata_hash: vector<u8>,
    ctx: &mut TxContext,
) {
    assert!(tx_context::sender(ctx) == issuer.admin, E_NOT_ISSUER_ADMIN);
    assert!(is_trusted(registry, issuer.admin), E_ISSUER_NOT_TRUSTED);

    let credential = Credential {
        id: object::new(ctx),
        recipient,
        issuer: issuer.admin,
        credential_type,
        metadata_hash,
        issued_at: tx_context::epoch_timestamp_ms(ctx),
        revoked: false,
    };

    let credential_id = object::id(&credential);

    event::emit(CredentialIssued {
        credential_id,
        recipient,
    });

    // Issue as wallet-owned object to the recipient.
    // `Credential` has `key` (without `store`), so recipients cannot publicly transfer it.
    transfer::transfer(credential, recipient);
}


public fun batch_issue(
    registry: &Registry,
    issuer: &Issuer,
    recipients: vector<address>,
    credential_types: vector<vector<u8>>,
    metadata_hashes: vector<vector<u8>>,
    ctx: &mut TxContext,
) {
    assert!(tx_context::sender(ctx) == issuer.admin, E_NOT_ISSUER_ADMIN);
    assert!(is_trusted(registry, issuer.admin), E_ISSUER_NOT_TRUSTED);
    assert!(
        vector::length(&recipients) == vector::length(&metadata_hashes),
        E_BATCH_LENGTH_MISMATCH
    );
    assert!(
        vector::length(&recipients) == vector::length(&credential_types),
        E_BATCH_LENGTH_MISMATCH
    );

    let mut recipients = recipients;
    let mut credential_types = credential_types;
    let mut metadata_hashes = metadata_hashes;
    let issued_at = tx_context::epoch_timestamp_ms(ctx);

    while (!vector::is_empty(&recipients)) {
        let recipient = vector::pop_back(&mut recipients);
        let credential_type = vector::pop_back(&mut credential_types);
        let metadata_hash = vector::pop_back(&mut metadata_hashes);

        let credential = Credential {
            id: object::new(ctx),
            recipient,
            issuer: issuer.admin,
            credential_type,
            metadata_hash,
            issued_at,
            revoked: false,
        };

        let credential_id = object::id(&credential);

        event::emit(CredentialIssued {
            credential_id,
            recipient,
        });

        // Same SBT semantics for batch minting: owned by recipient, non-publicly transferable.
        transfer::transfer(credential, recipient);
    };
}



public fun revoke_credential(
    credential: &mut Credential,
    issuer: &Issuer,
    ctx: &TxContext,
) {
    assert!(tx_context::sender(ctx) == issuer.admin, E_NOT_ISSUER_ADMIN);
    assert!(credential.issuer == issuer.admin, E_ISSUER_MISMATCH);

    credential.revoked = true;

    event::emit(CredentialRevoked {
        credential_id: object::id(credential),
    });
}


public fun is_valid_owner(
    credential: &Credential,
    addr: address,
): bool {
    credential.recipient == addr
}

public fun is_trusted(
    registry: &Registry,
    issuer: address,
): bool {
    vector::contains(&registry.issuers, &issuer)
}
