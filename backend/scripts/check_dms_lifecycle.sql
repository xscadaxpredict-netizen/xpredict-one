-- ============================================================================
-- DMS lifecycle check: enquiry -> quotation -> confirmed site -> field records
--
-- Run against ONE organisation's database (each org has its own):
--   mysql -u root -p xpredict_<org-slug> < backend/scripts/check_dms_lifecycle.sql
-- or paste into MySQL Workbench after:  USE xpredict_<org-slug>;
--
-- Part A shows the data so you can read it. Part B are consistency checks:
-- EVERY query in Part B must return ZERO rows. Any row is a broken record.
-- ============================================================================

-- ---------------------------------------------------------------- PART A: look
-- A1. Customers (one row per name per dealership)
SELECT c.unit_id, c.name, c.phone, c.city,
       (SELECT COUNT(*) FROM dms_sales_enquiry e WHERE e.customer_id = c.id) AS enquiries
FROM dms_sales_customer c ORDER BY c.unit_id, c.name;

-- A2. Enquiries with their confirmed quote and site, side by side
SELECT e.customer_name, e.status AS enquiry_status, e.oc_number AS enquiry_oc,
       q.quote_no AS confirmed_quote, q.quote_type, q.status AS quote_status,
       s.oc_number AS site_oc, s.is_active AS site_active, e.created_at
FROM dms_sales_enquiry e
LEFT JOIN dms_sales_quotation q ON q.id = e.confirmed_quote_id
LEFT JOIN dms_sales_confirmedsite s ON s.enquiry_id = e.id
ORDER BY e.created_at DESC;

-- A3. Every quotation with its enquiry and commission
SELECT e.customer_name, q.quote_no, q.quote_type, q.status, q.agent_name,
       q.commission_amount, q.commission_status, q.created_at
FROM dms_sales_quotation q JOIN dms_sales_enquiry e ON e.id = q.enquiry_id
ORDER BY e.customer_name, q.created_at;

-- A4. Confirmed sites and what hangs off each one
SELECT s.oc_number, s.site_name, s.is_active, e.status AS enquiry_status,
  (SELECT COUNT(*) FROM dms_site_services_servicereport r WHERE r.site_id = s.id) AS service_reports,
  (SELECT COUNT(*) FROM dms_site_services_waterreport  w WHERE w.site_id = s.id) AS water_reports,
  (SELECT COUNT(*) FROM dms_site_services_complaint    c WHERE c.site_id = s.id) AS complaints,
  (SELECT COUNT(*) FROM dms_site_services_serviceschedule v WHERE v.site_id = s.id) AS visits,
  (SELECT COUNT(*) FROM dms_ecommerce_ecommerceorder   o WHERE o.site_id = s.id) AS store_orders
FROM dms_sales_confirmedsite s JOIN dms_sales_enquiry e ON e.id = s.enquiry_id
ORDER BY s.oc_number;

-- A5. Payments recorded (lead fees and commissions)
SELECT p.payout_type, p.agent_name, p.amount, p.paid_at, e.customer_name, q.quote_no
FROM dms_sales_agentpayout p
LEFT JOIN dms_sales_enquiry e ON e.id = p.enquiry_id
LEFT JOIN dms_sales_quotation q ON q.id = p.quotation_id
ORDER BY p.paid_at DESC;

-- ------------------------------------------- PART B: must all return 0 rows
-- B1. An active site whose enquiry is not CONFIRMED (would leak into AMC/services)
SELECT 'B1 active site, enquiry not confirmed' AS problem, s.oc_number, e.customer_name, e.status
FROM dms_sales_confirmedsite s JOIN dms_sales_enquiry e ON e.id = s.enquiry_id
WHERE s.is_active = 1 AND e.status <> 'CONFIRMED';

-- B2. More than one site for one enquiry
SELECT 'B2 duplicate sites' AS problem, enquiry_id, COUNT(*) AS sites
FROM dms_sales_confirmedsite GROUP BY enquiry_id HAVING COUNT(*) > 1;

