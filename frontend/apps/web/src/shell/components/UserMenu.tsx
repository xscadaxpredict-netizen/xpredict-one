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

import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useNavigate } from "react-router-dom";

import type { Me } from "../api/auth";
import { useLogout } from "../hooks/useAuth";
import { useUiStore, type Theme } from "../../stores/uiStore";
import styles from "./UserMenu.module.css";

interface UserMenuProps {
  me: Me;
}

export function UserMenu({ me }: UserMenuProps) {
  const navigate = useNavigate();
  const { mutate: signOut, isPending } = useLogout();
  const [failed, setFailed] = useState(false);
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);

  const fullName = [me.first_name, me.last_name].filter(Boolean).join(" ") || me.email;

  function onSignOut() {
    setFailed(false);

    signOut(undefined, {
      /*
       * ON SUCCESS ONLY. This used to be `onSettled`, which runs on failure
       * too — so a logout the server refused still sent you to /login with the
       * cookie intact and the cache unemptied. The route guard then read a
       * perfectly valid `/me` and put you straight back in, with nothing
       * saying why. On a shared machine that is somebody believing they have
       * signed out when they have not.
       *
       * The frontend cannot clear an httpOnly cookie (C12). Only the server
       * that set it can, so if the request failed, the session is still live
       * and the honest thing is to say so.
       */
      onSuccess: () => void navigate("/login", { replace: true }),
      onError: () => {
        setFailed(true);
      },
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

          {/*
            The theme lived in the store from the scaffold onwards with nothing
            reading it and nothing setting it. "System" is the default and
            follows the operating system; the other two override it, which is
            what somebody on a dark laptop in a bright room actually wants.
          */}
          <DropdownMenu.Label className={styles.sectionLabel}>Appearance</DropdownMenu.Label>

          <DropdownMenu.RadioGroup
            value={theme}
            onValueChange={(value) => {
              setTheme(value as Theme);
            }}
          >
            {THEMES.map((option) => (
              <DropdownMenu.RadioItem
                key={option.value}
                className={styles.radioItem}
                value={option.value}
              >
                <DropdownMenu.ItemIndicator className={styles.indicator}>
                  <TickIcon />
                </DropdownMenu.ItemIndicator>
                {option.label}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>

          <DropdownMenu.Separator className={styles.separator} />

          {failed && (
            <p className={styles.signOutError} role="alert">
              Could not sign out. You are still signed in — check your connection and try
              again.
            </p>
          )}

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

const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "Match system" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function TickIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="m3.5 8.5 3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
