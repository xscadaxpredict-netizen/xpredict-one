"""
DMS SETTINGS (C78 amended, C82): the pages behind the gear in the topbar,
`/api/v1/orgs/<slug>/dms/settings/`.

NOT A DJANGO APP, deliberately: it owns no models and no tables. What it shows
-- who holds DMS, their roles and places -- is the control plane's, so it reads
`core` selectors and stores nothing of its own. If it ever gains a model it
becomes an app like its siblings (label `dms_app_settings`, added to
`TENANT_APPS`), and that is a decision, not a tidy-up.
"""
