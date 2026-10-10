/**
 * GSTIN and PAN in the browser: is this well-formed, and what PAN is inside it.
 *
 * A SECOND COPY OF THE BACKEND'S ALGORITHM, and that is the deliberate cost of
 * two decisions. C19 says frontend guards mirror the backend and are never the
 * source of truth; C43 removed the generated client, so there is nothing that
 * derives this file from `core/organizations/identifiers.py`. If the two ever
 * disagree, the backend is right and this is the bug.
 *
 * WHY HAVE IT AT ALL, THEN. Because the alternative is a round trip to learn
 * that the last character is wrong, and somebody typing a 15-character number
 * off a certificate wants to know while they are still looking at it. The same
 * reasoning as the password hints (C57): the server enforces, the browser
 * tells you early.
 *
 * NO REACT IN THIS FILE. It is arithmetic and two regexes, used by the form's
 * Zod schema and by nothing else yet.
 */

/** Base-36 in the GST portal's ordering: digits, then letters. */
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/*
 * 2-digit state code, 10-character PAN, 1 entity character, a literal Z, then
 * the check digit.
 *
 * The Z is pinned rather than left as [A-Z]: it is reserved, so accepting
 * anything there would wave through a value that is not a GSTIN while looking
 * strict. Matches the backend pattern exactly — if one is relaxed, both are.
 */
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

/** Five letters, four digits, one letter. A PAN has no check digit. */
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export const GSTIN_LENGTH = 15;
export const PAN_LENGTH = 10;

/**
 * The fifteenth character of a GSTIN, computed from the first fourteen.
 *
 * Luhn mod 36: walk right to left, multiply alternately by 2 and 1, and add
 * each product's quotient and remainder over 36 — which folds the carry back
 * in rather than losing it.
 */
export function gstinCheckCharacter(firstFourteen: string): string {
  let total = 0;
  let factor = 2;

  // `charAt`, not `[i]`: `noUncheckedIndexedAccess` makes a bracket index
  // `string | undefined`, and the honest fix is the accessor that cannot
  // return undefined rather than a non-null assertion that hides the question.
  for (let i = firstFourteen.length - 1; i >= 0; i -= 1) {
    const product = factor * ALPHABET.indexOf(firstFourteen.charAt(i));
    factor = factor === 2 ? 1 : 2;
    total += Math.floor(product / 36) + (product % 36);
  }

  return ALPHABET.charAt((36 - (total % 36)) % 36);
}

/** Format AND check digit. Either alone lets real mistakes through. */
export function isValidGstin(value: string): boolean {
  if (!GSTIN_PATTERN.test(value)) {
    return false;
  }

  return gstinCheckCharacter(value.slice(0, 14)) === value.charAt(14);
}

export function isValidPan(value: string): boolean {
  return PAN_PATTERN.test(value);
}

/**
 * The PAN inside a GSTIN — characters 3 to 12, counting from one.
 *
 * Empty for anything that is not a well-formed GSTIN, rather than a hopeful
 * slice: while somebody is still typing, every intermediate value is invalid,
 * and prefilling the PAN field with four characters of a half-typed number
 * would look answered when it is not.
 */
export function extractPan(gstin: string): string {
  if (!isValidGstin(gstin)) {
    return "";
  }

  return gstin.slice(2, 12);
}

/**
 * What the person typed, as the identifier is actually written: uppercase, no
 * surrounding space.
 *
 * Both fields run through this before validation, so a correct number typed in
 * lowercase is accepted rather than refused for its case — a refusal nobody
 * can act on. The backend uppercases too; this is what makes the browser agree
 * with it instead of refusing first.
 */
export function normaliseIdentifier(value: string): string {
  return value.trim().toUpperCase();
}
