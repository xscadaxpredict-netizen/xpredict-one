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
 * The shell routes to products but must not know their internals.
 */
const SHELL_PATTERNS = [
  {
    group: ["**/products/*/!(routes)", "@/products/*/!(routes)"],
    message:
      "The shell may only import a product's routes entry point, not its " +
      "internal components.",
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
          patterns: [crossProduct("crm", "DMS")],
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
          patterns: [crossProduct("dms", "CRM")],
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
     * The ONLY exemption from the query-hook ban, and deliberately one file.
     *
     * Authentication runs BEFORE an organisation is known — that is the whole
     * purpose of signing in — so there is no org to scope a cache key by and
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
    files: ["src/shell/hooks/useAuth.ts", "src/shell/hooks/useSignup.ts"],
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
