/**
 * React entry point for the ERP renderer process.
 * Mounts the app under HashRouter (suitable for Electron file:// / packaged loads)
 * and enables StrictMode for development checks.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
