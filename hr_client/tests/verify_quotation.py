"""
Post-deploy smoke test for Quotation Studio §4.5/§4.6/§4.10/§4.11 —
Customer Quotation, the commercial-approval exception engine, Terms, and the
gated Sales Order conversion.

    bench --site <site> execute hr_client.tests.verify_quotation.run

Self-cleaning.
"""

import frappe

from hr_client.api import quotation as q
from hr_client.api import cost_sheet as cs
from hr_client.api import boq as boqmod
from hr_client.api import measurement as ms
from hr_client.api import quotation_masters as qm
from hr_client.api import terms as tmod
from hr_client.api import sales_order as somod

_results = []


def _check(label, cond):
    _results.append((label, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    return cond


def _approx(a, b, tol=1.0):
    return abs(a - b) <= tol


def _cleanup():
    for dt, field, pat in [
        ("Vera Sales Order", "so_title", "ZZTQ-%"),
        ("Vera Sales Quotation", "quotation_title", "ZZTQ-%"),
        ("Vera Cost Sheet", "cost_title", "ZZTQ-%"),
        ("Vera BOQ", "boq_title", "ZZTQ-%"),
        ("Vera Measurement Sheet", "measurement_title", "ZZTQ-%"),
        ("Vera Quotation Material", "code", "ZZTQ-%"),
        ("Vera Quotation Finish", "code", "ZZTQ-%"),
        ("Vera Terms Clause", "code", "ZZTQ-%"),
        ("Vera Terms Template", "code", "ZZTQ-%"),
    ]:
        for name in frappe.get_all(dt, filters={field: ["like", pat]}, pluck="name"):
            try:
                frappe.delete_doc(dt, name, force=True, ignore_permissions=True)
            except Exception:
                pass
    frappe.db.commit()


def _approved_cost_sheet():
    qm.create_material({"code": "ZZTQ-M", "material_name": "ZZTQ Ply"})
    qm.create_finish({"code": "ZZTQ-F", "finish_name": "ZZTQ Lam"})
    mc = ms.create_measurement({"measurement_title": "ZZTQ-MS", "company_name": "ACME"})
    ms.save_register(mc["name"], "rows", [{"area": "K", "product": "Cab", "width": 600, "height": 720, "quantity": 1}])
    ms.approve_measurement(mc["name"])
    bc = boqmod.create_boq({"boq_title": "ZZTQ-BOQ", "measurement_sheet": mc["name"]})
    spec = {"carcass_material": "ZZTQ Ply", "internal_finish": "ZZTQ Lam"}
    boqmod.save_lines(bc["name"], [
        {"unit_name": "Cab A", "pricing_method": "UNIT", "quantity": 1, "selling_rate": 6000, "cost_rate": 4000, **spec},
        {"unit_name": "Cab B", "pricing_method": "UNIT", "quantity": 1, "selling_rate": 4000, "cost_rate": 2000, **spec},
    ])
    boqmod.approve_boq(bc["name"])
    csc = cs.create_cost_sheet({"cost_title": "ZZTQ-CS", "boq": bc["name"]})
    cs.update_cost_sheet(csc["name"], {"target_gp_percent": 35, "min_gp_percent": 25})
    cs.approve_cost_sheet(csc["name"])
    return csc["name"]


def run():
    print("\n=== Quotation + Approvals + Terms + SO verification ===\n")
    _cleanup()
    try:
        print("1. DocTypes present")
        for dt in ("Vera Sales Quotation", "Vera Sales Quotation Line",
                   "Vera Sales Quotation Approval", "Vera Terms Clause",
                   "Vera Terms Template", "Vera Sales Order"):
            _check(f"{dt} exists", frappe.db.exists("DocType", dt))

        print("2. Build quotation from approved cost sheet")
        cs_name = _approved_cost_sheet()
        blocked = q.create_quotation({"quotation_title": "ZZTQ-early", "cost_sheet": None})
        _check("requires a cost sheet", not blocked.get("success"))
        c = q.create_quotation({"quotation_title": "ZZTQ-Quote", "cost_sheet": cs_name})
        name = c["name"]
        _check("quotation created", c.get("success"))
        d = q.get_quotation(name)["quotation"]
        _check("2 lines seeded from BOQ", len(d["lines"]) == 2)
        _check("cost basis pulled from cost sheet = 6000", _approx(d["cost_basis"], 6000))
        _check("GP targets pulled from cost sheet", d["target_gp_percent"] == 35 and d["min_gp_percent"] == 25)

        print("3. Totals cascade (Gross->Disc->Adj->Net->GST->Grand)")
        _check("gross total = 10000", _approx(d["gross_total"], 10000))
        _check("net before gst = 10000 (no disc/adj)", _approx(d["net_before_gst"], 10000))
        _check("gst @18% = 1800", _approx(d["gst_amount"], 1800))
        _check("grand total = 11800", _approx(d["grand_total"], 11800))
        _check("gross profit = 4000 (net-cost)", _approx(d["gross_profit"], 4000))
        _check("gp% = 40", _approx(d["gp_percent"], 40, 0.1))
        _check("gp tone green (40 >= target 35)", d["gp_tone"] == "green")

        print("4. Exception engine (§4.6)")
        _check("no exception -> Sales Executive", d["required_authority"] == "Sales Executive")
        q.update_quotation(name, {"discount_percent": 4})
        _check("discount 4% -> Sales Manager",
               q.get_quotation(name)["quotation"]["required_authority"] == "Sales Manager")
        q.update_quotation(name, {"discount_percent": 6})
        _check("discount 6% -> CFO",
               q.get_quotation(name)["quotation"]["required_authority"] == "CFO")
        q.update_quotation(name, {"discount_percent": 45})
        _check("deep discount pushing GP below min -> Director / CFO",
               q.get_quotation(name)["quotation"]["required_authority"] == "Director / CFO")
        q.update_quotation(name, {"discount_percent": 0, "credit_terms_standard": 0})
        _check("non-standard credit -> CFO",
               q.get_quotation(name)["quotation"]["required_authority"] == "CFO")
        q.update_quotation(name, {"credit_terms_standard": 1, "adjustment": -100})
        _check("negative adjustment -> Sales Manager",
               q.get_quotation(name)["quotation"]["required_authority"] == "Sales Manager")
        q.update_quotation(name, {"adjustment": 0})

        print("5. Approval workflow + audit log")
        sub = q.submit_for_approval(name)
        _check("submit -> Pending Approval", sub.get("status") == "Pending Approval")
        edit_blocked = q.update_quotation(name, {"discount_percent": 1})
        _check("editing a Pending quotation is blocked", not edit_blocked.get("success"))
        cond_needed = q.decide(name, "Approve with Conditions")
        _check("approve-with-conditions requires conditions", not cond_needed.get("success"))
        ap = q.decide(name, "Approve", comment="Looks good")
        _check("approve -> Approved", ap.get("status") == "Approved")
        d = q.get_quotation(name)["quotation"]
        _check("approval log has submit + approve", len(d["approval_log"]) == 2)
        _check("approved_by stamped", bool(d["approved_by"]))

        print("6. Gated conversion to Sales Order (§4.11)")
        blocked_conv = q.convert_to_sales_order(name)
        _check("conversion blocked before acceptance/advance", not blocked_conv.get("success"))
        gate = {c2["label"]: c2["ok"] for c2 in blocked_conv["checks"]}
        _check("gate: commercial approval obtained = True",
               gate["Commercial approval obtained"])
        _check("gate: acceptance not yet recorded",
               not gate["Customer acceptance recorded in writing"])
        q.set_acceptance(name, customer_acceptance=1, advance_received=1)
        conv = q.convert_to_sales_order(name)
        _check("conversion succeeds once gate passes", conv.get("success"))
        so_name = conv["sales_order"]
        _check("quotation now Converted",
               frappe.db.get_value("Vera Sales Quotation", name, "status") == "Converted")
        so = somod.get_sales_order(so_name)["sales_order"]
        _check("SO records source quotation + revision",
               so["quotation"] == name and so["quotation_revision"] == 1)
        _check("SO records BOQ + cost sheet revisions",
               so["boq_revision"] == 1 and so["cost_sheet_revision"] == 1)
        _check("SO carries 2 lines", len(so["lines"]) == 2)
        reconv = q.convert_to_sales_order(name)
        _check("double conversion blocked", not reconv.get("success"))

        print("7. Print formats redaction (§4.9)")
        cust = q.get_quotation_print(name, "detailed")
        _check("customer format has grand total", "grand_total" in cust)
        _check("customer format hides cost/GP", "cost_basis" not in cust and "gross_profit" not in cust)
        tech = q.get_quotation_print(name, "technical")
        _check("technical BOQ has no pricing", "grand_total" not in tech and "rate" not in (tech["lines"][0] if tech["lines"] else {}))
        intl = q.get_quotation_print(name, "internal")
        _check("internal costing shows cost + GP + confidential flag",
               intl.get("confidential") and "cost_basis" in intl and "gp_percent" in intl)

        print("8. Terms library + versioned templates (§4.10)")
        tmod.create_clause({"code": "ZZTQ-C1", "title": "Payment", "category": "Complete Interior Project",
                            "mandatory": 1, "customer_text": "50% advance."})
        tmod.create_clause({"code": "ZZTQ-C2", "title": "Warranty", "category": "Complete Interior Project",
                            "customer_text": "1 year warranty."})
        tt = tmod.create_terms_template(
            {"code": "ZZTQ-T1", "template_name": "ZZTQ Interior", "category": "Complete Interior Project", "version": 1},
            clauses=["ZZTQ-C1", "ZZTQ-C2"])
        _check("terms template created with clauses", tt.get("success"))
        asm = tmod.assemble_terms("ZZTQ-T1")
        _check("assembled terms include both clauses",
               "Payment" in asm["text"] and "Warranty" in asm["text"])
        _check("mandatory clause starred in assembly", "*" in asm["text"])

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
