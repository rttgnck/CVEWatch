import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePreferences } from './contexts/PreferencesContext';
import { useCVE } from './contexts/CVEContext';
import Header from './components/Header';
import CVEList from './components/CVEList';
import ProductPicker from './components/ProductPicker';
import Settings from './components/Settings';
import EmptyState from './components/EmptyState';
import ProjectsSection from './components/ProjectsSection';

function App() {
  const { preferences } = usePreferences();
  const { cves, isLoading, error, lastUpdated, refresh } = useCVE();
  const [activeView, setActiveView] = useState('feed');
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (activeView !== 'feed') {
          setActiveView('feed');
        } else if (window.electronAPI) {
          window.electronAPI.hideWindow();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
        e.preventDefault();
        refresh();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeView, refresh]);

  // Listen for refresh from tray menu
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onRefreshCVEs?.(() => refresh());
    }
  }, [refresh]);

  const hasProducts = preferences.products && preferences.products.length > 0;
  
  // Filter CVEs
  const filteredCVEs = cves.filter(cve => {
    const matchesSearch = !searchQuery || 
      cve.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cve.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cve.matchedProduct?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesSeverity = severityFilter === 'all' || 
      cve.severity?.toLowerCase() === severityFilter.toLowerCase();
    
    return matchesSearch && matchesSeverity;
  });

  return (
    <div className="app-root w-full h-screen flex flex-col shadow-dropdown">
      {/* Header */}
      <Header 
        activeView={activeView}
        onViewChange={setActiveView}
        lastUpdated={lastUpdated}
        onRefresh={refresh}
        isLoading={isLoading}
        cveCount={cves.length}
      />

      {/* Search & Filters - only in feed view */}
      {activeView === 'feed' && (
        <div className="px-4 pb-3 space-y-3">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-lp-text-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search CVE, product, or description..."
              className="lp-input"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveView('products')}
                className="lp-pill-active"
              >
                <span className="w-2 h-2 rounded-full bg-white/80" />
                Products
              </button>
              
              <button
                onClick={() => setSeverityFilter(severityFilter === 'all' ? 'critical' : 'all')}
                className={severityFilter !== 'all' ? 'lp-pill-active' : 'lp-pill-inactive'}
              >
                ☆ Critical Only
              </button>
              
              <div className="lp-pill-inactive">
                <span>⌄</span>
                <span>Severity</span>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5">
              <span className={`lp-status ${hasProducts && !isLoading ? 'lp-status-active' : 'lp-status-inactive'}`} />
              <span className="text-sm text-lp-text-secondary">{cves.length} CVEs</span>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeView === 'feed' && (
            <motion.div
              key="feed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full flex flex-col"
            >
              {/* Projects Scanner Section - with its own scroll */}
              <div className="shrink-0 max-h-[60%] overflow-y-auto border-b border-lp-border">
                <ProjectsSection cves={cves} />
              </div>
              
              {/* User-Specified Products Section */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Section Header */}
                <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-lp-border bg-lp-surface/50">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-lp-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                    </svg>
                    <span className="text-sm font-semibold text-lp-text">Tracked Products</span>
                  </div>
                  {filteredCVEs.length > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-lp-blue/20 text-lp-blue">
                      {filteredCVEs.length} CVEs
                    </span>
                  )}
                </div>
                
                {/* CVE List with its own scroll */}
                <div className="flex-1 overflow-y-auto">
                  {!hasProducts ? (
                    <EmptyState 
                      type="no-products"
                      onAction={() => setActiveView('products')}
                    />
                  ) : isLoading && cves.length === 0 ? (
                    <CVEList loading />
                  ) : error ? (
                    <EmptyState type="error" message={error} onAction={refresh} />
                  ) : filteredCVEs.length === 0 ? (
                    <EmptyState type={searchQuery ? 'no-results' : 'no-cves'} />
                  ) : (
                    <CVEList cves={filteredCVEs} isLoading={isLoading} />
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeView === 'products' && (
            <motion.div
              key="products"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <ProductPicker onClose={() => setActiveView('feed')} />
            </motion.div>
          )}

          {activeView === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <Settings onClose={() => setActiveView('feed')} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-lp-border flex items-center justify-between bg-lp-bg">
        <div className="flex items-center gap-2">
          <span className={`lp-status ${!isLoading && hasProducts ? 'lp-status-active' : 'lp-status-inactive'}`} />
          <span className="text-xs text-lp-text-secondary">
            {isLoading ? 'Fetching...' : 'Ready'}
          </span>
        </div>
        <span className="text-xs text-lp-text-muted">
          Auto-refresh: {preferences.pollInterval || 30}m
        </span>
      </div>
    </div>
  );
}

export default App;
