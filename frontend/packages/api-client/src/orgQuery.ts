/**
 * Organisation-scoped query and mutation hooks.
 *
 * These exist so the cache key cannot be got wrong. Product code never calls
 * TanStack Query's `useQuery` / `useMutation` directly — ESLint refuses the
 * import outside this package — so there is no code path that produces a cache
 * key without the organisation in it.
 *
 * WHY THIS IS NOT LEFT TO DISCIPLINE
 *
 * A key like ["enquiries", "list"] works perfectly in development, where you are
 * only ever signed into one organisation. It breaks the first time a real user
 * with two memberships switches org in the topbar: TanStack Query finds a cache
 * hit and renders Acme's enquiries inside Northway. The backend behaved
 * correctly and the cache did it — and to the person looking at the screen it is
 * indistinguishable from a data breach.
 *
 * A rule in a document does not survive four developers and a deadline. A
 * function signature does.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useOrgSlug } from "@xpredict/auth";

/**
 * A module-relative cache key: everything *after* the organisation.
 *
 * `["dms", "sales", "enquiries", "list", filters]` — never the org itself.
 * This hook adds that, and it is the only thing that does.
 */
export type ModuleKey = readonly unknown[];

/** Prefix a module-relative key with the organisation. Exported for invalidation. */
export function orgKey(orgSlug: string, key: ModuleKey): readonly unknown[] {
  return ["org", orgSlug, ...key] as const;
}

type OrgQueryOptions<TData> = Omit<
  UseQueryOptions<TData, Error, TData, readonly unknown[]>,
  "queryKey" | "queryFn"
> & {
  /** Module-relative. The org is prepended for you. */
  key: ModuleKey;
  /** Receives the current org slug, so it cannot be forgotten in the URL either. */
  queryFn: (orgSlug: string) => Promise<TData>;
};

export function useOrgQuery<TData>(options: OrgQueryOptions<TData>): UseQueryResult<TData, Error> {
  const orgSlug = useOrgSlug();
  const { key, queryFn, ...rest } = options;

  return useQuery({
    queryKey: orgKey(orgSlug, key),
    queryFn: () => queryFn(orgSlug),
    ...rest,
  });
}

type OrgMutationOptions<TData, TVariables> = Omit<
  UseMutationOptions<TData, Error, TVariables>,
  "mutationFn"
> & {
  mutationFn: (orgSlug: string, variables: TVariables) => Promise<TData>;
  /**
   * Module-relative key branches to invalidate on success.
   *
   * Also org-prefixed, which closes the matching hole on the write side: an
   * invalidation of ["enquiries"] would refetch *every* organisation's
   * enquiries cached in this browser session, not just the current one.
   */
  invalidates?: readonly ModuleKey[];
};

export function useOrgMutation<TData, TVariables = void>(
  options: OrgMutationOptions<TData, TVariables>,
): UseMutationResult<TData, Error, TVariables> {
  const orgSlug = useOrgSlug();
  const queryClient = useQueryClient();
  const { mutationFn, invalidates, onSuccess, ...rest } = options;

  return useMutation({
    mutationFn: (variables: TVariables) => mutationFn(orgSlug, variables),
    // Forward whatever arguments the library passes rather than naming them.
    // TanStack Query has changed this callback's arity within v5 (it is
    // currently data, variables, onMutateResult, context) and spreading keeps
    // this wrapper working across those changes.
    onSuccess: (...args) => {
      for (const key of invalidates ?? []) {
        void queryClient.invalidateQueries({ queryKey: orgKey(orgSlug, key) });
      }
      onSuccess?.(...args);
    },
    ...rest,
  });
}

/**
 * Query-client access that is already scoped to the current organisation.
 *
 * For the rare case needing `setQueryData` — writing a mutation's result
 * straight into the detail cache rather than refetching it.
 */
export function useOrgQueryClient() {
  const orgSlug = useOrgSlug();
  const queryClient = useQueryClient();

  return {
    orgSlug,
    setData: <TData>(key: ModuleKey, data: TData) =>
      queryClient.setQueryData(orgKey(orgSlug, key), data),
    invalidate: (key: ModuleKey) =>
      queryClient.invalidateQueries({ queryKey: orgKey(orgSlug, key) }),
  };
}
