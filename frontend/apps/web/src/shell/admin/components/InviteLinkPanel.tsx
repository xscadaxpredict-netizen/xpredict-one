/**
 * The invitation link, ready to copy and send by hand (C56).
 *
 * THERE IS NO EMAIL, so this is the delivery mechanism: the admin copies the
 * link and sends it over whatever they already use to talk to the person.
 *
 * IT ALWAYS SHOWS THE LINK, not just a Copy button. `navigator.clipboard` is
 * unavailable outside a secure context and can be refused by permissions
 * policy, and a Copy button that silently fails would leave the admin
 * believing they had the link while pasting whatever was there before. A
 * visible, selectable field cannot fail that way.
 *
 * IT FETCHES ON MOUNT, which is why the callers render it only when the link
 * is actually wanted: the link carries the token that joins the organisation as
 * that person, so it travels when somebody asks for it rather than on every
 * visit to the users screen.
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
}

export function InviteLinkPanel({ userId, email }: InviteLinkPanelProps) {
  const { mutateAsync: load } = useInviteLink();

  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // React runs effects twice in development (StrictMode). This is a read, so
  // twice is harmless, but a ref keeps the request count honest.
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;

    void (async () => {
      try {
        const result = await load(userId);
        setLink(result.link);
        /*
         * Copy straight away, because the admin asked for the link in order to
         * send it. The failure is swallowed ON PURPOSE: the link is on screen
         * either way, and an error about the clipboard would be reporting a
         * problem that does not stop them.
         */
        try {
          await navigator.clipboard.writeText(result.link);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      } catch (caught) {
        setError(asProblem(caught).detail);
      }
    })();
  }, [load, userId]);

  async function copyAgain() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("Could not reach the clipboard. Select the link above and copy it.");
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
      <p className={styles.label}>
        Send this link to <strong>{email}</strong>. They choose their own password.
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
          onClick={() => void copyAgain()}
        >
          {copied ? "Copied" : "Copy"}
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
