import * as vscode from 'vscode';
import { CVEWatchViewProvider } from './CVEWatchViewProvider';
import { CVEService } from './services/cveService';
import { DependencyScanner } from './services/dependencyScanner';

let cveService: CVEService;
let dependencyScanner: DependencyScanner;
let viewProvider: CVEWatchViewProvider;
let pollInterval: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('CVE Watch extension is now active');

    // Initialize services
    cveService = new CVEService();
    dependencyScanner = new DependencyScanner();

    // Create the webview provider
    viewProvider = new CVEWatchViewProvider(
        context.extensionUri,
        cveService,
        dependencyScanner,
        context
    );

    // Register the webview provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'cveWatch.mainView',
            viewProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('cveWatch.openPanel', () => {
            vscode.commands.executeCommand('cveWatch.mainView.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cveWatch.refresh', async () => {
            await viewProvider.refresh();
            vscode.window.showInformationMessage('CVE Watch: Refreshed CVEs');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cveWatch.scanWorkspace', async () => {
            const results = await dependencyScanner.scanWorkspace();
            viewProvider.updateScannedProjects(results);
            vscode.window.showInformationMessage(
                `CVE Watch: Scanned workspace, found ${results.totalPackages} packages in ${results.totalProjects} projects`
            );
        })
    );

    // Start polling for CVEs
    startPolling(context);

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('cveWatch')) {
                // Restart polling with new interval
                stopPolling();
                startPolling(context);
                viewProvider.refresh();
            }
        })
    );

    // Auto-scan workspace on startup if enabled
    const config = vscode.workspace.getConfiguration('cveWatch');
    if (config.get<boolean>('autoScanWorkspace', true)) {
        setTimeout(async () => {
            const results = await dependencyScanner.scanWorkspace();
            viewProvider.updateScannedProjects(results);
        }, 2000);
    }
}

function startPolling(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('cveWatch');
    const intervalMinutes = config.get<number>('pollInterval', 30);
    const intervalMs = intervalMinutes * 60 * 1000;

    pollInterval = setInterval(async () => {
        await viewProvider.refresh();
    }, intervalMs);

    // Initial fetch
    viewProvider.refresh();
}

function stopPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = undefined;
    }
}

export function deactivate() {
    stopPolling();
}

