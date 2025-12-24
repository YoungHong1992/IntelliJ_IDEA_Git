import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getFileHistory, getDirectoryHistory, isFileTracked, getRepoRoot, CommitInfo } from '../gitService';
import { createGitUri } from '../gitContentProvider';
import { getChangesTreeProvider, CompareContext } from '../changesTreeProvider';

/**
 * Command handler for "Compare with Revision..."
 * Shows a QuickPick with the file's commit history and opens a diff view
 */
export async function compareWithRevision(uri?: vscode.Uri): Promise<void> {
    // Get the file URI from context or active editor
    const fileUri = uri ?? vscode.window.activeTextEditor?.document.uri;
    
    if (!fileUri || fileUri.scheme !== 'file') {
        vscode.window.showErrorMessage('Please select a file or folder to compare');
        return;
    }

    const filePath = fileUri.fsPath;
    const fileName = path.basename(filePath);

    // Check if it's a directory
    let isDirectory = false;
    try {
        const stats = fs.statSync(filePath);
        isDirectory = stats.isDirectory();
    } catch (error) {
        vscode.window.showErrorMessage(`Cannot access "${fileName}"`);
        return;
    }

    // Get repo root
    let repoRoot: string;
    try {
        repoRoot = await getRepoRoot(filePath);
    } catch (error) {
        vscode.window.showErrorMessage('Not a Git repository');
        return;
    }

    // Show loading indicator while fetching history
    const commits = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Loading Git history...',
            cancellable: false
        },
        async () => {
            if (isDirectory) {
                return await getDirectoryHistory(filePath);
            } else {
                // Check if file is tracked
                const tracked = await isFileTracked(filePath);
                if (!tracked) {
                    return [];
                }
                return await getFileHistory(filePath);
            }
        }
    );

    if (commits.length === 0) {
        if (isDirectory) {
            vscode.window.showInformationMessage(`No commit history found for "${fileName}"`);
        } else {
            vscode.window.showWarningMessage(`"${fileName}" is not tracked by Git or has no history`);
        }
        return;
    }

    // Create QuickPick items
    const items: vscode.QuickPickItem[] = commits.map((commit: CommitInfo) => ({
        label: `$(git-commit) ${commit.shortHash}`,
        description: commit.message,
        detail: `${commit.author} • ${commit.date}`,
        commit // Store commit info for later use
    } as vscode.QuickPickItem & { commit: CommitInfo }));

    // Show QuickPick
    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a revision to compare with',
        matchOnDescription: true,
        matchOnDetail: true
    }) as (vscode.QuickPickItem & { commit: CommitInfo }) | undefined;

    if (!selected) {
        return; // User cancelled
    }

    const commit = selected.commit;

    if (isDirectory) {
        // Directory comparison - show in Changes panel
        const changesTreeProvider = getChangesTreeProvider();
        
        const context: CompareContext = {
            basePath: filePath,
            ref: commit.hash,
            refLabel: commit.shortHash,
            repoRoot: repoRoot,
            isDirectory: true
        };

        await changesTreeProvider.setCompareContext(context);

        // Show the Changes panel
        await vscode.commands.executeCommand('jbGitChangesView.focus');
        
        vscode.window.showInformationMessage(
            `Comparing "${fileName}" with revision ${commit.shortHash}. See Changes panel.`
        );
    } else {
        // File comparison - open diff directly
        const leftUri = createGitUri(filePath, commit.hash);
        const rightUri = fileUri;
        const title = `${fileName} (${commit.shortHash} ↔ Current)`;
        await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
    }
}
