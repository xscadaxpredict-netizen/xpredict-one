/**
 * Healing an expired session instead of showing the login screen.
 *
 * THE BUG THIS FIXES, reported as "I get back to the login page in 15 minutes".
 * The access cookie lasts 15 minutes and the refresh cookie lasts 7 days, and
 * NOTHING EVER SPENT THE SECOND ONE: the browser dropped the access cookie, the
 * next call answered 401, `useMe` read that as "not signed in", and the shell
 * sent a perfectly good session to `/login`. `/api/v1/auth/refresh/` had been
 * built, tested four ways on the backend, and never called by anything.
 *
 * THE TEST THAT MATTERS MOST IS THE CONCURRENT ONE. `ROTATE_REFRESH_TOKENS` and
 * `BLACKLIST_AFTER_ROTATION` are both on, so each refresh invalidates the token
 * before it. Three simultaneous 401s refreshing independently would mean the
 * first succeeds and the other two present a token it has just blacklisted —
 * signing the person out via the thing meant to keep them signed in. That
 * failure is intermittent and load-dependent, which is the kind nobody
 * reproduces from a bug report.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ApiError, request, resetSessionRefresh } from "@xpredict/api-client";

const REFRESH = "/api/v1/auth/refresh/";
const PROTECTED = "/api/v1/me/";

function json(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function unauthorised() {
  return json(401, {
    type: "about:blank",
    title: "Unauthorized",
    status: 401,
    detail: "Not signed in.",
    code: "not_authenticated",
    trace_id: "test",
  });
}

/*
 * TYPED, rather than a bare `vi.fn()`. Untyped, its implementation is inferred
 * as returning void, and returning a promise from it trips
 * `no-misused-promises` -- the rule that exists to catch a floating promise
 * nobody awaits.
 */
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

let fetchMock: Mock<FetchLike>;

