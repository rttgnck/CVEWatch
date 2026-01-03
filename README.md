# CVE Watch

A VS Code extension that tracks CVEs for products you care about and scans your workspace for vulnerable dependencies.

![CVE Watch](screenshot.png)

## Features

- 🔍 **Product-specific tracking** — Choose exactly which technologies to monitor (React, PostgreSQL, nginx, etc.)
- 📦 **Workspace scanning** — Automatically detect dependencies in your projects
- 🔔 **Critical CVE alerts** — Get notified about high-severity vulnerabilities
- ⚡ **Background polling** — Configurable interval to check for new CVEs
- 📦 **100+ products** — Pre-configured list across 13 categories

## Installation

### From VSIX

1. Download the `.vsix` file
2. In VS Code, press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
3. Type "Extensions: Install from VSIX..."
4. Select the downloaded `.vsix` file

### From Marketplace

Search for "CVE Watch" in the VS Code Extensions marketplace.

## Usage

1. Click the shield icon in the Activity Bar to open CVE Watch
2. Go to the "Products" tab and select technologies to track
3. CVE Watch will automatically fetch recent vulnerabilities
4. Click on any CVE to see details and open on NVD

## Configuration

CVE Watch can be configured in VS Code Settings:

- **cveWatch.products** — List of products to track CVEs for
- **cveWatch.pollInterval** — How often to check for new CVEs (15-1440 minutes)
- **cveWatch.notifications** — Show notifications for critical CVEs
- **cveWatch.autoScanWorkspace** — Automatically scan workspace for dependencies

## Commands

- `CVE Watch: Open Panel` — Open the CVE Watch panel
- `CVE Watch: Refresh CVEs` — Manually refresh the CVE feed
- `CVE Watch: Scan Workspace for Dependencies` — Scan workspace for package files

## NVD API Usage

This extension uses the [NVD API v2.0](https://nvd.nist.gov/developers/vulnerabilities) to fetch CVE data.

**Rate Limits:**
- Without API key: 5 requests per 30 seconds

The extension implements caching and rate limiting to stay within these limits.

## Supported Dependency Files

CVE Watch can scan the following dependency files:

- **Node.js**: package.json, package-lock.json, yarn.lock
- **Python**: requirements.txt, Pipfile, Pipfile.lock, pyproject.toml
- **Rust**: Cargo.toml, Cargo.lock
- **Go**: go.mod, go.sum
- **Ruby**: Gemfile, Gemfile.lock
- **Java**: pom.xml, build.gradle
- **PHP**: composer.json
- **Dart**: pubspec.yaml
- **iOS**: Podfile, Podfile.lock

## Building from Source

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Package as VSIX
npm run package
```

## Changelog

- v1.0.3 - Converted to VS Code extension
- v1.0.2 - Only looks at the dependency files in scanned projects folders
- v1.0.1 - Copilot suggested updates
- v1.0.0 - Initial release (Electron app)

## License

This project is not licensed outside personal use. All rights reserved.

## Acknowledgments

- [National Vulnerability Database (NVD)](https://nvd.nist.gov/) for CVE data
- [VS Code Extension API](https://code.visualstudio.com/api) for the extension framework
