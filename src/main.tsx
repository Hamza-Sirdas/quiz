import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import '@/styles/index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Kök uygulama öğesi (#root) bulunamadı.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
