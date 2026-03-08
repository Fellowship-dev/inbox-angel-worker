// Resolves the customer and domain records from an inbound RUA recipient address.
//
// The to-address encodes which customer's inbox this is:
//   org_abc123@reports.inboxangel.com  →  domain.rua_address = "org_abc123@reports.inboxangel.com"
//
// Returns null if the address is unknown (not provisioned in D1).

import { getDomainByAddress, getCustomer } from '../db/queries';
import { Customer, Domain } from '../db/types';

export interface ResolvedCustomer {
  customer: Customer;
  domain: Domain;
}

/**
 * Looks up customer + domain from a full RUA email address.
 * Returns null if the address is not registered.
 */
export async function resolveCustomer(
  db: D1Database,
  ruaAddress: string,
): Promise<ResolvedCustomer | null> {
  const domain = await getDomainByAddress(db, ruaAddress.toLowerCase());
  if (!domain) return null;

  const customer = await getCustomer(db, domain.customer_id);
  if (!customer) return null;

  return { customer, domain };
}
