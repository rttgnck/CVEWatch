const { app, BrowserWindow, Tray, nativeImage, nativeTheme, screen, ipcMain, Notification, Menu, dialog } = require('electron');
const path = require('path');

// Initialize store with error handling
let store;
try {
  const Store = require('electron-store');
  store = new Store({
    defaults: {
      products: [],
      pollInterval: 30,
      notifications: true,
      theme: 'system',
      openAtLogin: false,
      projectsFolder: null,
      scannedProjects: null,
      lastProjectsScan: null
    }
  });
} catch (err) {
  console.error('CVE Watch: Failed to initialize store:', err);
  const memoryStore = {
    products: [],
    pollInterval: 30,
    notifications: true,
    theme: 'system',
    openAtLogin: false,
    projectsFolder: null,
    scannedProjects: null,
    lastProjectsScan: null
  };
  store = {
    get: (key) => memoryStore[key],
    set: (key, value) => { memoryStore[key] = value; },
    delete: (key) => { delete memoryStore[key]; },
    store: memoryStore
  };
}

let tray = null;
let mainWindow = null;
let isQuitting = false;

const isMac = process.platform === 'darwin';
// Check for production mode: either explicitly set or running as packaged app
const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;

// Log levels for production vs development
const LOG_LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
const CURRENT_LOG_LEVEL = isDev ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN;
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB max log file size

// Debug logging function - writes to file after app is ready
let debugLogPath = null;
function debugLog(...args) {
  // Only log DEBUG level in development
  if (CURRENT_LOG_LEVEL < LOG_LEVELS.DEBUG) return;
  
  const msg = `[${new Date().toISOString()}] [DEBUG] ${args.join(' ')}\n`;
  console.log(...args);
  writeToLogFile(msg);
}

function errorLog(...args) {
  const msg = `[${new Date().toISOString()}] [ERROR] ${args.join(' ')}\n`;
  console.error(...args);
  writeToLogFile(msg);
}

function warnLog(...args) {
  if (CURRENT_LOG_LEVEL < LOG_LEVELS.WARN) return;
  const msg = `[${new Date().toISOString()}] [WARN] ${args.join(' ')}\n`;
  console.warn(...args);
  writeToLogFile(msg);
}

function writeToLogFile(msg) {
  if (!debugLogPath) return;
  try {
    // Check log file size and rotate if needed
    try {
      const stats = require('fs').statSync(debugLogPath);
      if (stats.size > MAX_LOG_SIZE) {
        // Rotate: rename old log and start fresh
        const rotatedPath = debugLogPath.replace('.log', '.old.log');
        try { require('fs').unlinkSync(rotatedPath); } catch (e) {}
        require('fs').renameSync(debugLogPath, rotatedPath);
      }
    } catch (e) {
      // File doesn't exist yet, that's fine
    }
    
    // Sanitize log message to avoid leaking sensitive paths in production
    let sanitizedMsg = msg;
    if (!isDev) {
      // In production, replace full user paths with shortened versions
      sanitizedMsg = msg.replace(/\/Users\/[^\/\s]+/g, '/Users/***');
      sanitizedMsg = sanitizedMsg.replace(/C:\\Users\\[^\\s]+/gi, 'C:\\Users\\***');
    }
    
    require('fs').appendFileSync(debugLogPath, sanitizedMsg);
  } catch (e) {
    // Ignore write errors
  }
}

// Initial console-only logging (before app is ready)
console.log('CVE Watch: isDev =', isDev);
console.log('CVE Watch: app.isPackaged =', app.isPackaged);
console.log('CVE Watch: NODE_ENV =', process.env.NODE_ENV);

const fs = require('fs');

// Dependency file patterns to look for
const DEPENDENCY_FILES = {
  'package.json': 'npm',
  'package-lock.json': 'npm',
  'yarn.lock': 'npm',
  'requirements.txt': 'pypi',
  'Pipfile': 'pypi',
  'Pipfile.lock': 'pypi',
  'pyproject.toml': 'pypi',
  'setup.py': 'pypi',
  'Cargo.toml': 'cargo',
  'Cargo.lock': 'cargo',
  'go.mod': 'go',
  'go.sum': 'go',
  'Gemfile': 'rubygems',
  'Gemfile.lock': 'rubygems',
  'pom.xml': 'maven',
  'build.gradle': 'gradle',
  'build.gradle.kts': 'gradle',
  'composer.json': 'composer',
  'pubspec.yaml': 'pub',
  'Package.swift': 'swift',
  'Podfile': 'cocoapods',
  'Podfile.lock': 'cocoapods'
};

