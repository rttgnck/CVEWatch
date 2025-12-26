import React from 'react';
import { motion } from 'framer-motion';

function Header({ activeView, onViewChange, lastUpdated, onRefresh, isLoading, cveCount }) {
  const formatLastUpdated = () => {
    if (!lastUpdated) return 'Never';
    const now = new Date();
    const diff = Math.floor((now - lastUpdated) / 1000);
    if (diff < 60) return 'Just now';
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins}:${String(diff % 60).padStart(2, '0')} ago`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m ago`;
  };

  const formatTime = () => {
    if (!lastUpdated) return '';
    return lastUpdated.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  return (
    <header className="px-4 pt-4 pb-3">
      {/* Top Row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="lp-icon-box w-10 h-10 bg-lp-orange/20 rounded-xl">
            <svg className="w-5 h-5 text-lp-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lp-text font-semibold text-base tracking-tight">CVE Watch</h1>
            <p className="text-xs text-lp-text-muted">
              Last scan: {formatTime() || 'Never'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onRefresh}
            disabled={isLoading}
            className="lp-btn-ghost p-2 rounded-lg disabled:opacity-50"
            title="Refresh"
          >
            <motion.svg 
              animate={isLoading ? { rotate: 360 } : {}}
              transition={isLoading ? { duration: 1, repeat: Infinity, ease: 'linear' } : {}}
              className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </motion.svg>
          </motion.button>
          
          <button
            onClick={() => onViewChange(activeView === 'settings' ? 'feed' : 'settings')}
            className={`p-2 rounded-lg transition-colors ${
              activeView === 'settings' 
                ? 'bg-lp-orange/20 text-lp-orange' 
                : 'lp-btn-ghost'
            }`}
            title="Settings"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
            </svg>
          </button>

          <button
            onClick={() => window.electronAPI?.hideWindow()}
            className="lp-btn-ghost p-2 rounded-lg"
            title="Close (Esc)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Back Button for sub-views */}
      {activeView !== 'feed' && (
        <button
          onClick={() => onViewChange('feed')}
          className="flex items-center gap-1 text-sm text-lp-orange hover:text-lp-orange-hover transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Feed
        </button>
      )}
    </header>
  );
}

export default Header;
