import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface Package {
    name: string;
    version: string;
    ecosystem: string;
    type: string;
    id: string;
    cves: any[];
}

export interface DependencyFile {
    fileName: string;
    filePath: string;
    ecosystem: string;
    packages: Package[];
}

export interface FolderNode {
    id: string;
    name: string;
    path: string;
    type: 'folder';
    dependencyFiles: DependencyFile[];
    children: FolderNode[];
    totalPackages: number;
    totalProjects: number;
    isProject: boolean;
}

export interface ScanResult {
    rootName: string;
    rootPath: string;
    tree: FolderNode | null;
    totalProjects: number;
    totalPackages: number;
    error?: string;
}

const DEPENDENCY_FILES: Record<string, string> = {
    'package.json': 'npm',
    'package-lock.json': 'npm',
    'yarn.lock': 'npm',
    'requirements.txt': 'pypi',
    'Pipfile': 'pypi',
    'Pipfile.lock': 'pypi',
    'pyproject.toml': 'pypi',
    'Cargo.toml': 'cargo',
    'Cargo.lock': 'cargo',
    'go.mod': 'go',
    'go.sum': 'go',
    'Gemfile': 'rubygems',
    'Gemfile.lock': 'rubygems',
    'pom.xml': 'maven',
    'build.gradle': 'gradle',
    'composer.json': 'composer',
    'pubspec.yaml': 'pub',
    'Podfile': 'cocoapods',
    'Podfile.lock': 'cocoapods'
};

const SKIP_DIRS = [
    'node_modules', '.git', 'vendor', 'venv', '.venv', 'env',
    '__pycache__', 'target', 'build', 'dist', '.next', '.nuxt',
    '.cache', 'coverage', '.nyc_output', 'bower_components'
];

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_FILES_SCANNED = 10000;
const MAX_FOLDERS_SCANNED = 5000;

export class DependencyScanner {
    private filesScanned = 0;
    private foldersScanned = 0;
    private scanLimitReached = false;

