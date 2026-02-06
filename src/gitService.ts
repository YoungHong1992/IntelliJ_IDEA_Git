import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export interface CommitInfo {
    hash: string;
    shortHash: string;
    message: string;
    author: string;
    date: string;
}

export interface RefInfo {
    name: string;
    type: 'branch' | 'tag' | 'remote';
}

export interface DiffFileInfo {
    status: string;  // A=Added, M=Modified, D=Deleted, R=Renamed, C=Copied
    path: string;
    oldPath?: string; // For renamed files
}

/**
 * Get the Git repository root for a given file path
 */
export async function getRepoRoot(filePath: string): Promise<string> {
    const dir = path.dirname(filePath);
    try {
        const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
            cwd: dir,
            encoding: 'utf8'
        });
        return stdout.trim();
    } catch (error) {
        throw new Error('Not a Git repository');
    }
}

/**
 * Get the commit history for a specific file
 */
export async function getFileHistory(filePath: string, limit: number = 50): Promise<CommitInfo[]> {
    const dir = path.dirname(filePath);
    
    try {
        const { stdout } = await execFileAsync(
            'git',
            [
                'log',
                `--max-count=${limit}`,
                '--pretty=format:%H|%h|%s|%an|%ad',
                '--date=short',
                '--',
                filePath
            ],
            {
                cwd: dir,
                encoding: 'utf8'
            }
        );

        if (!stdout.trim()) {
            return [];
        }

        return stdout.trim().split('\n').map(line => {
            const [hash, shortHash, message, author, date] = line.split('|');
            return { hash, shortHash, message, author, date };
        });
    } catch (error) {
        console.error('Failed to get file history:', error);
        return [];
    }
}

/**
 * Get all branches and tags
 */
export async function getBranchesAndTags(filePath: string): Promise<RefInfo[]> {
    const dir = path.dirname(filePath);
    const refs: RefInfo[] = [];

    try {
        // Get local branches
        const { stdout: branchOutput } = await execFileAsync(
            'git',
            ['branch', '--format=%(refname:short)'],
            { cwd: dir, encoding: 'utf8' }
        );
        
        branchOutput.trim().split('\n').filter(b => b.trim()).forEach(name => {
            refs.push({ name: name.trim(), type: 'branch' });
        });

        // Get remote branches
        const { stdout: remoteOutput } = await execFileAsync(
            'git',
            ['branch', '-r', '--format=%(refname:short)'],
            { cwd: dir, encoding: 'utf8' }
        );
        
        remoteOutput.trim().split('\n').filter(b => b.trim() && !b.includes('HEAD')).forEach(name => {
            refs.push({ name: name.trim(), type: 'remote' });
        });

        // Get tags
        const { stdout: tagOutput } = await execFileAsync(
            'git',
            ['tag'],
            { cwd: dir, encoding: 'utf8' }
        );
        
        tagOutput.trim().split('\n').filter(t => t.trim()).forEach(name => {
            refs.push({ name: name.trim(), type: 'tag' });
        });
    } catch (error) {
        console.error('Failed to get branches and tags:', error);
    }

    return refs;
}

/**
 * Get file content at a specific git reference (commit hash, branch, or tag)
 */
export async function getFileContentAtRef(filePath: string, ref: string): Promise<string> {
    const repoRoot = await getRepoRoot(filePath);
    const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
    
    try {
        const { stdout } = await execFileAsync(
            'git',
            ['show', `${ref}:${relativePath}`],
            {
                cwd: repoRoot,
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large files
            }
        );
        return stdout;
    } catch (error: any) {
        if (error.message?.includes('does not exist') || error.message?.includes('Path')) {
            throw new Error(`File does not exist in ${ref}`);
        }
        throw error;
    }
}

/**
 * Check if a file is tracked by Git
 */
export async function isFileTracked(filePath: string): Promise<boolean> {
    const dir = path.dirname(filePath);
    
    try {
        await execFileAsync(
            'git',
            ['ls-files', '--error-unmatch', filePath],
            { cwd: dir, encoding: 'utf8' }
        );
        return true;
    } catch {
        return false;
    }
}

/**
 * Get list of changed files between current state and a git reference
 * @param dirPath - Directory path to compare
 * @param ref - Git reference (commit hash, branch, or tag)
 * @param repoRoot - Git repository root path
 */