-- B3. A CONFIRMED enquiry with no active site
SELECT 'B3 confirmed, no active site' AS problem, e.customer_name, e.oc_number
FROM dms_sales_enquiry e
WHERE e.status = 'CONFIRMED'
  AND NOT EXISTS (SELECT 1 FROM dms_sales_confirmedsite s WHERE s.enquiry_id = e.id AND s.is_active = 1);

-- B4. Enquiry and its confirmed quote disagree
SELECT 'B4 enquiry/quote mismatch' AS problem, e.customer_name, e.status, q.quote_no, q.status
FROM dms_sales_enquiry e LEFT JOIN dms_sales_quotation q ON q.id = e.confirmed_quote_id
WHERE (e.status = 'CONFIRMED' AND (q.id IS NULL OR q.status <> 'CONFIRMED'))
   OR (e.status <> 'CONFIRMED' AND e.confirmed_quote_id IS NOT NULL);

-- B5. A CONFIRMED machine quote that is not its enquiry's confirmed quote
--     (e.g. left CONFIRMED after an unconfirm)
SELECT 'B5 stray confirmed machine quote' AS problem, e.customer_name, q.quote_no
FROM dms_sales_quotation q JOIN dms_sales_enquiry e ON e.id = q.enquiry_id
WHERE q.quote_type = 'NORMAL' AND q.status = 'CONFIRMED'
  AND (e.confirmed_quote_id IS NULL OR e.confirmed_quote_id <> q.id);

-- B6. Same customer name twice in one dealership (case/accent-insensitive in MySQL)
SELECT 'B6 duplicate customer' AS problem, unit_id, name, COUNT(*) AS copies
FROM dms_sales_customer GROUP BY unit_id, name HAVING COUNT(*) > 1;

-- B7. Same OC number twice in one dealership
SELECT 'B7 duplicate OC number' AS problem, unit_id, oc_number, COUNT(*) AS copies
FROM dms_sales_confirmedsite WHERE oc_number <> ''
GROUP BY unit_id, oc_number HAVING COUNT(*) > 1;

-- B8. Commission on an AMC or Spares quote (only machine quotes earn commission)
SELECT 'B8 commission on non-machine quote' AS problem, quote_no, quote_type, commission_amount
FROM dms_sales_quotation
WHERE quote_type IN ('AMC', 'SPARES') AND COALESCE(commission_amount, 0) <> 0;

-- B9. Enquiry OC differs from its site's OC
SELECT 'B9 OC mismatch' AS problem, e.customer_name, e.oc_number, s.oc_number
FROM dms_sales_enquiry e JOIN dms_sales_confirmedsite s ON s.enquiry_id = e.id
WHERE e.status = 'CONFIRMED' AND COALESCE(e.oc_number, '') <> COALESCE(s.oc_number, '');

-- B10. Orphans: children pointing at a site or enquiry that no longer exists
SELECT 'B10 orphan service report' AS problem, id FROM dms_site_services_servicereport
 WHERE site_id NOT IN (SELECT id FROM dms_sales_confirmedsite)
UNION ALL SELECT 'B10 orphan water report', id FROM dms_site_services_waterreport
 WHERE site_id NOT IN (SELECT id FROM dms_sales_confirmedsite)
UNION ALL SELECT 'B10 orphan complaint', id FROM dms_site_services_complaint
 WHERE site_id NOT IN (SELECT id FROM dms_sales_confirmedsite)
UNION ALL SELECT 'B10 orphan visit', id FROM dms_site_services_serviceschedule
 WHERE site_id NOT IN (SELECT id FROM dms_sales_confirmedsite)
UNION ALL SELECT 'B10 orphan store order', id FROM dms_ecommerce_ecommerceorder
 WHERE site_id IS NOT NULL AND site_id NOT IN (SELECT id FROM dms_sales_confirmedsite)
UNION ALL SELECT 'B10 orphan quotation', id FROM dms_sales_quotation
 WHERE enquiry_id NOT IN (SELECT id FROM dms_sales_enquiry);
