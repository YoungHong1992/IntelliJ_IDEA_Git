# Changelog

## [0.3.0] - 2026-02-10

### Added

- **Rebase onto** — Rebase current branch onto any branch or tag
  - QuickPick UI for selecting target reference
  - Working tree cleanliness check
  - Detached HEAD detection
  - Conflict detection with file-opening support
  - Rebase continue/abort options

### Fixed

- Commit message parsing now uses NUL separator (`%x00`) instead of `|`, preventing corruption when messages contain pipe characters
- Windows path normalization for `getRepoRoot()` — `git rev-parse --show-toplevel` returns POSIX paths on Windows which caused `path.relative()` to produce wrong results
- `isRebaseInProgress` now uses `import fs` instead of `require('fs')` and handles absolute paths from `git rev-parse --git-path`
- `rebaseContinue` now sets `GIT_EDITOR=true` to prevent the extension from hanging when git opens an interactive editor
- `rebaseAbort` now returns a result object with proper error handling instead of throwing uncaught exceptions
- `openFileDiff` now correctly handles Added (`A`) and Deleted (`D`) files instead of crashing
- Fixed potential double-encoding in `createGitUri` — removed redundant `encodeURIComponent` since `Uri.with()` handles encoding internally
- Single-file comparison now detects actual git status instead of hardcoding `'M'` (Modified)
- `extension.ts` now uses `import * as path` instead of runtime `require('path')`

### Changed

- `activationEvents` changed from `["*"]` to `[]` — extension now activates on-demand instead of at startup
- Unified QuickPick grouping order across all commands: Local Branches → Remote Branches → Tags
- Consistent empty-string handling in `getConflictFiles`

## [0.2.1] - 2025-12-20

### Changed

- Updated publisher name and added copilot instructions

## [0.2.0] - 2025-12-19

### Added

- Compare with Revision (file and directory)
- Compare with Branch or Tag (file and directory)
- Changes tree view panel with hierarchical file display
- Custom theme colors for added/modified/deleted files
