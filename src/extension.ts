import * as vscode from 'vscode';
import * as path from 'path';
import { GitContentProvider, SCHEME, createGitUri } from './gitContentProvider';
import { compareWithRevision } from './commands/compareWithRevision';
import { compareWithBranch } from './commands/compareWithBranch';
import { rebaseOnto } from './commands/rebaseOnto';
import { getChangesTreeProvider, ChangeTreeItem } from './changesTreeProvider';

export function activate(context: vscode.ExtensionContext) {
    // Register the TextDocumentContentProvider for git content
    const gitContentProvider = new GitContentProvider();
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(SCHEME, gitContentProvider)
    );

    // Register the Changes TreeView
    const changesTreeProvider = getChangesTreeProvider();
    const treeView = vscode.window.createTreeView('ideaGitChangesView', {
        treeDataProvider: changesTreeProvider
    });
    context.subscriptions.push(treeView);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('intellij-idea-git.compareWithRevision', compareWithRevision)
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('intellij-idea-git.compareWithBranch', compareWithBranch)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('intellij-idea-git.rebaseOnto', rebaseOnto)
    );

    // Command to open file diff from the Changes tree view
    context.subscriptions.push(
        vscode.commands.registerCommand('intellij-idea-git.openFileDiff', async (item: ChangeTreeItem) => {
            if (!item.fileInfo || !item.repoRoot || !item.ref) {
                return;
            }

            const filePath = path.join(item.repoRoot, item.fileInfo.path);
            const fileName = path.basename(filePath);
            const title = `${fileName} (${item.ref} ↔ Current)`;

            try {
                const status = item.fileInfo.status;

                if (status === 'D') {
                    // Deleted file: show old version as read-only (no current file to diff against)
                    const leftUri = createGitUri(filePath, item.ref);
                    // Use an empty untitled URI for the right side
                    const emptyUri = vscode.Uri.parse(`${SCHEME}:///dev/null?ref=__empty__`);
                    await vscode.commands.executeCommand('vscode.diff', leftUri, emptyUri, `${fileName} (Deleted)`);
                } else if (status === 'A') {
                    // Added file: no old version exists, show empty on the left
                    const fileUri = vscode.Uri.file(filePath);
                    const emptyUri = vscode.Uri.parse(`${SCHEME}:///dev/null?ref=__empty__`);
                    await vscode.commands.executeCommand('vscode.diff', emptyUri, fileUri, `${fileName} (Added)`);
                } else {
                    // Modified, Renamed, Copied: normal diff
                    const fileUri = vscode.Uri.file(filePath);
                    const leftUri = createGitUri(filePath, item.ref);
                    await vscode.commands.executeCommand('vscode.diff', leftUri, fileUri, title);
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to open diff: ${error.message}`);
            }
        })
    );

    // Command to clear the Changes view
    context.subscriptions.push(
        vscode.commands.registerCommand('intellij-idea-git.clearChanges', () => {
            changesTreeProvider.clear();
        })
    );

    // Command to refresh the Changes view
    context.subscriptions.push(
        vscode.commands.registerCommand('intellij-idea-git.refreshChanges', async () => {
            await changesTreeProvider.refresh();
        })
    );
}

export function deactivate() {}