// Directories to skip when scanning
const SKIP_DIRS = [
  'node_modules', '.git', 'vendor', 'venv', '.venv', 'env', 
  '__pycache__', 'target', 'build', 'dist', '.next', '.nuxt',
  '.cache', 'coverage', '.nyc_output', 'bower_components'
];

// Max file size for reading dependency files (25MB)
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Security limits for folder scanning
const MAX_FILES_SCANNED = 10000;
const MAX_FOLDERS_SCANNED = 5000;

// System directories that should never be scanned (security protection)
const FORBIDDEN_PATHS = [
  '/', '/bin', '/sbin', '/usr', '/etc', '/var', '/tmp', '/private',
  '/System', '/Library', '/Applications', '/Users',
  'C:\\', 'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)',
  'C:\\Users', 'C:\\ProgramData'
];

// Check if a path is a forbidden system directory
function isForbiddenPath(targetPath) {
  const normalizedPath = path.normalize(targetPath);
  // Check exact matches and parent directories
  for (const forbidden of FORBIDDEN_PATHS) {
    if (normalizedPath === forbidden || normalizedPath === path.normalize(forbidden)) {
      return true;
    }
  }
  // Allow subdirectories of /Users or C:\Users (user projects)
  if (normalizedPath.startsWith('/Users/') || normalizedPath.match(/^[A-Z]:\\Users\\/i)) {
    return false;
  }
  // Block root-level system paths
  const parts = normalizedPath.split(path.sep).filter(Boolean);
  if (parts.length <= 1 && FORBIDDEN_PATHS.some(f => normalizedPath.startsWith(f))) {
    return true;
  }
  return false;
}

// Resolve symlinks and validate path safety
async function validatePath(targetPath) {
  try {
    // Resolve the real path (follows symlinks)
    const realPath = await fs.promises.realpath(targetPath);
    
    // Check if the resolved path is forbidden
    if (isForbiddenPath(realPath)) {
      return { valid: false, error: 'Cannot scan system directories' };
    }
    
    // Verify it's actually a directory
    const stats = await fs.promises.stat(realPath);
    if (!stats.isDirectory()) {
      return { valid: false, error: 'Selected path is not a directory' };
    }
    
    return { valid: true, realPath };
  } catch (err) {
    return { valid: false, error: `Cannot access path: ${err.message}` };
  }
}

