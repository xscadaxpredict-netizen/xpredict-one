/**
 * Who is signed in, and the way out — the panel the avatar opens.
 *
 * Sign out is a REQUEST, not a local state change (C12). The token lives in an
 * httpOnly cookie that JavaScript cannot read or delete — only the server that
 * set it can clear it. So this calls the server and waits.
 *
 * It also clears the whole query cache on success (see `useLogout`). That is not
 * tidiness: without it, the next person to sign in on this machine gets the
 * previous person's cached screens for a few seconds.
 *
 * A drawer at the right edge (`TopbarDrawer`), like the apps panel beside it,
 * not the dropdown menu this used to be: it holds a radio group and text
 * somebody may want to select and copy (the IDs), and a menu takes over the
 * arrow keys and selection.
 */

import { LogOutIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Me, Membership } from "../api/auth";
import { useLogout } from "../hooks/useAuth";
import { useUiStore, type Theme } from "../../stores/uiStore";
import { DrawerClose, DrawerTitle, TopbarDrawer } from "./TopbarDrawer";
import styles from "./UserMenu.module.css";

interface UserMenuProps {
  me: Me;
  /** The organisation in the URL, whose ID the panel shows. */
  membership: Membership;
}

export function UserMenu({ me, membership }: UserMenuProps) {
  const navigate = useNavigate();
  const { mutate: signOut, isPending } = useLogout();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);

  const fullName =
    [me.first_name, me.last_name].filter(Boolean).join(" ") || me.email;

  function changeOpen(next: boolean) {
    setOpen(next);
    // A failure from last time is not news the next time the panel opens.
    if (!next) setFailed(false);
  }

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
    <TopbarDrawer
      open={open}
      onOpenChange={changeOpen}
      triggerLabel={`Account: ${fullName}`}
      tooltip="My profile"
      triggerClassName={styles.trigger}
      triggerContent={
        <span className={styles.avatar} aria-hidden="true">
          {initials(me)}
        </span>
      }
    >
      {/* The panel's name for a screen reader. What it SHOWS at the top is the
          person's name, which says whose account but not what this is. */}
      <DrawerTitle className={styles.visuallyHidden}>Your account</DrawerTitle>

      {/* The same grey band the other drawers' headers sit on: who you are,
          the IDs, and the two account actions. */}
      <div className={styles.head}>
        <div className={styles.identity}>
          <span className={styles.bigAvatar} aria-hidden="true">
            {initials(me)}
          </span>
          <div className={styles.who}>
            <h2 className={styles.name}>{fullName}</h2>
            {/* The email is the account's true identifier — worth showing
              when someone is unsure which account they are in. */}
            <p className={styles.email}>{me.email}</p>
          </div>
          <DrawerClose
            className={styles.close}
            aria-label="Close account panel"
          >
            <XIcon size={18} aria-hidden="true" />
          </DrawerClose>
        </div>

        {/*
        One under the other, as Zoho shows them. These are what support
        asks for, and the organisation one is the CURRENT organisation —
        switch organisations and it changes, the user one does not.
      */}
        <dl className={styles.ids}>
          <div className={styles.idRow}>
            <dt>User ID</dt>
            <dd>{me.id}</dd>
          </div>
          <div className={styles.idRow}>
            <dt>Organization ID</dt>
            <dd>{membership.org_id}</dd>
          </div>
        </dl>

        <div className={styles.links}>
          {/* Placeholder: there is no account page yet. Shown so the layout
            is settled, and marked unavailable rather than doing nothing
            silently when pressed. */}
          <button
            type="button"
            className={styles.myAccount}
            aria-disabled="true"
            title="Coming soon"
          >
            My account
          </button>

          <button
            type="button"
            className={styles.signOut}
            disabled={isPending}
            onClick={onSignOut}
          >
            <LogOutIcon size={16} aria-hidden="true" />
            {isPending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>

      {failed && (
        <p className={styles.signOutError} role="alert">
          Could not sign out. You are still signed in — check your connection
          and try again.
        </p>
      )}

      {/*
        "System" is the default and follows the operating system; the other
        two override it, which is what somebody on a dark laptop in a bright
        room actually wants.
      */}
      <fieldset className={styles.appearance}>
        <legend className={styles.sectionLabel}>Appearance</legend>
        <div className={styles.segments}>
          {THEMES.map((option) => (
            <label key={option.value} className={styles.segment}>
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={theme === option.value}
                onChange={() => {
                  setTheme(option.value);
                }}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </TopbarDrawer>
  );
}

const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function initials(me: Me): string {
  const letters = [me.first_name, me.last_name]
    .map((part) => part.trim()[0])
    .filter((letter): letter is string => Boolean(letter));

  // Someone invited but not yet named has neither. Fall back to the email so the
  // avatar is never an empty box.
  return (
    letters.length > 0 ? letters.join("") : me.email.slice(0, 2)
  ).toUpperCase();
}
