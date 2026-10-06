/**
 * Which of the three provisioning screens to show.
 *
 * Pulled out of `SignupScreen` so it can be tested on its own, for the same
 * reason `accessFor` lives in its own file: the rule decides what a new
 * customer sees on the very first screen of the product, and reaching it
 * through the component means filling in a three-step form and winding a
 * 30-second timer forward before you can assert anything.
 *
 * Three states, not a boolean, because "stuck" and "stuck for good" need
 * different words and different buttons.
 */

/**
 * How many times somebody may press "Try again" before the screen stops
 * offering it.
 *
 * A retry button with no limit is not a kindness. Provisioning either finishes
 * in seconds or has failed in a way more waiting will not fix — the Celery task
 * exhausts five retries and then gives up permanently, and nothing tells this
 * screen that happened.
 *
 * See **Q33**: the server side of this — noticing a permanently failed
 * provision, and being able to re-run it — does not exist yet. Until it does,
 * this screen's honest best is to stop, say so plainly, and hand over the one
 * piece of information support will ask for.
 */
export const MAX_PROVISIONING_ATTEMPTS = 3;

export type ProvisioningState =
  /** Still working, or still worth waiting for. Show the progress bar. */
  | "waiting"
  /** Not finished, and worth another go. Offer "Try again". */
  | "retryable"
  /** Out of attempts. Stop offering a button that will not help. */
  | "exhausted";

export interface ProvisioningSignals {
  /** The poll itself failed — network, 5xx, a lost connection. */
  isError: boolean;
  /** The waiting window elapsed without `is_ready` turning true. */
  timedOut: boolean;
  /** How many times the person has pressed "Try again". */
  attempt: number;
}

export function provisioningState({
  isError,
  timedOut,
  attempt,
}: ProvisioningSignals): ProvisioningState {
  /*
   * Two different ways to be stuck, treated the same. A failed request and a
   * server cheerfully answering `is_ready: false` forever look nothing alike
   * in the network tab and identical to the person waiting.
   */
  const stuck = isError || timedOut;

  if (!stuck) return "waiting";

  return attempt >= MAX_PROVISIONING_ATTEMPTS ? "exhausted" : "retryable";
}
