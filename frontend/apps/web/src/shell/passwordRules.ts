/**
 * What a new password has to be, said once.
 *
 * TWO FORMS SET PASSWORDS and they are the only two: signing up, and accepting
 * an invitation. Django applies the same `AUTH_PASSWORD_VALIDATORS` to both
 * (one helper, `validate_password_strength`), so the browser should describe
 * the same rules in the same words — otherwise the two screens drift, which is
 * the shape C54 found between the invite and edit forms.
 *
 * THE SERVER IS STILL THE AUTHORITY (C19). "Too common" needs Django's list of
 * twenty thousand passwords and cannot be checked here at all, so a password
 * can pass everything below and still be refused. What this buys is that the
 * mistakes people actually make — eight digits, a short word — are caught
 * while they type instead of after a request.
 */

import { z } from "zod";

/**
 * Shown under the field before anything is typed.
 *
 * It lists the rule the browser CANNOT check as well as the two it can,
 * because the point is to stop somebody choosing `12345678` — not to describe
 * the client-side validation.
 */
export const PASSWORD_HINT =
  "At least 8 characters. Not a common password, and not all numbers.";

/**
 * The checks a browser can make, as a Zod field.
 *
 * A function rather than a constant so each form can word its own
 * minimum-length message — "Use at least 8 characters" on a signup form and
 * "Password must be at least 8 characters" on the accept form were both
 * already written, and unifying the copy was not what this is for.
 */
export function passwordField(tooShort: string) {
  return z
    .string()
    .min(8, tooShort)
    .refine((value) => !/^\d+$/.test(value), {
      message: "Use something other than only numbers.",
    });
}
