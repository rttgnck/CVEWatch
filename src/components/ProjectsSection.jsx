import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CVEItem from './CVEItem';

// Ecosystem config for badges
const ECOSYSTEM_CONFIG = {
  npm: { color: 'text-pink-400', bg: 'bg-pink-400/10', label: 'npm' },
  pypi: { color: 'text-blue-400', bg: 'bg-blue-400/10', label: 'PyPI' },
  cargo: { color: 'text-orange-400', bg: 'bg-orange-400/10', label: 'Cargo' },
  go: { color: 'text-cyan-400', bg: 'bg-cyan-400/10', label: 'Go' },
  rubygems: { color: 'text-red-400', bg: 'bg-red-400/10', label: 'RubyGems' },
  maven: { color: 'text-rose-400', bg: 'bg-rose-400/10', label: 'Maven' },
  gradle: { color: 'text-slate-400', bg: 'bg-slate-400/10', label: 'Gradle' },
  composer: { color: 'text-amber-400', bg: 'bg-amber-400/10', label: 'Composer' },
  pub: { color: 'text-sky-400', bg: 'bg-sky-400/10', label: 'Pub' },
  swift: { color: 'text-orange-500', bg: 'bg-orange-500/10', label: 'Swift' },
  cocoapods: { color: 'text-red-500', bg: 'bg-red-500/10', label: 'CocoaPods' }
};

