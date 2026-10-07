import sys
sys.path.insert(0, "/app/backend")
from money import parse_amount_to_cents as p, format_cents as f
from server import map_lines_to_columns, compute_reconciliation

# --- money parsing (point/comma, thousands) ---
assert p("2757.40") == 275740, p("2757.40")
assert p("2757,40") == 275740, p("2757,40")
assert p("2.757,40") == 275740, p("2.757,40")
assert p("2,757.40") == 275740, p("2,757.40")
assert p("41.00") == 4100
assert p("38,65") == 3865
assert p("2.757") == 275700   # thousands sep -> 2757 euro
assert p("€ 201,90") == 20190
assert p("") is None and p("abc") is None
assert f(275740) == "2.757,40"
assert f(4100) == "41,00"
print("money OK")

# --- acceptance test: mapping + reconciliation ---
columns = [
    {"id": "c1", "display_name": "IVA 10% Ristorante", "ocr_label": "RISTORANTE", "aliases": [], "include_in_reconciliation": True, "active": True},
    {"id": "c2", "display_name": "IVA 10% Bar", "ocr_label": "BAR", "aliases": [], "include_in_reconciliation": True, "active": True},
    {"id": "c3", "display_name": "IVA 22% Alimentari", "ocr_label": "ALIMENTARI 22", "aliases": [], "include_in_reconciliation": True, "active": True},
    {"id": "c4", "display_name": "IVA 10% Alimentari", "ocr_label": "ALIMENTARI 10", "aliases": [], "include_in_reconciliation": True, "active": True},
    {"id": "c5", "display_name": "Bombole", "ocr_label": "BOMBOLE", "aliases": [], "include_in_reconciliation": True, "active": True},
    {"id": "c6", "display_name": "IVA 4% Alimentari", "ocr_label": "ALIMENTARI 4", "aliases": [], "include_in_reconciliation": True, "active": True},
]
lines = [
    {"label": "RISTORANTE", "amount_cents": p("2353.40")},
    {"label": "BAR", "amount_cents": p("201.90")},
    {"label": "ALIMENTARI 22", "amount_cents": p("80.05")},
    {"label": "ALIMENTARI 10", "amount_cents": p("42.40")},
    {"label": "BOMBOLE", "amount_cents": p("41.00")},
    {"label": "ALIMENTARI 4", "amount_cents": p("38.65")},
]
values, mapping, unmatched = map_lines_to_columns(lines, columns)
assert unmatched == [], unmatched
assert values["c1"] == 235340
assert values["c3"] == 8005, values["c3"]  # ALIMENTARI 22 must NOT match plain ALIMENTARI
assert values["c4"] == 4240
assert values["c6"] == 3865
print("mapping OK")

dept, diff, status = compute_reconciliation(columns, p("2757.40"), values, None)
assert dept == 275740, dept
assert diff == 0, diff
assert status == "VERIFICATO", status
print("reconciliation VERIFICATO OK")

# wrong case
dept2, diff2, status2 = compute_reconciliation(columns, p("2747.40"), values, None)
assert diff2 == -1000, diff2
assert status2 == "NON_QUADRATO"
print("reconciliation NON_QUADRATO OK")

# missing total -> DA_CONTROLLARE
_, _, status3 = compute_reconciliation(columns, None, values, None)
assert status3 == "DA_CONTROLLARE"
print("ALL BACKEND LOGIC TESTS PASSED")
