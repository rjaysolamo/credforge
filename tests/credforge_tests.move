#[test_only]
module credforge::credforge_tests;

use credforge::credforge;
use credforge::credforge::Credential;
use sui::test_scenario;

const ADMIN: address = @0xA11CE;
const RECIPIENT: address = @0x0919628afc8c1b899147ffee9ac126dedb64211b909e07028e1b0ba24d77d802;

#[test]
fun test_issue_credential_to_recipient_wallet() {
    let mut scenario = test_scenario::begin(ADMIN);

    {
        let issuer = credforge::new_issuer_for_testing(b"CredForge Issuer", ADMIN, scenario.ctx());
        let mut registry = credforge::new_registry_for_testing(scenario.ctx());
        credforge::add_issuer_to_registry(&mut registry, ADMIN, scenario.ctx());

        credforge::issue_credential(
            &registry,
            &issuer,
            RECIPIENT,
            b"course",
            b"0xmetadatahash",
            scenario.ctx(),
        );

        credforge::destroy_registry_for_testing(registry);
        credforge::destroy_issuer_for_testing(issuer);
    };

    scenario.next_tx(RECIPIENT);
    {
        assert!(scenario.has_most_recent_for_sender<Credential>());
        let credential = scenario.take_from_sender<Credential>();
        scenario.return_to_sender(credential);
    };

    scenario.end();
}

#[test, expected_failure]
fun test_issue_fails_for_untrusted_issuer() {
    let mut scenario = test_scenario::begin(ADMIN);

    {
        let issuer = credforge::new_issuer_for_testing(b"Untrusted Issuer", ADMIN, scenario.ctx());
        let registry = credforge::new_registry_for_testing(scenario.ctx());

        credforge::issue_credential(
            &registry,
            &issuer,
            RECIPIENT,
            b"event",
            b"0xmetadatahash",
            scenario.ctx(),
        );

        credforge::destroy_registry_for_testing(registry);
        credforge::destroy_issuer_for_testing(issuer);
    };

    scenario.end();
}
