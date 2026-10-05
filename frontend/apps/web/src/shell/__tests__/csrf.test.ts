/**
 * The CSRF header, which was documented for four sessions and never sent.
 *
 * `CLAUDE.md` has said "send X-CSRFToken on anything that changes state" since
 * the auth work landed, and no frontend code did it. Nothing caught that:
 * login, signup and code validation are all deliberately CSRF-exempt, because
 * a first-time visitor holds no token yet — so logout was the only unsafe
 * request in the product, and the fake intercepted it.
 *
 * Switching `USE_FAKE_AUTH` off made logout answer 403 and leave the person
 * signed in. Found by clicking it, then confirmed from the page itself: the
 * same request was 403 without the header and 204 with it.
 */

import { afterEach, describe, expect, it } from "vitest";

import { csrfHeaders } from "@xpredict/api-client";

function setCookie(value: string) {
  Object.defineProperty(document, "cookie", {
    value,
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  setCookie("");
});

describe("csrfHeaders", () => {
  it("sends the token on the methods that change state", () => {
    setCookie("csrftoken=abc123");

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(csrfHeaders(method)).toEqual({ "X-CSRFToken": "abc123" });
    }
  });

  it("sends nothing on a read", () => {
    setCookie("csrftoken=abc123");

    expect(csrfHeaders("GET")).toEqual({});
    expect(csrfHeaders(undefined)).toEqual({});
  });

  it("is case-insensitive about the method", () => {
    /*
     * `fetch` accepts a lowercase method and passes it through, so a helper
     * that only matched "POST" would silently skip the header for "post" —
     * and the request would 403 for a reason nobody would look for here.
     */
    setCookie("csrftoken=abc123");

    expect(csrfHeaders("post")).toEqual({ "X-CSRFToken": "abc123" });
  });

  it("finds the token among other cookies", () => {
    setCookie("theme=dark; csrftoken=abc123; other=1");

    expect(csrfHeaders("POST")).toEqual({ "X-CSRFToken": "abc123" });
  });

  it("is not fooled by a cookie whose name merely ends in csrftoken", () => {
    setCookie("notcsrftoken=wrong");

    expect(csrfHeaders("POST")).toEqual({});
  });

  it("sends nothing when there is no token yet", () => {
    /*
     * Normal before anybody signs in — Django sets the token on the login and
     * signup responses. Returning no header rather than throwing: at that
     * point there is no state-changing request worth making, and the server
     * refusing is a clearer failure than a crash somewhere unrelated.
     */
    setCookie("theme=dark");

    expect(csrfHeaders("POST")).toEqual({});
  });
});
