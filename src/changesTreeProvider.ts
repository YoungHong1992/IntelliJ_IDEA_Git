import * as vscode from 'vscode';
import * as path from 'path';
import { getDirectoryDiff, DiffFileInfo } from './gitService';

/**
 * Represents a file or folder node in the Changes tree view
 */
export class ChangeTreeItem extends vscode.TreeItem {
    public children: ChangeTreeItem[] = [];
    public parent: ChangeTreeItem | null = null;

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly isFolder: boolean,
        public readonly fileInfo?: DiffFileInfo,
        public readonly repoRoot?: string,
        public readonly ref?: string,
        public readonly fullPath?: string
    ) {
        super(label, collapsibleState);

        if (isFolder) {
            this.contextValue = 'folder';
            this.iconPath = new vscode.ThemeIcon('folder');
            // Show file count in description
            this.updateDescription();
        } else if (fileInfo) {
            this.contextValue = 'changedFile';
            this.tooltip = `${fileInfo.path} (${this.getStatusLabel(fileInfo.status)})`;
            this.description = this.getStatusLabel(fileInfo.status);
            this.iconPath = this.getFileIcon(fileInfo.status);
            
            if (repoRoot) {
                this.resourceUri = vscode.Uri.file(path.join(repoRoot, fileInfo.path));
            }
            
            // Set command to open diff on click
            this.command = {
                command: 'intellij-idea-git.openFileDiff',
                title: 'Open Diff',
                arguments: [this]
            };
        }
    }

    updateDescription(): void {
        if (this.isFolder) {
            const count = this.countFiles();
            this.description = `${count} file${count !== 1 ? 's' : ''}`;
        }
    }

    private countFiles(): number {
        let count = 0;
        for (const child of this.children) {
            if (child.isFolder) {
                count += child.countFiles();
            } else {
                count += 1;
            }
        }
        return count;
    }

    addChild(child: ChangeTreeItem): void {
        child.parent = this;
        this.children.push(child);
        this.updateDescription();
    }

    private getStatusLabel(status: string): string {
        switch (status) {
            case 'A': return 'Added';
            case 'M': return 'Modified';
            case 'D': return 'Deleted';
            case 'R': return 'Renamed';
            case 'C': return 'Copied';
            case 'U': return 'Unmerged';
            default: return status;
        }
    }

    private getFileIcon(status: string): vscode.ThemeIcon {
        switch (status) {
            case 'A':
                return new vscode.ThemeIcon('diff-added', new vscode.ThemeColor('ideaGit.addedFile'));
            case 'M':
                return new vscode.ThemeIcon('diff-modified', new vscode.ThemeColor('ideaGit.modifiedFile'));
            case 'D':
                return new vscode.ThemeIcon('diff-removed', new vscode.ThemeColor('ideaGit.deletedFile'));
            case 'R':
                return new vscode.ThemeIcon('diff-renamed', new vscode.ThemeColor('ideaGit.modifiedFile'));
            default:
                return new vscode.ThemeIcon('file');
        }
    }
}

/**
 * Interface representing a comparison context
 */
export interface CompareContext {
    basePath: string;      // Path to the file or directory being compared
    ref: string;           // Git reference (commit hash, branch, or tag)
    refLabel: string;      // Human-readable label for the reference
    repoRoot: string;      // Git repository root path
    isDirectory: boolean;  // Whether comparing a directory
}

/**
 * TreeDataProvider for the Changes view
 */
