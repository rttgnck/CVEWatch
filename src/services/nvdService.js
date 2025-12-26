// NVD API v2.0 Service
// Documentation: https://nvd.nist.gov/developers/vulnerabilities

const NVD_API_BASE = 'https://services.nvd.nist.gov/rest/json/cves/2.0';

// Rate limiting: NVD allows 5 requests per 30 seconds without API key
// With API key: 50 requests per 30 seconds
const REQUEST_DELAY = 6500; // 6.5 seconds between requests (safe without API key)
const REQUEST_TIMEOUT = 30000; // 30 second timeout
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache
const BATCH_SIZE = 5; // Fetch 5 products in parallel

// Maximum lengths for string fields (security measure)
const MAX_CVE_ID_LENGTH = 30;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_URL_LENGTH = 2048;

// Simple in-memory cache
const cache = new Map();

// Validate NVD API response structure
function validateNVDResponse(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid API response: not an object');
  }
  
  if (!Array.isArray(data.vulnerabilities)) {
    // Could be empty response, which is valid
    if (data.vulnerabilities === undefined) {
      return { ...data, vulnerabilities: [] };
    }
    throw new Error('Invalid API response: vulnerabilities is not an array');
  }
  
  // Validate each vulnerability entry has required structure
  for (const vuln of data.vulnerabilities) {
    if (!vuln.cve || typeof vuln.cve !== 'object') {
      throw new Error('Invalid vulnerability entry: missing cve object');
    }
    if (!vuln.cve.id || typeof vuln.cve.id !== 'string') {
      throw new Error('Invalid vulnerability entry: missing cve.id');
    }
    // Validate CVE ID format (CVE-YYYY-NNNNN)
    if (!/^CVE-\d{4}-\d{4,}$/.test(vuln.cve.id)) {
      throw new Error(`Invalid CVE ID format: ${vuln.cve.id}`);
    }
    if (vuln.cve.id.length > MAX_CVE_ID_LENGTH) {
      throw new Error(`CVE ID too long: ${vuln.cve.id}`);
    }
  }
  
  return data;
}

// Sanitize a string field (truncate and remove control characters)
function sanitizeString(str, maxLength) {
  if (typeof str !== 'string') return '';
  // Remove control characters except newlines and tabs
  let sanitized = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '...';
  }
  return sanitized;
}

// Sanitize URL
function sanitizeUrl(url) {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (trimmed.length > MAX_URL_LENGTH) return '';
  // Only allow http/https URLs
  if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) {
    return '';
  }
  return trimmed;
}

