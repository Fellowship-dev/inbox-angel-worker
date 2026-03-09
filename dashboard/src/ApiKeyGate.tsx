import { useState, useEffect } from 'preact/hooks';

interface Props {
  onSave: (key: string) => void;
}

export function ApiKeyGate({ onSave }: Props) {
  const [value, setValue] = useState('');
  const [autoKey, setAutoKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/init-key')
      .then(r => r.ok ? r.json() as Promise<{ key: string }> : null)
      .then(data => { if (data?.key) { setAutoKey(data.key); setValue(data.key); } })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const submit = (e: Event) => {
    e.preventDefault();
    const key = value.trim();
    if (!key) return;
    localStorage.setItem('ia_api_key', key);
    onSave(key);
  };

  return (
    <div style={styles.wrap}>
      <form onSubmit={submit} style={styles.box}>
        <h1 style={styles.title}>InboxAngel</h1>

        {loading ? (
          <p style={styles.hint}>Loading…</p>
        ) : autoKey ? (
          <div style={styles.autoKeyBanner}>
            <strong>Your API key was auto-generated.</strong>
            <span style={{ display: 'block', marginTop: '0.25rem', color: '#374151' }}>
              Save it somewhere safe — you'll need it to log back in.
            </span>
          </div>
        ) : (
          <p style={styles.hint}>
            Enter the <code style={styles.code}>API_KEY</code> secret you set during setup.
          </p>
        )}

        <input
          type={autoKey ? 'text' : 'password'}
          placeholder="sk-••••••••"
          value={value}
          onInput={(e) => setValue((e.target as HTMLInputElement).value)}
          style={styles.input}
          autoFocus={!loading}
          readOnly={!!autoKey}
        />

        <button type="submit" style={styles.button} disabled={loading || !value.trim()}>
          {autoKey ? 'Open dashboard →' : 'Continue'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f9fafb',
  } as const,
  box: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
    width: '100%',
    maxWidth: '340px',
    padding: '2rem',
    background: '#fff',
    borderRadius: '10px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
    fontFamily: 'system-ui, sans-serif',
  },
  title: { margin: 0, fontSize: '1.25rem' },
  hint: { margin: 0, color: '#6b7280', fontSize: '0.875rem' },
  code: { fontFamily: 'monospace', fontSize: '0.8rem', background: '#f3f4f6', padding: '1px 4px', borderRadius: '3px' },
  autoKeyBanner: {
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: '6px',
    padding: '0.75rem',
    fontSize: '0.875rem',
    color: '#15803d',
  } as const,
  input: {
    padding: '0.6rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '0.9rem',
    fontFamily: 'monospace',
    outline: 'none',
    background: '#f9fafb',
  } as const,
  button: {
    padding: '0.6rem',
    background: '#111827',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.95rem',
    cursor: 'pointer',
  } as const,
};
