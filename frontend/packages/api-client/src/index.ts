/**
 * Shared API plumbing: problem+json errors, and organisation-scoped query
 * hooks whose cache key cannot omit the organisation.
 *
 * NOT A GENERATED CLIENT, and this file used to say it was. drf-spectacular
 * was removed from the backend on 2026-10-02 — it had been in the scaffold
 * since Phase 1 and nobody had agreed to it — so there is no OpenAPI schema
 * and no `npm run api:generate`. Request and response types are written by
 * hand, the same way the fakes already declare them.
 *
 * That is a real trade, not a tidy-up: hand-written types can disagree with
 * what Django actually returns, and nothing will tell you. The backend is the
 * source of truth; when these drift, the types are wrong.
 *
 * Note: org slug travels in the URL path, not the token, so every request
 * takes it explicitly: /api/v1/orgs/{orgSlug}/{app}/...
 */
export * from "./body";
export * from "./csrf";
export * from "./problem";
export * from "./orgQuery";
