import { useState, type FormEvent, type ReactNode } from 'react';
import { getApiKey, setApiKey } from '../auth';
import { validateApiKey } from '../api';

export function AuthGate({ children }: { children: ReactNode }) {
    const [authed, setAuthed] = useState(() => !!getApiKey());
    const [value, setValue] = useState('');
    const [error, setError] = useState('');
    const [checking, setChecking] = useState(false);

    if (authed) return <>{children}</>;

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        const key = value.trim();
        if (!key) return;
        setChecking(true);
        setError('');
        const ok = await validateApiKey(key);
        setChecking(false);
        if (ok) {
            setApiKey(key);
            setAuthed(true);
        } else {
            setError('Invalid key. Please try again.');
        }
    }

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#020617',
                color: '#b2bac2',
                fontFamily: "'Roboto Flex', system-ui, sans-serif",
            }}
        >
            <form
                onSubmit={handleSubmit}
                style={{
                    backgroundColor: '#0f172a',
                    padding: '2rem',
                    borderRadius: '12px',
                    border: '1px solid #1e293b',
                    width: 'min(360px, 90vw)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                }}
            >
                <h1 style={{ fontSize: '1.25rem', margin: 0, color: '#fff' }}>Web Bookmarks</h1>
                <label style={{ fontSize: '0.875rem' }}>
                    Enter your access key
                    <input
                        type="password"
                        autoFocus
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        style={{
                            marginTop: '0.5rem',
                            width: '100%',
                            padding: '0.6rem 0.75rem',
                            backgroundColor: '#020617',
                            color: '#fff',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            boxSizing: 'border-box',
                        }}
                    />
                </label>
                {error && <div style={{ color: '#f87171', fontSize: '0.8125rem' }}>{error}</div>}
                <button
                    type="submit"
                    disabled={checking}
                    style={{
                        padding: '0.6rem',
                        backgroundColor: '#1e3a5f',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: checking ? 'default' : 'pointer',
                        opacity: checking ? 0.7 : 1,
                    }}
                >
                    {checking ? 'Checking…' : 'Unlock'}
                </button>
            </form>
        </div>
    );
}
