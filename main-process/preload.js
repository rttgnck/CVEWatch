const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Preferences
  getPreferences: () => ipcRenderer.invoke('get-preferences'),
  setPreference: (key, value) => ipcRenderer.invoke('set-preference', key, value),
  
  // Theme
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  onThemeChanged: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('theme-changed', handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener('theme-changed', handler);
  },
  
  // Window controls
  hideWindow: () => ipcRenderer.send('hide-window'),
  quitApp: () => ipcRenderer.send('quit-app'),
  
  // Notifications
  showNotification: (title, body, url) => ipcRenderer.send('show-notification', { title, body, url }),
  
  // Refresh from tray
  onRefreshCVEs: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('refresh-cves', handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener('refresh-cves', handler);
  },
  
  // Projects folder methods
  selectProjectsFolder: () => ipcRenderer.invoke('select-projects-folder'),
  getProjectsFolder: () => ipcRenderer.invoke('get-projects-folder'),
  rescanProjects: () => ipcRenderer.invoke('rescan-projects'),
  clearProjectsFolder: () => ipcRenderer.invoke('clear-projects-folder'),
  
  // Platform info
  platform: process.platform
});
