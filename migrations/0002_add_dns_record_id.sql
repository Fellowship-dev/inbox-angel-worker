-- Migration 0002: add dns_record_id to domains
-- Stores the Cloudflare DNS record ID for the cross-domain DMARC authorization
-- record provisioned when a customer adds a domain. Required for cleanup on delete.
ALTER TABLE domains ADD COLUMN dns_record_id TEXT;
