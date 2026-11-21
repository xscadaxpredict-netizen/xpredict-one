import { asProblem } from "@xpredict/api-client";

/**
 * The sentence to show a person when an API call fails.
 *
 * The backend answers with a problem document whose `title` is the same for
 * every failure of a kind ("Unprocessable entity", "Conflict") and says nothing
 * useful. The reason is in `errors` (validation: one entry per field) or in
 * `detail` (a refused action: "Cannot unconfirm this order because ...").
 * Showing only the title is how "enquiry is not saving" looked like a mystery.
 */
const GENERIC_DETAILS = new Set([
  "",
  "The submitted data is not valid.",
  "An unexpected error occurred.",
]);

const NON_FIELD = new Set(["", "non_field_errors", "detail", "__all__"]);

function fieldLabel(field: string): string {
  return field.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  const problem = asProblem(error);
  if (problem.errors?.length) {
    return problem.errors
      .map((e) => (NON_FIELD.has(e.field) ? e.detail : `${fieldLabel(e.field)}: ${e.detail}`))
      .join("\n");
  }
  if (problem.detail && !GENERIC_DETAILS.has(problem.detail)) return problem.detail;
  return fallback;
}