export class ChangesTreeProvider implements vscode.TreeDataProvider<ChangeTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ChangeTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private compareContext: CompareContext | null = null;
    private changedFiles: DiffFileInfo[] = [];
    private rootItems: ChangeTreeItem[] = [];

    constructor() {}

    /**
     * Set the comparison context and fetch changed files
     */
    async setCompareContext(context: CompareContext): Promise<void> {
        this.compareContext = context;
        
        if (context.isDirectory) {
            // Get diff for directory
            this.changedFiles = await getDirectoryDiff(
                context.basePath,
                context.ref,
                context.repoRoot
            );
        } else {
            // Single file - detect the actual status from git diff
            const relativePath = path.relative(context.repoRoot, context.basePath).replace(/\\/g, '/');
            const allDiffs = await getDirectoryDiff(
                path.dirname(context.basePath),
                context.ref,
                context.repoRoot
            );
            const matchedFile = allDiffs.find(f => f.path === relativePath);
            this.changedFiles = [matchedFile ?? {
                status: 'M',
                path: relativePath
            }];
        }

        this.buildTreeStructure();
        this._onDidChangeTreeData.fire();
    }

    /**
     * Build a hierarchical tree structure from flat file list
     */
    private buildTreeStructure(): void {
        this.rootItems = [];
        
        if (!this.compareContext || this.changedFiles.length === 0) {
            return;
        }

        // Create a map to store folder nodes by their path
        const folderMap = new Map<string, ChangeTreeItem>();
        
        // Sort files by path for consistent ordering
        const sortedFiles = [...this.changedFiles].sort((a, b) => a.path.localeCompare(b.path));

        for (const file of sortedFiles) {
            const pathParts = file.path.split('/');
            const fileName = pathParts.pop()!;
            
            // Create or get parent folders
            let currentParent: ChangeTreeItem | null = null;
            let currentPath = '';
            
            for (const part of pathParts) {
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                
                if (!folderMap.has(currentPath)) {
                    // Create new folder node
                    const folderItem = new ChangeTreeItem(
                        part,
                        vscode.TreeItemCollapsibleState.Expanded,
                        true, // isFolder
                        undefined,
                        this.compareContext?.repoRoot,
                        this.compareContext?.ref,
                        currentPath
                    );
                    
                    folderMap.set(currentPath, folderItem);
                    
                    if (currentParent) {
                        currentParent.addChild(folderItem);
                    } else {
                        this.rootItems.push(folderItem);
                    }
                }
                
                currentParent = folderMap.get(currentPath)!;
            }
            
            // Create file node
            const fileItem = new ChangeTreeItem(
                fileName,
                vscode.TreeItemCollapsibleState.None,
                false, // isFolder
                file,
                this.compareContext?.repoRoot,
                this.compareContext?.ref,
                file.path
            );
            
            if (currentParent) {
                currentParent.addChild(fileItem);
            } else {
                this.rootItems.push(fileItem);
            }
        }

        // Update all folder descriptions after building the tree
        this.updateAllFolderDescriptions(this.rootItems);
    }

    private updateAllFolderDescriptions(items: ChangeTreeItem[]): void {
        for (const item of items) {
            if (item.isFolder) {
                item.updateDescription();
                this.updateAllFolderDescriptions(item.children);
            }
        }
    }

    /**
     * Clear the current comparison
     */
    clear(): void {
        this.compareContext = null;
        this.changedFiles = [];
        this.rootItems = [];
        this._onDidChangeTreeData.fire();
    }

    /**
     * Refresh the current comparison
     */
    async refresh(): Promise<void> {
        if (this.compareContext) {
            await this.setCompareContext(this.compareContext);
        }
    }

    getTreeItem(element: ChangeTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ChangeTreeItem): ChangeTreeItem[] {
        if (!this.compareContext) {
            return [];
        }

        if (!element) {
            // Return root items
            return this.rootItems;
        }

        // Return children of the element
        return element.children;
    }

    /**
     * Get parent for tree item (for reveal support)
     */
    getParent(element: ChangeTreeItem): ChangeTreeItem | null {
        return element.parent;
    }
}

// Singleton instance
let changesTreeProviderInstance: ChangesTreeProvider | null = null;

export function getChangesTreeProvider(): ChangesTreeProvider {
    if (!changesTreeProviderInstance) {
        changesTreeProviderInstance = new ChangesTreeProvider();
    }
    return changesTreeProviderInstance;
}
