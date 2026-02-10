import * as vscode from 'vscode';
import * as path from 'path';
import { 
    getBranchesAndTags, 
    getRepoRoot, 
    getCurrentBranch,
    isWorkingTreeClean,
    isRebaseInProgress,
    rebase,
    getConflictFiles,
    RefInfo 
} from '../gitService';

/**
 * Command handler for "Rebase onto..."
 * Shows a QuickPick with all branches and tags and performs rebase
 */
export async function rebaseOnto(uri?: vscode.Uri): Promise<void> {
    // Get the file URI from context or active editor
    const fileUri = uri ?? vscode.window.activeTextEditor?.document.uri;
    
    // If no URI, try to get from workspace
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let targetPath: string;
    
    if (fileUri && fileUri.scheme === 'file') {
        targetPath = fileUri.fsPath;
    } else if (workspaceFolders && workspaceFolders.length > 0) {
        targetPath = workspaceFolders[0].uri.fsPath;
    } else {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    // Get repo root
    let repoRoot: string;
    try {
        repoRoot = await getRepoRoot(targetPath);
    } catch (error) {
        vscode.window.showErrorMessage('Not a Git repository');
        return;
    }

    // Check if on a branch (not detached HEAD)
    const currentBranch = await getCurrentBranch(repoRoot);
    if (!currentBranch) {
        vscode.window.showErrorMessage('Cannot rebase: you are in detached HEAD state. Please checkout a branch first.');
        return;
    }

    // Check if rebase is already in progress
    const rebaseInProgress = await isRebaseInProgress(repoRoot);
    if (rebaseInProgress) {
        const action = await vscode.window.showWarningMessage(
            'A rebase is already in progress.',
            'Continue Rebase',
            'Abort Rebase'
        );
        
        if (action === 'Abort Rebase') {
            const { rebaseAbort } = await import('../gitService');
            const abortResult = await rebaseAbort(repoRoot);
            if (abortResult.success) {
                vscode.window.showInformationMessage('Rebase aborted');
            } else {
                vscode.window.showErrorMessage(`Rebase abort failed: ${abortResult.error}`);
            }
        } else if (action === 'Continue Rebase') {
            const { rebaseContinue } = await import('../gitService');
            const result = await rebaseContinue(repoRoot);
            if (result.success) {
                vscode.window.showInformationMessage('Rebase completed successfully');
            } else {
                vscode.window.showErrorMessage(`Rebase continue failed: ${result.error}`);
            }
        }
        return;
    }

    // Check if working tree is clean
    const isClean = await isWorkingTreeClean(repoRoot);
    if (!isClean) {
        vscode.window.showErrorMessage(
            'Cannot rebase: working tree has uncommitted changes. Please commit or stash your changes first.'
        );
        return;
    }

    // Show loading indicator while fetching refs
    const refs = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Loading branches and tags...',
            cancellable: false
        },
        async () => {
            return await getBranchesAndTags(targetPath);
        }
    );

    if (refs.length === 0) {
        vscode.window.showInformationMessage('No branches or tags found');
        return;
    }

    // Create QuickPick items, grouped by type (similar to compareWithBranch)
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
    
    // Group refs by type, filter out current branch
    const branches = refs.filter(r => r.type === 'branch' && r.name !== currentBranch);
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
        placeHolder: `Select a branch or tag to rebase "${currentBranch}" onto`,
        matchOnDescription: true
    });

    if (!selected || !selected.ref) {
        return; // User cancelled
    }

    const targetRef = selected.ref.name;

    // Confirm the rebase operation
    const confirmMessage = `Rebase "${currentBranch}" onto "${targetRef}"?\n\nThis will rewrite commit history. Make sure you haven't pushed these commits.`;
    const confirm = await vscode.window.showWarningMessage(
        confirmMessage,
        { modal: true },
        'Rebase'
    );

    if (confirm !== 'Rebase') {
        return;
    }

    // Execute rebase with progress
    const result = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Rebasing onto ${targetRef}...`,
            cancellable: false
        },
        async () => {
            return await rebase(repoRoot, targetRef);
        }
    );

    if (result.success) {
        vscode.window.showInformationMessage(`Successfully rebased "${currentBranch}" onto "${targetRef}"`);
    } else {
        // Check if there are conflicts
        const conflicts = await getConflictFiles(repoRoot);
        
        if (conflicts.length > 0) {
            // Show conflict resolution options
            const action = await vscode.window.showWarningMessage(
                `Rebase stopped due to conflicts in ${conflicts.length} file(s).`,
                'Open Conflicting Files',
                'Abort Rebase'
            );

            if (action === 'Open Conflicting Files') {
                // Open the first conflicting file
                for (const file of conflicts.slice(0, 3)) { // Open up to 3 files
                    const fileUri = vscode.Uri.file(path.join(repoRoot, file));
                    await vscode.window.showTextDocument(fileUri, { preview: false });
                }
                
                vscode.window.showInformationMessage(
                    `Resolve conflicts and run "Git: Continue Rebase" or use the Source Control panel.`
                );
            } else if (action === 'Abort Rebase') {
                const { rebaseAbort } = await import('../gitService');
                const abortResult = await rebaseAbort(repoRoot);
                if (abortResult.success) {
                    vscode.window.showInformationMessage('Rebase aborted');
                } else {
                    vscode.window.showErrorMessage(`Rebase abort failed: ${abortResult.error}`);
                }
            }
        } else {
            vscode.window.showErrorMessage(`Rebase failed: ${result.error}`);
        }
    }
}
