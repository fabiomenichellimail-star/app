"""Money utilities. Internally every amount is an integer number of cents.
Never use floats for monetary calculations."""
import re
from typing import Optional


def parse_amount_to_cents(value) -> Optional[int]:
    """Parse OCR / user amount strings into integer cents.
    Handles formats: 2757.40 / 2757,40 / 2.757,40 / 2,757.40 / 41.00 / 2.757
    Returns None when nothing numeric is present."""
    if value is None:
        return None
    if isinstance(value, int):
        return value * 100
    s = str(value).strip()
    s = re.sub(r"[^0-9,.\-]", "", s)
    if s in ("", "-", ".", ","):
        return None
    neg = s.startswith("-")
    s = s.replace("-", "")
    last_comma = s.rfind(",")
    last_dot = s.rfind(".")
    dec_pos = max(last_comma, last_dot)
    if dec_pos == -1:
        digits = re.sub(r"[,.]", "", s)
        if not digits:
            return None
        cents = int(digits) * 100
    else:
        frac_part = s[dec_pos + 1:]
        int_part = s[:dec_pos]
        if len(frac_part) != 2:
            # separator is a thousands separator, value is an integer euro amount
            digits = re.sub(r"[,.]", "", s)
            cents = int(digits) * 100
        else:
            int_digits = re.sub(r"[,.]", "", int_part) or "0"
            cents = int(int_digits) * 100 + int(frac_part)
    return -cents if neg else cents


def format_cents(cents: Optional[int]) -> str:
    """Format integer cents as an Italian euro string, e.g. 275740 -> '2.757,40'."""
    if cents is None:
        return ""
    neg = cents < 0
    cents = abs(int(cents))
    euros = cents // 100
    rem = cents % 100
    s = f"{euros:,}".replace(",", ".")
    return f"{'-' if neg else ''}{s},{rem:02d}"
