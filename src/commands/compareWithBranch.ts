import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getBranchesAndTags, isFileTracked, getRepoRoot, RefInfo } from '../gitService';
import { createGitUri } from '../gitContentProvider';
import { getChangesTreeProvider, CompareContext } from '../changesTreeProvider';

/**
 * Command handler for "Compare with Branch or Tag..."
 * Shows a QuickPick with all branches and tags and opens a diff view
 */
export async function compareWithBranch(uri?: vscode.Uri): Promise<void> {
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

    // For files, check if tracked
    if (!isDirectory) {
        const tracked = await isFileTracked(filePath);
        if (!tracked) {
            vscode.window.showWarningMessage(`"${fileName}" is not tracked by Git`);
            return;
        }
    }

    // Show loading indicator while fetching refs
    const refs = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Loading branches and tags...',
            cancellable: false
        },
        async () => {
            return await getBranchesAndTags(filePath);
        }
    );

    if (refs.length === 0) {
        vscode.window.showInformationMessage('No branches or tags found');
        return;
    }

    // Create QuickPick items, grouped by type
    const getIcon = (type: RefInfo['type']) => {
        switch (type) {
            case 'branch': return '$(git-branch)';
            case 'remote': return '$(cloud)';
            case 'tag': return '$(tag)';
        }
    };

    const getLabel = (type: RefInfo['type']) => {
        switch (type) {
            case 'branch': return 'Local Branch';
            case 'remote': return 'Remote Branch';
            case 'tag': return 'Tag';
        }
    };

    const items: (vscode.QuickPickItem & { ref?: RefInfo })[] = [];
    
    // Group refs by type
    const branches = refs.filter(r => r.type === 'branch');
    const remotes = refs.filter(r => r.type === 'remote');
    const tags = refs.filter(r => r.type === 'tag');

    if (branches.length > 0) {
        items.push({ label: 'Local Branches', kind: vscode.QuickPickItemKind.Separator });
        branches.forEach(ref => {
            items.push({
                label: `${getIcon(ref.type)} ${ref.name}`,
                description: getLabel(ref.type),
                ref
            });
        });
    }

    if (remotes.length > 0) {
        items.push({ label: 'Remote Branches', kind: vscode.QuickPickItemKind.Separator });
        remotes.forEach(ref => {
            items.push({
                label: `${getIcon(ref.type)} ${ref.name}`,
                description: getLabel(ref.type),
                ref
            });
        });
    }

    if (tags.length > 0) {
        items.push({ label: 'Tags', kind: vscode.QuickPickItemKind.Separator });
        tags.forEach(ref => {
            items.push({
                label: `${getIcon(ref.type)} ${ref.name}`,
                description: getLabel(ref.type),
                ref
            });
        });
    }

    // Show QuickPick
    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a branch or tag to compare with',
        matchOnDescription: true
    });

    if (!selected || !selected.ref) {
        return; // User cancelled or selected a separator
    }

    const ref = selected.ref;

    if (isDirectory) {
        // Directory comparison - show in Changes panel
        const changesTreeProvider = getChangesTreeProvider();
        
        const context: CompareContext = {
            basePath: filePath,
            ref: ref.name,
            refLabel: ref.name,
            repoRoot: repoRoot,
            isDirectory: true
        };

        await changesTreeProvider.setCompareContext(context);

        // Show the Changes panel
        await vscode.commands.executeCommand('ideaGitChangesView.focus');
        
        vscode.window.showInformationMessage(
            `Comparing "${fileName}" with ${ref.name}. See Changes panel.`
        );
    } else {
        // File comparison - open diff directly
        const leftUri = createGitUri(filePath, ref.name);
        const rightUri = fileUri;
        const title = `${fileName} (${ref.name} ↔ Current)`;
        
        try {
            await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to compare: ${error.message}`);
        }
    }
}