// Scan projects folder recursively and build a nested tree structure
async function scanProjectsFolder(rootPath, maxDepth = 5) {
  // Track scan progress for limits
  let filesScanned = 0;
  let foldersScanned = 0;
  let scanLimitReached = false;
  
  // Recursively scan a directory and return a tree node
  async function scanDir(dirPath, depth = 0) {
    if (depth > maxDepth) return null;
    
    // Check folder limit
    foldersScanned++;
    if (foldersScanned > MAX_FOLDERS_SCANNED) {
      if (!scanLimitReached) {
        console.warn('CVE Watch: Folder scan limit reached, stopping scan');
        scanLimitReached = true;
      }
      return null;
    }
    
    let entries;
    try {
      entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    } catch (err) {
      console.error('CVE Watch: Cannot read directory:', dirPath, err.message);
      return null;
    }
    
    // Check file limit
    filesScanned += entries.length;
    if (filesScanned > MAX_FILES_SCANNED) {
      if (!scanLimitReached) {
        console.warn('CVE Watch: File scan limit reached, stopping scan');
        scanLimitReached = true;
      }
      return null;
    }
    
    // Sort entries: folders first, then files, alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });
    
    const dependencyFiles = [];
    const children = [];
    
    // Process all entries
    for (const entry of entries) {
      if (entry.isFile() && DEPENDENCY_FILES[entry.name]) {
        // Found a dependency file
        const filePath = path.join(dirPath, entry.name);
        console.log('CVE Watch: Found dependency file:', entry.name, 'at', filePath);
        const deps = await parseDependencyFile(filePath, entry.name);
        console.log('CVE Watch: Parsed', deps.length, 'dependencies from', entry.name);
        
        // Always show recognized dependency files, even if 0 packages parsed
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
        // Recurse into subdirectory
        const childNode = await scanDir(path.join(dirPath, entry.name), depth + 1);
        if (childNode) {
          children.push(childNode);
        }
      }
    }
    
    // Calculate package count for this folder (including all children)
    const localPackages = dependencyFiles.reduce((sum, f) => sum + f.packages.length, 0);
    const childPackages = children.reduce((sum, c) => sum + c.totalPackages, 0);
    const totalPackages = localPackages + childPackages;
    
    // Calculate project count (folders with dependency files)
    const isProject = dependencyFiles.length > 0;
    const localProjects = isProject ? 1 : 0;
    const childProjects = children.reduce((sum, c) => sum + c.totalProjects, 0);
    const totalProjects = localProjects + childProjects;
    
    // Only return a node if this folder has deps OR has children with deps
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
  
  const tree = await scanDir(rootPath);
  
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
}

// Parse dependency file and extract packages
async function parseDependencyFile(filePath, fileName) {
  const dependencies = [];
  
  try {
    // Check file size before reading (security measure)
    const stats = await fs.promises.stat(filePath);
    if (stats.size > MAX_FILE_SIZE) {
      console.warn('CVE Watch: Skipping large file:', filePath, `(${Math.round(stats.size / 1024 / 1024)}MB)`);
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
            version: version.replace(/^[\^~>=<]+/, ''),
            ecosystem: 'npm',
            type: pkg.devDependencies?.[name] ? 'dev' : 'prod'
          });
        }
        break;
      }
      
      case 'package-lock.json': {
        const lockfile = JSON.parse(content);
        // npm lockfile v2/v3 (npm 7+) - packages key with resolved versions
        if (lockfile.packages) {
          // Get the root package to find direct deps
          const rootPkg = lockfile.packages[''] || {};
          const directDeps = new Set([
            ...Object.keys(rootPkg.dependencies || {}),
            ...Object.keys(rootPkg.devDependencies || {})
          ]);
          
          // Extract only direct dependencies with their locked versions
          for (const [pkgPath, pkgInfo] of Object.entries(lockfile.packages)) {
            if (pkgPath.startsWith('node_modules/') && !pkgPath.includes('/node_modules/', 13)) {
              const pkgName = pkgPath.replace('node_modules/', '');
              if (directDeps.has(pkgName) && pkgInfo.version) {
                dependencies.push({
                  name: pkgName,
                  version: pkgInfo.version,
                  ecosystem: 'npm',
                  type: rootPkg.devDependencies?.[pkgName] ? 'dev' : 'prod'
                });
              }
            }
          }
        } 
        // npm lockfile v1 fallback
        else if (lockfile.dependencies) {
          for (const [name, info] of Object.entries(lockfile.dependencies)) {
            if (info.version) {
              dependencies.push({
                name,
                version: info.version,
                ecosystem: 'npm',
                type: info.dev ? 'dev' : 'prod'
              });
            }
          }
        }
        break;
      }
      
      case 'yarn.lock': {
        // Parse yarn.lock format: "package@version": \n  version "x.y.z"
        const blocks = content.split(/\n(?=[^\s])/);
        for (const block of blocks) {
          const nameMatch = block.match(/^"?([^@\n]+)@/);
          const versionMatch = block.match(/\n\s+version\s+"([^"]+)"/);
          if (nameMatch && versionMatch) {
            dependencies.push({
              name: nameMatch[1],
              version: versionMatch[1],
              ecosystem: 'npm',
              type: 'prod'
            });
          }
        }
        break;
      }
      
      case 'requirements.txt': {
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('-')) {
            // Parse: package==1.0.0 or package>=1.0.0 or just package
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
        // Simple TOML parsing for dependencies section
        const depsMatch = content.match(/\[dependencies\]([\s\S]*?)(?=\[|$)/);
        if (depsMatch) {
          const depsSection = depsMatch[1];
          const depLines = depsSection.split('\n');
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
      
      case 'Cargo.lock': {
        // Parse Cargo.lock format: [[package]] \n name = "x" \n version = "y"
        const packages = content.split('[[package]]');
        for (const pkg of packages) {
          const nameMatch = pkg.match(/name\s*=\s*"([^"]+)"/);
          const versionMatch = pkg.match(/version\s*=\s*"([^"]+)"/);
          if (nameMatch && versionMatch) {
            dependencies.push({
              name: nameMatch[1],
              version: versionMatch[1],
              ecosystem: 'cargo',
              type: 'prod'
            });
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
      
      case 'go.sum': {
        // Parse go.sum format: module/path v1.2.3 h1:hash
        const lines = content.split('\n');
        const seen = new Set();
        for (const line of lines) {
          const match = line.match(/^([^\s]+)\s+v([^\s/]+)/);
          if (match && !seen.has(match[1])) {
            seen.add(match[1]);
            dependencies.push({
              name: match[1],
              version: match[2],
              ecosystem: 'go',
              type: 'prod'
            });
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
      
      case 'Gemfile.lock': {
        // Parse Gemfile.lock - gems are listed under "specs:" with 4-space indent
        const specsMatch = content.match(/specs:\n([\s\S]*?)(?=\n\S|$)/);
        if (specsMatch) {
          const lines = specsMatch[1].split('\n');
          for (const line of lines) {
            // Top-level gems have 4-space indent, sub-deps have 6+
            const match = line.match(/^ {4}([a-zA-Z0-9_-]+)\s+\(([^)]+)\)/);
            if (match) {
              dependencies.push({
                name: match[1],
                version: match[2],
                ecosystem: 'rubygems',
                type: 'prod'
              });
            }
          }
        }
        break;
      }
      
      case 'Pipfile': {
        // Parse Pipfile TOML format
        const packagesMatch = content.match(/\[packages\]([\s\S]*?)(?=\[|$)/);
        const devMatch = content.match(/\[dev-packages\]([\s\S]*?)(?=\[|$)/);
        
        const parseSection = (section, isDev) => {
          if (!section) return;
          const lines = section.split('\n');
          for (const line of lines) {
            const match = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*"?([^"]+)"?/);
            if (match) {
              dependencies.push({
                name: match[1],
                version: match[2] === '*' ? 'latest' : match[2],
                ecosystem: 'pypi',
                type: isDev ? 'dev' : 'prod'
              });
            }
          }
        };
        
        parseSection(packagesMatch?.[1], false);
        parseSection(devMatch?.[1], true);
        break;
      }
      
      case 'Pipfile.lock': {
        // Pipfile.lock is JSON
        const lockfile = JSON.parse(content);
        const parseDeps = (deps, isDev) => {
          for (const [name, info] of Object.entries(deps || {})) {
            dependencies.push({
              name,
              version: info.version?.replace(/^==/, '') || 'locked',
              ecosystem: 'pypi',
              type: isDev ? 'dev' : 'prod'
            });
          }
        };
        parseDeps(lockfile.default, false);
        parseDeps(lockfile.develop, true);
        break;
      }
      
      case 'pyproject.toml': {
        // Parse pyproject.toml - look for [project] dependencies or [tool.poetry.dependencies]
        const projectDeps = content.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/);
        const poetryDeps = content.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(?=\[|$)/);
        
        if (projectDeps) {
          // PEP 621 format: dependencies = ["package>=1.0", ...]
          const matches = projectDeps[1].matchAll(/"([a-zA-Z0-9_-]+)([><=!]+)?([^"]+)?"/g);
          for (const match of matches) {
            dependencies.push({
              name: match[1],
              version: match[3] || 'latest',
              ecosystem: 'pypi',
              type: 'prod'
            });
          }
        }
        
        if (poetryDeps) {
          // Poetry format: package = "^1.0" or package = {version = "^1.0"}
          const lines = poetryDeps[1].split('\n');
          for (const line of lines) {
            const simpleMatch = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"/);
            const complexMatch = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*\{.*version\s*=\s*"([^"]+)"/);
            const match = simpleMatch || complexMatch;
            if (match && match[1] !== 'python') {
              dependencies.push({
                name: match[1],
                version: match[2].replace(/^[\^~>=<]+/, ''),
                ecosystem: 'pypi',
                type: 'prod'
              });
            }
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
              version: version.replace(/^[\^~>=<]+/, ''),
              ecosystem: 'composer',
              type: pkg['require-dev']?.[name] ? 'dev' : 'prod'
            });
          }
        }
        break;
      }
      
      case 'pubspec.yaml': {
        // Basic YAML parsing for dependencies
        const depsMatch = content.match(/dependencies:\s*\n((?:\s+[^\n]+\n?)*)/);
        if (depsMatch) {
          const lines = depsMatch[1].split('\n');
          for (const line of lines) {
            const match = line.match(/^\s+([a-zA-Z0-9_]+):\s*(.+)?/);
            if (match && !match[1].startsWith('#')) {
              dependencies.push({
                name: match[1],
                version: match[2]?.trim() || 'latest',
                ecosystem: 'pub',
                type: 'prod'
              });
            }
          }
        }
        break;
      }
      
      case 'Podfile': {
        // Parse Podfile - pod 'Name', '~> 1.0'
        const lines = content.split('\n');
        for (const line of lines) {
          const match = line.match(/^\s*pod\s+['"]([^'"]+)['"]/);
          if (match) {
            const versionMatch = line.match(/,\s*['"]([^'"]+)['"]/);
            dependencies.push({
              name: match[1],
              version: versionMatch ? versionMatch[1] : 'latest',
              ecosystem: 'cocoapods',
              type: 'prod'
            });
          }
        }
        break;
      }
      
      case 'Podfile.lock': {
        // Parse Podfile.lock - PODS section lists pods with versions
        const podsMatch = content.match(/PODS:\n([\s\S]*?)(?=\n[A-Z]|$)/);
        if (podsMatch) {
          const lines = podsMatch[1].split('\n');
          for (const line of lines) {
            // Top-level pods have 2-space indent: "  - PodName (1.0.0)"
            const match = line.match(/^ {2}- ([^\s(]+)\s*\(([^)]+)\)/);
            if (match) {
              dependencies.push({
                name: match[1],
                version: match[2],
                ecosystem: 'cocoapods',
                type: 'prod'
              });
            }
          }
        }
        break;
      }
      
      case 'Package.swift': {
        // Parse Package.swift - .package(url: "...", from: "1.0.0")
        const matches = content.matchAll(/\.package\([^)]*url:\s*"[^"]*\/([^"\/]+?)(?:\.git)?"\s*,\s*(?:from:|\.upToNextMajor\(from:)\s*"([^"]+)"/g);
        for (const match of matches) {
          dependencies.push({
            name: match[1],
            version: match[2],
            ecosystem: 'swift',
            type: 'prod'
          });
        }
        break;
      }
      
      case 'build.gradle':
      case 'build.gradle.kts': {
        // Parse Gradle dependencies - implementation 'group:name:version' or implementation("group:name:version")
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
      
      case 'pom.xml': {
        // Parse Maven pom.xml - <dependency><groupId>...</groupId><artifactId>...</artifactId><version>...</version></dependency>
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
      
      // Fallback for unhandled but recognized files
    }
  } catch (err) {
    console.error('CVE Watch: Error parsing', filePath, err.message);
  }
  
  return dependencies;
}

// Create tray icon using the SVG file from assets
function createTrayIcon() {
  const svgName = 'tray-iconTemplate.svg';
  const svg2xName = 'tray-iconTemplate@2x.svg';
  
  // Try multiple possible paths for the SVG icon
  const possiblePaths = [
    path.join(__dirname, '..', 'assets', svgName),
    path.join(__dirname, 'assets', svgName),
    path.join(app.getAppPath(), 'assets', svgName),
    path.join(process.resourcesPath || '', 'assets', svgName)
  ];
  
  let icon = null;
  
  // Try to load SVG and convert to nativeImage
  for (const svgPath of possiblePaths) {
    try {
      if (fs.existsSync(svgPath)) {
        const svgContent = fs.readFileSync(svgPath, 'utf8');
        const svgBase64 = Buffer.from(svgContent).toString('base64');
        const dataUrl = `data:image/svg+xml;base64,${svgBase64}`;
        
        const testIcon = nativeImage.createFromDataURL(dataUrl);
        if (!testIcon.isEmpty()) {
          icon = testIcon;
          console.log('CVE Watch: Loaded SVG icon from:', svgPath);
          break;
        }
      }
    } catch (e) {
      console.log('CVE Watch: Failed to load SVG from:', svgPath, e.message);
      // Continue to next path
    }
  }
  
  // If no SVG found, try PNG fallback
  if (!icon || icon.isEmpty()) {
    const pngName = isMac ? 'tray-icon-Template.png' : 'tray-icon.png';
    const pngPaths = [
      path.join(__dirname, '..', 'assets', pngName),
      path.join(__dirname, 'assets', pngName),
      path.join(app.getAppPath(), 'assets', pngName),
      path.join(process.resourcesPath || '', 'assets', pngName)
    ];
    
    for (const pngPath of pngPaths) {
      try {
        const testIcon = nativeImage.createFromPath(pngPath);
        if (!testIcon.isEmpty()) {
          icon = testIcon;
          console.log('CVE Watch: Loaded PNG icon from:', pngPath);
          break;
        }
      } catch (e) {
        // Continue to next path
      }
    }
  }
  
  // If still no icon found, create a programmatic fallback
  if (!icon || icon.isEmpty()) {
    console.log('CVE Watch: Creating fallback icon programmatically');
    icon = createFallbackIcon();
  }
  
  // macOS: resize for menu bar and set as template
  if (isMac) {
    icon = icon.resize({ width: 18, height: 18 });
    icon.setTemplateImage(true);
  }
  
  console.log('CVE Watch: Tray icon ready, size:', icon.getSize());
  return icon;
}

// Create a shield with checkmark icon using raw pixels (matches our SVG)
function createFallbackIcon() {
  const size = 22;
  const buffer = Buffer.alloc(size * size * 4);
  
  const cx = size / 2;
  const strokeWidth = 1.4;
  
  // Helper to set a pixel with anti-aliasing
  const setPixel = (x, y, alpha) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (Math.floor(y) * size + Math.floor(x)) * 4;
    const currentAlpha = buffer[idx + 3];
    const newAlpha = Math.min(255, currentAlpha + alpha);
    buffer[idx] = 0;     // R (black for template)
    buffer[idx + 1] = 0; // G
    buffer[idx + 2] = 0; // B
    buffer[idx + 3] = newAlpha;
  };
  
  // Draw anti-aliased line using Xiaolin Wu's algorithm
  const drawLine = (x0, y0, x1, y1, width = strokeWidth) => {
    const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
    if (steep) {
      [x0, y0] = [y0, x0];
      [x1, y1] = [y1, x1];
    }
    if (x0 > x1) {
      [x0, x1] = [x1, x0];
      [y0, y1] = [y1, y0];
    }
    
    const dx = x1 - x0;
    const dy = y1 - y0;
    const gradient = dx === 0 ? 1 : dy / dx;
    
    let y = y0;
    for (let x = x0; x <= x1; x++) {
      for (let w = -width/2; w <= width/2; w += 0.5) {
        const py = y + w;
        const frac = py - Math.floor(py);
        if (steep) {
          setPixel(Math.floor(py), x, (1 - frac) * 255);
          setPixel(Math.floor(py) + 1, x, frac * 255);
        } else {
          setPixel(x, Math.floor(py), (1 - frac) * 255);
          setPixel(x, Math.floor(py) + 1, frac * 255);
        }
      }
      y += gradient;
    }
  };
  
  // Shield outline path (scaled from SVG viewBox 18x18 to 22x22)
  // SVG path: M9 1.5 L2.5 4.5 V9 C2.5 13 5.5 15.5 9 17 C12.5 15.5 15.5 13 15.5 9 V4.5 L9 1.5
  const scale = size / 18;
  const shieldPoints = [
    { x: 9 * scale, y: 1.5 * scale },      // Top center
    { x: 2.5 * scale, y: 4.5 * scale },    // Top left
    { x: 2.5 * scale, y: 9 * scale },      // Left side
  ];
  
  // Draw shield outline
  // Top: center to left
  drawLine(9 * scale, 2 * scale, 3 * scale, 4.5 * scale);
  // Top: center to right
  drawLine(9 * scale, 2 * scale, 15 * scale, 4.5 * scale);
  // Left side
  drawLine(3 * scale, 4.5 * scale, 3 * scale, 9 * scale);
  // Right side
  drawLine(15 * scale, 4.5 * scale, 15 * scale, 9 * scale);
  // Bottom left curve to point
  drawLine(3 * scale, 9 * scale, 5.5 * scale, 13 * scale);
  drawLine(5.5 * scale, 13 * scale, 9 * scale, 15.5 * scale);
  // Bottom right curve to point
  drawLine(15 * scale, 9 * scale, 12.5 * scale, 13 * scale);
  drawLine(12.5 * scale, 13 * scale, 9 * scale, 15.5 * scale);
  
  // Checkmark inside shield (centered in visual middle of shield)
  // SVG path: M6.5 6.5 L8.5 8.5 L12.5 4.5
  drawLine(6.5 * scale, 8 * scale, 8.5 * scale, 10 * scale, strokeWidth * 1.1);
  drawLine(8.5 * scale, 10 * scale, 12.5 * scale, 6 * scale, strokeWidth * 1.1);
  
  return nativeImage.createFromBuffer(buffer, {
    width: size,
    height: size,
    scaleFactor: 1.0
  });
}

