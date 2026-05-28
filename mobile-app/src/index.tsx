import './index.css';
import { render } from 'react-dom';
import { App } from './App';
import { GreenhouseProvider } from './context/GreenhouseContext';

render(
  <GreenhouseProvider>
    <App />
  </GreenhouseProvider>,
  document.getElementById('root'),
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // The app should keep working even if the browser declines service workers.
    });
  });
}
