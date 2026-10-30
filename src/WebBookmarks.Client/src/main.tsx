import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthGate } from './components/AuthGate';
import Tooltip from './components/Tooltip';
import './App.css';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <AuthGate>
            <App />
            <Tooltip />
        </AuthGate>
    </StrictMode>,
);
