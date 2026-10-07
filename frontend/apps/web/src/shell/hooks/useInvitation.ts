/**
 * Reading and redeeming an invitation link (C56).
 *
 * Raw `useQuery` / `useMutation`, not `useOrgQuery`, for the same reason as
 * `useAuth`: this runs BEFORE an organisation is known. The token is the key,
 * because it is the only thing identifying anything at this point.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchMe } from "../api/auth";
import { acceptInvitation, fetchInvitation } from "../api/invitations";
import { authKeys } from "./useAuth";

export const invitationKeys = {
  detail: (token: string) => ["invitation", token] as const,
};

/**
 * What this link is for.
 *
 * `retry: false`, like `useMe`: the failure that matters is a 404 for a token
 * that does not exist, which is a normal answer rather than a blip, and
 * retrying it three times only delays the explanation.
 */
export function useInvitation(token: string) {
  return useQuery({
    queryKey: invitationKeys.detail(token),
    queryFn: () => fetchInvitation(token),
    retry: false,
    // A link is read once, at the moment it is opened. Nothing about it
    // changes while somebody is looking at it except by their own action.
    staleTime: Infinity,
  });
}

export function useAcceptInvitation(token: string) {
  const queryClient = useQueryClient();

  return useMutation({
    /*
     * ONE `/me` AFTER ACCEPTING, and it returns the answer — the same shape as
     * `useLogin`, for the same reason. Accepting sets the cookies, so the
     * browser is now signed in and the shell needs the identity that goes with
     * it; `fetchQuery` fetches and writes the cache `useMe` is watching, so
     * the redirect has what it needs without a second request.
     */
    mutationFn: async (body: { password?: string }) => {
      const result = await acceptInvitation(token, body);

      await queryClient.fetchQuery({
        queryKey: authKeys.me(),
        queryFn: fetchMe,
        // Force it. Somebody accepting a SECOND organisation already has a
        // cached `/me` from this session, and it does not know about the
        // membership that was just created.
        staleTime: 0,
      });

      return result;
    },
  });
}
