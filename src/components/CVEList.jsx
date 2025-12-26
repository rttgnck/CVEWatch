import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CVEItem from './CVEItem';

function CVEList({ cves = [], loading = false, isLoading = false }) {
  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
        {[...Array(3)].map((_, i) => (
          <SkeletonProductSection key={i} delay={i * 0.1} />
        ))}
      </div>
    );
  }

  // Group CVEs by matched product
  const groupedByProduct = cves.reduce((acc, cve) => {
    const productName = cve.matchedProduct || 'Unknown';
    if (!acc[productName]) {
      acc[productName] = [];
    }
    acc[productName].push(cve);
    return acc;
  }, {});

  // Sort products by total CVE count (most CVEs first)
  const sortedProducts = Object.entries(groupedByProduct).sort(
    ([, a], [, b]) => b.length - a.length
  );

  return (
    <div className="flex-1 overflow-y-auto px-4 py-2">
      {/* Loading Banner */}
      {isLoading && cves.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mb-3 px-3 py-2 bg-lp-orange/10 border border-lp-orange/20 rounded-xl"
        >
          <div className="flex items-center gap-2 text-sm text-lp-orange">
            <motion.svg 
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-4 h-4" fill="none" viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </motion.svg>
            Fetching latest CVEs...
          </div>
        </motion.div>
      )}

      {/* Product Sections */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {sortedProducts.map(([productName, productCVEs], index) => (
            <motion.div
              key={productName}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15, delay: index * 0.05 }}
              layout
            >
              <ProductSection 
                productName={productName} 
                cves={productCVEs} 
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ProductSection({ productName, cves }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate severity stats
  const stats = {
    critical: cves.filter(c => c.severity === 'CRITICAL').length,
    high: cves.filter(c => c.severity === 'HIGH').length,
    medium: cves.filter(c => c.severity === 'MEDIUM').length,
    low: cves.filter(c => c.severity === 'LOW').length,
    other: cves.filter(c => !c.severity || c.severity === 'NONE').length,
  };

  const totalCount = cves.length;
  const hasCritical = stats.critical > 0;
  const hasHigh = stats.high > 0;

  return (
    <motion.div 
      layout
      className="lp-card overflow-hidden"
    >
      {/* Product Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex items-center gap-3 hover:bg-lp-hover/50 transition-colors"
      >
        {/* Product Icon */}
        <div className={`lp-icon-box w-10 h-10 rounded-lg shrink-0 ${
          hasCritical ? 'bg-severity-critical/20' : 
          hasHigh ? 'bg-severity-high/20' : 
          'bg-lp-elevated'
        }`}>
          <svg className={`w-5 h-5 ${
            hasCritical ? 'text-severity-critical' : 
            hasHigh ? 'text-severity-high' : 
            'text-lp-text-secondary'
          }`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
          </svg>
        </div>

        {/* Product Info */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-lp-text truncate">
              {productName}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-lp-elevated text-lp-text-secondary">
              {totalCount} CVE{totalCount !== 1 ? 's' : ''}
            </span>
          </div>
          
          {/* Severity Stats */}
          <div className="flex items-center gap-2 mt-1">
            {stats.critical > 0 && (
              <span className="severity-stat severity-stat-critical">
                {stats.critical} Critical
              </span>
            )}
            {stats.high > 0 && (
              <span className="severity-stat severity-stat-high">
                {stats.high} High
              </span>
            )}
            {stats.medium > 0 && (
              <span className="severity-stat severity-stat-medium">
                {stats.medium} Med
              </span>
            )}
            {stats.low > 0 && (
              <span className="severity-stat severity-stat-low">
                {stats.low} Low
              </span>
            )}
          </div>
        </div>

        {/* Expand/Collapse Chevron */}
        <motion.svg 
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="w-5 h-5 text-lp-text-muted shrink-0" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>

      {/* Expanded CVE List */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-lp-border">
              {/* Sort CVEs by severity within product */}
              {[...cves]
                .sort((a, b) => {
                  const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };
                  return (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4);
                })
                .map((cve, index) => (
                  <motion.div
                    key={cve.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15, delay: index * 0.03 }}
                    className={index > 0 ? 'border-t border-lp-border/50' : ''}
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

function SkeletonProductSection({ delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay }}
      className="lp-card p-3"
    >
      <div className="flex items-center gap-3">
        <div className="skeleton w-10 h-10 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-32 rounded" />
          <div className="flex gap-2">
            <div className="skeleton h-3 w-16 rounded" />
            <div className="skeleton h-3 w-14 rounded" />
          </div>
        </div>
        <div className="skeleton h-5 w-5 rounded shrink-0" />
      </div>
    </motion.div>
  );
}

export default CVEList;
