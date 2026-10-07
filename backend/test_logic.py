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

# =========================================================================== #
# Targeted zero-tolerance quadratura tests (no epsilon, exact-cent only)       #
# =========================================================================== #
one_col = [{"id": "x", "display_name": "Reparto", "ocr_label": "R",
            "aliases": [], "include_in_reconciliation": True, "active": True}]

# differenza 0 centesimi -> VERIFICATO
d, diff, st = compute_reconciliation(one_col, 275740, {"x": 275740}, None)
assert (d, diff, st) == (275740, 0, "VERIFICATO"), (d, diff, st)
print("diff 0 -> VERIFICATO OK")

# differenza +1 centesimo (reparti mancano 1 cent) -> NON_QUADRATO
d, diff, st = compute_reconciliation(one_col, 275740, {"x": 275739}, None)
assert (d, diff, st) == (275739, 1, "NON_QUADRATO"), (d, diff, st)
print("diff +1 cent -> NON_QUADRATO OK")

# differenza -1 centesimo (reparti in piu' di 1 cent) -> NON_QUADRATO
d, diff, st = compute_reconciliation(one_col, 275740, {"x": 275741}, None)
assert (d, diff, st) == (275741, -1, "NON_QUADRATO"), (d, diff, st)
print("diff -1 cent -> NON_QUADRATO OK")

# nessuna tolleranza: tutti i tipi devono essere int esatti
assert isinstance(diff, int) and isinstance(d, int)

# Controllo A: somma righe reparti vs TOT EUR stampato, esatto al centesimo
def controllo_a(printed_total_cents, lines_cents):
    lines_sum = sum(lines_cents)  # integer cents
    return printed_total_cents - lines_sum

assert controllo_a(275740, [235340, 20190, 8005, 4240, 4100, 3865]) == 0, "Controllo A esatto"
assert controllo_a(275740, [235340, 20190, 8005, 4240, 4100, 3864]) == 1, "Controllo A +1"
assert controllo_a(275740, [235340, 20190, 8005, 4240, 4100, 3866]) == -1, "Controllo A -1"
print("Controllo A exact-cent OK")

# parsing punto/virgola/migliaia -> centesimi interi esatti
assert p("2.757,40") == 275740 and p("2,757.40") == 275740
assert p("2757.40") == 275740 and p("2757,40") == 275740
assert p("1.234.567,89") == 123456789  # migliaia multiple
assert p("1,234,567.89") == 123456789
assert isinstance(p("2.757,40"), int)
# somma di importi parsati resta esatta (nessun float)
total = p("2353.40") + p("201.90") + p("80.05") + p("42.40") + p("41.00") + p("38.65")
assert total == 275740, total
print("parsing punto/virgola/migliaia -> cent interi OK")

print("ALL ZERO-TOLERANCE QUADRATURA TESTS PASSED")
