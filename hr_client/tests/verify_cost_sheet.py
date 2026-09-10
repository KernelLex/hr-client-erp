"""
Post-deploy smoke test for Quotation Studio Cost Sheet (Phase 2 §4.4).

    bench --site <site> execute hr_client.tests.verify_cost_sheet.run

Checks build-on-approved-BOQ + line snapshot, base/total cost + GP maths, the
overhead recompute, GP tone thresholds, and the workflow + revision. Self-cleaning.
"""

import frappe

from hr_client.api import cost_sheet as cs
from hr_client.api import boq
from hr_client.api import measurement as ms
from hr_client.api import quotation_masters as qm

_results = []


def _check(label, cond):
    _results.append((label, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    return cond


def _approx(a, b, tol=0.5):
    return abs(a - b) <= tol


def _cleanup():
    for dt, field, pat in [
        ("Vera Cost Sheet", "cost_title", "ZZTCS-%"),
        ("Vera BOQ", "boq_title", "ZZTCS-%"),
        ("Vera Measurement Sheet", "measurement_title", "ZZTCS-%"),
        ("Vera Quotation Material", "code", "ZZTCS-%"),
        ("Vera Quotation Finish", "code", "ZZTCS-%"),
    ]:
        for name in frappe.get_all(dt, filters={field: ["like", pat]}, pluck="name"):
            try:
                frappe.delete_doc(dt, name, force=True, ignore_permissions=True)
            except Exception:
                pass
    frappe.db.commit()


def _make_approved_boq():
    qm.create_material({"code": "ZZTCS-M", "material_name": "ZZTCS Ply"})
    qm.create_finish({"code": "ZZTCS-F", "finish_name": "ZZTCS Laminate"})
    mc = ms.create_measurement({"measurement_title": "ZZTCS-MS", "company_name": "ACME"})
    ms.save_register(mc["name"], "rows", [{"area": "K", "product": "Cab", "width": 600, "height": 720, "quantity": 1}])
    ms.approve_measurement(mc["name"])
    bc = boq.create_boq({"boq_title": "ZZTCS-BOQ", "measurement_sheet": mc["name"]})
    # two lines: selling 10000, cost 6000 total — with valid spec so the BOQ approves
    spec = {"carcass_material": "ZZTCS Ply", "internal_finish": "ZZTCS Laminate"}
    boq.save_lines(bc["name"], [
        {"unit_name": "Cab A", "pricing_method": "UNIT", "quantity": 1, "selling_rate": 6000, "cost_rate": 4000, **spec},
        {"unit_name": "Cab B", "pricing_method": "UNIT", "quantity": 1, "selling_rate": 4000, "cost_rate": 2000, **spec},
    ])
    ap = boq.approve_boq(bc["name"])
    if not ap.get("success"):
        raise Exception(f"test BOQ failed to approve: {ap.get('issues')}")
    return bc["name"]


def run():
    print("\n=== Cost Sheet verification ===\n")
    _cleanup()
    try:
        print("1. DocTypes present")
        _check("Vera Cost Sheet exists", frappe.db.exists("DocType", "Vera Cost Sheet"))
        _check("Vera Cost Sheet Line exists", frappe.db.exists("DocType", "Vera Cost Sheet Line"))

        print("2. GP tone thresholds (§4.5)")
        _check("below minimum -> red", cs.gp_tone(10, 30, 20) == "red")
        _check("below target -> amber", cs.gp_tone(25, 30, 20) == "amber")
        _check("at/above target -> green", cs.gp_tone(35, 30, 20) == "green")

        print("3. Build on approved BOQ + snapshot")
        boq_name = _make_approved_boq()
        blocked = cs.create_cost_sheet({"cost_title": "ZZTCS-early", "boq": None})
        _check("requires a BOQ", not blocked.get("success"))
        c = cs.create_cost_sheet({"cost_title": "ZZTCS-Sheet", "boq": boq_name})
        name = c["name"]
        _check("cost sheet created on approved BOQ", c.get("success"))
        doc = frappe.get_doc("Vera Cost Sheet", name)
        _check("2 cost lines snapshotted", len(doc.lines) == 2)
        _check("base cost = 6000 (4000+2000)", _approx(doc.base_cost, 6000))
        _check("selling total carried from BOQ = 10000", _approx(doc.selling_total, 10000))
        _check("total cost = base (overhead 0)", _approx(doc.total_cost, 6000))
        _check("projected GP = 4000", _approx(doc.projected_gp, 4000))
        _check("projected GP% = 40", _approx(doc.projected_gp_percent, 40, 0.1))

        print("4. Overhead recompute + GP targets")
        cs.update_cost_sheet(name, {"overhead_percent": 10, "target_gp_percent": 35, "min_gp_percent": 25})
        doc = frappe.get_doc("Vera Cost Sheet", name)
        _check("total cost = 6600 with 10% overhead", _approx(doc.total_cost, 6600))
        _check("projected GP = 3400", _approx(doc.projected_gp, 3400))
        _check("projected GP% = 34", _approx(doc.projected_gp_percent, 34, 0.1))
        detail = cs.get_cost_sheet(name)["cost_sheet"]
        _check("GP tone amber (34 < target 35, >= min 25)", detail["gp_tone"] == "amber")

        print("5. Workflow + revision")
        cs.submit_cost_sheet(name)
        blocked_edit = cs.update_cost_sheet(name, {"overhead_percent": 5})
        _check("editing a Submitted sheet blocked", not blocked_edit.get("success"))
        ap = cs.approve_cost_sheet(name)
        _check("approve -> Approved", ap.get("status") == "Approved")
        _check("approved cost sheet in downstream list",
               any(x["name"] == name for x in cs.get_approved_cost_sheets()))
        rev = cs.create_revision(name)
        _check("revision rev 2 + original superseded",
               rev.get("revision") == 2 and
               frappe.db.get_value("Vera Cost Sheet", name, "status") == "Superseded")

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
