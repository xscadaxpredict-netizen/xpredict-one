/**
 * Authentication hooks.
 *
 * These use TanStack Query's `useQuery` / `useMutation` directly rather than
 * `useOrgQuery` — and that is correct, not an oversight.
 *
 * Every other screen is inside an organisation, so its cache key must carry the
 * org slug. Login is the one screen that runs BEFORE an organisation is known;
 * that is the entire purpose of it. There is no org to scope by, so the rule
 * that protects every other key simply does not apply here.
 *
 * (ESLint forbids the raw hooks in `products/`, which is where the rule
 * matters. The shell is exempt for exactly this reason.)
 *
 * Note what is NOT here: no token, anywhere. With httpOnly cookies (C12) the
 * browser holds it and JavaScript cannot see it, so "am I signed in?" is not a
 * value we store — it is whether `/me` answers. That makes it SERVER state, and
 * server state belongs in TanStack Query, never in Zustand.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type Credentials, fetchMe, login, logout } from "../api/auth";

/** The cached identity. No org prefix: this is who you are, before any org. */
export const authKeys = { me: () => ["auth", "me"] as const,};

/**
 * Who am I — and, by whether it succeeds, am I signed in at all.
 *
 * `retry: false` matters here. A 401 means "not signed in", which is a normal
 * answer rather than a failure; retrying it three times would just delay the
 * login screen by a couple of seconds on every first visit.
 */
export function useMe() {
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: fetchMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credentials: Credentials) => login(credentials),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
    },
  });
}
