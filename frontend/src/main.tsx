import * as ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

console.log('🚀 [MAIN.TSX] Script loaded');

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('❌ [MAIN.TSX] Root element not found!');
} else {
  console.log('✅ [MAIN.TSX] Root element found');
  
  const root = ReactDOM.createRoot(rootElement as HTMLElement);
  root.render(<App />);
  
  console.log('✅ [MAIN.TSX] React render called');
}
