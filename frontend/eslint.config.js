import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Base rules for the shared packages.
 *
 * `apps/web` has its own config, which ESLint finds first when linting from
 * that directory — the module-boundary and cache-key rules live there because
 * they are about products and the shell, neither of which exists in here.
 *
 * This file exists because `npm run lint` at the root was failing: each
 * package has a `lint` script and none had a config, so the command the team
 * is told to run errored out before linting anything.
 *
 * Deliberately not type-aware. These packages are small and the type-checked
 * rules need every file in a tsconfig project; `npm run typecheck` already
 * covers what those rules would catch here.
 */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      /*
       * STILL AN ERROR HERE, DELIBERATELY, while `apps/web` relaxed it to a
       * warning (C65).
       *
       * The original reason is gone -- it said "server data comes from the
       * generated client, and an `any` means someone bypassed the API
       * contract", and C43 removed that client on 2026-10-02. What justifies
       * it NOW is different and narrower: these three packages are the shared
       * layer. An untyped value in `api-client` propagates to every screen
       * that calls it, while an `any` inside one product screen stops there.
       *
       * It also costs nothing: `api-client`, `ui` and `auth` contain zero
       * `any` between them, and zero lint problems. Relaxing a rule that is
       * already being met would buy no time and lose the guarantee.
       */
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",

      /*
       * A leading underscore marks a parameter that exists to satisfy a
       * signature but is not used yet — the Phase 4 stubs in `auth` are full
       * of them. Without this, the only way to keep a stub honest about the
       * arguments it will take is to delete them.
       */
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: ["**/dist/**", "**/node_modules/**", "apps/**"],
  },
);
