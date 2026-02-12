import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// This connects your React/Preact code to the <div id="app"> in index.html
ReactDOM.createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);