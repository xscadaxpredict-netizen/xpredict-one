/**
 * The invitation link, ready to copy and send by hand (C56).
 *
 * THERE IS NO EMAIL, so this is the delivery mechanism: the admin reads the
 * link, copies it, and sends it over whatever they already use.
 *
 * IT DOES NOT COPY ANYTHING BY ITSELF. An earlier version wrote to the
 * clipboard the moment it opened, which is a surprise in both directions —
 * somebody who only wanted to LOOK at the link has had their clipboard
 * replaced, and somebody who wanted to copy it has no idea whether it
 * happened. Showing and copying are two actions and the admin does both.
 *
 * THE LINK IS ALWAYS VISIBLE, not hidden behind a button. `navigator.clipboard`
 * is unavailable outside a secure context and can be refused by permissions
 * policy, so a copy button that silently fails would leave an admin pasting
 * whatever was there before. A selectable field cannot fail that way.
 */

import { useEffect, useRef, useState } from "react";
import { asProblem } from "@xpredict/api-client";

import { useInviteLink } from "../hooks/useUsers";
import styles from "./InviteLinkPanel.module.css";

interface InviteLinkPanelProps {
  /** The pending person's id — an `Invitation` id, under C51's union. */
  userId: string;
  /** Shown so the admin can see at a glance who the link is for. */
  email: string;
  /**
   * Bumped by the panel above when Resend mints a new token. Changing it
   * refetches, so the link on screen is the one that works — the old one
   * stopped working the instant Resend was pressed.
   */
  version: number;
  /** True once Resend has run, which turns the heading into a confirmation. */
  isFresh: boolean;
}

export function InviteLinkPanel({ userId, email, version, isFresh }: InviteLinkPanelProps) {
  const { mutateAsync: load } = useInviteLink();

  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // React runs effects twice in development (StrictMode). This is a read, so
  // twice is harmless, but a ref keeps the request count honest.
  const asked = useRef("");

  useEffect(() => {
    const request = `${userId}:${version}`;
    if (asked.current === request) return;
    asked.current = request;

    setCopied(false);

    void (async () => {
      try {
        setLink(await load(userId).then((result) => result.link));
      } catch (caught) {
        setError(asProblem(caught).detail);
      }
    })();
  }, [load, userId, version]);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("Could not reach the clipboard. Select the link and copy it by hand.");
    }
  }

  if (error) {
    return (
      <p className={styles.error} role="alert">
        {error}
      </p>
    );
  }

  return (
    <div className={styles.panel}>
      {/*
        `role="status"` so the confirmation after Resend is announced rather
        than only seen. It is the acknowledgement that the old link is dead —
        the one thing that is easy to miss, because the new link looks exactly
        like the old one.
      */}
      <p className={styles.label} role="status">
        {isFresh ? (
          <>
            <strong>New link ready.</strong> The previous one no longer works.
          </>
        ) : (
          <>
            Send this link to <strong>{email}</strong>. They choose their own password.
          </>
        )}
      </p>

      <div className={styles.row}>
        {/*
          readOnly rather than disabled: a disabled input cannot be focused, so
          its text cannot be selected by hand — which is the fallback for every
          browser where the clipboard API is unavailable.
        */}
        <input
          className={styles.link}
          readOnly
          value={link ?? "Fetching the link…"}
          aria-label="Invitation link"
          onFocus={(event) => event.currentTarget.select()}
        />

        <button
          type="button"
          className={styles.copy}
          disabled={!link}
          onClick={() => void copy()}
          aria-label={copied ? "Copied" : "Copy link"}
          title={copied ? "Copied" : "Copy link"}
        >
          {copied ? <TickIcon /> : <CopyIcon />}
        </button>
      </div>

      {/*
        Said plainly, because the admin is about to paste this into a chat
        window. Whoever opens it becomes that person in this organisation —
        there is no second factor and no password behind it.
      */}
      <p className={styles.warning}>
        Anyone who opens this link can join as {email}, so send it to them directly. It stops
        working once they accept, and Resend replaces it.
      </p>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      <rect x="4.75" y="4.75" width="7.5" height="7.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M9.25 4.25v-1a1.5 1.5 0 0 0-1.5-1.5h-4.5a1.5 1.5 0 0 0-1.5 1.5v4.5a1.5 1.5 0 0 0 1.5 1.5h1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TickIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      <path
        d="M2.75 7.5 5.5 10.25l5.75-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