export default function ProjectsSection({ cves = [] }) {
  const [projectsData, setProjectsData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRootExpanded, setIsRootExpanded] = useState(true);
  const [expandedItems, setExpandedItems] = useState({});

  useEffect(() => {
    loadProjectsFolder();
  }, []);

  // Add CVEs to the tree structure
  const treeWithCVEs = useMemo(() => {
    if (!projectsData?.tree) return null;
    
    // Recursively process tree nodes and add CVEs
    function processNode(node) {
      const processedDeps = node.dependencyFiles.map(depFile => ({
        ...depFile,
        packages: depFile.packages.map(pkg => ({
          ...pkg,
          cves: findCVEsForPackage(pkg, cves)
        }))
      }));
      
      const processedChildren = node.children.map(child => processNode(child));
      
      // Calculate CVE count for this node
      let cveCount = 0;
      for (const depFile of processedDeps) {
        for (const pkg of depFile.packages) {
          cveCount += pkg.cves.length;
        }
      }
      for (const child of processedChildren) {
        cveCount += child.cveCount;
      }
      
      return {
        ...node,
        dependencyFiles: processedDeps,
        children: processedChildren,
        cveCount
      };
    }
    
    return processNode(projectsData.tree);
  }, [projectsData, cves]);

  // Calculate totals
  const totals = useMemo(() => {
    if (!treeWithCVEs) return { projects: 0, packages: 0, cves: 0 };
    return {
      projects: projectsData?.totalProjects || 0,
      packages: projectsData?.totalPackages || 0,
      cves: treeWithCVEs.cveCount || 0
    };
  }, [projectsData, treeWithCVEs]);

  const loadProjectsFolder = async () => {
    if (!window.electronAPI) return;
    const data = await window.electronAPI.getProjectsFolder();
    if (data) {
      setProjectsData(data);
    }
  };

  const handleSelectFolder = async () => {
    if (!window.electronAPI) return;
    setIsLoading(true);
    try {
      const result = await window.electronAPI.selectProjectsFolder();
      if (result) {
        setProjectsData(result);
        setIsRootExpanded(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRescan = async (e) => {
    e.stopPropagation();
    if (!window.electronAPI) return;
    setIsLoading(true);
    try {
      const result = await window.electronAPI.rescanProjects();
      if (result) {
        setProjectsData(result);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async (e) => {
    e.stopPropagation();
    if (!window.electronAPI) return;
    await window.electronAPI.clearProjectsFolder();
    setProjectsData(null);
    setExpandedItems({});
  };

  const toggleExpanded = (id) => {
    setExpandedItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const formatLastScan = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div>
      {/* Section Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-lp-border bg-lp-surface/50">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-lp-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
          <span className="text-sm font-semibold text-lp-text">Project Scanner</span>
        </div>
        {totals.cves > 0 && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-severity-critical/20 text-severity-critical">
            {totals.cves} CVEs
          </span>
        )}
      </div>

      {/* No folder selected state */}
      {!projectsData ? (
        <div className="px-4 py-6 text-center">
          <div className="mb-3">
            <svg className="w-8 h-8 mx-auto text-lp-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
            </svg>
          </div>
          <p className="text-xs text-lp-text-secondary mb-4 max-w-[220px] mx-auto">
            Scan a folder to automatically detect and track project dependencies.
          </p>
          <button
            onClick={handleSelectFolder}
            disabled={isLoading}
            className="lp-btn-primary text-xs inline-flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <motion.svg
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </motion.svg>
                Scanning...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
                Select Projects Folder
              </>
            )}
          </button>
        </div>
      ) : (
        /* Main folder tree */
        <div className="py-2">
          {/* Root Level - Main Projects Folder */}
          <RootFolder
            tree={treeWithCVEs}
            rootName={projectsData?.rootName}
            isExpanded={isRootExpanded}
            onToggle={() => setIsRootExpanded(!isRootExpanded)}
            expandedItems={expandedItems}
            toggleExpanded={toggleExpanded}
            totals={totals}
            isLoading={isLoading}
            onRescan={handleRescan}
            onClear={handleClear}
            formatLastScan={formatLastScan}
            lastScan={projectsData?.lastScan}
          />
        </div>
      )}
    </div>
  );
}

/* Level 1: Root Projects Folder */
function RootFolder({ 
  tree,
  rootName,
  isExpanded, 
  onToggle, 
  expandedItems, 
  toggleExpanded, 
  totals,
  isLoading,
  onRescan,
  onClear,
  formatLastScan,
  lastScan
}) {
  return (
    <div>
      {/* Root Header */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-lp-hover/50 transition-colors"
      >
        {/* Expand Icon */}
        <motion.svg
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="w-3.5 h-3.5 text-lp-text-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </motion.svg>

        {/* Folder Icon */}
        <svg className={`w-4 h-4 ${isExpanded ? 'text-lp-orange' : 'text-amber-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          {isExpanded ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          )}
        </svg>

        {/* Folder Name */}
        <span className="text-sm font-medium text-lp-text">{rootName}</span>

        {/* Stats */}
        <span className="text-[10px] text-lp-text-muted ml-auto mr-2">
          {totals.projects} projects · {totals.packages} packages
        </span>

        {/* CVE Badge */}
        {totals.cves > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-severity-critical/20 text-severity-critical">
            {totals.cves}
          </span>
        )}

        {/* Actions */}
        <div className="flex gap-1 ml-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={onRescan}
            disabled={isLoading}
            className="p-1 rounded hover:bg-lp-hover text-lp-text-muted hover:text-lp-text transition-colors"
            title="Rescan"
          >
            <motion.svg
              animate={isLoading ? { rotate: 360 } : {}}
              transition={isLoading ? { duration: 1, repeat: Infinity, ease: 'linear' } : {}}
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </motion.svg>
          </button>
          <button
            onClick={onClear}
            className="p-1 rounded hover:bg-lp-hover text-lp-text-muted hover:text-severity-critical transition-colors"
            title="Remove folder"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </button>

      {/* Root Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Last Scan Info */}
            {lastScan && (
              <div className="px-4 py-1.5 flex items-center gap-1.5 text-[10px] text-lp-text-muted">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Last scanned {formatLastScan(lastScan)}
              </div>
            )}

            {/* Tree Content */}
            {!tree ? (
              <div className="px-4 py-4 text-center text-xs text-lp-text-secondary">
                No projects with recognized dependency files found.
              </div>
            ) : (
              <div className="pl-4">
                {/* Render dependency files at root level */}
                {tree.dependencyFiles.length > 0 && (
                  <div className="border-l border-lp-border/50 ml-2">
                    {tree.dependencyFiles.map((depFile, idx) => (
                      <DependencyFile
                        key={depFile.filePath}
                        depFile={depFile}
                        expandedItems={expandedItems}
                        toggleExpanded={toggleExpanded}
                        index={idx}
                      />
                    ))}
                  </div>
                )}
                
                {/* Render child folders */}
                {tree.children.length > 0 && (
                  <div className="border-l border-lp-border/50 ml-2">
                    {tree.children.map((child, idx) => (
                      <FolderNode
                        key={child.id}
                        node={child}
                        expandedItems={expandedItems}
                        toggleExpanded={toggleExpanded}
                        depth={1}
                        index={idx}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* Recursive Folder Node */
function FolderNode({ node, expandedItems, toggleExpanded, depth, index }) {
  const isExpanded = expandedItems[node.id];
  const hasContent = node.dependencyFiles.length > 0 || node.children.length > 0;
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02 }}
    >
      {/* Folder Header */}
      <button
        onClick={() => toggleExpanded(node.id)}
        className="w-full pl-4 pr-4 py-2 flex items-center gap-2 hover:bg-lp-hover/50 transition-colors"
      >
        <motion.svg
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="w-3 h-3 text-lp-text-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </motion.svg>

        <svg className={`w-4 h-4 ${isExpanded ? 'text-amber-400' : 'text-amber-500/70'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          {isExpanded ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          )}
        </svg>

        <span className="text-sm font-medium text-lp-text">{node.name}</span>

        <span className="text-[10px] text-lp-text-muted ml-auto mr-1">
          {node.totalPackages} packages
        </span>

        {node.cveCount > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-severity-high/20 text-severity-high">
            {node.cveCount}
          </span>
        )}
      </button>

      {/* Folder Content */}
      <AnimatePresence>
        {isExpanded && hasContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="ml-4 border-l border-lp-border/30">
              {/* Dependency files in this folder */}
              {node.dependencyFiles.map((depFile, idx) => (
                <DependencyFile
                  key={depFile.filePath}
                  depFile={depFile}
                  expandedItems={expandedItems}
                  toggleExpanded={toggleExpanded}
                  index={idx}
                />
              ))}
              
              {/* Child folders */}
              {node.children.map((child, idx) => (
                <FolderNode
                  key={child.id}
                  node={child}
                  expandedItems={expandedItems}
                  toggleExpanded={toggleExpanded}
                  depth={depth + 1}
                  index={idx}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* Dependency File (package.json, requirements.txt, etc.) */
function DependencyFile({ depFile, expandedItems, toggleExpanded, index }) {
  const fileId = depFile.filePath;
  const isExpanded = expandedItems[fileId];
  const ecosystem = ECOSYSTEM_CONFIG[depFile.ecosystem] || { color: 'text-lp-text-muted', bg: 'bg-lp-surface', label: depFile.ecosystem };
  
  const fileCVECount = useMemo(() => {
    return depFile.packages.reduce((sum, pkg) => sum + pkg.cves.length, 0);
  }, [depFile]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.02 }}
    >
      {/* File Header */}
      <button
        onClick={() => toggleExpanded(fileId)}
        className="w-full pl-4 pr-4 py-1.5 flex items-center gap-2 hover:bg-lp-hover/50 transition-colors"
      >
        <motion.svg
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="w-3 h-3 text-lp-text-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </motion.svg>

        <svg className="w-4 h-4 text-lp-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>

        <span className="text-xs font-medium text-lp-text">{depFile.fileName}</span>

        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${ecosystem.bg} ${ecosystem.color}`}>
          {ecosystem.label}
        </span>

        <span className="text-[10px] text-lp-text-muted ml-auto mr-1">
          {depFile.packages.length} packages
        </span>

        {fileCVECount > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-severity-medium/20 text-severity-medium">
            {fileCVECount}
          </span>
        )}
      </button>

      {/* File Content - Packages */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="ml-4 border-l border-lp-border/30">
              {depFile.packages.map((pkg, idx) => (
                <PackageItem
                  key={pkg.id}
                  pkg={pkg}
                  ecosystem={depFile.ecosystem}
                  expandedItems={expandedItems}
                  toggleExpanded={toggleExpanded}
                  index={idx}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* Individual Package */
function PackageItem({ pkg, ecosystem, expandedItems, toggleExpanded, index }) {
  const pkgId = `pkg-${pkg.id}`;
  const isExpanded = expandedItems[pkgId];
  const hasCVEs = pkg.cves.length > 0;
  const ecosystemConfig = ECOSYSTEM_CONFIG[ecosystem] || { color: 'text-lp-text-muted' };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.01 }}
      className={hasCVEs ? 'bg-severity-high/5' : ''}
    >
      {/* Package Header */}
      <button
        onClick={() => hasCVEs && toggleExpanded(pkgId)}
        className={`w-full pl-4 pr-4 py-1.5 flex items-center gap-2 transition-colors ${
          hasCVEs ? 'hover:bg-severity-high/10 cursor-pointer' : 'cursor-default'
        }`}
      >
        {/* Expand Icon - only show if has CVEs */}
        {hasCVEs ? (
          <motion.svg
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.15 }}
            className="w-2.5 h-2.5 text-lp-text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </motion.svg>
        ) : (
          <span className="w-2.5" />
        )}

        {/* Package Icon */}
        <svg className={`w-3.5 h-3.5 ${ecosystemConfig.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>

        <span className="text-xs font-medium text-lp-text">{pkg.name}</span>

        <span className="text-[10px] font-mono text-lp-text-muted bg-lp-surface px-1.5 py-0.5 rounded">
          {pkg.version}
        </span>

        {pkg.type === 'dev' && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-indigo-500/10 text-indigo-400 uppercase font-medium">
            dev
          </span>
        )}

        <span className="flex-1" />

        {hasCVEs ? (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-severity-critical/20 text-severity-critical">
            {pkg.cves.length} CVE{pkg.cves.length !== 1 ? 's' : ''}
          </span>
        ) : (
          <svg className="w-3.5 h-3.5 text-lp-green/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        )}
      </button>

      {/* CVEs for this package */}
      <AnimatePresence>
        {isExpanded && hasCVEs && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="ml-6 pl-4 border-l border-lp-border/30 py-1 space-y-1">
              {pkg.cves
                .sort((a, b) => {
                  const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };
                  return (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4);
                })
                .map((cve, idx) => (
                  <motion.div
                    key={cve.id}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                  >
                    <CVEItem cve={cve} compact />
                  </motion.div>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Helper functions
function findCVEsForPackage(pkg, cves) {
  if (!cves || cves.length === 0) return [];
  
  const pkgNameLower = pkg.name.toLowerCase();
  
  return cves.filter(cve => {
    // Match by product name (exact match)
    if (cve.matchedProduct?.toLowerCase() === pkgNameLower) return true;
    // Match by vendor name
    if (cve.vendor?.toLowerCase() === pkgNameLower) return true;
    // Match partial in product name
    if (cve.matchedProduct?.toLowerCase().includes(pkgNameLower)) return true;
    return false;
  });
}
