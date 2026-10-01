"""
What exists in Sales. Structure only — no behaviour that changes state.

EMPTY ON PURPOSE. A worked `Enquiry` model lived here through Phase 1 as a
shape reference, and it was deleted on 2026-10-01 for two reasons: bare
`makemigrations` kept generating a migration for a model nobody wanted, and
once tenant provisioning runs, a placeholder model is not inert — it would
create a real `enquiry` table, with placeholder columns, in EVERY
organization's database. The conventions it demonstrated are below; they are
the part worth keeping.

Write the real models here. The conventions:

- Inherit `UnitScopedModel` for anything a dealer owns. It supplies `unit_id`
  and a default manager that filters by the caller's dealer, so a query for
  another dealer's row returns nothing — which is what turns into 404, not 403.
- Inherit `BaseModel` instead for records that belong to the organization as a
  whole rather than to one dealer.
- Reference control-plane rows (users, business units) by **plain UUID**, never
  a ForeignKey: they live in a different database and the router refuses
  cross-database relations.
- ForeignKeys *within* the same tenant database are fine — but only to models
  this product owns. Never to another product's models.
- Model methods may compute and validate. They must not create, update or
  delete other modules' data — that belongs in services.py.
- **`unit_id` leads every index.** Every scoped query filters on it first, so an
  index that does not start with it will not be used by the queries that matter.
- Add the app to `TENANT_APPS` in `config/settings/base.py`, or it never
  migrates and nothing tells you.

The router keeps this module out of the control database. Verified against a
real MySQL on 2026-10-01: `migrate` reports "Applying dms_sales.0001_initial...
OK" and creates NOTHING, because `allow_migrate` refused every operation. That
line prints either way — check the tables, not the output.
"""