// Helper to delay between requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Get cached result if still valid
function getCached(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

// Set cache with timestamp
function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// Parse CVSS score from CVE data
function parseCVSSScore(cve) {
  const metrics = cve.metrics || {};
  
  // Try CVSS 3.1 first, then 3.0, then 2.0
  if (metrics.cvssMetricV31?.length > 0) {
    return {
      score: metrics.cvssMetricV31[0].cvssData.baseScore,
      severity: metrics.cvssMetricV31[0].cvssData.baseSeverity,
      version: '3.1'
    };
  }
  
  if (metrics.cvssMetricV30?.length > 0) {
    return {
      score: metrics.cvssMetricV30[0].cvssData.baseScore,
      severity: metrics.cvssMetricV30[0].cvssData.baseSeverity,
      version: '3.0'
    };
  }
  
  if (metrics.cvssMetricV2?.length > 0) {
    const score = metrics.cvssMetricV2[0].cvssData.baseScore;
    // Convert V2 score to severity
    let severity = 'LOW';
    if (score >= 7.0) severity = 'HIGH';
    else if (score >= 4.0) severity = 'MEDIUM';
    
    return { score, severity, version: '2.0' };
  }
  
  return { score: null, severity: 'NONE', version: null };
}

// Parse CVE data into our format
function parseCVE(item) {
  const cve = item.cve;
  const cvssData = parseCVSSScore(cve);
  
  // Get description (prefer English) - sanitized
  const descriptions = cve.descriptions || [];
  const englishDesc = descriptions.find(d => d.lang === 'en');
  const rawDescription = englishDesc?.value || descriptions[0]?.value || 'No description available';
  const description = sanitizeString(rawDescription, MAX_DESCRIPTION_LENGTH);
  
  // Get affected products from configurations
  const configurations = cve.configurations || [];
  const affectedProducts = [];
  
  configurations.forEach(config => {
    config.nodes?.forEach(node => {
      node.cpeMatch?.forEach(match => {
        if (match.vulnerable && typeof match.criteria === 'string') {
          // Limit CPE string length
          affectedProducts.push(sanitizeString(match.criteria, 500));
        }
      });
    });
  });
  
  // Sanitize references
  const sanitizedRefs = (cve.references || [])
    .slice(0, 5)
    .map(ref => ({
      ...ref,
      url: sanitizeUrl(ref.url)
    }))
    .filter(ref => ref.url); // Remove invalid URLs
  
  return {
    id: cve.id, // Already validated in validateNVDResponse
    description,
    score: cvssData.score,
    severity: cvssData.severity,
    cvssVersion: cvssData.version,
    published: cve.published,
    lastModified: cve.lastModified,
    affectedProducts: affectedProducts.slice(0, 50), // Limit number of products
    references: sanitizedRefs,
    url: `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cve.id)}`
  };
}

// Fetch CVEs for a single product keyword with timeout
async function fetchCVEsForKeyword(keyword, resultsPerProduct = 10, signal = null) {
  // Check cache first
  const cacheKey = `${keyword}-${resultsPerProduct}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`Cache hit for ${keyword}`);
    return cached;
  }

  try {
    const params = new URLSearchParams({
      keywordSearch: keyword,
      resultsPerPage: resultsPerProduct.toString(),
      startIndex: '0'
    });
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    
    // Combine external signal with timeout signal
    const combinedSignal = signal 
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    
    const response = await fetch(`${NVD_API_BASE}?${params}`, {
      headers: {
        'Accept': 'application/json'
      },
      signal: combinedSignal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Rate limited by NVD. Please wait and try again.');
      }
      throw new Error(`NVD API error: ${response.status}`);
    }
    
    const rawData = await response.json();
    
    // Validate response structure before processing
    const data = validateNVDResponse(rawData);
    const cves = (data.vulnerabilities || []).map(parseCVE);
    
    // Cache the result
    setCache(cacheKey, cves);
    
    return cves;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout for ${keyword}`);
    }
    console.error(`Error fetching CVEs for ${keyword}:`, error);
    throw error;
  }
}

// Fetch CVEs for multiple products with rate limiting and batching
export async function fetchCVEsForProducts(products, resultsPerProduct = 10, signal = null) {
  if (!products || products.length === 0) {
    return [];
  }
  
  const allCVEs = [];
  const seenIds = new Set();
  
  // Process in batches
  for (let batchStart = 0; batchStart < products.length; batchStart += BATCH_SIZE) {
    // Check if aborted
    if (signal?.aborted) {
      throw new Error('Fetch aborted');
    }
    
    // Add delay between batches (except for first)
    if (batchStart > 0) {
      await delay(REQUEST_DELAY);
    }
    
    const batch = products.slice(batchStart, batchStart + BATCH_SIZE);
    
    // Fetch batch in parallel
    const batchPromises = batch.map(async (product) => {
      try {
        const cves = await fetchCVEsForKeyword(
          product.keyword || product.name, 
          resultsPerProduct,
          signal
        );
        return { product, cves };
      } catch (error) {
        console.error(`Failed to fetch CVEs for ${product.name}:`, error);
        return { product, cves: [] };
      }
    });
    
    const results = await Promise.all(batchPromises);
    
    // Deduplicate and add product source
    for (const { product, cves } of results) {
      cves.forEach(cve => {
        if (!seenIds.has(cve.id)) {
          seenIds.add(cve.id);
          allCVEs.push({
            ...cve,
            matchedProduct: product.name
          });
        }
      });
    }
  }
  
  // Sort by published date (newest first)
  allCVEs.sort((a, b) => new Date(b.published) - new Date(a.published));
  
  return allCVEs;
}

// Clear the cache (useful for force refresh)
export function clearCache() {
  cache.clear();
}

// Search for products in CPE dictionary (for autocomplete)
export async function searchProducts(query) {
  // For now, return from our predefined list
  // In a full implementation, you'd query the CPE API
  return [];
}
