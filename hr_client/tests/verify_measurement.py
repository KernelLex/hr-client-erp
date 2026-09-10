"""
Post-deploy smoke test for Quotation Studio Measurement Sheets (Phase 2 §4.2).

    bench --site <site> execute hr_client.tests.verify_measurement.run

Checks the four DocTypes, the create → edit-registers → submit → approve flow,
the Draft-only editing guard, revision creation (supersede + rev+1), and the
approved-measurement option list. Self-cleaning.
"""

import frappe

from hr_client.api import measurement as ms

_results = []
_created = []

_DOCTYPES = [
    "Vera Measurement Sheet", "Vera Measurement Row",
    "Vera Measurement Obstruction", "Vera Measurement Service",
]


def _check(label, cond):
    _results.append((label, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    return cond


def _cleanup():
    # delete revisions first (children of supersede chain), then originals
    for name in frappe.get_all("Vera Measurement Sheet",
                               filters={"measurement_title": ["like", "ZZTEST-%"]},
                               pluck="name"):
        try:
            frappe.delete_doc("Vera Measurement Sheet", name, force=True, ignore_permissions=True)
        except Exception:
            pass
    frappe.db.commit()


def run():
    print("\n=== Measurement Sheets verification ===\n")
    _cleanup()
    try:
        print("1. DocTypes present")
        for dt in _DOCTYPES:
            _check(f"{dt} exists", frappe.db.exists("DocType", dt))

        print("2. Create + source=ERP + measured_by default")
        c = ms.create_measurement({"measurement_title": "ZZTEST-Kitchen", "company_name": "ACME",
                                   "measurement_type": "Site Survey"})
        name = c.get("name")
        _check("create returns name", c.get("success") and name)
        doc = frappe.get_doc("Vera Measurement Sheet", name)
        _check("source is ERP", doc.source == "ERP")
        _check("measured_by defaulted", bool(doc.measured_by))
        _check("stage is Measurement", doc.stage == "Measurement")
        _check("starts as Draft rev 1", doc.status == "Draft" and doc.revision == 1)

        print("3. Save all three registers")
        r = ms.save_register(name, "rows", [
            {"area": "Kitchen", "product": "Base Cabinet", "width": 600, "height": 720,
             "depth": 560, "quantity": 2, "uom": "Nos"},
            {"area": "Kitchen", "product": "Tall Unit", "width": 600, "height": 2100, "quantity": 1},
        ])
        _check("2 measurement rows saved", r.get("count") == 2)
        o = ms.save_register(name, "obstructions", [
            {"obstruction_type": "Window", "wall": "A", "width": 1200, "height": 1500},
        ])
        _check("1 obstruction saved", o.get("count") == 1)
        s = ms.save_register(name, "services", [
            {"service_type": "Electrical", "sub_description": "Hob point", "wall": "A",
             "readiness_status": "Pending"},
        ])
        _check("1 service saved", s.get("count") == 1)

        print("4. Detail serialization")
        detail = ms.get_measurement(name)["measurement"]
        _check("detail carries 2 rows", len(detail["rows"]) == 2)
        _check("detail carries obstructions + services",
               len(detail["obstructions"]) == 1 and len(detail["services"]) == 1)
        _check("detail marked editable while Draft", detail["editable"] is True)

        print("5. Submit requires rows, then locks appropriately")
        sub = ms.submit_measurement(name)
        _check("submit moves Draft -> Submitted", sub.get("status") == "Submitted")

        print("6. Draft-only editing guard")
        blocked = ms.save_register(name, "rows", [])
        _check("editing a Submitted sheet is blocked", not blocked.get("success"))

        print("7. Approve stamps approver + timestamp")
        ap = ms.approve_measurement(name)
        doc = frappe.get_doc("Vera Measurement Sheet", name)
        _check("approve moves -> Approved", ap.get("status") == "Approved")
        _check("approved_by + approved_on stamped", bool(doc.approved_by) and bool(doc.approved_on))

        print("8. Approved measurement appears in downstream option list")
        approved = ms.get_approved_measurements()
        _check("approved list includes this sheet", any(a["name"] == name for a in approved))

        print("9. Create revision supersedes original + rev+1")
        rev = ms.create_revision(name)
        _check("revision is rev 2", rev.get("revision") == 2)
        _check("original marked Superseded",
               frappe.db.get_value("Vera Measurement Sheet", name, "status") == "Superseded")
        newdoc = frappe.get_doc("Vera Measurement Sheet", rev["name"])
        _check("revision is a fresh Draft", newdoc.status == "Draft")
        _check("revision carries copied rows", len(newdoc.rows) == 2)
        _check("revision links supersedes -> original", newdoc.supersedes == name)

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
