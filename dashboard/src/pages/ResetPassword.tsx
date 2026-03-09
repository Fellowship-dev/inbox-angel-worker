import { useState, useEffect } from 'preact/hooks';

interface Props {
  token: string;
  onReset: () => void;
}

export function ResetPassword({ token, onReset }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [invalid, setInvalid] = useState(false);

  // Validate token exists on mount (basic sanity check)
  useEffect(() => {
    if (!token || token.length < 10) setInvalid(true);
  }, [token]);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? 'Reset failed');
        if (res.status === 400) setInvalid(true);
        return;
      }
      const { token: sessionToken } = await res.json() as { token: string };
      localStorage.setItem('ia_api_key', sessionToken);
      onReset();
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  };

  if (invalid) {
    return (
      <div style={s.wrap}>
        <div style={s.box}>
          <div style={s.logo}>🪄 InboxAngel</div>
          <h1 style={s.title}>Link expired</h1>
          <p style={s.subtitle}>This reset link is invalid or has expired. Request a new one from the sign-in page.</p>
          <a href="#/" style={s.btn}>Back to sign in</a>
        </div>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <form onSubmit={submit} style={s.box}>
        <div style={s.logo}>🪄 InboxAngel</div>
        <h1 style={s.title}>Set new password</h1>
        <label style={s.label}>
          New password
          <input
            type="password"
            placeholder="Choose a password (8+ chars)"
            value={password}
            onInput={e => setPassword((e.target as HTMLInputElement).value)}
            style={s.input}
            required
            autoFocus
            autoComplete="new-password"
          />
        </label>
        <label style={s.label}>
          Confirm password
          <input
            type="password"
            placeholder="Same password again"
            value={confirm}
            onInput={e => setConfirm((e.target as HTMLInputElement).value)}
            style={s.input}
            required
            autoComplete="new-password"
          />
        </label>
        {error && <p style={s.error}>{error}</p>}
        <button type="submit" style={s.btn} disabled={loading}>
          {loading ? '…' : 'Set password →'}
        </button>
      </form>
    </div>
  );
}

const s = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f9fafb',
    padding: '2rem 1rem',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  } as const,
  box: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
    width: '100%',
    maxWidth: '400px',
    padding: '2rem',
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
  },
  logo: { fontSize: '1.1rem', fontWeight: 700, color: '#111827' } as const,
  title: { margin: 0, fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' },
  subtitle: { margin: 0, color: '#6b7280', fontSize: '0.875rem', lineHeight: 1.5 } as const,
  label: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.35rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#374151',
  },
  input: {
    padding: '0.6rem 0.75rem',
    border: '1.5px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '0.95rem',
    outline: 'none',
    fontFamily: 'inherit',
  } as const,
  error: { margin: 0, color: '#dc2626', fontSize: '0.875rem' } as const,
  btn: {
    display: 'block',
    padding: '0.7rem',
    background: '#111827',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '0.25rem',
    textAlign: 'center' as const,
    textDecoration: 'none',
  } as const,
};
