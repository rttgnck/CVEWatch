import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { usePreferences } from './PreferencesContext';
import { fetchCVEsForProducts } from '../services/nvdService';
import DOMPurify from 'dompurify';

const CVEContext = createContext();

// Minimum time between manual refreshes (10 seconds)
const MIN_REFRESH_INTERVAL = 10000;

// Sanitize text for notifications (strip all HTML, then truncate)
function sanitizeForNotification(text, maxLength = 100) {
  if (typeof text !== 'string') return '';
  // Strip ALL HTML tags and attributes with strict config
  const sanitized = DOMPurify.sanitize(text, { 
    ALLOWED_TAGS: [], 
    ALLOWED_ATTR: [],
    KEEP_CONTENT: false  // Extra safety
  });
  // Now truncate the clean text
  if (sanitized.length > maxLength) {
    return sanitized.substring(0, maxLength) + '...';
  }
  return sanitized;
}

export function CVEProvider({ children }) {
  const { preferences } = usePreferences();
  const [cves, setCVEs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const seenCVEIds = useRef(new Set());
  const isFirstLoad = useRef(true);
  const abortControllerRef = useRef(null);
  const lastFetchTime = useRef(0);

  const fetchCVEs = useCallback(async (bypassRateLimit = false) => {
    // Rate limiting: prevent rapid manual refreshes
    const now = Date.now();
    if (!bypassRateLimit && !isFirstLoad.current && now - lastFetchTime.current < MIN_REFRESH_INTERVAL) {
      console.log('Refresh rate limited, please wait');
      return;
    }
    lastFetchTime.current = now;
    
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    if (!preferences.products || preferences.products.length === 0) {
      setCVEs([]);
      setIsLoading(false);
      return;
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsLoading(true);
    setError(null);

    try {
      console.log('Fetching CVEs for products:', preferences.products.map(p => p.name));
      const results = await fetchCVEsForProducts(preferences.products, 10, signal);
      
      // Check if aborted before updating state
      if (signal.aborted) return;
      
      console.log('Fetched CVEs:', results.length);
      
      // Check for new critical CVEs (after first load)
      if (!isFirstLoad.current && window.electronAPI && preferences.notifications) {
        const criticalCVEs = results.filter(cve => 
          (cve.severity === 'CRITICAL' || cve.severity === 'HIGH') &&
          !seenCVEIds.current.has(cve.id)
        );
        
        criticalCVEs.slice(0, 3).forEach(cve => {
          // Only pass URL if it's from NVD (defense in depth - main process also validates)
          const safeUrl = cve.url?.startsWith('https://nvd.nist.gov/') ? cve.url : undefined;
          window.electronAPI.showNotification(
            `${cve.severity} CVE: ${cve.id}`,
            sanitizeForNotification(cve.description, 100),
            safeUrl
          );
        });
      }
      
      // Mark all as seen
      results.forEach(cve => seenCVEIds.current.add(cve.id));
      isFirstLoad.current = false;
      
      setCVEs(results);
      setLastUpdated(new Date());
    } catch (err) {
      // Don't set error state if request was aborted
      if (err.name === 'AbortError' || err.message === 'Fetch aborted') {
        return;
      }
      console.error('Failed to fetch CVEs:', err);
      setError(err.message || 'Failed to fetch CVEs');
    } finally {
      // Only update loading state if not aborted
      if (!signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [preferences.products, preferences.notifications]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Fetch on mount and when products change
  useEffect(() => {
    fetchCVEs();
  }, [preferences.products]);

  // Set up polling interval (bypasses rate limit since it's automatic)
  useEffect(() => {
    const intervalMs = (preferences.pollInterval || 30) * 60 * 1000;
    const interval = setInterval(() => fetchCVEs(true), intervalMs);
    return () => clearInterval(interval);
  }, [preferences.pollInterval, fetchCVEs]);

  const refresh = useCallback(() => {
    fetchCVEs();
  }, [fetchCVEs]);

  return (
    <CVEContext.Provider value={{
      cves,
      isLoading,
      error,
      lastUpdated,
      refresh
    }}>
      {children}
    </CVEContext.Provider>
  );
}

export function useCVE() {
  const context = useContext(CVEContext);
  if (!context) {
    throw new Error('useCVE must be used within a CVEProvider');
  }
  return context;
}
