import * as vscode from 'vscode';
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

            const filePath = require('path').join(item.repoRoot, item.fileInfo.path);
            const fileUri = vscode.Uri.file(filePath);
            const leftUri = createGitUri(filePath, item.ref);
            
            const fileName = require('path').basename(filePath);
            const title = `${fileName} (${item.ref} ↔ Current)`;

            try {
                await vscode.commands.executeCommand('vscode.diff', leftUri, fileUri, title);
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
