import { useState, useEffect } from 'preact/hooks';
import { useIsMobile } from './hooks';
import { Overview } from './pages/Overview';
import { DomainDetail } from './pages/Domain';
import { AddDomain } from './pages/AddDomain';
import { ReportDetail } from './pages/ReportDetail';
import { DomainSettings } from './pages/DomainSettings';
import { Explore } from './pages/Explore';
import { EmailCheck } from './pages/EmailCheck';
import { ApiKeyGate } from './ApiKeyGate';

function getRoute(): string {
  return window.location.hash.replace(/^#/, '') || '/';
}

function navActive(route: string, section: 'domains' | 'check'): boolean {
  if (section === 'check') return route === '/check';
  return route === '/' || route === '/add' || route.startsWith('/domains/');
}

export function App() {
  const [route, setRoute] = useState(getRoute);
  const [hasKey, setHasKey] = useState(() => !!localStorage.getItem('ia_api_key'));
  const handleUnauth = () => { localStorage.removeItem('ia_api_key'); setHasKey(false); };

  useEffect(() => {
    const onHash = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const mobile = useIsMobile();

  if (!hasKey) return <ApiKeyGate onSave={() => setHasKey(true)} />;

  return (
    <div style={{ ...styles.shell, padding: mobile ? '0 1rem' : '0 1.5rem' }}>
      <header style={styles.header}>
        <a href="#/" style={styles.logo}>InboxAngel</a>
        <nav style={styles.nav}>
          <a href="#/" style={{ ...styles.navLink, ...(navActive(route, 'domains') ? styles.navLinkActive : {}) }}>
            Domains
          </a>
          <a href="#/check" style={{ ...styles.navLink, ...(navActive(route, 'check') ? styles.navLinkActive : {}) }}>
            {mobile ? 'Check' : 'Email check'}
          </a>
        </nav>
      </header>
      <main style={styles.main}>
        {route === '/' && <Overview onUnauthorized={handleUnauth} />}
        {route === '/add' && <AddDomain onUnauthorized={handleUnauth} />}
        {route === '/check' && <EmailCheck />}
        {/^\/domains\/(\d+)$/.test(route) && !/\/settings$/.test(route) && (
          <DomainDetail id={parseInt(route.split('/')[2], 10)} onUnauthorized={handleUnauth} />
        )}
        {/^\/domains\/(\d+)\/settings$/.test(route) && (
          <DomainSettings id={parseInt(route.split('/')[2], 10)} onUnauthorized={handleUnauth} />
        )}
        {/^\/domains\/(\d+)\/explore$/.test(route) && (
          <Explore domainId={parseInt(route.split('/')[2], 10)} onUnauthorized={handleUnauth} />
        )}
        {(() => {
          const m = route.match(/^\/domains\/(\d+)\/reports\/(\d{4}-\d{2}-\d{2})$/);
          return m ? <ReportDetail domainId={parseInt(m[1], 10)} date={m[2]} onUnauthorized={handleUnauth} /> : null;
        })()}
        {route !== '/' && route !== '/add' && route !== '/check' &&
         !/^\/domains\/\d+$/.test(route) &&
         !/^\/domains\/\d+\/settings$/.test(route) &&
         !/^\/domains\/\d+\/explore$/.test(route) &&
         !/^\/domains\/\d+\/reports\/\d{4}-\d{2}-\d{2}$/.test(route) && (
          <p style={{ color: '#9ca3af' }}>Page not found. <a href="#/">Back to overview</a></p>
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
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  nav: {
    display: 'flex',
    gap: '1rem',
  } as const,
  navLink: {
    fontSize: '0.875rem',
    textDecoration: 'none',
    color: '#6b7280',
  } as const,
  navLinkActive: {
    color: '#111827',
    fontWeight: 600,
  } as const,
  main: {
    paddingBottom: '3rem',
  } as const,
};
