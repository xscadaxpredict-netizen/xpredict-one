/**
 * Typed API client, generated from the Django OpenAPI schema.
 *
 * Regenerate with `npm run api:generate` after changing a serializer. The
 * generated output lands in ./generated and is gitignored --- it is a build
 * artifact, and a stale committed copy is worse than no copy.
 *
 * Generate the schema first:
 *   cd backend && python manage.py spectacular --file ../frontend/openapi.yaml
 *
 * Note: org slug travels in the URL path, not the token, so every request
 * takes it explicitly: /api/v1/orgs/{orgSlug}/{app}/...
 */
export * from "./problem";
export * from "./orgQuery";
