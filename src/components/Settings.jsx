import React from 'react';
import { motion } from 'framer-motion';
import { usePreferences } from '../contexts/PreferencesContext';
import packageJson from '../../package.json';

function Settings({ onClose }) {
  const version = packageJson.version || 'dev';
  console.log('Version:', version);

  const { preferences, updatePreference } = usePreferences();

  const pollIntervals = [
    { value: 15, label: '15 minutes' },
    { value: 30, label: '30 minutes' },
    { value: 60, label: '1 hour' },
    { value: 120, label: '2 hours' },
    { value: 360, label: '6 hours' },
  ];

  const handleQuit = () => {
    if (window.electronAPI) {
      window.electronAPI.quitApp();
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-2">
      {/* Refresh Interval */}
      <div className="mb-6">
        <div className="lp-category">
          <div className="lp-category-dot bg-lp-green" />
          <span className="text-lp-green">Refresh Interval</span>
        </div>
        <div className="space-y-1.5 mt-2">
          {pollIntervals.map((interval) => (
            <motion.button
              key={interval.value}
              whileTap={{ scale: 0.98 }}
              onClick={() => updatePreference('pollInterval', interval.value)}
              className={`lp-card w-full flex items-center justify-between py-3 px-3.5 text-sm transition-all ${
                preferences.pollInterval === interval.value
                  ? '!bg-lp-orange !border-lp-orange text-white'
                  : ''
              }`}
            >
              <span className={preferences.pollInterval === interval.value ? 'text-white' : 'text-lp-text'}>
                {interval.label}
              </span>
              {preferences.pollInterval === interval.value && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Notifications */}
      <div className="mb-6">
        <div className="lp-category">
          <div className="lp-category-dot bg-lp-purple" />
          <span className="text-lp-purple">Notifications</span>
        </div>
        <button
          onClick={() => updatePreference('notifications', !preferences.notifications)}
          className="lp-card w-full flex items-center justify-between py-3 px-3.5 mt-2"
        >
          <div className="text-left">
            <div className="text-sm text-lp-text font-medium">Critical CVE Alerts</div>
            <div className="text-xs text-lp-text-muted mt-0.5">Notify for HIGH and CRITICAL severity</div>
          </div>
          <div className={`w-11 h-6 rounded-full p-0.5 transition-colors ${
            preferences.notifications ? 'bg-lp-green' : 'bg-lp-border'
          }`}>
            <motion.div
              animate={{ x: preferences.notifications ? 20 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="w-5 h-5 rounded-full bg-white shadow-sm"
            />
          </div>
        </button>
      </div>

      {/* Startup */}
      <div className="mb-6">
        <div className="lp-category">
          <div className="lp-category-dot bg-lp-orange" />
          <span className="text-lp-orange">Startup</span>
        </div>
        <button
          onClick={() => updatePreference('openAtLogin', preferences.openAtLogin === false ? true : false)}
          className="lp-card w-full flex items-center justify-between py-3 px-3.5 mt-2"
        >
          <div className="text-left">
            <div className="text-sm text-lp-text font-medium">Start at Login</div>
            <div className="text-xs text-lp-text-muted mt-0.5">Launch CVE Watch when you log in</div>
          </div>
          <div className={`w-11 h-6 rounded-full p-0.5 transition-colors ${
            preferences.openAtLogin !== false ? 'bg-lp-green' : 'bg-lp-border'
          }`}>
            <motion.div
              animate={{ x: preferences.openAtLogin !== false ? 20 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="w-5 h-5 rounded-full bg-white shadow-sm"
            />
          </div>
        </button>
      </div>

      {/* About */}
      <div className="mb-6">
        <div className="lp-category">
          <div className="lp-category-dot bg-lp-text-muted" />
          <span className="text-lp-text-muted">About</span>
        </div>
        <div className="lp-card p-3.5 mt-2">
          <div className="flex items-center gap-3 mb-3">
            <div className="lp-icon-box w-10 h-10 bg-lp-orange/20 rounded-xl">
              <svg className="w-5 h-5 text-lp-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold text-lp-text">CVE Watch</div>
              <div className="text-xs text-lp-text-muted">v{version}</div>
            </div>
          </div>
          <p className="text-xs text-lp-text-secondary leading-relaxed">
            Monitor CVEs for your tech stack. Data provided by the National Vulnerability Database (NVD).
          </p>
        </div>
      </div>

      {/* Quit */}
      <button
        onClick={handleQuit}
        className="w-full py-3 px-3.5 rounded-xl text-sm font-medium bg-severity-critical/10 border border-severity-critical/20 hover:bg-severity-critical/20 text-severity-critical transition-colors"
      >
        Quit CVE Watch
      </button>
    </div>
  );
}

export default Settings;
