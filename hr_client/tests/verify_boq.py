"""
Post-deploy smoke test for Quotation Studio BOQ / Configuration (Phase 2 §4.3).

    bench --site <site> execute hr_client.tests.verify_boq.run

Checks the pricing formulas, build-on-approved-measurement rule + line seeding,
server-side quantity/amount/total maths, the validation gate (approval blocked
until issues resolved), and revision creation. Self-cleaning.
"""

import frappe

from hr_client.api import boq
from hr_client.api import measurement as ms
from hr_client.api import quotation_masters as qm

_results = []
_TITLE = "ZZTEST-BOQ"


def _check(label, cond):
    _results.append((label, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    return cond


def _approx(a, b, tol=0.01):
    return abs(a - b) <= tol


def _cleanup():
    for dt, field, val in [
        ("Vera BOQ", "boq_title", "ZZTEST-%"),
        ("Vera Measurement Sheet", "measurement_title", "ZZTEST-BOQ-MS%"),
        ("Vera Quotation Material", "code", "ZZTBOQ-%"),
        ("Vera Quotation Finish", "code", "ZZTBOQ-%"),
    ]:
        for name in frappe.get_all(dt, filters={field: ["like", val]}, pluck="name"):
            try:
                frappe.delete_doc(dt, name, force=True, ignore_permissions=True)
            except Exception:
                pass
    frappe.db.commit()


def run():
    print("\n=== BOQ / Configuration verification ===\n")
    _cleanup()
    try:
        print("1. DocTypes present")
        _check("Vera BOQ exists", frappe.db.exists("DocType", "Vera BOQ"))
        _check("Vera BOQ Line exists", frappe.db.exists("DocType", "Vera BOQ Line"))

        print("2. Pricing formulas (§4.3)")
        _check("RFT: 2400mm ÷ 304.8 × 1 = 7.874", _approx(boq.calc_line_qty("RFT", 2400, 0, 1), 7.874))
        _check("SFT: 600×720 ÷ 92903.04 × 2 = 9.30", _approx(boq.calc_line_qty("SFT", 600, 720, 2), 9.30, 0.02))
        _check("SQM: 1000×1000 ÷ 1e6 × 3 = 3.0", _approx(boq.calc_line_qty("SQM", 1000, 1000, 3), 3.0))
        _check("UNIT: qty passthrough = 5", boq.calc_line_qty("UNIT", 0, 0, 5) == 5)
        _check("LS: always 1", boq.calc_line_qty("LS", 0, 0, 99) == 1)

        print("3. Masters for compatibility checks")
        qm.create_material({"code": "ZZTBOQ-M", "material_name": "ZZTest Ply"})
        qm.create_finish({"code": "ZZTBOQ-F", "finish_name": "ZZTest Laminate"})

        print("4. Build-on-approved-measurement rule + line seeding")
        msc = ms.create_measurement({"measurement_title": "ZZTEST-BOQ-MS", "company_name": "ACME"})
        ms_name = msc["name"]
        ms.save_register(ms_name, "rows", [
            {"area": "Kitchen", "product": "Base Cabinet", "reference_code": "K1",
             "width": 600, "height": 720, "depth": 560, "quantity": 2, "uom": "Nos"},
        ])
        blocked = boq.create_boq({"boq_title": "ZZTEST-BOQ-early", "measurement_sheet": ms_name})
        _check("BOQ blocked on non-approved measurement", not blocked.get("success"))
        ms.approve_measurement(ms_name)
        c = boq.create_boq({"boq_title": _TITLE, "measurement_sheet": ms_name})
        name = c["name"]
        _check("BOQ created on approved measurement", c.get("success"))
        _check("lines seeded from measurement rows", c.get("seeded_lines") == 1)
        _check("company inherited from measurement",
               frappe.db.get_value("Vera BOQ", name, "company_name") == "ACME")

        print("5. Server-side maths on save_lines")
        sv = boq.save_lines(name, [
            {"area": "Kitchen", "unit_name": "Base Cabinet", "pricing_method": "UNIT",
             "quantity": 2, "carcass_material": "ZZTest Ply", "internal_finish": "ZZTest Laminate",
             "selling_rate": 5000, "cost_rate": 3000, "line_status": "Complete"},
            {"area": "Wall", "unit_name": "Panel", "pricing_method": "SFT",
             "width": 1000, "height": 1000, "quantity": 1, "carcass_material": "ZZTest Ply",
             "internal_finish": "ZZTest Laminate", "selling_rate": 100, "cost_rate": 60},
        ])
        _check("2 lines saved", sv.get("count") == 2)
        # UNIT line: calc 2 × 5000 = 10000 sell; SFT line: 1000*1000/92903.04*1 = 10.764 × 100 = 1076.39
        _check("total selling computed server-side", _approx(sv.get("total_selling"), 10000 + 1076.39, 1))

        print("6. Validation gate blocks approval until clean")
        # add a bad line (dimensional method, zero width, missing spec, unknown finish)
        bad = boq.save_lines(name, [
            {"unit_name": "Bad", "pricing_method": "SFT", "width": 0, "height": 0,
             "internal_finish": "Nonexistent Finish"},
        ])
        v = boq.validate_boq(name)
        _check("validation reports issues", not v.get("ready") and len(v.get("issues")) > 0)
        ap_blocked = boq.approve_boq(name)
        _check("approval blocked while issues exist", not ap_blocked.get("success"))

        print("7. Fix lines, then approve succeeds")
        boq.save_lines(name, [
            {"area": "Kitchen", "unit_name": "Base Cabinet", "pricing_method": "UNIT",
             "quantity": 2, "carcass_material": "ZZTest Ply", "internal_finish": "ZZTest Laminate",
             "selling_rate": 5000, "cost_rate": 3000, "line_status": "Complete"},
        ])
        ap = boq.approve_boq(name)
        _check("approval succeeds once clean", ap.get("success") and ap.get("status") == "Approved")
        _check("approved BOQ in downstream list", any(b["name"] == name for b in boq.get_approved_boqs()))

        print("8. Revision supersedes + rev+1")
        rev = boq.create_revision(name)
        _check("revision is rev 2", rev.get("revision") == 2)
        _check("original superseded",
               frappe.db.get_value("Vera BOQ", name, "status") == "Superseded")
        _check("revision carries copied lines", len(frappe.get_doc("Vera BOQ", rev["name"]).lines) == 1)

    finally:
        _cleanup()

    passed = sum(1 for _, ok in _results if ok)
    total = len(_results)
    print(f"\n=== {passed}/{total} checks passed ===\n")
    if passed != total:
        print("FAILURES:")
        for label, ok in _results:
            if not ok:
                print(f"  - {label}")
    return {"passed": passed, "total": total}
