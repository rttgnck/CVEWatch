/**
 * Electron Fuses Configuration
 * 
 * This script configures Electron Fuses to disable dangerous APIs at build time.
 * Fuses are immutable security settings that cannot be changed at runtime.
 * 
 * Run this as an afterPack hook in electron-builder.
 * 
 * @see https://www.electronjs.org/docs/latest/tutorial/fuses
 */

const path = require('path');

module.exports = async function afterPack(context) {
  // Only run on macOS
  if (process.platform !== 'darwin') {
    console.log('Skipping fuses configuration on non-macOS platform');
    return;
  }
  
  try {
    const { FuseV1Options, FuseVersion, flipFuses } = require('@electron/fuses');
    
    const electronPath = path.join(
      context.appOutDir,
      context.packager.appInfo.productFilename + '.app',
      'Contents',
      'MacOS',
      context.packager.appInfo.productFilename
    );
    
    console.log('Configuring Electron Fuses for:', electronPath);
    
    await flipFuses(electronPath, {
      version: FuseVersion.V1,
      // Disable running as Node.js (ELECTRON_RUN_AS_NODE)
      [FuseV1Options.RunAsNode]: false,
      // Enable cookie encryption
      [FuseV1Options.EnableCookieEncryption]: true,
      // Disable NODE_OPTIONS environment variable
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      // Disable --inspect CLI arguments
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      // NOTE: These require proper ASAR setup - disabled for now
      // [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      // [FuseV1Options.OnlyLoadAppFromAsar]: true,
    });
    
    console.log('Electron Fuses configured successfully');
  } catch (error) {
    console.warn('Failed to configure Electron Fuses:', error.message);
    // Don't fail the build if fuses can't be set
  }
};

