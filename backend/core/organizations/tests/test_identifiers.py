"""
`core/organizations/identifiers.py` -- GSTIN and PAN, on their own.

NO DATABASE, so these run in milliseconds and can afford to be exhaustive.
The API tests next door prove the serializer calls this; these prove the
arithmetic is right, which is a different question and the one that would be
expensive to debug through an HTTP response.

THE PROPERTY TESTS ARE THE POINT. Three published GSTINs validating proves the
algorithm reproduces the portal's; what matters in use is that it REFUSES the
mistakes people make, so the two loops below mutate those same numbers every
way a person can mis-copy one and assert every mutation is caught. A
format-only check passes all 1,575 of them.
"""

from __future__ import annotations

import pytest

from core.organizations.identifiers import (
    extract_pan,
    gstin_check_character,
    is_valid_gstin,
    is_valid_pan,
)

ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

# Published sample GSTINs. Not invented -- an invented one would fail the
# check digit, so there is no such thing as a made-up GSTIN to test with.
REAL = ["27AAPFU0939F1ZV", "29AAGCB7383J1Z4", "09AAACH7409R1ZZ"]


class TestValidGstins:
    @pytest.mark.parametrize("gstin", REAL)
    def test_a_real_gstin_is_accepted(self, gstin):
        assert is_valid_gstin(gstin)

    @pytest.mark.parametrize("gstin", REAL)
    def test_the_computed_check_character_matches_the_real_one(self, gstin):
        assert gstin_check_character(gstin[:14]) == gstin[14]


class TestTheCheckDigitCatchesTypos:
    """
    Both loops assert 100%, which is a strong claim and a true one: Luhn mod 36
    is designed to catch exactly these two classes completely. If either ever
    drops below 100 the implementation has drifted, not the maths.
    """

    def test_every_single_character_substitution_is_refused(self):
        missed = []

        for gstin in REAL:
            for position in range(15):
                for replacement in ALPHABET:
                    if replacement == gstin[position]:
                        continue

                    mutated = gstin[:position] + replacement + gstin[position + 1 :]
                    if is_valid_gstin(mutated):
                        missed.append(mutated)

        assert missed == []

    def test_every_adjacent_transposition_is_refused(self):
        missed = []

        for gstin in REAL:
            for position in range(14):
                if gstin[position] == gstin[position + 1]:
                    continue

                mutated = (
                    gstin[:position]
                    + gstin[position + 1]
                    + gstin[position]
                    + gstin[position + 2 :]
                )
                if is_valid_gstin(mutated):
                    missed.append(mutated)

        assert missed == []


class TestMalformedGstins:
    @pytest.mark.parametrize(
        "value",
        [
            "",
            "27AAPFU0939F1Z",  # fourteen characters
            "27AAPFU0939F1ZVV",  # sixteen
            "NOT-A-GSTIN-ATALL",
            "2AAPFU0939F1ZV1",  # one-digit state code
            "27aapfu0939f1zv",  # lowercase: the SERIALIZER uppercases, not this
            "27AAPFU0939F1AV",  # the reserved Z replaced
            "27AAPFU0939F11V",  # ... with a digit
        ],
    )
    def test_it_is_refused(self, value):
        assert not is_valid_gstin(value)

    def test_lowercase_is_rejected_here_on_purpose(self):
        """
        PINNING WHERE THE UPPERCASING HAPPENS. `validate_gstin` in the
        serializer uppercases before calling this, so a person typing lowercase
        is accepted at the edge. Doing it in here as well would mean two places
        normalise and neither obviously owns it -- and a service calling
        `is_valid_gstin` directly would then silently accept a value the
        database stores in a second spelling.
        """
        assert not is_valid_gstin(REAL[0].lower())
        assert is_valid_gstin(REAL[0].lower().upper())


class TestPan:
    @pytest.mark.parametrize("value", ["AAPFU0939F", "AAGCB7383J", "ZZZPK1234Q"])
    def test_a_well_formed_pan_is_accepted(self, value):
        assert is_valid_pan(value)

    @pytest.mark.parametrize(
        "value",
        [
            "",
            "AAPFU0939",  # nine characters
            "AAPFU0939FF",  # eleven
            "AAPF00939F",  # a digit among the first five letters
            "AAPFU093AF",  # a letter among the four digits
            "AAPFU09391",  # a digit in the last position
            "aapfu0939f",  # lowercase, same reasoning as the GSTIN above
            "12345",
        ],
    )
    def test_a_malformed_pan_is_refused(self, value):
        assert not is_valid_pan(value)


class TestExtractPan:
    @pytest.mark.parametrize(
        ("gstin", "pan"),
        [
            ("27AAPFU0939F1ZV", "AAPFU0939F"),
            ("29AAGCB7383J1Z4", "AAGCB7383J"),
            ("09AAACH7409R1ZZ", "AAACH7409R"),
        ],
    )
    def test_it_returns_the_embedded_pan(self, gstin, pan):
        assert extract_pan(gstin) == pan

    @pytest.mark.parametrize("gstin", ["", "27AAPFU0939F1Z", "27AAPFU0939F1ZX", "rubbish"])
    def test_an_invalid_gstin_yields_nothing(self, gstin):
        """
        EMPTY, NOT A HOPEFUL SLICE. A half-typed GSTIN would otherwise store
        four characters of nonsense as somebody's PAN, which is worse than
        storing none: the field would look answered.
        """
        assert extract_pan(gstin) == ""

    @pytest.mark.parametrize("gstin", REAL)
    def test_what_it_extracts_is_always_a_valid_pan(self, gstin):
        """
        The two checks agree, which is what makes the derivation safe to store
        in a column validated as a PAN.
        """
        assert is_valid_pan(extract_pan(gstin))
