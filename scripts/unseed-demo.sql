-- InboxAngel demo data cleanup
-- Removes all data seeded by scripts/seed-demo.ts (customer_id = 'demo')
-- Safe to run multiple times.

DELETE FROM report_records   WHERE customer_id = 'demo';
DELETE FROM aggregate_reports WHERE customer_id = 'demo';
DELETE FROM domains          WHERE customer_id = 'demo';
DELETE FROM customers        WHERE id = 'demo';
