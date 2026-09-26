/**
 * RFC 9457 Problem Details — the shape of every API failure.
 *
 * The backend answers every error, from any layer, as application/problem+json.
 * `code` is the contract: switch on it. `detail` is prose the backend may reword
 * at any release, so matching on its text breaks silently and in production.
 */

export interface FieldProblem {
  field: string;
  code: string;
  detail: string;
}

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  trace_id: string;
  instance?: string;
  errors?: FieldProblem[];
}

/** Thrown by the api layer so callers get a typed error rather than a Response. */
export class ApiError extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail);
    this.name = "ApiError";
    this.problem = problem;
  }
}

/**
 * Narrow an unknown caught value to a Problem.
 *
 * Anything that is not an ApiError — a dropped connection, a bug in our own code —
 * becomes a synthetic 0 / `network_error`, so a caller never has to handle two
 * error shapes. `trace_id` is empty there because no server ever saw it.
 */
export function asProblem(error: unknown): Problem {
  if (error instanceof ApiError) return error.problem;

  return {
    type: "about:blank",
    title: "Network error",
    status: 0,
    detail: "Could not reach the server. Check your connection and try again.",
    code: "network_error",
    trace_id: "",
  };
}

/** True when the failure carries field-level errors a form can display. */
export function hasFieldErrors(
  problem: Problem,
): problem is Problem & { errors: FieldProblem[] } {
  return Array.isArray(problem.errors) && problem.errors.length > 0;
}
