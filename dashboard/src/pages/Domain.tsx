import { useEffect, useState } from 'preact/hooks';
import { getDomains, getDomainStats } from '../api';
import type { Domain, DomainStats } from '../types';

interface Props {
  id: number;
  onUnauthorized: () => void;
}

const POLICY_COLOR: Record<string, string> = {
  reject: '#16a34a',
  quarantine: '#d97706',
  none: '#dc2626',
};

export function DomainDetail({ id, onUnauthorized }: Props) {
  const [domain, setDomain] = useState<Domain | null>(null);
  const [stats, setStats] = useState<DomainStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [{ domains }, s] = await Promise.all([
          getDomains(),
          getDomainStats(id, 7),
        ]);
        if (cancelled) return;
        setDomain(domains.find((d) => d.id === id) ?? null);
        setStats(s);
      } catch (e: any) {
        if (cancelled) return;
        if (e.message === '401') { onUnauthorized(); return; }
        setError(e.message ?? 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <p style={s.muted}>Loading…</p>;
  if (error) return <p style={{ color: '#dc2626' }}>Error: {error}</p>;
  if (!domain || !stats) return <p style={s.muted}>Domain not found.</p>;

  const total = stats.stats.reduce((n, r) => n + r.total, 0);
  const passed = stats.stats.reduce((n, r) => n + r.passed, 0);
  const failed = stats.stats.reduce((n, r) => n + r.failed, 0);
  const passRate = total > 0 ? Math.round((passed / total) * 100) : null;
  const maxTotal = Math.max(...stats.stats.map((r) => r.total), 1);

  const policy = domain.dmarc_policy ?? 'none';

  return (
    <div>
      {/* Back link */}
      <a href="#/" style={s.back}>← All domains</a>

      {/* Header */}
      <div style={s.header}>
        <h2 style={s.domainName}>{domain.domain}</h2>
        <span style={{ ...s.badge, color: POLICY_COLOR[policy] ?? '#6b7280' }}>
          {policy}
        </span>
      </div>

      {/* Summary numbers */}
      <div style={s.summaryRow}>
        <Stat label="Pass rate" value={passRate !== null ? `${passRate}%` : '—'} accent />
        <Stat label="Total messages" value={total.toLocaleString()} />
        <Stat label="Passed" value={passed.toLocaleString()} />
        <Stat label="Failed" value={failed.toLocaleString()} />
      </div>

      {/* Daily bars */}
      <h3 style={s.sectionTitle}>Last 7 days</h3>
      {stats.stats.length === 0 && <p style={s.muted}>No data yet.</p>}
      <div style={s.bars}>
        {stats.stats.map((row) => {
          const passW = total > 0 ? (row.passed / maxTotal) * 100 : 0;
          const failW = total > 0 ? (row.failed / maxTotal) * 100 : 0;
          const label = row.day.slice(5); // MM-DD
          return (
            <div key={row.day} style={s.barRow}>
              <span style={s.dayLabel}>{label}</span>
              <div style={s.barTrack}>
                <div style={{ ...s.barPass, width: `${passW}%` }} />
                <div style={{ ...s.barFail, width: `${failW}%` }} />
              </div>
              <span style={s.barCount}>{row.total.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={s.stat}>
      <div style={{ ...s.statValue, color: accent ? '#111827' : '#374151' }}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  );
}

const s = {
  back: { fontSize: '0.875rem', color: '#6b7280', textDecoration: 'none', display: 'inline-block', marginBottom: '1.25rem' } as const,
  header: { display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '1.5rem' } as const,
  domainName: { margin: 0, fontSize: '1.5rem', fontWeight: 700 },
  badge: { fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  summaryRow: { display: 'flex', gap: '2rem', padding: '1.25rem 0', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', marginBottom: '2rem' } as const,
  stat: { display: 'flex', flexDirection: 'column' as const, gap: '0.25rem' },
  statValue: { fontSize: '1.5rem', fontWeight: 700 },
  statLabel: { fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  sectionTitle: { fontSize: '0.875rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 1rem' },
  bars: { display: 'flex', flexDirection: 'column' as const, gap: '0.5rem' },
  barRow: { display: 'flex', alignItems: 'center', gap: '0.75rem' } as const,
  dayLabel: { width: '3rem', fontSize: '0.8rem', color: '#6b7280', flexShrink: 0 } as const,
  barTrack: { flex: 1, height: '8px', borderRadius: '4px', background: '#f3f4f6', position: 'relative' as const, overflow: 'hidden', display: 'flex' },
  barPass: { height: '100%', background: '#16a34a', borderRadius: '4px 0 0 4px', transition: 'width 0.3s' } as const,
  barFail: { height: '100%', background: '#dc2626', transition: 'width 0.3s' } as const,
  barCount: { width: '4rem', fontSize: '0.8rem', color: '#9ca3af', textAlign: 'right' as const, flexShrink: 0 },
  muted: { color: '#9ca3af' } as const,
};
