import * as ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const rootElement = document.getElementById('root');
if (!rootElement) {
  // This is the only failure that cannot be shown inside React, so it goes to the console.
  console.error('[main.tsx] Could not start the app: no <div id="root"> element was found in index.html.');
} else {
  ReactDOM.createRoot(rootElement as HTMLElement).render(<App />);
}
