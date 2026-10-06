/**
 * Reading a response body without assuming there is one.
 *
 * `response.json()` THROWS ON AN EMPTY BODY. A 204 No Content has none, so
 * calling it unconditionally turns a perfectly successful request into a
 * SyntaxError — and the caller, which is only watching for exceptions, reports
 * failure for something that worked.
 *
 * THIS IS NOT HYPOTHETICAL. Logout answers 204. Signing out genuinely ended
 * the session, cleared the cookies and blacklisted the refresh token — and the
 * account menu said "Could not sign out. You are still signed in", because the
 * parse threw after the server had already done the work. The person was
 * signed out and told they were not, on a screen offering to try again.
 *
 * It was found by a human clicking the button. Nothing else could have:
 * - The backend tests pass. The endpoint returns 204 and that is correct.
 * - The frontend tests pass. They mock this layer, so no real empty body
 *   reaches it.
 * - Every other endpoint returns a body, so the happy path hid it.
 *
 * ONE COPY, used by all five `request()` helpers, for the same reason
 * `csrfHeaders` is shared: five places to fix is four places to forget. Every
 * Administration delete and remove will answer 204 too.
 */

/**
 * The parsed body, or `undefined` when there is nothing to parse.
 *
 * Returns `undefined` rather than throwing for a 204, an empty body, or a
 * response that is not JSON. Callers typed `request<void>` ignore it; callers
 * expecting data get it. A caller that asked for data and received nothing has
 * a server bug, and letting `undefined` surface there is clearer than a
 * SyntaxError pointing at this line.
 */
export async function readBody<T>(response: Response): Promise<T> {
  const text = await response.text();

  /*
   * ONE CHECK, AND IT COVERS EVERY CASE. This started as three — an explicit
   * `status === 204`, a `Content-Length: 0` test, and this. Removing the 204
   * branch to prove the test caught it showed the tests still passing, because
   * `.text()` on a 204 returns "" and this line had been handling it all
   * along. The other two were decoration that read like defence.
   *
   * `text.length === 0`, not `!text`: "0", "false" and "null" are valid JSON
   * and all falsy, and the endpoint most likely to answer a bare boolean is a
   * readiness poll.
   */
  if (text.length === 0) {
    return undefined as T;
  }

  // A body that is present and malformed is a real failure and must still
  // throw. Swallowing it would turn a server bug into a blank screen with no
  // error anywhere.
  return JSON.parse(text) as T;
}
