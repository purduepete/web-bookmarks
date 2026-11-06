import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthGate } from './components/AuthGate';
import Tooltip from './components/Tooltip';
import { trackSiteIcon } from './siteIcon';
import './App.css';
import './first-load.css';

trackSiteIcon();

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <AuthGate>
            <App />
            <Tooltip />
        </AuthGate>
    </StrictMode>,
);