    public async scanWorkspace(): Promise<ScanResult> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return {
                rootName: 'No workspace',
                rootPath: '',
                tree: null,
                totalProjects: 0,
                totalPackages: 0
            };
        }

        // Reset counters
        this.filesScanned = 0;
        this.foldersScanned = 0;
        this.scanLimitReached = false;

        // Scan the first workspace folder
        const rootPath = workspaceFolders[0].uri.fsPath;
        
        try {
            const tree = await this.scanDir(rootPath, 0, 5);
            
            if (!tree) {
                return {
                    rootName: path.basename(rootPath),
                    rootPath: rootPath,
                    tree: null,
                    totalProjects: 0,
                    totalPackages: 0
                };
            }

            return {
                rootName: tree.name,
                rootPath: rootPath,
                tree: tree,
                totalProjects: tree.totalProjects,
                totalPackages: tree.totalPackages
            };
        } catch (err: any) {
            return {
                rootName: path.basename(rootPath),
                rootPath: rootPath,
                tree: null,
                totalProjects: 0,
                totalPackages: 0,
                error: `Scan failed: ${err.message}`
            };
        }
    }

    private async scanDir(dirPath: string, depth: number, maxDepth: number): Promise<FolderNode | null> {
        if (depth > maxDepth) return null;

        this.foldersScanned++;
        if (this.foldersScanned > MAX_FOLDERS_SCANNED) {
            if (!this.scanLimitReached) {
                console.warn('CVE Watch: Folder scan limit reached');
                this.scanLimitReached = true;
            }
            return null;
        }

        let entries: fs.Dirent[];
        try {
            entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        } catch (err) {
            console.error('CVE Watch: Cannot read directory:', dirPath);
            return null;
        }

        this.filesScanned += entries.length;
        if (this.filesScanned > MAX_FILES_SCANNED) {
            if (!this.scanLimitReached) {
                console.warn('CVE Watch: File scan limit reached');
                this.scanLimitReached = true;
            }
            return null;
        }

        entries.sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
        });

        const dependencyFiles: DependencyFile[] = [];
        const children: FolderNode[] = [];

        for (const entry of entries) {
            if (entry.isFile() && DEPENDENCY_FILES[entry.name]) {
                const filePath = path.join(dirPath, entry.name);
                const deps = await this.parseDependencyFile(filePath, entry.name);

                dependencyFiles.push({
                    fileName: entry.name,
                    filePath: filePath,
                    ecosystem: DEPENDENCY_FILES[entry.name],
                    packages: deps.map(dep => ({
                        ...dep,
                        id: `${dep.name}@${dep.version}`,
                        cves: []
                    }))
                });
            } else if (entry.isDirectory() && !SKIP_DIRS.includes(entry.name) && !entry.name.startsWith('.')) {
                const childNode = await this.scanDir(path.join(dirPath, entry.name), depth + 1, maxDepth);
                if (childNode) {
                    children.push(childNode);
                }
            }
        }

        const localPackages = dependencyFiles.reduce((sum, f) => sum + f.packages.length, 0);
        const childPackages = children.reduce((sum, c) => sum + c.totalPackages, 0);
        const totalPackages = localPackages + childPackages;

        const isProject = dependencyFiles.length > 0;
        const localProjects = isProject ? 1 : 0;
        const childProjects = children.reduce((sum, c) => sum + c.totalProjects, 0);
        const totalProjects = localProjects + childProjects;

        if (dependencyFiles.length === 0 && children.length === 0) {
            return null;
        }

        return {
            id: dirPath,
            name: path.basename(dirPath),
            path: dirPath,
            type: 'folder',
            dependencyFiles: dependencyFiles,
            children: children,
            totalPackages: totalPackages,
            totalProjects: totalProjects,
            isProject: isProject
        };
    }

    private async parseDependencyFile(filePath: string, fileName: string): Promise<Array<{ name: string; version: string; ecosystem: string; type: string }>> {
        const dependencies: Array<{ name: string; version: string; ecosystem: string; type: string }> = [];

        try {
            const stats = await fs.promises.stat(filePath);
            if (stats.size > MAX_FILE_SIZE) {
                console.warn('CVE Watch: Skipping large file:', filePath);
                return dependencies;
            }

            const content = await fs.promises.readFile(filePath, 'utf-8');

            switch (fileName) {
                case 'package.json': {
                    const pkg = JSON.parse(content);
                    const allDeps = {
                        ...pkg.dependencies,
                        ...pkg.devDependencies
                    };
                    for (const [name, version] of Object.entries(allDeps || {})) {
                        dependencies.push({
                            name,
                            version: String(version).replace(/^[\^~>=<]+/, ''),
                            ecosystem: 'npm',
                            type: pkg.devDependencies?.[name] ? 'dev' : 'prod'
                        });
                    }
                    break;
                }

                case 'requirements.txt': {
                    const lines = content.split('\n');
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('-')) {
                            const match = trimmed.match(/^([a-zA-Z0-9_-]+)([=<>!]+)?(.+)?/);
                            if (match) {
                                dependencies.push({
                                    name: match[1],
                                    version: match[3] || 'latest',
                                    ecosystem: 'pypi',
                                    type: 'prod'
                                });
                            }
                        }
                    }
                    break;
                }

                case 'Cargo.toml': {
                    const depsMatch = content.match(/\[dependencies\]([\s\S]*?)(?=\[|$)/);
                    if (depsMatch) {
                        const depLines = depsMatch[1].split('\n');
                        for (const line of depLines) {
                            const match = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*"?([^"]+)"?/);
                            if (match) {
                                dependencies.push({
                                    name: match[1],
                                    version: match[2],
                                    ecosystem: 'cargo',
                                    type: 'prod'
                                });
                            }
                        }
                    }
                    break;
                }

                case 'go.mod': {
                    const lines = content.split('\n');
                    let inRequire = false;
                    for (const line of lines) {
                        if (line.includes('require (')) {
                            inRequire = true;
                            continue;
                        }
                        if (inRequire && line.includes(')')) {
                            inRequire = false;
                            continue;
                        }
                        if (inRequire || line.startsWith('require ')) {
                            const match = line.match(/^\s*([^\s]+)\s+v?([^\s]+)/);
                            if (match && match[1] !== 'require') {
                                dependencies.push({
                                    name: match[1],
                                    version: match[2],
                                    ecosystem: 'go',
                                    type: 'prod'
                                });
                            }
                        }
                    }
                    break;
                }

                case 'Gemfile': {
                    const lines = content.split('\n');
                    for (const line of lines) {
                        const match = line.match(/^\s*gem\s+['"]([^'"]+)['"]/);
                        if (match) {
                            const versionMatch = line.match(/,\s*['"]([^'"]+)['"]/);
                            dependencies.push({
                                name: match[1],
                                version: versionMatch ? versionMatch[1] : 'latest',
                                ecosystem: 'rubygems',
                                type: 'prod'
                            });
                        }
                    }
                    break;
                }

                case 'composer.json': {
                    const pkg = JSON.parse(content);
                    const allDeps = {
                        ...pkg.require,
                        ...pkg['require-dev']
                    };
                    for (const [name, version] of Object.entries(allDeps || {})) {
                        if (!name.startsWith('php') && !name.startsWith('ext-')) {
                            dependencies.push({
                                name,
                                version: String(version).replace(/^[\^~>=<]+/, ''),
                                ecosystem: 'composer',
                                type: pkg['require-dev']?.[name] ? 'dev' : 'prod'
                            });
                        }
                    }
                    break;
                }

                case 'pom.xml': {
                    const depMatches = content.matchAll(/<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>\s*(?:<version>([^<]+)<\/version>)?/g);
                    for (const match of depMatches) {
                        dependencies.push({
                            name: `${match[1]}:${match[2]}`,
                            version: match[3] || 'managed',
                            ecosystem: 'maven',
                            type: 'prod'
                        });
                    }
                    break;
                }

                case 'build.gradle': {
                    const matches = content.matchAll(/(?:implementation|api|compile|runtimeOnly|testImplementation)\s*[('"]([^:]+):([^:]+):([^'")\s]+)/g);
                    for (const match of matches) {
                        dependencies.push({
                            name: `${match[1]}:${match[2]}`,
                            version: match[3],
                            ecosystem: 'gradle',
                            type: 'prod'
                        });
                    }
                    break;
                }
            }
        } catch (err) {
            console.error('CVE Watch: Error parsing', filePath);
        }

        return dependencies;
    }
}

