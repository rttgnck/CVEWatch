import React from 'react';
import { motion } from 'framer-motion';

function EmptyState({ type, message, onAction }) {
  const states = {
    'no-products': {
      icon: (
        <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      title: 'No Products Tracked',
      description: 'Add products to start monitoring CVEs for your tech stack.',
      actionLabel: 'Add Products',
    },
    'no-cves': {
      icon: (
        <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      title: 'All Clear!',
      description: 'No CVEs found for your tracked products. Check back later.',
      actionLabel: null,
    },
    'no-results': {
      icon: (
        <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
      title: 'No Results',
      description: 'No CVEs match your search query.',
      actionLabel: null,
    },
    'error': {
      icon: (
        <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
      title: 'Something Went Wrong',
      description: message || 'Failed to fetch CVEs. Check your connection.',
      actionLabel: 'Try Again',
    },
  };

  const state = states[type] || states['no-products'];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex flex-col items-center justify-center p-8 text-center"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="text-lp-text-muted mb-5"
      >
        {state.icon}
      </motion.div>

      <motion.h3
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="text-lg font-semibold text-lp-text mb-2"
      >
        {state.title}
      </motion.h3>

      <motion.p
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-sm text-lp-text-secondary mb-6 max-w-[280px]"
      >
        {state.description}
      </motion.p>

      {state.actionLabel && onAction && (
        <motion.button
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onAction}
          className="lp-btn-primary px-6"
        >
          {state.actionLabel}
        </motion.button>
      )}
    </motion.div>
  );
}

export default EmptyState;
