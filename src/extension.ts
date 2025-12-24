import * as vscode from 'vscode';
import { GitContentProvider, SCHEME, createGitUri } from './gitContentProvider';
import { compareWithRevision } from './commands/compareWithRevision';
import { compareWithBranch } from './commands/compareWithBranch';
import { getChangesTreeProvider, ChangeTreeItem } from './changesTreeProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('JetBrains Git extension is now active!');

    // Register the TextDocumentContentProvider for git content
    const gitContentProvider = new GitContentProvider();
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(SCHEME, gitContentProvider)
    );

    // Register the Changes TreeView
    const changesTreeProvider = getChangesTreeProvider();
    const treeView = vscode.window.createTreeView('jbGitChangesView', {
        treeDataProvider: changesTreeProvider
    });
    changesTreeProvider.setTreeView(treeView);
    context.subscriptions.push(treeView);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('jetbrains-git.compareWithRevision', compareWithRevision)
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('jetbrains-git.compareWithBranch', compareWithBranch)
    );

    // Command to open file diff from the Changes tree view
    context.subscriptions.push(
        vscode.commands.registerCommand('jetbrains-git.openFileDiff', async (item: ChangeTreeItem) => {
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
        vscode.commands.registerCommand('jetbrains-git.clearChanges', () => {
            changesTreeProvider.clear();
        })
    );

    // Command to refresh the Changes view
    context.subscriptions.push(
        vscode.commands.registerCommand('jetbrains-git.refreshChanges', async () => {
            await changesTreeProvider.refresh();
        })
    );
}

export function deactivate() {}
