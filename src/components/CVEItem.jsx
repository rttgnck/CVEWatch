import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DOMPurify from 'dompurify';

// Sanitize text content to prevent XSS
function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  // DOMPurify with text-only config (no HTML allowed)
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

function CVEItem({ cve, compact = false }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Memoize sanitized description
  const safeDescription = useMemo(() => sanitizeText(cve.description), [cve.description]);

  const severityConfig = {
    CRITICAL: { bg: 'bg-severity-critical/20', text: 'text-severity-critical', icon: 'text-severity-critical' },
    HIGH: { bg: 'bg-severity-high/20', text: 'text-severity-high', icon: 'text-severity-high' },
    MEDIUM: { bg: 'bg-severity-medium/20', text: 'text-severity-medium', icon: 'text-severity-medium' },
    LOW: { bg: 'bg-severity-low/20', text: 'text-severity-low', icon: 'text-severity-low' },
  };

  const config = severityConfig[cve.severity] || { bg: 'bg-lp-surface', text: 'text-lp-text-muted', icon: 'text-lp-text-muted' };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString();
  };

  const openInBrowser = async (url) => {
    // Validate URL before sending to main process
    if (!url || typeof url !== 'string' || url.length > 2048) {
      console.warn('Invalid URL:', url);
      return;
    }
    
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        console.warn('Blocked non-http(s) URL:', url);
        return;
      }
      
      // Use Electron's shell.openExternal via IPC (validated in main process)
      if (window.electronAPI?.openExternal) {
        await window.electronAPI.openExternal(url);
      } else {
        // Fallback for browser environment (dev)
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      console.warn('Invalid URL:', url);
    }
  };

  // Compact mode for nested display in product sections
  if (compact) {
    return (
      <div
        className="cursor-pointer hover:bg-lp-hover/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Compact Main Row */}
        <div className="px-3 py-2.5 flex items-center gap-3">
          {/* Severity Indicator */}
          <div className={`w-1.5 h-8 rounded-full shrink-0 ${
            cve.severity === 'CRITICAL' ? 'bg-severity-critical' :
            cve.severity === 'HIGH' ? 'bg-severity-high' :
            cve.severity === 'MEDIUM' ? 'bg-severity-medium' :
            cve.severity === 'LOW' ? 'bg-severity-low' : 'bg-lp-text-muted'
          }`} />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-semibold text-lp-text">
                {cve.id}
              </span>
              <span className="text-[10px] text-lp-text-muted">
                {formatDate(cve.published)}
              </span>
            </div>
            <p className="text-[11px] text-lp-text-secondary line-clamp-1 leading-relaxed mt-0.5">
              {safeDescription}
            </p>
          </div>

          {/* Score Badge */}
          <span className={`severity-badge text-[10px] shrink-0 ${
            cve.severity === 'CRITICAL' ? 'severity-critical' :
            cve.severity === 'HIGH' ? 'severity-high' :
            cve.severity === 'MEDIUM' ? 'severity-medium' :
            cve.severity === 'LOW' ? 'severity-low' : 'severity-none'
          }`}>
            {cve.score ? cve.score.toFixed(1) : 'N/A'}
          </span>
        </div>

        {/* Compact Expanded Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 ml-4 border-l-2 border-lp-border">
                <p className="text-xs text-lp-text-secondary leading-relaxed mb-2 selectable">
                  {safeDescription}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openInBrowser(cve.url);
                    }}
                    className="lp-btn-primary text-[10px] px-2 py-1"
                  >
                    View on NVD
                  </button>
                  {cve.references?.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openInBrowser(cve.references[0].url);
                      }}
                      className="lp-btn-secondary text-[10px] px-2 py-1"
                    >
                      Reference
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <motion.div
      layout
      className="lp-card cursor-pointer overflow-hidden"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      {/* Main Row */}
      <div className="p-3 flex items-start gap-3">
        {/* Icon Box */}
        <div className={`lp-icon-box w-10 h-10 rounded-lg shrink-0 ${config.bg}`}>
          <svg className={`w-5 h-5 ${config.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-mono font-semibold text-lp-text">
              {cve.id}
            </span>
            {cve.matchedProduct && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-lp-elevated text-lp-text-secondary">
                {cve.matchedProduct}
              </span>
            )}
          </div>
          <p className="text-xs text-lp-text-secondary line-clamp-2 leading-relaxed">
            {safeDescription}
          </p>
        </div>

        {/* Score & Date */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`severity-badge ${
            cve.severity === 'CRITICAL' ? 'severity-critical' :
            cve.severity === 'HIGH' ? 'severity-high' :
            cve.severity === 'MEDIUM' ? 'severity-medium' :
            cve.severity === 'LOW' ? 'severity-low' : 'severity-none'
          }`}>
            {cve.score ? cve.score.toFixed(1) : 'N/A'}
          </span>
          <span className="text-[10px] text-lp-text-muted">
            {formatDate(cve.published)}
          </span>
        </div>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 border-t border-lp-border">
              {/* Score Details */}
              {cve.score && (
                <div className="flex items-center gap-3 mt-3 mb-3">
                  <span className="text-xs text-lp-text-muted">CVSS {cve.cvssVersion}:</span>
                  <span className={`text-sm font-bold ${config.text}`}>
                    {cve.score.toFixed(1)}
                  </span>
                  <span className={`severity-badge ${
                    cve.severity === 'CRITICAL' ? 'severity-critical' :
                    cve.severity === 'HIGH' ? 'severity-high' :
                    cve.severity === 'MEDIUM' ? 'severity-medium' :
                    cve.severity === 'LOW' ? 'severity-low' : 'severity-none'
                  }`}>
                    {cve.severity}
                  </span>
                </div>
              )}

              {/* Full Description */}
              <p className="text-xs text-lp-text-secondary leading-relaxed mb-3 selectable">
                {safeDescription}
              </p>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openInBrowser(cve.url);
                  }}
                  className="lp-btn-primary flex-1 text-xs"
                >
                  View on NVD
                </button>
                {cve.references?.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openInBrowser(cve.references[0].url);
                    }}
                    className="lp-btn-secondary text-xs"
                  >
                    Reference
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default CVEItem;
