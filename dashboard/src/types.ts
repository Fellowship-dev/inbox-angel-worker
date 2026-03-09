export interface Domain {
  id: number;
  domain: string;
  dmarc_policy: 'none' | 'quarantine' | 'reject' | null;
  rua_address: string;
  customer_id: string;
}

export interface DailyStat {
  day: string;
  total: number;
  passed: number;
  failed: number;
}

export interface DomainStats {
  domain: string;
  days: number;
  stats: DailyStat[];
}
