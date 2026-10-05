import '@mantine/core/styles.css';
import './app/global.css';
import { StrictMode } from 'react';
import { BUNDLED_FONTS, fontFaceCss } from '@core/print/fonts';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { App } from './app/App';
import { createI18n } from './i18n';
import { ThemeProvider } from './app/ThemeProvider';

// The bundled fonts, for on-screen previews of documents (print loads its own).
const fontStyles = document.createElement('style');
fontStyles.textContent = fontFaceCss(BUNDLED_FONTS, 'fonts/');
document.head.appendChild(fontStyles);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element');

createRoot(rootElement).render(
  <StrictMode>
    <I18nextProvider i18n={createI18n()}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </I18nextProvider>
  </StrictMode>,
);
