/**
 * Signed in successfully, with nowhere to go.
 *
 * Two real cases, and both are easy to miss because both require a VALID
 * password:
 *
 *   "removed"  — C13's case. Someone was invited, then deactivated. Their
 *                credentials still work, so they authenticate and have zero
 *                memberships. Without this screen they get a blank page or a
 *                redirect loop.
 *
 *   "unknown"  — the URL names an organisation this account is not in, usually
 *                a stale bookmark or a link from a colleague in another org.
 *
 * Note what this screen does NOT do: confirm whether that organisation exists.
 * "No such organisation" and "you are not in it" are deliberately the same
 * message, because distinguishing them lets anyone enumerate your customer list
 * from the address bar. Same rule as the login screen's identical wording for a
 * wrong email and a wrong password.
 *
 * This is a courtesy, not a control. The backend rejects the request either way.
 */

import { useNavigate } from "react-router-dom";

import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { useLogout } from "../hooks/useAuth";

interface NoAccessScreenProps {
  variant: "removed" | "unknown";
  /** Somewhere to go instead, when the account does have another organisation. */
  fallbackOrgSlug?: string;
}

export function NoAccessScreen({ variant, fallbackOrgSlug }: NoAccessScreenProps) {
  const navigate = useNavigate();
  const { mutate: signOut, isPending } = useLogout();

  const removed = variant === "removed";

  return (
    <AuthLayout
      title={removed ? "No access" : "Organisation unavailable"}
      subtitle={
        removed
          ? "Your access has been removed. Contact your administrator."
          : "This organisation is not available on your account. Check the address, or contact your administrator."
      }
    >
      {fallbackOrgSlug ? (
        <Button onClick={() => void navigate(`/${fallbackOrgSlug}`, { replace: true })}>
          Go to your organisation
        </Button>
      ) : (
        <Button
          variant="secondary"
          isLoading={isPending}
          onClick={() =>
            signOut(undefined, {
              onSettled: () => void navigate("/login", { replace: true }),
            })
          }
        >
          {isPending ? "Signing out…" : "Sign out"}
        </Button>
      )}
    </AuthLayout>
  );
}
