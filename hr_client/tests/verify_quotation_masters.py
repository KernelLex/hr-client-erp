"""
Post-deploy smoke test for the Quotation Studio masters foundation (Phase 2 §4.7).

Run on the server AFTER `bench migrate && bench clear-cache`:

    bench --site <site> execute hr_client.tests.verify_quotation_masters.run

It checks that all six master DocTypes exist, the five standard pricing methods
seed correctly and are idempotent, each create endpoint works and stamps
source=ERP, duplicate codes are rejected, the page envelopes are well-formed,
and the shared option-list endpoint returns every master. Deletes everything it
creates. Prints PASS/FAIL per check and a final summary.
"""

import frappe

from hr_client.api import quotation_masters as qm

_results = []

_MASTER_DOCTYPES = [
    "Vera Quotation Unit",
    "Vera Quotation Material",
    "Vera Quotation Finish",
    "Vera Quotation Hardware",
    "Vera Quotation Pricing Method",
    "Vera Quotation Template",
]

# Test codes are prefixed so cleanup is unambiguous.
_P = "ZZTEST-"


def _check(label, cond):
    _results.append((label, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    return cond


def _cleanup():
    for dt in _MASTER_DOCTYPES:
        for name in frappe.get_all(dt, filters={"code": ["like", f"{_P}%"]}, pluck="name"):
            frappe.delete_doc(dt, name, force=True, ignore_permissions=True)
    frappe.db.commit()


def run():
    print("\n=== Quotation Studio masters verification ===\n")
    _cleanup()  # in case a prior run aborted mid-way

    try:
        # 1. DocTypes exist
        print("1. Master DocTypes present")
        for dt in _MASTER_DOCTYPES:
            _check(f"{dt} exists", frappe.db.exists("DocType", dt))

        # 2. Standard pricing methods seed + idempotency
        print("2. Standard pricing methods seed")
        qm._ensure_pricing_seeded()
        for code in ("RFT", "SFT", "SQM", "UNIT", "LS"):
            _check(f"pricing method {code} seeded",
                   frappe.db.exists("Vera Quotation Pricing Method", code))
        sft_formula = frappe.db.get_value("Vera Quotation Pricing Method", "SFT", "formula")
        _check("SFT formula matches spec", "92,903.04" in (sft_formula or ""))
        before = frappe.db.count("Vera Quotation Pricing Method")
        qm._ensure_pricing_seeded()  # second call must not duplicate
        _check("seeding is idempotent", frappe.db.count("Vera Quotation Pricing Method") == before)

        # 3. Create endpoints + source=ERP
        print("3. Create endpoints stamp source=ERP")
        u = qm.create_unit({"code": _P + "U1", "unit_name": "Test Base Cabinet",
                            "product_group": "Kitchen", "category": "Base Unit",
                            "pricing_method": "UNIT"})
        _check("create_unit returns name", u.get("success") and u.get("name"))
        _check("unit source is ERP",
               frappe.db.get_value("Vera Quotation Unit", u["name"], "source") == "ERP")

        m = qm.create_material({"code": _P + "M1", "material_name": "Test BWP Plywood",
                                "category": "Carcass", "thickness": "18 mm"})
        _check("create_material works", m.get("success"))

        f = qm.create_finish({"code": _P + "F1", "finish_name": "Test Laminate",
                              "category": "Laminate", "finish_type": "Matte"})
        _check("create_finish works", f.get("success"))

        h = qm.create_hardware({"code": _P + "H1", "hardware_item": "Test Hinge",
                                "brand": "Blum", "category": "Hinge"})
        _check("create_hardware works", h.get("success"))

        t = qm.create_template({"code": _P + "T1", "template_name": "Test W×H×D",
                                "applies_to": "Base Units", "dynamic_fields": "width, height, depth"})
        _check("create_template works", t.get("success"))

        p = qm.create_pricing_method({"code": _P + "P1", "method": "SFT",
                                      "formula": "custom", "uom": "SFT"})
        _check("create_pricing_method works", p.get("success"))

        # 4. Duplicate-code rejection. The @handle_api_error decorator catches
        # the frappe.throw and returns {success: False} rather than re-raising,
        # so a blocked duplicate is a falsy-success result, not an exception.
        print("4. Duplicate code rejected")
        dup = qm.create_unit({"code": _P + "U1", "unit_name": "Dup"})
        _check("duplicate code is rejected", not dup.get("success"))
        _check("only one unit exists for the duplicated code",
               frappe.db.count("Vera Quotation Unit", {"code": _P + "U1"}) == 1)

        # 5. Page envelopes well-formed
        print("5. Page envelopes")
        for fn, key in [
            (qm.get_units_page, "unit"), (qm.get_materials_page, "material"),
            (qm.get_finishes_page, "finish"), (qm.get_hardware_page, "hardware"),
            (qm.get_pricing_page, "pricing"), (qm.get_templates_page, "template"),
        ]:
            payload = fn()
            ok = (isinstance(payload, dict) and "kpis" in payload
                  and "columns" in payload and "rows" in payload)
            _check(f"{key} page returns a valid ModulePayload", ok)

        # 6. Shared option lists
        print("6. Shared option lists")
        opts = qm.get_master_options()
        for grp in ("units", "materials", "finishes", "hardware", "pricing_methods", "templates"):
            _check(f"options include '{grp}'", grp in opts and isinstance(opts[grp], list))
        _check("options carry the seeded pricing methods", len(opts["pricing_methods"]) >= 5)

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
