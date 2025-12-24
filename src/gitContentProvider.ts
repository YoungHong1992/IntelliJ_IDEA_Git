import * as vscode from 'vscode';
import { getFileContentAtRef } from './gitService';

export const SCHEME = 'idea-git';

/**
 * TextDocumentContentProvider for displaying Git file content at specific revisions.
 * 
 * URI format: jb-git:///path/to/file?ref=<commit-hash-or-branch>
 * 
 * We use vscode.Uri.fsPath for cross-platform path handling.
 */
export class GitContentProvider implements vscode.TextDocumentContentProvider {
    
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        // Use fsPath for cross-platform compatibility (Windows, macOS, Linux)
        const filePath = uri.fsPath;
        const params = new URLSearchParams(uri.query);
        const ref = params.get('ref');

        console.log('[JB-Git] provideTextDocumentContent called');
        console.log('[JB-Git] URI:', uri.toString());
        console.log('[JB-Git] fsPath:', filePath);
        console.log('[JB-Git] Ref:', ref);

        if (!ref) {
            throw new Error('No git reference specified in URI');
        }

        try {
            const content = await getFileContentAtRef(filePath, ref);
            console.log('[JB-Git] Content loaded successfully, length:', content.length);
            return content;
        } catch (error: any) {
            console.error('[JB-Git] Error loading content:', error);
            return `// Error loading content: ${error.message}`;
        }
    }
}

/**
 * Create a URI for viewing a file at a specific Git reference
 */
export function createGitUri(filePath: string, ref: string): vscode.Uri {
    // Use Uri.file to properly handle paths on all platforms, then convert to our scheme
    const fileUri = vscode.Uri.file(filePath);
    return fileUri.with({
        scheme: SCHEME,
        query: `ref=${encodeURIComponent(ref)}`
    });
}

