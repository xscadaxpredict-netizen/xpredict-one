/**
 * The CSRF header every state-changing request must carry.
 *
 * WHY THIS EXISTS AT ALL. Tokens live in httpOnly cookies (C12), which the
 * browser attaches by itself — and a cookie the browser sends automatically is
 * exactly what CSRF abuses, because another site's form can trigger the
 * request too. Django's answer is a second token that travels in a header: an
 * attacker's page can make your browser send the cookie, but it cannot read
 * the cookie to copy it into a header.
 *
 * So `csrftoken` is deliberately NOT httpOnly while `xp_access` is. That
 * asymmetry looks like an oversight and is the whole mechanism.
 *
 * IT WAS DOCUMENTED AND NOT IMPLEMENTED. `CLAUDE.md` has said "send
 * X-CSRFToken on anything that changes state" since the auth work landed, and
 * no frontend code did. Nothing caught it: login, signup and code validation
 * are all deliberately CSRF-exempt — a first-time visitor holds no token yet —
 * so the only unsafe request that existed was logout, and the fake intercepted
 * it. Switching USE_FAKE_AUTH off made logout answer 403 and leave the person
 * signed in. Found by clicking it in a browser.
 *
 * ONE COPY, used by all five `request()` helpers. Five copies of a security
 * rule is four chances for one of them to be forgotten.
 */

/** Methods that change state and therefore need the header. */
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function readCookie(name: string): string | null {
  // No document in SSR or in a test environment without jsdom. Returning null
  // rather than throwing: the caller then sends no header, and the server
  // refuses — which is the safe direction and a clear error, instead of a
  // crash somewhere unrelated.
  if (typeof document === "undefined") return null;

  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

/**
 * Headers to merge into a fetch for this method. Empty for GET and HEAD.
 *
 * Returns nothing rather than throwing when the cookie is missing. That
 * happens before anybody has signed in — Django sets the token on the login
 * and signup responses — and at that point there is no state-changing request
 * worth making.
 */
export function csrfHeaders(method: string | undefined): Record<string, string> {
  if (!UNSAFE_METHODS.has((method ?? "GET").toUpperCase())) return {};

  const token = readCookie("csrftoken");
  return token ? { "X-CSRFToken": token } : {};
}
