// Audit log — fire-and-forget helper for recording all mutations.
//
// Every state-changing operation in the Worker (DNS, auth, domain, team, cron)
// calls logAudit(). The write is non-blocking: if ctx is provided it uses
// ctx.waitUntil so it never adds latency to the response. If DB is unavailable
// the error is logged but never thrown.
//
// before_value / after_value are serialised to JSON strings at insert time.
// Reads parse them back. Callers pass raw objects — no pre-serialisation needed.

export interface AuditEntry {
  customer_id: string;
  actor_id?: string | null;
  actor_email?: string | null;
  actor_type?: 'user' | 'system';
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  resource_name?: string | null;
  before_value?: unknown;
  after_value?: unknown;
  meta?: Record<string, unknown> | null;
}

export function logAudit(
  db: D1Database,
  entry: AuditEntry,
  ctx?: ExecutionContext,
): void {
  const run = db
    .prepare(
      `INSERT INTO audit_log
        (customer_id, actor_id, actor_email, actor_type, action,
         resource_type, resource_id, resource_name, before_value, after_value, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      entry.customer_id,
      entry.actor_id ?? null,
      entry.actor_email ?? null,
      entry.actor_type ?? 'user',
      entry.action,
      entry.resource_type ?? null,
      entry.resource_id ?? null,
      entry.resource_name ?? null,
      entry.before_value != null ? JSON.stringify(entry.before_value) : null,
      entry.after_value != null ? JSON.stringify(entry.after_value) : null,
      entry.meta ? JSON.stringify(entry.meta) : null,
    )
    .run()
    .catch((e: unknown) => console.error('[audit] log failed:', e));

  if (ctx) {
    ctx.waitUntil(run);
  }
}
