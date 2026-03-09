import { useState } from 'preact/hooks';

interface Props {
  onSave: (key: string) => void;
}

export function ApiKeyGate({ onSave }: Props) {
  const [value, setValue] = useState('');

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
        <p style={styles.hint}>Enter your API key to continue.</p>
        <input
          type="password"
          placeholder="sk-••••••••"
          value={value}
          onInput={(e) => setValue((e.target as HTMLInputElement).value)}
          style={styles.input}
          autoFocus
        />
        <button type="submit" style={styles.button}>Continue</button>
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
    maxWidth: '320px',
    padding: '2rem',
    background: '#fff',
    borderRadius: '10px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
    fontFamily: 'system-ui, sans-serif',
  },
  title: { margin: 0, fontSize: '1.25rem' },
  hint: { margin: 0, color: '#6b7280', fontSize: '0.875rem' },
  input: {
    padding: '0.6rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '1rem',
    outline: 'none',
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
