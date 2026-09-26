/**
 * Who is signed in, and the way out.
 *
 * Sign out is a REQUEST, not a local state change (C12). The token lives in an
 * httpOnly cookie that JavaScript cannot read or delete — only the server that
 * set it can clear it. So this calls the server and waits.
 *
 * It also clears the whole query cache on success (see `useLogout`). That is not
 * tidiness: without it, the next person to sign in on this machine gets the
 * previous person's cached screens for a few seconds.
 */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useNavigate } from "react-router-dom";

import type { Me } from "../api/auth";
import { useLogout } from "../hooks/useAuth";
import styles from "./UserMenu.module.css";

interface UserMenuProps {
  me: Me;
}

export function UserMenu({ me }: UserMenuProps) {
  const navigate = useNavigate();
  const { mutate: signOut, isPending } = useLogout();

  const fullName = [me.first_name, me.last_name].filter(Boolean).join(" ") || me.email;

  function onSignOut() {
    signOut(undefined, {
      // Only leave once the server has actually cleared the cookie. Navigating
      // first would show the login screen while the session is still live.
      onSettled: () => void navigate("/login", { replace: true }),
    });
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.trigger} aria-label={`Account: ${fullName}`}>
        <span className={styles.avatar} aria-hidden="true">
          {initials(me)}
        </span>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} sideOffset={8} align="end">
          <div className={styles.identity}>
            <span className={styles.name}>{fullName}</span>
            {/* The email is the account's true identifier — worth showing when
                someone is unsure which account they are in. */}
            <span className={styles.email}>{me.email}</span>
          </div>

          <DropdownMenu.Separator className={styles.separator} />

          <DropdownMenu.Item
            className={styles.item}
            disabled={isPending}
            onSelect={(event) => {
              // Keep the menu on screen while the request is in flight, so the
              // click visibly did something.
              event.preventDefault();
              onSignOut();
            }}
          >
            {isPending ? "Signing out…" : "Sign out"}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function initials(me: Me): string {
  const letters = [me.first_name, me.last_name]
    .map((part) => part.trim()[0])
    .filter((letter): letter is string => Boolean(letter));

  // Someone invited but not yet named has neither. Fall back to the email so the
  // avatar is never an empty box.
  return (letters.length > 0 ? letters.join("") : me.email.slice(0, 2)).toUpperCase();
}
