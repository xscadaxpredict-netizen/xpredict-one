/**
 * Turning a problem response's `errors` list into messages a form can show.
 *
 * WHY THIS EXISTS AT ALL. `config/exception_handler.py` gives every validation
 * failure the same generic `detail` — "The submitted data is not valid." — and
 * puts the real reasons in `errors`, one entry per field per rule. A form that
 * renders only `detail` therefore shows nothing useful however much the server
 * said, which is exactly what happened when a refused password came back as
 * "the given data is invalid" with "This password is too common. This password
 * is entirely numeric." sitting unread in the payload.
 *
 * TWO CALLERS, WHICH IS WHY IT IS SHARED. Signup and accepting an invitation
 * are the only two places anybody sets a password, they now enforce the same
 * rules, and they had already written this logic once each — the shape C54
 * found between two forms asking one question two ways.
 *
 * ONE FIELD CAN HAVE SEVERAL REASONS, and that is the part a loop written
 * quickly gets wrong. `12345678` fails two validators at once; assigning them
 * one after another leaves whichever came last, so somebody fixes the numbers
 * and is then told it is too common. They are joined instead.
 */

import type { FieldProblem } from "@xpredict/api-client";

/**
 * Group the server's field errors by field name, joining multiple reasons.
 *
 * The keys are whatever the SERVER called its fields. A caller decides which of
 * those its form actually has — see the note about casting in `SignupScreen`:
 * telling the compiler a name is a form field when it is not means the message
 * attaches to nothing and the screen fails silently.
 */
export function messagesByField(errors: FieldProblem[] | undefined): Map<string, string> {
  const collected = new Map<string, string[]>();

  for (const error of errors ?? []) {
    const existing = collected.get(error.field);
    if (existing) {
      existing.push(error.detail);
    } else {
      collected.set(error.field, [error.detail]);
    }
  }

  return new Map([...collected].map(([field, details]) => [field, details.join(" ")]));
}
