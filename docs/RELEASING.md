# Release Guide

How to create stable and beta releases for Omniscribe.

## How It Works

The CI workflow detects the channel from the version suffix and passes it explicitly to electron-builder via `-c.publish.channel=<channel>` (required for GitHub provider — auto-detection doesn't work):

- `0.5.0` (no suffix) -> `-c.publish.channel=latest` -> generates `latest.yml` -> picked up by **stable** channel users
- `0.5.0-beta.1` (`-beta` suffix) -> `-c.publish.channel=beta` -> generates `beta.yml` -> picked up by **beta** channel users

Users switch channels at runtime in **Settings > General > Updates**.

## Stable Release

1. **Create a GitHub Release** from the release branch (e.g. `v0.5.0`):
   - Tag: `v0.5.0`
   - Target: `v0.5.0` branch
   - **Not** marked as pre-release

2. CI will:
   - Bump all `package.json` versions to `0.5.0`
   - Build for Windows, macOS, Linux
   - Generate `latest.yml` / `latest-mac.yml` / `latest-linux.yml`
   - Upload artifacts to the GitHub Release
   - Sync version to `master` branch

## Beta Release

1. **Create a GitHub Release** from the release branch:
   - Tag: `v0.5.0-beta.1`
   - Target: `v0.5.0` branch
   - **Mark as pre-release** (checkbox in GitHub UI)

2. CI will:
   - Bump all `package.json` versions to `0.5.0-beta.1`
   - Build for Windows, macOS, Linux
   - Generate `beta.yml` / `beta-mac.yml` / `beta-linux.yml`
   - Upload artifacts to the GitHub Release
   - **Skip** version sync to `master` (beta versions don't pollute master)

3. Subsequent betas: increment the suffix (`v0.5.0-beta.2`, `v0.5.0-beta.3`, etc.)

## Version Bumping

The `scripts/bump-version.sh` script handles version changes across all packages:

```bash
# Explicit version (stable)
./scripts/bump-version.sh 0.5.0

# Explicit version (beta)
./scripts/bump-version.sh 0.5.0-beta.1

# Auto-increment (strips pre-release suffix first)
./scripts/bump-version.sh patch   # 0.5.0-beta.1 -> 0.5.1
./scripts/bump-version.sh minor   # 0.5.0-beta.1 -> 0.6.0
./scripts/bump-version.sh major   # 0.5.0-beta.1 -> 1.0.0
```

## Typical Workflow

```text
master (stable)
  |
  +-- v0.5.0 (release branch)
        |
        +-- Tag: v0.5.0-beta.1   (pre-release)  -> beta.yml
        +-- Tag: v0.5.0-beta.2   (pre-release)  -> beta.yml
        +-- Tag: v0.5.0           (release)      -> latest.yml -> syncs to master
```

1. Branch off `master` for the release (`v0.5.0`)
2. Push beta releases as needed for testing
3. When stable, tag the final release (no `-beta` suffix)
4. CI syncs the version back to `master`

## Update Channels (User-Facing)

| Channel  | Receives            | YML file    | `allowPrerelease` |
|----------|---------------------|-------------|--------------------|
| Stable   | `latest.yml` only   | `latest.yml`| `false`            |
| Beta     | `beta.yml` updates  | `beta.yml`  | `true`             |

- `allowDowngrade` is `true` on both channels so switching beta->stable works
- Channel preference is persisted in electron-store at `preferences.updateChannel`

## Edge Cases

- **No beta release exists yet**: Users on beta channel see "No beta release is currently available" (404 on `beta.yml` is caught)
- **Switching channels mid-download**: Channel buttons are disabled while downloading
- **Beta -> stable downgrade**: UI shows "Stable version X.Y.Z available (current: A.B.C)" with clear downgrade messaging
- **Multiple windows (macOS)**: Channel changes broadcast to all open windows via `BrowserWindow.getAllWindows()`

## Quick Reference

| Action | Command / Step |
|--------|---------------|
| Create beta release | GitHub Release with tag `v0.5.0-beta.1`, check "pre-release" |
| Create stable release | GitHub Release with tag `v0.5.0`, leave "pre-release" unchecked |
| Bump version locally | `./scripts/bump-version.sh <version>` |
| Build shared package | `pnpm build:packages` |
| Full build | `pnpm build` |
| Package desktop app | `pnpm --filter @omniscribe/desktop package` |
