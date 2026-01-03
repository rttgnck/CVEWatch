import * as vscode from 'vscode';
import { CVEService, CVE } from './services/cveService';
import { DependencyScanner, ScanResult } from './services/dependencyScanner';
import { PRODUCTS_BY_CATEGORY, Product } from './data/products';

export class CVEWatchViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'cveWatch.mainView';
    
    private _view?: vscode.WebviewView;
    private _cves: CVE[] = [];
    private _scannedProjects: ScanResult | null = null;
    private _isLoading = false;
    private _lastUpdated: Date | null = null;
    private _seenCVEIds: Set<string> = new Set();
    private _isFirstLoad = true;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _cveService: CVEService,
        private readonly _dependencyScanner: DependencyScanner,
        private readonly _context: vscode.ExtensionContext
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'refresh':
                    await this.refresh();
                    break;
                case 'getPreferences':
                    this._sendPreferences();
                    break;
                case 'setPreference':
                    await this._setPreference(message.key, message.value);
                    break;
                case 'openExternal':
                    if (this._isValidUrl(message.url)) {
                        vscode.env.openExternal(vscode.Uri.parse(message.url));
                    }
                    break;
                case 'scanWorkspace':
                    const results = await this._dependencyScanner.scanWorkspace();
                    this.updateScannedProjects(results);
                    break;
                case 'addProduct':
                    await this._addProduct(message.product);
                    break;
                case 'removeProduct':
                    await this._removeProduct(message.productId);
                    break;
                case 'ready':
                    this._sendInitialData();
                    break;
            }
        });

        // Send initial data when view becomes visible
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._sendInitialData();
            }
        });
    }

    private _isValidUrl(url: string): boolean {
        if (!url || typeof url !== 'string' || url.length > 2048) {
            return false;
        }
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }

    private async _sendInitialData() {
        this._sendPreferences();
        this._sendProducts();
        await this.refresh();
        
        if (this._scannedProjects) {
            this._postMessage({
                type: 'scannedProjects',
                data: this._scannedProjects
            });
        }
    }

    private _sendPreferences() {
        const config = vscode.workspace.getConfiguration('cveWatch');
        this._postMessage({
            type: 'preferences',
            data: {
                products: config.get<Product[]>('products', []),
                pollInterval: config.get<number>('pollInterval', 30),
                notifications: config.get<boolean>('notifications', true),
                autoScanWorkspace: config.get<boolean>('autoScanWorkspace', true)
            }
        });
    }

    private _sendProducts() {
        this._postMessage({
            type: 'productCatalog',
            data: PRODUCTS_BY_CATEGORY
        });
    }

    private async _setPreference(key: string, value: any) {
        const config = vscode.workspace.getConfiguration('cveWatch');
        await config.update(key, value, vscode.ConfigurationTarget.Global);
        this._sendPreferences();
    }

    private async _addProduct(product: Product) {
        const config = vscode.workspace.getConfiguration('cveWatch');
        const products = config.get<Product[]>('products', []);
        if (!products.find(p => p.id === product.id)) {
            products.push(product);
            await config.update('products', products, vscode.ConfigurationTarget.Global);
            this._sendPreferences();
            await this.refresh();
        }
    }

    private async _removeProduct(productId: string) {
        const config = vscode.workspace.getConfiguration('cveWatch');
        const products = config.get<Product[]>('products', []);
        const filtered = products.filter(p => p.id !== productId);
        await config.update('products', filtered, vscode.ConfigurationTarget.Global);
        this._sendPreferences();
        await this.refresh();
    }

    public async refresh() {
        if (this._isLoading) return;
        
        this._isLoading = true;
        this._postMessage({ type: 'loading', data: true });

        try {
            const config = vscode.workspace.getConfiguration('cveWatch');
            const products = config.get<Product[]>('products', []);
            
            if (products.length > 0) {
                this._cves = await this._cveService.fetchCVEsForProducts(products);
                this._lastUpdated = new Date();

                // Check for new critical CVEs and show notifications
                const notifications = config.get<boolean>('notifications', true);
                if (notifications && !this._isFirstLoad) {
                    const newCritical = this._cves.filter(cve =>
                        (cve.severity === 'CRITICAL' || cve.severity === 'HIGH') &&
                        !this._seenCVEIds.has(cve.id)
                    );

                    for (const cve of newCritical.slice(0, 3)) {
                        vscode.window.showWarningMessage(
                            `${cve.severity} CVE: ${cve.id}`,
                            'View Details'
                        ).then(selection => {
                            if (selection === 'View Details') {
                                vscode.env.openExternal(vscode.Uri.parse(cve.url));
                            }
                        });
                    }
                }

                // Mark all as seen
                this._cves.forEach(cve => this._seenCVEIds.add(cve.id));
                this._isFirstLoad = false;
            } else {
                this._cves = [];
            }

            this._postMessage({
                type: 'cves',
                data: {
                    cves: this._cves,
                    lastUpdated: this._lastUpdated?.toISOString()
                }
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to fetch CVEs';
            this._postMessage({
                type: 'error',
                data: message
            });
        } finally {
            this._isLoading = false;
            this._postMessage({ type: 'loading', data: false });
        }
    }

    public updateScannedProjects(results: ScanResult) {
        this._scannedProjects = results;
        this._postMessage({
            type: 'scannedProjects',
            data: results
        });
    }

    private _postMessage(message: any) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:; font-src ${webview.cspSource};">
    <title>CVE Watch</title>
    <style>
        :root {
            --vscode-font-family: var(--vscode-editor-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
            --severity-critical: #dc2626;
            --severity-high: #ea580c;
            --severity-medium: #ca8a04;
            --severity-low: #16a34a;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: 13px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            line-height: 1.4;
            padding: 0;
            overflow-x: hidden;
        }

        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        /* Header */
        .header {
            padding: 12px;
            border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
            background: var(--vscode-sideBarSectionHeader-background);
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: sticky;
            top: 0;
            z-index: 100;
        }

        .header-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-sideBarTitle-foreground);
        }

        .header-actions {
            display: flex;
            gap: 8px;
        }

        .icon-btn {
            background: none;
            border: none;
            color: var(--vscode-icon-foreground);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .icon-btn:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }

        .icon-btn.spinning svg {
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        /* Tabs */
        .tabs {
            display: flex;
            border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
            padding: 0 8px;
        }

        .tab {
            padding: 8px 16px;
            border: none;
            background: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 12px;
            opacity: 0.7;
            border-bottom: 2px solid transparent;
            transition: all 0.15s;
        }

        .tab:hover {
            opacity: 1;
        }

        .tab.active {
            opacity: 1;
            border-bottom-color: var(--vscode-focusBorder);
        }

        /* Content */
        .content {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
        }

        /* Search */
        .search-container {
            padding: 8px;
            position: sticky;
            top: 0;
            background: var(--vscode-sideBar-background);
            z-index: 50;
        }

        .search-input {
            width: 100%;
            padding: 6px 10px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-size: 12px;
            outline: none;
        }

        .search-input:focus {
            border-color: var(--vscode-focusBorder);
        }

        .search-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }

        /* Product Card */
        .product-card {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
            margin-bottom: 8px;
            overflow: hidden;
        }

        .product-header {
            padding: 10px 12px;
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
            transition: background 0.15s;
        }

        .product-header:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .product-icon {
            width: 32px;
            height: 32px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        .product-icon.critical { background: rgba(220, 38, 38, 0.15); color: var(--severity-critical); }
        .product-icon.high { background: rgba(234, 88, 12, 0.15); color: var(--severity-high); }
        .product-icon.medium { background: rgba(202, 138, 4, 0.15); color: var(--severity-medium); }
        .product-icon.default { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }

        .product-info {
            flex: 1;
            min-width: 0;
        }

        .product-name {
            font-weight: 600;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .product-count {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 10px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }

        .product-stats {
            display: flex;
            gap: 6px;
            margin-top: 4px;
        }

        .severity-stat {
            font-size: 10px;
            padding: 1px 5px;
            border-radius: 3px;
        }

        .severity-stat.critical { background: rgba(220, 38, 38, 0.15); color: var(--severity-critical); }
        .severity-stat.high { background: rgba(234, 88, 12, 0.15); color: var(--severity-high); }
        .severity-stat.medium { background: rgba(202, 138, 4, 0.15); color: var(--severity-medium); }
        .severity-stat.low { background: rgba(22, 163, 74, 0.15); color: var(--severity-low); }

        .chevron {
            transition: transform 0.2s;
            color: var(--vscode-foreground);
            opacity: 0.5;
        }

        .chevron.open {
            transform: rotate(180deg);
        }

        /* CVE Item */
        .cve-list {
            border-top: 1px solid var(--vscode-widget-border);
        }

        .cve-item {
            padding: 8px 12px;
            display: flex;
            align-items: flex-start;
            gap: 8px;
            border-bottom: 1px solid var(--vscode-widget-border);
            cursor: pointer;
            transition: background 0.15s;
        }

        .cve-item:last-child {
            border-bottom: none;
        }

        .cve-item:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .severity-bar {
            width: 3px;
            height: 28px;
            border-radius: 2px;
            flex-shrink: 0;
        }

        .severity-bar.critical { background: var(--severity-critical); }
        .severity-bar.high { background: var(--severity-high); }
        .severity-bar.medium { background: var(--severity-medium); }
        .severity-bar.low { background: var(--severity-low); }
        .severity-bar.none { background: var(--vscode-foreground); opacity: 0.3; }

        .cve-content {
            flex: 1;
            min-width: 0;
        }

        .cve-header {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .cve-id {
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
            font-weight: 600;
        }

        .cve-date {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
        }

        .cve-description {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .severity-badge {
            font-size: 10px;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 3px;
            flex-shrink: 0;
        }

        .severity-badge.critical { background: var(--severity-critical); color: white; }
        .severity-badge.high { background: var(--severity-high); color: white; }
        .severity-badge.medium { background: var(--severity-medium); color: white; }
        .severity-badge.low { background: var(--severity-low); color: white; }
        .severity-badge.none { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }

        /* CVE Details (expanded) */
        .cve-details {
            padding: 8px 12px;
            margin-left: 11px;
            border-left: 2px solid var(--vscode-widget-border);
            display: none;
        }

        .cve-details.open {
            display: block;
        }

        .cve-full-description {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
            line-height: 1.5;
        }

        .cve-actions {
            display: flex;
            gap: 6px;
        }

        .btn {
            font-size: 11px;
            padding: 4px 10px;
            border-radius: 4px;
            border: none;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .btn-secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        /* Empty State */
        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--vscode-descriptionForeground);
        }

        .empty-state svg {
            width: 48px;
            height: 48px;
            margin-bottom: 16px;
            opacity: 0.5;
        }

        .empty-state h3 {
            font-size: 14px;
            margin-bottom: 8px;
            color: var(--vscode-foreground);
        }

        .empty-state p {
            font-size: 12px;
            margin-bottom: 16px;
        }

        /* Products Picker */
        .products-section {
            margin-bottom: 16px;
        }

        .section-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-sideBarTitle-foreground);
            padding: 8px 0;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .product-chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 12px;
            font-size: 11px;
            margin: 2px;
            cursor: pointer;
            transition: all 0.15s;
        }

        .product-chip:hover {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .product-chip.selected {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .product-chip .remove {
            margin-left: 2px;
            opacity: 0.7;
        }

        .product-chip .remove:hover {
            opacity: 1;
        }

        .category-section {
            margin-bottom: 12px;
        }

        .category-title {
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            color: var(--vscode-descriptionForeground);
            padding: 4px 0;
        }

        .category-products {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }

        /* Projects Section */
        .projects-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 0;
        }

        .folder-tree {
            padding-left: 0;
        }

        .folder-item {
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
            margin-bottom: 6px;
            background: var(--vscode-editor-background);
        }

        .folder-header {
            padding: 8px 10px;
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
        }

        .folder-header:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .folder-icon {
            color: var(--vscode-icon-foreground);
        }

        .folder-name {
            flex: 1;
            font-weight: 500;
        }

        .folder-badge {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 10px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }

        .folder-children {
            padding-left: 16px;
            border-top: 1px solid var(--vscode-widget-border);
            display: none;
        }

        .folder-children.open {
            display: block;
        }

        .dep-file {
            padding: 6px 10px;
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .dep-file-icon {
            width: 16px;
            text-align: center;
        }

        /* Loading */
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 40px;
        }

        .spinner {
            width: 24px;
            height: 24px;
            border: 2px solid var(--vscode-foreground);
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        /* Status bar */
        .status-bar {
            padding: 6px 12px;
            border-top: 1px solid var(--vscode-sideBarSectionHeader-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            background: var(--vscode-sideBarSectionHeader-background);
        }

        .status-indicator {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            margin-right: 6px;
        }

        .status-indicator.active {
            background: #22c55e;
        }

        .status-indicator.loading {
            background: #eab308;
        }

        .status-indicator.error {
            background: #ef4444;
        }
    </style>
</head>
<body>
    <div class="container" id="app">
        <!-- Header -->
        <div class="header">
            <span class="header-title">CVE Watch</span>
            <div class="header-actions">
                <button class="icon-btn" id="refreshBtn" title="Refresh CVEs">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M13.451 5.609l-.579-.939-1.068.812-.076.094c-.335.415-.927 1.341-1.124 2.876l-.021.165.033.163.071.345c.024.087.04.2.046.34.009.212-.017.455-.076.727-.065.299-.161.6-.287.898-.391.93-1.022 1.8-1.878 2.462-.835.644-1.765.961-2.791.947-1.572-.021-2.741-.746-3.509-1.792l1.406-.537-1.25-.875-1.25-.875-1.25-.875-.251 1.462-.249 1.462-.248 1.462 1.13-.737c1.295 1.861 3.201 2.875 5.528 2.906 1.416.019 2.701-.418 3.858-1.307 1.123-.864 1.925-1.955 2.404-3.091.167-.398.294-.792.378-1.179.089-.41.132-.779.118-1.105-.013-.26-.052-.485-.116-.682l-.065-.225c.13-1.165.46-1.955.753-2.437z"/>
                        <path d="M2.5 9.473l.592.913 1.06-.834.073-.095c.326-.424.904-1.364 1.076-2.906l.017-.166-.037-.162-.076-.343c-.026-.087-.044-.199-.052-.339-.012-.212.011-.456.067-.729.062-.3.155-.603.278-.903.382-.936 1.005-1.816 1.854-2.492.827-.658 1.752-.989 2.779-.992 1.572-.003 2.749.706 3.53 1.741l-1.398.554 1.258.862 1.258.862 1.258.862.231-1.466.23-1.466.231-1.465-1.139.722c-1.27-1.88-3.163-2.913-5.49-2.91-1.416.003-2.706.424-3.872 1.301-1.13.851-1.942 1.934-2.434 3.063-.172.395-.303.788-.391 1.173-.094.409-.141.777-.131 1.104.01.26.047.486.108.684l.063.226c-.148 1.162-.491 1.944-.793 2.42z"/>
                    </svg>
                </button>
                <button class="icon-btn" id="settingsBtn" title="Settings">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M3.5 2h-1v5h1V2zm6.1 5H6.4L6 6.45v-1L6.4 5h3.2l.4.5v1l-.4.5zm-5 3H1.4L1 9.5v-1l.4-.5h3.2l.4.5v1l-.4.5zm3.9-8h-1v2h1V2zm-1 6h1v6h-1V8zm-4 3h-1v3h1v-3zm7.9 0h3.19l.4-.5v-1l-.4-.5H11.4l-.4.5v1l.4.5zm-.9-8h-1v2h1V3zm1 8h1v3h-1v-3z"/>
                    </svg>
                </button>
            </div>
        </div>

        <!-- Tabs -->
        <div class="tabs">
            <button class="tab active" data-tab="feed">Feed</button>
            <button class="tab" data-tab="products">Products</button>
            <button class="tab" data-tab="settings">Settings</button>
        </div>

        <!-- Content -->
        <div class="content" id="content">
            <div class="loading" id="loading" style="display: none;">
                <div class="spinner"></div>
            </div>
            
            <div id="feedView"></div>
            <div id="productsView" style="display: none;"></div>
            <div id="settingsView" style="display: none;"></div>
        </div>

        <!-- Status Bar -->
        <div class="status-bar">
            <div style="display: flex; align-items: center;">
                <span class="status-indicator active" id="statusIndicator"></span>
                <span id="statusText">Ready</span>
            </div>
            <span id="lastUpdated"></span>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        // State
        let state = {
            preferences: { products: [], pollInterval: 30, notifications: true },
            cves: [],
            scannedProjects: null,
            productCatalog: {},
            isLoading: false,
            lastUpdated: null,
            activeTab: 'feed',
            expandedProducts: new Set(),
            expandedCVEs: new Set(),
            searchQuery: ''
        };

        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            setupEventListeners();
            vscode.postMessage({ command: 'ready' });
        });

        function setupEventListeners() {
            // Tab switching
            document.querySelectorAll('.tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    const tabName = tab.dataset.tab;
                    setActiveTab(tabName);
                });
            });

            // Refresh button
            document.getElementById('refreshBtn').addEventListener('click', () => {
                vscode.postMessage({ command: 'refresh' });
            });

            // Settings button
            document.getElementById('settingsBtn').addEventListener('click', () => {
                setActiveTab('settings');
            });
        }

        function setActiveTab(tabName) {
            state.activeTab = tabName;
            
            document.querySelectorAll('.tab').forEach(t => {
                t.classList.toggle('active', t.dataset.tab === tabName);
            });

            document.getElementById('feedView').style.display = tabName === 'feed' ? 'block' : 'none';
            document.getElementById('productsView').style.display = tabName === 'products' ? 'block' : 'none';
            document.getElementById('settingsView').style.display = tabName === 'settings' ? 'block' : 'none';

            if (tabName === 'feed') renderFeedView();
            if (tabName === 'products') renderProductsView();
            if (tabName === 'settings') renderSettingsView();
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'preferences':
                    state.preferences = message.data;
                    if (state.activeTab === 'feed') renderFeedView();
                    if (state.activeTab === 'products') renderProductsView();
                    if (state.activeTab === 'settings') renderSettingsView();
                    break;
                case 'productCatalog':
                    state.productCatalog = message.data;
                    if (state.activeTab === 'products') renderProductsView();
                    break;
                case 'cves':
                    state.cves = message.data.cves;
                    state.lastUpdated = message.data.lastUpdated;
                    updateLastUpdated();
                    if (state.activeTab === 'feed') renderFeedView();
                    break;
                case 'scannedProjects':
                    state.scannedProjects = message.data;
                    if (state.activeTab === 'feed') renderFeedView();
                    break;
                case 'loading':
                    state.isLoading = message.data;
                    updateLoadingState();
                    break;
                case 'error':
                    showError(message.data);
                    break;
            }
        });

        function updateLoadingState() {
            const loading = document.getElementById('loading');
            const refreshBtn = document.getElementById('refreshBtn');
            const indicator = document.getElementById('statusIndicator');
            const statusText = document.getElementById('statusText');

            if (state.isLoading) {
                loading.style.display = 'flex';
                refreshBtn.classList.add('spinning');
                indicator.className = 'status-indicator loading';
                statusText.textContent = 'Fetching...';
            } else {
                loading.style.display = 'none';
                refreshBtn.classList.remove('spinning');
                indicator.className = 'status-indicator active';
                statusText.textContent = 'Ready';
            }
        }

        function updateLastUpdated() {
            const el = document.getElementById('lastUpdated');
            if (state.lastUpdated) {
                const date = new Date(state.lastUpdated);
                el.textContent = 'Updated ' + formatRelativeTime(date);
            }
        }

        function formatRelativeTime(date) {
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            
            if (diffMins < 1) return 'just now';
            if (diffMins < 60) return diffMins + 'm ago';
            const diffHours = Math.floor(diffMins / 60);
            if (diffHours < 24) return diffHours + 'h ago';
            return date.toLocaleDateString();
        }

        function formatDate(dateStr) {
            const date = new Date(dateStr);
            const now = new Date();
            const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
            
            if (diffDays === 0) return 'Today';
            if (diffDays === 1) return 'Yesterday';
            if (diffDays < 7) return diffDays + 'd ago';
            if (diffDays < 30) return Math.floor(diffDays / 7) + 'w ago';
            return date.toLocaleDateString();
        }

        function showError(message) {
            const indicator = document.getElementById('statusIndicator');
            const statusText = document.getElementById('statusText');
            indicator.className = 'status-indicator error';
            statusText.textContent = 'Error: ' + message;
        }

        // Render functions
        function renderFeedView() {
            const container = document.getElementById('feedView');
            
            // Group CVEs by product
            const grouped = {};
            state.cves.forEach(cve => {
                const product = cve.matchedProduct || 'Unknown';
                if (!grouped[product]) grouped[product] = [];
                grouped[product].push(cve);
            });

            // Sort products by CVE count
            const sortedProducts = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);

            if (state.preferences.products.length === 0) {
                container.innerHTML = \`
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                        </svg>
                        <h3>No Products Selected</h3>
                        <p>Add some products to track their CVEs</p>
                        <button class="btn btn-primary" onclick="setActiveTab('products')">Add Products</button>
                    </div>
                \`;
                return;
            }

            if (sortedProducts.length === 0 && !state.isLoading) {
                container.innerHTML = \`
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <h3>No CVEs Found</h3>
                        <p>No recent vulnerabilities for your tracked products</p>
                    </div>
                \`;
                return;
            }

            let html = '';

            // Scanned Projects Section
            if (state.scannedProjects && state.scannedProjects.tree) {
                html += \`
                    <div class="products-section">
                        <div class="section-title">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
                            </svg>
                            Workspace (\${state.scannedProjects.totalPackages} packages)
                        </div>
                        <div class="folder-tree">
                            \${renderFolderTree(state.scannedProjects.tree)}
                        </div>
                    </div>
                \`;
            }

            // CVE Feed
            html += '<div class="section-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"/></svg> CVE Feed (' + state.cves.length + ' total)</div>';

            sortedProducts.forEach(([productName, cves]) => {
                const stats = {
                    critical: cves.filter(c => c.severity === 'CRITICAL').length,
                    high: cves.filter(c => c.severity === 'HIGH').length,
                    medium: cves.filter(c => c.severity === 'MEDIUM').length,
                    low: cves.filter(c => c.severity === 'LOW').length
                };

                const hasCritical = stats.critical > 0;
                const hasHigh = stats.high > 0;
                const iconClass = hasCritical ? 'critical' : hasHigh ? 'high' : 'default';
                const isExpanded = state.expandedProducts.has(productName);

                html += \`
                    <div class="product-card">
                        <div class="product-header" onclick="toggleProduct('\${escapeHtml(productName)}')">
                            <div class="product-icon \${iconClass}">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <path d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375"/>
                                </svg>
                            </div>
                            <div class="product-info">
                                <div class="product-name">
                                    \${escapeHtml(productName)}
                                    <span class="product-count">\${cves.length}</span>
                                </div>
                                <div class="product-stats">
                                    \${stats.critical > 0 ? '<span class="severity-stat critical">' + stats.critical + ' Critical</span>' : ''}
                                    \${stats.high > 0 ? '<span class="severity-stat high">' + stats.high + ' High</span>' : ''}
                                    \${stats.medium > 0 ? '<span class="severity-stat medium">' + stats.medium + ' Med</span>' : ''}
                                    \${stats.low > 0 ? '<span class="severity-stat low">' + stats.low + ' Low</span>' : ''}
                                </div>
                            </div>
                            <svg class="chevron \${isExpanded ? 'open' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M19 9l-7 7-7-7"/>
                            </svg>
                        </div>
                        \${isExpanded ? '<div class="cve-list">' + cves.map(cve => renderCVEItem(cve)).join('') + '</div>' : ''}
                    </div>
                \`;
            });

            container.innerHTML = html;
        }

        function renderFolderTree(node) {
            if (!node) return '';
            
            const isExpanded = state.expandedProducts.has('folder-' + node.path);
            const hasContent = node.dependencyFiles.length > 0 || node.children.length > 0;
            
            let html = \`
                <div class="folder-item">
                    <div class="folder-header" onclick="toggleProduct('folder-\${escapeHtml(node.path)}')">
                        <svg class="folder-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
                            <path d="M12 12l-4-4h3V5h2v3h3l-4 4z"/>
                        </svg>
                        <span class="folder-name">\${escapeHtml(node.name)}</span>
                        <span class="folder-badge">\${node.totalPackages} pkgs</span>
                        <svg class="chevron \${isExpanded ? 'open' : ''}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M19 9l-7 7-7-7"/>
                        </svg>
                    </div>
            \`;

            if (isExpanded && hasContent) {
                html += '<div class="folder-children open">';
                
                node.dependencyFiles.forEach(file => {
                    html += \`
                        <div class="dep-file">
                            <span class="dep-file-icon">📦</span>
                            <span>\${escapeHtml(file.fileName)}</span>
                            <span style="color: var(--vscode-descriptionForeground)">(\${file.packages.length} packages)</span>
                        </div>
                    \`;
                });

                node.children.forEach(child => {
                    html += renderFolderTree(child);
                });

                html += '</div>';
            }

            html += '</div>';
            return html;
        }

        function renderCVEItem(cve) {
            const severityClass = (cve.severity || 'none').toLowerCase();
            const isExpanded = state.expandedCVEs.has(cve.id);
            
            return \`
                <div class="cve-item" onclick="toggleCVE('\${escapeHtml(cve.id)}')">
                    <div class="severity-bar \${severityClass}"></div>
                    <div class="cve-content">
                        <div class="cve-header">
                            <span class="cve-id">\${escapeHtml(cve.id)}</span>
                            <span class="cve-date">\${formatDate(cve.published)}</span>
                        </div>
                        <p class="cve-description">\${escapeHtml(cve.description)}</p>
                    </div>
                    <span class="severity-badge \${severityClass}">\${cve.score ? cve.score.toFixed(1) : 'N/A'}</span>
                </div>
                <div class="cve-details \${isExpanded ? 'open' : ''}">
                    <p class="cve-full-description">\${escapeHtml(cve.description)}</p>
                    <div class="cve-actions">
                        <button class="btn btn-primary" onclick="event.stopPropagation(); openExternal('\${escapeHtml(cve.url)}')">View on NVD</button>
                        \${cve.references && cve.references.length > 0 ? 
                            '<button class="btn btn-secondary" onclick="event.stopPropagation(); openExternal(\\''+escapeHtml(cve.references[0].url)+'\\')">Reference</button>' : ''}
                    </div>
                </div>
            \`;
        }

        function renderProductsView() {
            const container = document.getElementById('productsView');
            
            // Selected products
            let html = '<div class="section-title">Selected Products</div>';
            
            if (state.preferences.products.length > 0) {
                html += '<div style="margin-bottom: 16px;">';
                state.preferences.products.forEach(p => {
                    html += \`
                        <span class="product-chip selected" onclick="removeProduct('\${escapeHtml(p.id)}')">
                            \${escapeHtml(p.name)}
                            <span class="remove">×</span>
                        </span>
                    \`;
                });
                html += '</div>';
            } else {
                html += '<p style="color: var(--vscode-descriptionForeground); margin-bottom: 16px; font-size: 12px;">No products selected yet. Add some from below.</p>';
            }

            // Available products by category
            html += '<div class="section-title">Available Products</div>';
            
            const selectedIds = new Set(state.preferences.products.map(p => p.id));

            Object.entries(state.productCatalog).forEach(([category, products]) => {
                html += \`
                    <div class="category-section">
                        <div class="category-title">\${escapeHtml(category)}</div>
                        <div class="category-products">
                \`;

                products.forEach(product => {
                    if (!selectedIds.has(product.id)) {
                        html += \`
                            <span class="product-chip" onclick="addProduct('\${escapeHtml(JSON.stringify(product))}')">
                                + \${escapeHtml(product.name)}
                            </span>
                        \`;
                    }
                });

                html += '</div></div>';
            });

            container.innerHTML = html;
        }

        function renderSettingsView() {
            const container = document.getElementById('settingsView');
            
            container.innerHTML = \`
                <div class="section-title">Settings</div>
                
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-size: 12px;">Poll Interval (minutes)</label>
                    <input type="number" class="search-input" value="\${state.preferences.pollInterval}" 
                        min="15" max="1440" 
                        onchange="updatePreference('pollInterval', parseInt(this.value))"
                        style="width: 100px;">
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer;">
                        <input type="checkbox" \${state.preferences.notifications ? 'checked' : ''} 
                            onchange="updatePreference('notifications', this.checked)">
                        Show notifications for critical CVEs
                    </label>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer;">
                        <input type="checkbox" \${state.preferences.autoScanWorkspace ? 'checked' : ''} 
                            onchange="updatePreference('autoScanWorkspace', this.checked)">
                        Auto-scan workspace for dependencies
                    </label>
                </div>

                <div style="margin-top: 24px;">
                    <button class="btn btn-secondary" onclick="scanWorkspace()">
                        Scan Workspace Now
                    </button>
                </div>
            \`;
        }

        // Actions
        function toggleProduct(productName) {
            if (state.expandedProducts.has(productName)) {
                state.expandedProducts.delete(productName);
            } else {
                state.expandedProducts.add(productName);
            }
            renderFeedView();
        }

        function toggleCVE(cveId) {
            if (state.expandedCVEs.has(cveId)) {
                state.expandedCVEs.delete(cveId);
            } else {
                state.expandedCVEs.add(cveId);
            }
            renderFeedView();
        }

        function addProduct(productJson) {
            const product = JSON.parse(productJson);
            vscode.postMessage({ command: 'addProduct', product });
        }

        function removeProduct(productId) {
            vscode.postMessage({ command: 'removeProduct', productId });
        }

        function updatePreference(key, value) {
            vscode.postMessage({ command: 'setPreference', key, value });
        }

        function openExternal(url) {
            vscode.postMessage({ command: 'openExternal', url });
        }

        function scanWorkspace() {
            vscode.postMessage({ command: 'scanWorkspace' });
        }

        function escapeHtml(text) {
            if (typeof text !== 'string') return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    </script>
</body>
</html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

