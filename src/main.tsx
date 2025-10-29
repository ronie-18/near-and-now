import * as React from 'react'
import * as ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Log that the script is loading
console.log('🔄 Loading Near & Now application...');

// Check if root element exists
const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('❌ Root element not found! Cannot mount React app.');
  document.body.innerHTML = `
    <div style="padding: 40px; text-align: center; font-family: Arial, sans-serif;">
      <h1 style="color: #e74c3c;">Error: Root element not found</h1>
      <p>The React app cannot mount. Please check the HTML file.</p>
    </div>
  `;
} else {
  console.log('✅ Root element found, mounting React app...');
  
  try {
    const root = ReactDOM.createRoot(rootElement as HTMLElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log('✅ React app mounted successfully');
  } catch (error) {
    console.error('❌ Failed to mount React app:', error);
    rootElement.innerHTML = `
      <div style="padding: 40px; text-align: center; font-family: Arial, sans-serif;">
        <h1 style="color: #e74c3c;">Failed to load application</h1>
        <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
        <button onclick="window.location.reload()" style="padding: 12px 24px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 20px;">
          Reload Page
        </button>
      </div>
    `;
  }
}