export async function getDirectoryDiff(
    dirPath: string,
    ref: string,
    repoRoot: string
): Promise<DiffFileInfo[]> {
    try {
        // Get relative path of the directory from repo root
        const relativePath = path.relative(repoRoot, dirPath).replace(/\\/g, '/');
        
        // Use git diff to compare
        const args = [
            'diff',
            '--name-status',
            ref,
            '--',
            relativePath || '.'
        ];

        const { stdout } = await execFileAsync(
            'git',
            args,
            {
                cwd: repoRoot,
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024
            }
        );

        if (!stdout.trim()) {
            return [];
        }

        return stdout.trim().split('\n').map(line => {
            const parts = line.split('\t');
            const status = parts[0].charAt(0); // First char is status
            
            if (status === 'R' || status === 'C') {
                // Renamed or Copied: status\toldPath\tnewPath
                return {
                    status,
                    oldPath: parts[1],
                    path: parts[2]
                };
            }
            
            return {
                status,
                path: parts[1]
            };
        }).filter(file => file.path); // Filter out any invalid entries
    } catch (error) {
        console.error('Failed to get directory diff:', error);
        return [];
    }
}

/**
 * Get commit history for a directory
 */
export async function getDirectoryHistory(dirPath: string, limit: number = 50): Promise<CommitInfo[]> {
    try {
        const { stdout } = await execFileAsync(
            'git',
            [
                'log',
                `--max-count=${limit}`,
                '--pretty=format:%H|%h|%s|%an|%ad',
                '--date=short',
                '--',
                dirPath
            ],
            {
                cwd: dirPath,
                encoding: 'utf8'
            }
        );

        if (!stdout.trim()) {
            return [];
        }

        return stdout.trim().split('\n').map(line => {
            const [hash, shortHash, message, author, date] = line.split('|');
            return { hash, shortHash, message, author, date };
        });
    } catch (error) {
        console.error('Failed to get directory history:', error);
        return [];
    }
}

/**
 * Get the current branch name
 * Returns null if in detached HEAD state
 */
export async function getCurrentBranch(repoRoot: string): Promise<string | null> {
    try {
        const { stdout } = await execFileAsync(
            'git',
            ['symbolic-ref', '--short', 'HEAD'],
            { cwd: repoRoot, encoding: 'utf8' }
        );
        return stdout.trim();
    } catch {
        // Detached HEAD state
        return null;
    }
}

/**
 * Check if the working tree is clean (no uncommitted changes)
 */
export async function isWorkingTreeClean(repoRoot: string): Promise<boolean> {
    try {
        const { stdout } = await execFileAsync(
            'git',
            ['status', '--porcelain'],
            { cwd: repoRoot, encoding: 'utf8' }
        );
        return stdout.trim() === '';
    } catch {
        return false;
    }
}

/**
 * Check if a rebase is currently in progress
 */
export async function isRebaseInProgress(repoRoot: string): Promise<boolean> {
    try {
        const { stdout } = await execFileAsync(
            'git',
            ['rev-parse', '--git-path', 'rebase-merge'],
            { cwd: repoRoot, encoding: 'utf8' }
        );
        const rebaseMergePath = path.join(repoRoot, stdout.trim());
        
        // Check if rebase-merge directory exists
        const fs = require('fs');
        if (fs.existsSync(rebaseMergePath)) {
            return true;
        }

        // Also check rebase-apply for older git rebase
        const { stdout: applyPath } = await execFileAsync(
            'git',
            ['rev-parse', '--git-path', 'rebase-apply'],
            { cwd: repoRoot, encoding: 'utf8' }
        );
        const rebaseApplyPath = path.join(repoRoot, applyPath.trim());
        return fs.existsSync(rebaseApplyPath);
    } catch {
        return false;
    }
}

/**
 * Execute git rebase onto a target ref
 */
export async function rebase(repoRoot: string, ontoRef: string): Promise<{ success: boolean; error?: string }> {
    try {
        await execFileAsync(
            'git',
            ['rebase', ontoRef],
            { cwd: repoRoot, encoding: 'utf8' }
        );
        return { success: true };
    } catch (error: any) {
        return { 
            success: false, 
            error: error.stderr || error.message || 'Rebase failed'
        };
    }
}

/**
 * Abort the current rebase
 */
export async function rebaseAbort(repoRoot: string): Promise<void> {
    await execFileAsync(
        'git',
        ['rebase', '--abort'],
        { cwd: repoRoot, encoding: 'utf8' }
    );
}

/**
 * Continue the current rebase after resolving conflicts
 */
export async function rebaseContinue(repoRoot: string): Promise<{ success: boolean; error?: string }> {
    try {
        await execFileAsync(
            'git',
            ['rebase', '--continue'],
            { cwd: repoRoot, encoding: 'utf8' }
        );
        return { success: true };
    } catch (error: any) {
        return { 
            success: false, 
            error: error.stderr || error.message || 'Rebase continue failed'
        };
    }
}

/**
 * Get list of files with merge conflicts
 */
export async function getConflictFiles(repoRoot: string): Promise<string[]> {
    try {
        const { stdout } = await execFileAsync(
            'git',
            ['diff', '--name-only', '--diff-filter=U'],
            { cwd: repoRoot, encoding: 'utf8' }
        );
        return stdout.trim().split('\n').filter(f => f.trim());
    } catch {
        return [];
    }
}
