/**
 * Reading a response body that may not exist.
 *
 * THE BUG THIS PINS DOWN was found by a human clicking Sign out. The server
 * answered 204, ended the session, cleared the cookies and blacklisted the
 * refresh token — and the account menu said "Could not sign out. You are still
 * signed in." `response.json()` throws on an empty body, so a successful
 * request became a SyntaxError and the caller, which only watches for
 * exceptions, reported failure.
 *
 * Nothing automated could have caught it: the backend tests pass because 204
 * is correct, and the frontend tests pass because they mock this layer, so no
 * real empty body ever reaches it. Every other endpoint returns a body, which
 * is why the happy path hid it for as long as it did.
 */

import { describe, expect, it } from "vitest";

import { readBody } from "@xpredict/api-client";

function jsonResponse(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("readBody", () => {
  it("parses a normal JSON body", async () => {
    const response = jsonResponse(JSON.stringify({ org_slug: "acme-motors" }));

    await expect(readBody(response)).resolves.toEqual({ org_slug: "acme-motors" });
  });

  it("returns undefined for 204, instead of throwing", async () => {
    /*
     * The logout case exactly. `new Response` refuses a body on a 204, which
     * is the browser enforcing what the status means.
     */
    const response = new Response(null, { status: 204 });

    await expect(readBody(response)).resolves.toBeUndefined();
  });

  it("returns undefined for 205", async () => {
    const response = new Response(null, { status: 205 });

    await expect(readBody(response)).resolves.toBeUndefined();
  });

  it("returns undefined for an empty body on a 200", async () => {
    /*
     * A server can answer 200 with nothing at all. Rarer than 204 and just as
     * fatal to `response.json()`.
     */
    const response = new Response("", { status: 200 });

    await expect(readBody(response)).resolves.toBeUndefined();
  });

  it("returns undefined when the server says the length is zero", async () => {
    const response = new Response("", {
      status: 200,
      headers: { "Content-Length": "0" },
    });

    await expect(readBody(response)).resolves.toBeUndefined();
  });

  it("still throws on a body that is genuinely malformed", async () => {
    /*
     * The line between "there is nothing here" and "there is something here
     * and it is broken". The second is a real failure and must not be
     * swallowed — quietly returning undefined for it would turn a server bug
     * into a blank screen with no error anywhere.
     */
    const response = jsonResponse("{ not json");

    await expect(readBody(response)).rejects.toThrow();
  });

  it("parses a falsy body rather than mistaking it for an empty one", async () => {
    /*
     * `0`, `false` and `null` are valid JSON and are all falsy. A check
     * written as `if (!text)` would discard them, and the endpoint most likely
     * to return a bare boolean is a readiness poll.
     */
    await expect(readBody(jsonResponse("false"))).resolves.toBe(false);
    await expect(readBody(jsonResponse("0"))).resolves.toBe(0);
    await expect(readBody(jsonResponse("null"))).resolves.toBeNull();
  });
});
