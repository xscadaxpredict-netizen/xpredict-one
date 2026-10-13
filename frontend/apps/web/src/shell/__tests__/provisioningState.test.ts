/**
 * Which provisioning screen a new customer sees.
 *
 * This is the first screen of the product and the worst place to dead-end, so
 * the rule is tested on its own rather than only through the component — the
 * same reason `accessFor` has its own tests.
 *
 * The case that matters is the last one: out of attempts. Until **Q33** is
 * answered there is nothing on the server that notices a permanently failed
 * provision, so this screen is the only thing standing between a customer and
 * a spinner that never stops.
 */

import { describe, expect, it } from "vitest";

import {
  MAX_PROVISIONING_ATTEMPTS,
  provisioningState,
} from "../screens/provisioningState";

const fresh = { isError: false, timedOut: false, attempt: 0 };

describe("provisioningState", () => {
  it("waits while nothing has gone wrong", () => {
    expect(provisioningState(fresh)).toBe("waiting");
  });

  it("keeps waiting after retries, as long as it is not stuck", () => {
    /*
     * Attempts alone never end the wait. Somebody who pressed "Try again"
     * three times and then had it succeed must not be shown the give-up
     * screen because of a counter.
     */
    expect(provisioningState({ ...fresh, attempt: MAX_PROVISIONING_ATTEMPTS })).toBe(
      "waiting",
    );
  });

  it("offers a retry when the waiting window elapses", () => {
    expect(provisioningState({ ...fresh, timedOut: true })).toBe("retryable");
  });

  it("offers a retry when the poll itself fails", () => {
    /*
     * A failed request and a server answering `is_ready: false` forever look
     * nothing alike in the network tab and identical to the person waiting, so
     * they get the same screen.
     */
    expect(provisioningState({ ...fresh, isError: true })).toBe("retryable");
  });

  it("gives up once the attempts are spent", () => {
    expect(
      provisioningState({ ...fresh, timedOut: true, attempt: MAX_PROVISIONING_ATTEMPTS }),
    ).toBe("exhausted");
  });

  it("gives up on an error too, not only on a timeout", () => {
    expect(
      provisioningState({ ...fresh, isError: true, attempt: MAX_PROVISIONING_ATTEMPTS }),
    ).toBe("exhausted");
  });

  it("still offers the last attempt rather than giving up one early", () => {
    /*
     * An off-by-one here is the difference between three tries and two. The
     * boundary is written out both sides so the fence post is explicit.
     */
    expect(
      provisioningState({
        ...fresh,
        timedOut: true,
        attempt: MAX_PROVISIONING_ATTEMPTS - 1,
      }),
    ).toBe("retryable");
  });

  it("stays given up if somehow pressed past the limit", () => {
    expect(
      provisioningState({
        ...fresh,
        timedOut: true,
        attempt: MAX_PROVISIONING_ATTEMPTS + 5,
      }),
    ).toBe("exhausted");
  });
});