beforeEach(() => {
  resetSessionRefresh();
  fetchMock = vi.fn<FetchLike>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Every call this test made, as "METHOD url". */
function calls(): string[] {
  return fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${url}`);
}

describe("an expired access token", () => {
  it("is refreshed, and the original request is replayed", async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorised())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json(200, { email: "rahul@vrk.com" }));

    const me = await request<{ email: string }>(PROTECTED);

    expect(me).toEqual({ email: "rahul@vrk.com" });
    expect(calls()).toEqual([`GET ${PROTECTED}`, `POST ${REFRESH}`, `GET ${PROTECTED}`]);
  });

  it("replays a write with its body and method intact", async () => {
    /*
     * The replay has to be the SAME request. A POST retried as a GET, or with
     * its body dropped, would look like it worked and quietly do nothing.
     */
    fetchMock
      .mockResolvedValueOnce(unauthorised())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json(201, { id: "1" }));

    await request("/api/v1/orgs/vrk/admin/invitations/", {
      method: "POST",
      body: JSON.stringify({ email: "asha@example.test" }),
    });

    const replay = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(replay.method).toBe("POST");
    expect(replay.body).toBe(JSON.stringify({ email: "asha@example.test" }));
  });

  it("still sends the cookie and the CSRF header on the replay", async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorised())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      // `null`, not `json(204)`: a 204 carries no body and the Response
      // constructor refuses one, which is the same rule `readBody` exists for.
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await request("/api/v1/orgs/vrk/admin/users/1/", { method: "DELETE" });

    const replay = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(replay.credentials).toBe("include");
    expect(replay.headers).toHaveProperty("Content-Type", "application/json");
  });
});

describe("the refresh is single-flight", () => {
  it("fires ONCE for several requests that expire together", async () => {
    /*
     * THE ROTATION RACE. Without one shared promise, each of these refreshes
     * independently; the first blacklists the token the others are holding,
     * and two of the three come back 401 for good.
     */
    let releaseRefresh: (value: Response) => void = () => {};
    const heldRefresh = new Promise<Response>((resolve) => {
      releaseRefresh = resolve;
    });

    fetchMock.mockImplementation((url, init) => {
      if (String(url) === REFRESH) return heldRefresh;
      // Every protected call fails until the refresh lands, then succeeds.
      return Promise.resolve(
        init && "replayed" in init ? json(200, { ok: true }) : unauthorised(),
      );
    });

    const first = request(PROTECTED);
    const second = request("/api/v1/orgs/vrk/admin/users/");
    const third = request("/api/v1/orgs/vrk/admin/dealers/");

    // All three have hit their 401 and are now waiting on the same refresh.
    await Promise.resolve();
    await Promise.resolve();

    releaseRefresh(new Response(null, { status: 204 }));
    await Promise.allSettled([first, second, third]);

    const refreshes = calls().filter((c) => c.endsWith(REFRESH));
    expect(refreshes).toHaveLength(1);
  });

  it("starts a fresh one the next time a token expires", async () => {
    /*
     * The shared promise has to be cleared when it settles, or the session can
     * be refreshed exactly once per page load and then never again.
     */
    fetchMock
      .mockResolvedValueOnce(unauthorised())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json(200, { ok: true }))
      .mockResolvedValueOnce(unauthorised())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json(200, { ok: true }));

    await request(PROTECTED);
    await request(PROTECTED);

    expect(calls().filter((c) => c.endsWith(REFRESH))).toHaveLength(2);
  });
});

describe("when the refresh cannot help", () => {
  it("surfaces the original 401 so the shell can send them to sign in", async () => {
    fetchMock.mockResolvedValueOnce(unauthorised()).mockResolvedValueOnce(unauthorised());

    await expect(request(PROTECTED)).rejects.toBeInstanceOf(ApiError);
    // The protected call is NOT replayed after a failed refresh.
    expect(calls()).toEqual([`GET ${PROTECTED}`, `POST ${REFRESH}`]);
  });

  it("never retries the refresh endpoint itself", async () => {
    /*
     * The recursion this prevents is unbounded: a refused refresh triggering a
     * refresh triggering a refresh, each one a real request.
     */
    fetchMock.mockResolvedValue(unauthorised());

    await expect(request(REFRESH, { method: "POST" })).rejects.toBeInstanceOf(ApiError);
    expect(calls()).toEqual([`POST ${REFRESH}`]);
  });

  it("treats a network failure as a failed refresh, not an exception", async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorised())
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    // An ApiError carrying the server's 401 -- not the fetch error, which
    // would replace "please sign in" with something nobody can act on.
    await expect(request(PROTECTED)).rejects.toMatchObject({ name: "ApiError" });
  });

  it("retries once and only once", async () => {
    /*
     * If the replay is also refused, something other than expiry is wrong -- a
     * disabled account, say -- and looping would hide it behind a hang.
     */
    fetchMock
      .mockResolvedValueOnce(unauthorised())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(unauthorised());

    await expect(request(PROTECTED)).rejects.toBeInstanceOf(ApiError);
    expect(calls()).toEqual([`GET ${PROTECTED}`, `POST ${REFRESH}`, `GET ${PROTECTED}`]);
  });
});

describe("endpoints where 401 is a real answer", () => {
  it("does not refresh when signing in with the wrong password", async () => {
    fetchMock.mockResolvedValueOnce(unauthorised());

    await expect(
      request("/api/v1/auth/login/", { method: "POST", body: "{}", public: true }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(calls()).toEqual(["POST /api/v1/auth/login/"]);
  });

  it("does not send `public` on to fetch as a header or option", async () => {
    /*
     * It is ours, not the browser's. Passing it through would be harmless
     * today and is the kind of thing that stops being harmless.
     */
    fetchMock.mockResolvedValueOnce(json(200, {}));

    await request("/api/v1/invitations/abc/", { public: true });

    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("public");
  });
});
