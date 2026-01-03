import * as https from 'https';

export interface CVE {
    id: string;
    description: string;
    score: number | null;
    severity: string;
    cvssVersion: string | null;
    published: string;
    lastModified: string;
    affectedProducts: string[];
    references: Array<{ url: string }>;
    url: string;
    matchedProduct?: string;
}

export interface Product {
    id: string;
    name: string;
    keyword: string;
}

const NVD_API_BASE = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const REQUEST_TIMEOUT = 30000;
const REQUEST_DELAY = 6500; // Rate limiting
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 500;
const MAX_CVE_ID_LENGTH = 30;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_URL_LENGTH = 2048;

// Simple cache
const cache = new Map<string, { data: CVE[]; timestamp: number }>();

export class CVEService {
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private getCached(key: string): CVE[] | null {
        const cached = cache.get(key);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.data;
        }
        return null;
    }

    private setCache(key: string, data: CVE[]): void {
        if (cache.size >= MAX_CACHE_SIZE) {
            const entriesToRemove = Math.max(1, Math.floor(MAX_CACHE_SIZE * 0.1));
            const keys = Array.from(cache.keys());
            for (let i = 0; i < entriesToRemove && i < keys.length; i++) {
                cache.delete(keys[i]);
            }
        }
        cache.set(key, { data, timestamp: Date.now() });
    }

    private sanitizeString(str: string, maxLength: number): string {
        if (typeof str !== 'string') return '';
        let sanitized = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        if (sanitized.length > maxLength) {
            sanitized = sanitized.substring(0, maxLength) + '...';
        }
        return sanitized;
    }

    private sanitizeUrl(url: string): string {
        if (typeof url !== 'string') return '';
        const trimmed = url.trim();
        if (trimmed.length > MAX_URL_LENGTH) return '';
        if (!trimmed.startsWith('https://')) return '';
        return trimmed;
    }

    private parseCVSSScore(cve: any): { score: number | null; severity: string; version: string | null } {
        const metrics = cve.metrics || {};

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
            let severity = 'LOW';
            if (score >= 7.0) severity = 'HIGH';
            else if (score >= 4.0) severity = 'MEDIUM';
            return { score, severity, version: '2.0' };
        }

        return { score: null, severity: 'NONE', version: null };
    }

    private parseCVE(item: any): CVE {
        const cve = item.cve;
        const cvssData = this.parseCVSSScore(cve);

        const descriptions = cve.descriptions || [];
        const englishDesc = descriptions.find((d: any) => d.lang === 'en');
        const rawDescription = englishDesc?.value || descriptions[0]?.value || 'No description available';
        const description = this.sanitizeString(rawDescription, MAX_DESCRIPTION_LENGTH);

        const configurations = cve.configurations || [];
        const affectedProducts: string[] = [];

        configurations.forEach((config: any) => {
            config.nodes?.forEach((node: any) => {
                node.cpeMatch?.forEach((match: any) => {
                    if (match.vulnerable && typeof match.criteria === 'string') {
                        affectedProducts.push(this.sanitizeString(match.criteria, 500));
                    }
                });
            });
        });

        const sanitizedRefs = (cve.references || [])
            .slice(0, 5)
            .map((ref: any) => ({
                url: this.sanitizeUrl(ref.url)
            }))
            .filter((ref: any) => ref.url);

        return {
            id: cve.id,
            description,
            score: cvssData.score,
            severity: cvssData.severity,
            cvssVersion: cvssData.version,
            published: cve.published,
            lastModified: cve.lastModified,
            affectedProducts: affectedProducts.slice(0, 50),
            references: sanitizedRefs,
            url: `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cve.id)}`
        };
    }

    private validateNVDResponse(data: any): any {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid API response: not an object');
        }

        if (!Array.isArray(data.vulnerabilities)) {
            if (data.vulnerabilities === undefined) {
                return { ...data, vulnerabilities: [] };
            }
            throw new Error('Invalid API response: vulnerabilities is not an array');
        }

        for (const vuln of data.vulnerabilities) {
            if (!vuln.cve || typeof vuln.cve !== 'object') {
                throw new Error('Invalid vulnerability entry: missing cve object');
            }
            if (!vuln.cve.id || typeof vuln.cve.id !== 'string') {
                throw new Error('Invalid vulnerability entry: missing cve.id');
            }
            if (!/^CVE-\d{4}-\d{4,}$/.test(vuln.cve.id)) {
                throw new Error(`Invalid CVE ID format: ${vuln.cve.id}`);
            }
            if (vuln.cve.id.length > MAX_CVE_ID_LENGTH) {
                throw new Error(`CVE ID too long: ${vuln.cve.id}`);
            }
        }

        return data;
    }

    private fetchWithTimeout(url: string, timeout: number): Promise<any> {
        return new Promise((resolve, reject) => {
            const req = https.get(url, {
                headers: { 'Accept': 'application/json' }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Invalid JSON response'));
                    }
                });
            });

            req.on('error', reject);
            req.setTimeout(timeout, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
        });
    }

    private async fetchCVEsForKeyword(keyword: string, resultsPerProduct: number = 10): Promise<CVE[]> {
        const cacheKey = `${keyword}-${resultsPerProduct}`;
        const cached = this.getCached(cacheKey);
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

            const url = `${NVD_API_BASE}?${params}`;
            const rawData = await this.fetchWithTimeout(url, REQUEST_TIMEOUT);
            const data = this.validateNVDResponse(rawData);
            const cves = (data.vulnerabilities || []).map((item: any) => this.parseCVE(item));

            this.setCache(cacheKey, cves);
            return cves;
        } catch (error) {
            console.error(`Error fetching CVEs for ${keyword}:`, error);
            throw error;
        }
    }

    public async fetchCVEsForProducts(products: Product[], resultsPerProduct: number = 10): Promise<CVE[]> {
        if (!products || products.length === 0) {
            return [];
        }

        const allCVEs: CVE[] = [];
        const seenIds = new Set<string>();
        const BATCH_SIZE = 5;

        for (let batchStart = 0; batchStart < products.length; batchStart += BATCH_SIZE) {
            if (batchStart > 0) {
                await this.delay(REQUEST_DELAY);
            }

            const batch = products.slice(batchStart, batchStart + BATCH_SIZE);

            const batchPromises = batch.map(async (product) => {
                try {
                    const cves = await this.fetchCVEsForKeyword(
                        product.keyword || product.name,
                        resultsPerProduct
                    );
                    return { product, cves };
                } catch (error) {
                    console.error(`Failed to fetch CVEs for ${product.name}:`, error);
                    return { product, cves: [] };
                }
            });

            const results = await Promise.all(batchPromises);

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

        allCVEs.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
        return allCVEs;
    }

    public clearCache(): void {
        cache.clear();
    }
}

