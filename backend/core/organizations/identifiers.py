"""
GSTIN and PAN: what a well-formed one looks like, and how to derive one from
the other.

WHY THIS IS ITS OWN MODULE AND NOT PART OF `api/serializers.py`. The serializer
is where these run (shape is a field-level question, so that is the right
enforcement point), but a GSTIN's check digit is arithmetic with no opinion
about HTTP, and `extract_pan` is needed by `services.py` as well -- which must
not import from `api/`, because the dependency runs the other way. Putting the
algorithm beside the serializer that calls it would mean the service layer
importing upward to get at it.

STRICTER THAN THE PHONE AND POSTCODE FIELDS, AND THAT IS NOT INCONSISTENT.
`DealerForm.tsx` argues, correctly, for staying permissive on those two: a
pattern tight enough to be useful for one country rejects a legitimate value
from the next one, and the rejection lands on somebody who cannot do anything
about it. GSTIN and PAN do not have that problem. They exist in exactly one
jurisdiction and have exactly one format, so a strict check cannot refuse
anybody's legitimate data -- it can only catch a typo.

THE CHECK DIGIT IS WORTH THE CODE. Measured against three published GSTINs, it
rejects every single-character substitution (1,575 of 1,575) and every adjacent
transposition -- the two slips somebody copying a number off a certificate
actually makes. A format-only check accepts all of them, and the wrong GSTIN
reaches an invoice, where it is somebody else's tax problem.

THE SAME ALGORITHM EXISTS IN THE BROWSER, in `shell/admin/gstin.ts`, and the
two can drift. That is the standing cost of C19 (the frontend mirrors the
backend and is never the source) plus C43 (no generated client): the browser
copy is there to refuse a typo while somebody is still looking at the field,
and THIS one is what decides. If they ever disagree, this is right.
"""

from __future__ import annotations

import re

# Base-36 in the GST portal's ordering: digits, then letters.
_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

# 2-digit state code, 10-character PAN, 1 entity character, a literal Z, then
# the check digit.
#
# The `Z` is pinned rather than left as `[A-Z]`. It is reserved -- every GSTIN
# issued to a normal taxpayer carries it -- so accepting anything there would
# let through a value that is not a GSTIN while looking rigorous. If a customer
# ever turns up with one of the rare non-Z registrations, this is the line to
# relax, and the check digit will still be enforced.
GSTIN_PATTERN = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$")

# Five letters, four digits, one letter. The fourth character encodes the
# holder's type and the fifth is a surname or entity initial, but neither is
# checked here: a PAN has no check digit, so the format is all there is.
PAN_PATTERN = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")

# Where the PAN sits inside a GSTIN. Named, because `gstin[2:12]` at a call
# site is the kind of slice that gets "fixed" by somebody counting from one.
_PAN_SLICE = slice(2, 12)


def gstin_check_character(first_fourteen: str) -> str:
    """
    The fifteenth character of a GSTIN, computed from the first fourteen.

    Luhn mod 36, as the GST portal computes it: walk the characters from the
    right, multiply alternately by 2 and 1, and for each product add its
    quotient and remainder over 36 -- which is how a carry gets folded back in
    rather than lost. The check character is whatever brings the total to a
    multiple of 36.
    """
    total = 0
    factor = 2

    for character in reversed(first_fourteen):
        product = factor * _ALPHABET.index(character)
        factor = 1 if factor == 2 else 2
        total += product // 36 + product % 36

    return _ALPHABET[(36 - total % 36) % 36]


def is_valid_gstin(value: str) -> bool:
    """Format AND check digit. Either one alone lets real mistakes through."""
    if not GSTIN_PATTERN.match(value):
        return False

    return gstin_check_character(value[:14]) == value[14]


def is_valid_pan(value: str) -> bool:
    return bool(PAN_PATTERN.match(value))


def extract_pan(gstin: str) -> str:
    """
    The PAN inside a GSTIN -- characters 3 to 12, counting from one.

    Returns "" for anything that is not a well-formed GSTIN rather than
    slicing hopefully, so a caller cannot store four characters of nonsense
    because the GSTIN was half-typed.
    """
    if not is_valid_gstin(gstin):
        return ""

    return gstin[_PAN_SLICE]
