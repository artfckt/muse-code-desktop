# Muse Desktop 0.8.0-beta.2

Windows x64 verification refresh of 0.8.0-beta.1. Application behavior is unchanged.

- Fixed the native-terminal test cleanup race on Windows: teardown now waits for the terminal process to exit before removing its temporary home.
- Recorded the Windows installation and smoke verification completed for the previous beta.1 installer. Those results do not by themselves verify this new beta.2 binary.
- Bumped the package version to produce a distinct installer without replacing the previous release.

The installer remains unsigned. Muse Code CLI is required; authentication and subscription usage stay with the native runtime. Update installation remains manual. Live paid-model behavior is outside this verification scope.