function createWindow() {
  const windowConfig = {
    width: 420,
    height: 700,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    closable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    hasShadow: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  };

  // macOS-specific vibrancy
  if (isMac) {
    windowConfig.vibrancy = 'menu';
    windowConfig.visualEffectState = 'active';
    windowConfig.backgroundColor = '#00000000';
  }

  // Add sandbox mode for security
  windowConfig.webPreferences.sandbox = true;

  mainWindow = new BrowserWindow(windowConfig);

  // Load the app
  if (isDev) {
    debugLog('Running in DEVELOPMENT mode, loading from localhost:5173');
    mainWindow.loadURL('http://localhost:5173');
    // Uncomment to open dev tools automatically
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    debugLog('Running in PRODUCTION mode');
    debugLog('app.getAppPath() =', app.getAppPath());
    debugLog('__dirname =', __dirname);
    
    // In production, load from the built dist folder
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
    debugLog('Loading from:', indexPath);
    
    // Verify the file exists
    if (fs.existsSync(indexPath)) {
      debugLog('index.html found, loading...');
      mainWindow.loadFile(indexPath);
    } else {
      debugLog('ERROR: index.html NOT FOUND at:', indexPath);
      // Try alternative path (for development testing)
      const altPath = path.join(__dirname, '..', 'dist', 'index.html');
      debugLog('Trying alternative path:', altPath);
      if (fs.existsSync(altPath)) {
        debugLog('Found at alternative path, loading...');
        mainWindow.loadFile(altPath);
      } else {
        debugLog('ERROR: index.html NOT FOUND at alternative path either');
        mainWindow.loadURL(`data:text/html,<h1>Error: Could not find index.html</h1><p>Tried: ${indexPath}</p><p>And: ${altPath}</p>`);
      }
    }
  }

  // Hide window when it loses focus
  mainWindow.on('blur', () => {
    if (!mainWindow.webContents.isDevToolsOpened()) {
      hideWindow();
    }
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      hideWindow();
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('CVE Watch: Window content loaded');
    // Send current theme to renderer
    mainWindow.webContents.send('theme-changed', {
      shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
      themeSource: nativeTheme.themeSource
    });
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('CVE Watch: Failed to load window:', errorCode, errorDescription);
  });
}

