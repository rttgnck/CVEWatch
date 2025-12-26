import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PreferencesProvider } from './contexts/PreferencesContext';
import { CVEProvider } from './contexts/CVEContext';
import './styles/index.css';

// Error Boundary component for graceful error handling
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('CVE Watch Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col items-center justify-center p-6 bg-lp-base text-lp-text">
          <div className="w-16 h-16 mb-4 rounded-2xl bg-severity-critical/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-severity-critical" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
          <p className="text-sm text-lp-text-secondary text-center mb-4">
            CVE Watch encountered an unexpected error.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="lp-btn-primary px-4 py-2"
          >
            Reload App
          </button>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre className="mt-4 p-3 bg-lp-surface rounded-lg text-xs text-severity-critical max-w-full overflow-auto">
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PreferencesProvider>
        <CVEProvider>
          <App />
        </CVEProvider>
      </PreferencesProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
