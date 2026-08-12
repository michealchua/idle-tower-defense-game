import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyPersistedDisplayScale } from './utils/displayScale';
import './index.css';

applyPersistedDisplayScale();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
