"""
DMS --- dealership management. A container for its modules, not an app itself.

Each subpackage is its own Django app with a unique `dms_*` label, so each
owns its models and its migration history independently. DMS is the only
unit-aware product (C5): its records are scoped to a dealer by `unit_id`.
"""
