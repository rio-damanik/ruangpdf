import React, { Component } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

class ErrorBoundary extends Component {
  state = { hasError: false, errorMessage: '' };
  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error instanceof Error ? error.message : String(error) };
  }
  componentDidCatch(error, errorInfo) {
    console.error('React error boundary caught:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
          <h2>Aplikasi bermuat dengan kesalahan</h2>
          <p>{this.state.errorMessage}</p>
          <button onClick={() => this.setState({ hasError: false, errorMessage: '' })}>Muat ulang</button>
        </div>
      );
    }
    return this.props.children;
  }
}

window.onerror = (message, source, lineno, colno, error) => {
  console.error('Global error:', message, source, lineno, colno, error);
  return false;
};

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
