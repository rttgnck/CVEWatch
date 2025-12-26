import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePreferences } from '../contexts/PreferencesContext';
import { PRODUCTS_BY_CATEGORY } from '../data/products';

function ProductPicker({ onClose }) {
  const { preferences, addProduct, removeProduct } = usePreferences();
  const [searchQuery, setSearchQuery] = useState('');
  const [customKeyword, setCustomKeyword] = useState('');
  const [expandedCategory, setExpandedCategory] = useState(null);

  const selectedIds = new Set(preferences.products?.map(p => p.id) || []);

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return PRODUCTS_BY_CATEGORY;
    
    const query = searchQuery.toLowerCase();
    const result = {};
    
    Object.entries(PRODUCTS_BY_CATEGORY).forEach(([category, products]) => {
      const filtered = products.filter(p => 
        p.name.toLowerCase().includes(query) ||
        p.keyword.toLowerCase().includes(query)
      );
      if (filtered.length > 0) {
        result[category] = filtered;
      }
    });
    
    return result;
  }, [searchQuery]);

  const handleToggleProduct = (product) => {
    if (selectedIds.has(product.id)) {
      removeProduct(product.id);
    } else {
      addProduct(product);
    }
  };

  const handleAddCustom = () => {
    if (!customKeyword.trim()) return;
    
    const product = {
      id: `custom-${crypto.randomUUID()}`,
      name: customKeyword.trim(),
      keyword: customKeyword.trim(),
      isCustom: true
    };
    
    addProduct(product);
    setCustomKeyword('');
  };

  return (
    <div className="h-full flex flex-col">
      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-lp-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products..."
            className="lp-input pl-10"
          />
        </div>
      </div>

      {/* Selected Products */}
      {preferences.products?.length > 0 && (
        <div className="px-4 pb-3">
          <div className="lp-category">
            <div className="lp-category-dot bg-lp-green" />
            <span className="text-lp-green">Tracked</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-lp-green/20 text-lp-green">
              {preferences.products.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <AnimatePresence mode="popLayout">
              {preferences.products.map((product) => (
                <motion.button
                  key={product.id}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => removeProduct(product.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-lp-orange text-white text-xs font-medium hover:bg-lp-orange-hover transition-colors"
                >
                  {product.name}
                  <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Category List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {Object.entries(filteredCategories).map(([category, products]) => (
          <div key={category} className="mb-3">
            <button
              onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
              className="w-full flex items-center justify-between py-2 text-xs font-semibold uppercase tracking-wider text-lp-text-secondary hover:text-lp-text transition-colors"
            >
              <span>{category}</span>
              <div className="flex items-center gap-2">
                <span className="text-lp-text-muted">{products.length}</span>
                <motion.svg 
                  animate={{ rotate: expandedCategory === category || searchQuery ? 180 : 0 }}
                  className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </motion.svg>
              </div>
            </button>
            
            <AnimatePresence>
              {(expandedCategory === category || searchQuery) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-2 gap-1.5 pb-2">
                    {products.map((product) => {
                      const isSelected = selectedIds.has(product.id);
                      return (
                        <motion.button
                          key={product.id}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => handleToggleProduct(product)}
                          className={`lp-card py-2.5 px-3 text-left text-sm transition-all ${
                            isSelected 
                              ? '!bg-lp-orange !border-lp-orange text-white' 
                              : ''
                          }`}
                        >
                          <div className={`font-medium truncate ${isSelected ? 'text-white' : 'text-lp-text'}`}>
                            {product.name}
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}

        {/* Custom Keyword */}
        <div className="mt-4 pt-4 border-t border-lp-border">
          <div className="lp-category">
            <div className="lp-category-dot bg-lp-purple" />
            <span className="text-lp-purple">Custom Keyword</span>
          </div>
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={customKeyword}
              onChange={(e) => setCustomKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
              placeholder="e.g. my-library"
              className="lp-input flex-1 text-sm py-2.5"
            />
            <button
              onClick={handleAddCustom}
              disabled={!customKeyword.trim()}
              className="lp-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductPicker;
