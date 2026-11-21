# Agent entry point

For contributor setup, local-only inputs, test commands, and handover requests, read [CONTRIBUTING.md](CONTRIBUTING.md). Start changes from the latest `main`; inspect and preserve existing worktree changes.

For source publication or attribution changes, read [existing permissions](THIRD-PARTY-NOTICES.md). Source visibility retains existing rights; keep separately downloaded references, credentials, saves, and generated builds outside Git.

## Navigation work

For navigation changes, field failures, full-map reconstruction, or progress questions, first read [the persistent project state](docs/OFFLINE-NAVIGATION-STATE.md). It holds the user's objective, constraints, current failure, evidence and next work. Update that file when findings or acceptance change, so another turn can resume without chat history.

For development and release operations, also follow [the maintenance guide](docs/DEVELOPMENT.md). Keep offline evidence, mocked integration and actual game acceptance separate.

For Nexus updates, read [the release rules](release/README.md). Build and verify both flavors locally; upload Release only when authorized. Development builds remain local. Treat old upload records and machine-specific paths as historical context, and check the latest state before acting. Game installs, saves, the manager, and other mods are read-only unless the user authorizes the operation.