function positionWindow() {
  if (!tray || !mainWindow) return;

  const trayBounds = tray.getBounds();
  const windowBounds = mainWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  
  // Position window centered below the tray icon
  let x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2));
  let y = Math.round(trayBounds.y + trayBounds.height + 4);

  // Keep window on screen
  if (x + windowBounds.width > display.bounds.x + display.bounds.width) {
    x = display.bounds.x + display.bounds.width - windowBounds.width - 10;
  }
  if (x < display.bounds.x) {
    x = display.bounds.x + 10;
  }

  mainWindow.setPosition(x, y, false);
}

function showWindow() {
  if (!mainWindow) return;
  positionWindow();
  mainWindow.show();
  mainWindow.focus();
}

function hideWindow() {
  if (!mainWindow) return;
  mainWindow.hide();
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    hideWindow();
  } else {
    showWindow();
  }
}

// Configure login item (start at login)
function setLoginItemSettings(openAtLogin) {
  if (!app.isPackaged) return;
  
  try {
    app.setLoginItemSettings({
      openAtLogin: openAtLogin,
      openAsHidden: true
    });
    console.log('CVE Watch: Login item set to', openAtLogin);
  } catch (err) {
    console.error('CVE Watch: Failed to set login item:', err);
  }
}

function createContextMenu() {
  return Menu.buildFromTemplate([
    { 
      label: 'Open CVE Watch', 
      click: () => showWindow() 
    },
    { type: 'separator' },
    { 
      label: 'Refresh CVEs', 
      click: () => {
        if (mainWindow) {
          showWindow();
          mainWindow.webContents.send('refresh-cves');
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Start at Login',
      type: 'checkbox',
      checked: store.get('openAtLogin') === true,
      click: (menuItem) => {
        store.set('openAtLogin', menuItem.checked);
        setLoginItemSettings(menuItem.checked);
      }
    },
    { type: 'separator' },
    { 
      label: 'Quit CVE Watch', 
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
}

// App ready
app.whenReady().then(() => {
  // Initialize debug log path now that app is ready
  debugLogPath = path.join(app.getPath('userData'), 'debug.log');
  // Clear old log file
  try { fs.writeFileSync(debugLogPath, ''); } catch (e) {}
  
  debugLog('=== CVE Watch Starting ===');
  debugLog('Platform:', process.platform);
  debugLog('Is packaged:', app.isPackaged);
  debugLog('isDev:', isDev);
  debugLog('NODE_ENV:', process.env.NODE_ENV);
  debugLog('App path:', app.getAppPath());
  debugLog('User data path:', app.getPath('userData'));
  debugLog('Debug log path:', debugLogPath);
  
  // Hide dock icon FIRST (before creating tray)
  if (isMac && app.dock) {
    app.dock.hide();
  }

  // Create tray icon
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('CVE Watch');
  
  console.log('CVE Watch: Tray created, bounds:', tray.getBounds());
  
  // Click handler - toggle window
  tray.on('click', (event, bounds) => {
    console.log('CVE Watch: Tray clicked');
    toggleWindow();
  });

  // Right-click handler - show context menu
  tray.on('right-click', () => {
    const contextMenu = createContextMenu();
    tray.popUpContextMenu(contextMenu);
  });

  // Create the main window
  createWindow();
  
  // Set login item based on stored preference
  if (store.get('openAtLogin') === true) {
    setLoginItemSettings(true);
  }

  // Listen for system theme changes
  nativeTheme.on('updated', () => {
    if (mainWindow) {
      mainWindow.webContents.send('theme-changed', {
        shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
        themeSource: nativeTheme.themeSource
      });
    }
  });

  console.log('CVE Watch: Initialization complete');
});

// IPC Handlers
ipcMain.handle('get-preferences', () => {
  return {
    products: store.get('products') || [],
    pollInterval: store.get('pollInterval') || 30,
    notifications: store.get('notifications') !== false,
    theme: store.get('theme') || 'system',
    openAtLogin: store.get('openAtLogin') === true
  };
});

// Allowed preference keys for security
const ALLOWED_PREFERENCE_KEYS = ['products', 'pollInterval', 'notifications', 'theme', 'openAtLogin'];

ipcMain.handle('set-preference', (event, key, value) => {
  // Validate key to prevent arbitrary store writes
  if (!ALLOWED_PREFERENCE_KEYS.includes(key)) {
    console.error('CVE Watch: Invalid preference key:', key);
    throw new Error('Invalid preference key');
  }
  
  store.set(key, value);
  
  if (key === 'openAtLogin') {
    setLoginItemSettings(value);
  }
  
  if (key === 'theme') {
    nativeTheme.themeSource = value;
  }
  
  return {
    products: store.get('products') || [],
    pollInterval: store.get('pollInterval') || 30,
    notifications: store.get('notifications') !== false,
    theme: store.get('theme') || 'system',
    openAtLogin: store.get('openAtLogin') === true
  };
});

ipcMain.handle('get-theme', () => {
  return {
    shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
    themeSource: nativeTheme.themeSource
  };
});

ipcMain.handle('set-theme', (event, theme) => {
  nativeTheme.themeSource = theme;
  store.set('theme', theme);
  return {
    shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
    themeSource: theme
  };
});

ipcMain.on('hide-window', () => {
  hideWindow();
});

ipcMain.on('quit-app', () => {
  isQuitting = true;
  app.quit();
});

// Validate URL before opening externally
function isValidExternalUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

ipcMain.on('show-notification', (event, { title, body, url }) => {
  if (store.get('notifications') === false) return;
  
  try {
    const notification = new Notification({
      title,
      body,
      silent: false
    });
    
    notification.on('click', () => {
      if (url && isValidExternalUrl(url)) {
        require('electron').shell.openExternal(url);
      }
    });
    
    notification.show();
  } catch (err) {
    console.error('CVE Watch: Failed to show notification:', err);
  }
});

// Projects Folder IPC Handlers
ipcMain.handle('select-projects-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Projects Folder',
    buttonLabel: 'Select Folder'
  });
  
  if (result.canceled || !result.filePaths[0]) {
    return null;
  }
  
  const folderPath = result.filePaths[0];
  
  // Validate the selected path (security check)
  const validation = await validatePath(folderPath);
  if (!validation.valid) {
    console.error('CVE Watch: Invalid folder selection:', validation.error);
    return { error: validation.error };
  }
  
  // Use the resolved real path (symlinks followed)
  const safePath = validation.realPath;
  store.set('projectsFolder', safePath);
  
  const scanResult = await scanProjectsFolder(safePath);
  store.set('scannedProjects', scanResult);
  store.set('lastProjectsScan', Date.now());
  
  return {
    ...scanResult,
    lastScan: Date.now()
  };
});

ipcMain.handle('get-projects-folder', () => {
  const folderPath = store.get('projectsFolder');
  const scanResult = store.get('scannedProjects');
  const lastScan = store.get('lastProjectsScan');
  
  if (!folderPath || !scanResult) return null;
  
  return {
    ...scanResult,
    lastScan
  };
});

ipcMain.handle('rescan-projects', async () => {
  const folderPath = store.get('projectsFolder');
  if (!folderPath) return null;
  
  try {
    const scanResult = await scanProjectsFolder(folderPath);
    store.set('scannedProjects', scanResult);
    store.set('lastProjectsScan', Date.now());
    
    return {
      ...scanResult,
      lastScan: Date.now()
    };
  } catch (err) {
    console.error('CVE Watch: Rescan failed:', err);
    return null;
  }
});

ipcMain.handle('clear-projects-folder', () => {
  store.delete('projectsFolder');
  store.delete('scannedProjects');
  store.delete('lastProjectsScan');
  return true;
});

// Prevent app from quitting when windows closed (menu bar app behavior)
app.on('window-all-closed', () => {
  // Don't quit - we're a menu bar app
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('activate', () => {
  if (mainWindow) {
    showWindow();
  }
});

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      showWindow();
    }
  });
}
