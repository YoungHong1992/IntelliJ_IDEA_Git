# Copilot Instructions for IntelliJ IDEA Git Extension

## Project Overview
VS Code extension providing IntelliJ IDEA-style Git operations: file/directory diff against revisions, branches, and tags. TypeScript codebase targeting VS Code API v1.85+.

## Architecture

### Core Components
- **`extension.ts`** - Entry point: registers content provider, tree view, and commands
- **`gitService.ts`** - Git CLI wrapper using `child_process.execFileAsync`; handles all git operations
- **`gitContentProvider.ts`** - `TextDocumentContentProvider` for `idea-git://` scheme URIs
- **`changesTreeProvider.ts`** - Singleton `TreeDataProvider` for Changes sidebar panel
- **`commands/`** - Command handlers (one file per command)

### Data Flow Pattern
1. User triggers command via context menu → `commands/*.ts`
2. Command fetches git data via `gitService.ts` functions
3. For single files: creates `idea-git://` URI → VS Code opens diff view
4. For directories: populates `ChangesTreeProvider` → renders in sidebar panel

### URI Scheme
Custom `idea-git` scheme with query param: `idea-git:///path/to/file?ref=<commit-or-branch>`
- Created via `createGitUri(filePath, ref)` in `gitContentProvider.ts`
- Content resolved by `GitContentProvider.provideTextDocumentContent()`

## Key Patterns

### Git Operations
All git commands use `execFileAsync` (promisified `execFile`) with explicit `cwd`:
```typescript
const { stdout } = await execFileAsync('git', ['command', 'args'], {
    cwd: workingDirectory,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024  // 10MB for large files
});
```

### Singleton Tree Provider
`changesTreeProvider.ts` exports a singleton getter—always use `getChangesTreeProvider()`:
```typescript
import { getChangesTreeProvider } from '../changesTreeProvider';
const provider = getChangesTreeProvider();
await provider.setCompareContext(context);
```

### Command Handler Pattern
Commands in `commands/` folder follow this structure:
1. Get URI from context or active editor
2. Validate file/directory existence and git tracking
3. Show QuickPick for user selection (commits, branches, tags)
4. Either open diff view (files) or populate Changes panel (directories)

## Development Workflow

```bash
# Install dependencies
npm install

# Compile TypeScript (outputs to ./out/)
npm run compile

# Watch mode for development
npm run watch

# Debug: Press F5 in VS Code to launch Extension Development Host
```

## package.json Contribution Points
- **Commands**: `intellij-idea-git.compareWithRevision`, `intellij-idea-git.compareWithBranch`, etc.
- **Views**: `ideaGitChangesView` in custom activity bar container `idea-git-changes`
- **Menus**: Submenu `intellij.idea.git.menu` attached to explorer/editor context menus
- **Colors**: Theme colors `ideaGit.addedFile`, `ideaGit.modifiedFile`, `ideaGit.deletedFile`

## Adding New Commands
1. Create handler in `src/commands/newCommand.ts`
2. Export async function matching signature `(uri?: vscode.Uri) => Promise<void>`
3. Register in `extension.ts` via `vscode.commands.registerCommand()`
4. Add command definition and menu entries in `package.json` under `contributes`

## Cross-Platform Considerations
- Always use `uri.fsPath` for file paths (handles Windows backslashes)
- Normalize paths with `.replace(/\\/g, '/')` when passing to git commands
- Use `path.relative()` for git-relative paths from repo root
