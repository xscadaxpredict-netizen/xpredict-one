import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Module boundaries and cache-key safety, enforced.
 *
 * CAREFUL WHEN EDITING: `no-restricted-imports` is configured in several blocks
 * below, and in ESLint flat config a later block does not *merge* a rule's
 * options — it REPLACES them. A block that sets only its own `patterns` would
 * silently drop the shared `paths` restriction for exactly those files.
 *
 * So every block spreads QUERY_HOOK_PATHS. If you add a block that restricts
 * imports, spread it there too.
 */

/**
 * Product code must not call TanStack Query directly.
 *
 * `useQuery` lets you write `queryKey: ["enquiries"]`, which works perfectly in
 * development — where you are only ever signed into one organisation — and
 * serves the previous org's cached data the first time a real user with two
 * memberships switches in the topbar. The backend is blameless; the cache did
 * it; it is indistinguishable from a breach to whoever is looking at it.
 *
 * `useOrgQuery` takes a module-relative key and prepends the organisation
 * itself, so no code path can omit it. This closes the bypass.
 */
const QUERY_HOOK_PATHS = [
  {
    name: "@tanstack/react-query",
    importNames: [
      "useQuery",
      "useMutation",
      "useInfiniteQuery",
      "useSuspenseQuery",
      "useQueryClient",
    ],
    message:
      "Use useOrgQuery / useOrgMutation / useOrgQueryClient from @xpredict/api-client. " +
      "They scope the cache key to the current organisation; the raw hooks let you " +
      "forget, and forgetting serves one customer's data to another. " +
      "See CONTRIBUTING.md section 4.",
  },
];

/**
 * The shell must not import a product at all.
 *
 * Products are wired in `src/router.tsx`, which lazy-imports each one's
 * `routes` entry point. That file is outside `src/shell/**`, so it is not
 * covered by this rule — which leaves the shell itself with no reason to name
 * a product, and this rule saying exactly that.
 *
 * THIS RULE NEVER FIRED UNTIL 2026-09-30. It was written with an extglob
 * exclusion to permit the `routes` entry point, and extglob inside a `group`
 * pattern matches nothing at all — so the rule loaded, reported no error, and
 * looked exactly like a rule that was passing. A shell file importing a
 * product's internals linted clean for four sessions.
 *
 * The exception was dropped rather than repaired: no negation form tried would
 * re-include the entry point (five variants were measured, every one left it
 * blocked), and a rule whose message promises an exception it does not
 * grant is worse than one without the exception. Nothing imports it from here
 * anyway. If the shell ever genuinely needs to, move the wiring to
 * `src/router.tsx` where it belongs, or widen this deliberately and PROVE the
 * pattern with a throwaway file — these globs fail silently.
 *
 * Do not paste a glob containing a star-then-slash into a block comment here:
 * it ends the comment, and the config dies with a ReferenceError naming a path
 * segment. That is how this comment was first written.
 */
const SHELL_PATTERNS = [
  {
    group: ["**/products/**"],
    message:
      "The shell must not import a product. Products are wired in src/router.tsx, " +
      "which lazy-imports each product's routes entry point; the shell itself never " +
      "names one.",
  },
];

/*
 * What a product may take from the shell, and nothing else.
 *
 * A product renders inside the shell, so it needs three things from it: the
 * route wrapper that drops modules the person lacks, the access rules that
 * gate a button, and the membership the shell already resolved. That is the
 * contract, and it is the list below.
 *
 * THE TWO THAT MATTER, of everything this shuts out:
 *
 *   `shell/components/*` — Button, TextField, FormBanner. Borrowing one works
 *   and lints clean, which is exactly the problem: the component then never
 *   gets promoted into packages/ui when a second caller appears, and the rule
 *   of two quietly stops working. By the time CRM wants a button, DMS is
 *   welded to the admin console's private copy of one.
 *
 *   `shell/admin/*` — the Administration console's own hooks and API layer. A
 *   DMS screen calling `useUsers()` is one product reading another app's data
 *   through the back door.
 *
 * To share a component, move it to `packages/ui` and import it from there.
 * That is the rule of two working, not an obstacle to it.
 *
 * WHY NEGATION RATHER THAN `!(routing|access|context)`: extglob in a `group`
 * pattern silently matches NOTHING here — the rule loads, reports no error, and
 * you believe you are protected. Measured, not assumed: the extglob form
 * caught 0 of 5 forbidden imports, the form below catches 5 of 5 and allows
 * all three permitted ones. If you change these patterns, prove it with a
 * throwaway file that imports something banned.
 */
const PRODUCT_SHELL_PATTERNS = [
  {
    group: [
      "**/shell/**",
      "!**/shell/routing",
      "!**/shell/access",
      "!**/shell/context",
    ],
    message:
      "A product may import only shell/routing, shell/access and shell/context. " +
      "A shared component belongs in packages/ui -- move it there, then import it. " +
      "The Administration console's hooks and API are not a product's to call.",
  },
];

/** Products are separate deployable concerns: they never reach into each other. */
const crossProduct = (forbidden, allowed) => ({
  group: [`**/products/${forbidden}/**`, `@/products/${forbidden}/*`],
  message:
    `${allowed} must not import from ${forbidden}. Move shared code into ` +
    "packages/ui, packages/api-client or packages/auth.",
});

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Server data comes from the generated client. An `any` means someone
      // bypassed the API contract, and the contract is the only thing keeping
      // frontend and backend honest with each other.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "no-restricted-imports": ["error", { paths: QUERY_HOOK_PATHS }],
    },
  },
  {
    files: ["src/products/dms/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: QUERY_HOOK_PATHS,
          patterns: [crossProduct("crm", "DMS"), ...PRODUCT_SHELL_PATTERNS],
        },
      ],
    },
  },
  {
    files: ["src/products/crm/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: QUERY_HOOK_PATHS,
          patterns: [crossProduct("dms", "CRM"), ...PRODUCT_SHELL_PATTERNS],
        },
      ],
    },
  },
  {
    // The shell is the launcher, org switcher and admin console.
    files: ["src/shell/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: QUERY_HOOK_PATHS, patterns: SHELL_PATTERNS },
      ],
    },
  },
  {
    /*
     * The ONLY exemption from the query-hook ban, and deliberately a short
     * list of named files.
     *
     * These all run BEFORE an organisation is known — signing in, signing up,
     * and accepting an invitation, which is done by somebody with no
     * membership at all (C56) — so there is no org to scope a cache key by and
     * `useOrgQuery` cannot work here.
     *
     * Kept this narrow on purpose. Exempting `src/shell/**` would have been
     * easier and wrong: the rest of the shell is the admin console, which is
     * very much org-scoped, and an admin screen serving another organisation's
     * cached user list is precisely the disaster this rule exists to prevent.
     *
     * Files are listed individually rather than matched by pattern, so adding
     * one is a deliberate act that shows up in a diff.
     */
    files: [
      "src/shell/hooks/useAuth.ts",
      "src/shell/hooks/useSignup.ts",
      // Accepting an invitation: the caller is not a member of anything yet,
      // and the token is the only thing identifying the organisation.
      "src/shell/hooks/useInvitation.ts",
    ],
    rules: {
      "no-restricted-imports": ["error", { patterns: SHELL_PATTERNS }],
    },
  },
  {
    // Plain JS config files are not in any tsconfig project, so the
    // type-aware rules cannot run on them. Lint them without types rather
    // than adding them to tsconfig, which would pull build config into the
    // app's compilation.
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    ignores: ["dist/**", "node_modules/**", "src/generated/**"],
  },
);
