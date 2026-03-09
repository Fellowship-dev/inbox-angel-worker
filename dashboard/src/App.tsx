import { useState, useEffect } from 'preact/hooks';
import { Overview } from './pages/Overview';
import { ApiKeyGate } from './ApiKeyGate';

function getRoute(): string {
  return window.location.hash.replace(/^#/, '') || '/';
}

export function App() {
  const [route, setRoute] = useState(getRoute);
  const [hasKey, setHasKey] = useState(() => !!localStorage.getItem('ia_api_key'));

  useEffect(() => {
    const onHash = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (!hasKey) return <ApiKeyGate onSave={() => setHasKey(true)} />;

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <a href="#/" style={styles.logo}>InboxAngel</a>
      </header>
      <main style={styles.main}>
        {route === '/' && <Overview onUnauthorized={() => { localStorage.removeItem('ia_api_key'); setHasKey(false); }} />}
        {route !== '/' && (
          <p style={{ color: '#9ca3af' }}>
            Page not found. <a href="#/">Back to overview</a>
          </p>
        )}
      </main>
    </div>
  );
}

const styles = {
  shell: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    maxWidth: '760px',
    margin: '0 auto',
    padding: '0 1.5rem',
    color: '#111827',
  } as const,
  header: {
    padding: '1.25rem 0',
    borderBottom: '1px solid #e5e7eb',
    marginBottom: '1.5rem',
  } as const,
  logo: {
    fontWeight: 700,
    fontSize: '1.1rem',
    textDecoration: 'none',
    color: '#111827',
  } as const,
  main: {
    paddingBottom: '3rem',
  } as const,
};
