"""
Post-deploy smoke test for the CRM pipeline (Enquiries + Opportunities).

    bench --site <site> execute hr_client.tests.verify_phase2_crm.run

Creates an enquiry, converts it to an opportunity, walks the stage, then
deletes everything it created. Self-cleaning; prints PASS/FAIL per check.
"""

import frappe

from hr_client.api import crm_pipeline

_results = []


def _check(label, cond):
    _results.append((label, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    return cond


def run():
    print("\n=== CRM pipeline verification ===\n")
    enq_name = opp_name = None
    try:
        _check("Vera CRM Enquiry DocType exists", frappe.db.exists("DocType", "Vera CRM Enquiry"))
        _check("Vera CRM Opportunity DocType exists", frappe.db.exists("DocType", "Vera CRM Opportunity"))

        res = crm_pipeline.create_enquiry({
            "enquiry_title": "VERIFY — modular kitchen",
            "company_name": "Verify Client",
            "budget_band": "10-25L",
            "scope": "Full kitchen + 2 wardrobes",
        })
        enq_name = res.get("name")
        _check("create_enquiry returns a name", bool(enq_name))
        _check("Enquiry is ERP-native", frappe.db.get_value("Vera CRM Enquiry", enq_name, "source") == "ERP")

        conv = crm_pipeline.convert_enquiry_to_opportunity(enq_name)
        opp_name = conv.get("opportunity")
        _check("convert created an opportunity", bool(opp_name))
        enq = frappe.get_doc("Vera CRM Enquiry", enq_name)
        _check("Enquiry now Converted", enq.status == "Converted")
        _check("Enquiry links to opportunity", enq.created_opportunity == opp_name)

        opp = frappe.get_doc("Vera CRM Opportunity", opp_name)
        _check("Opportunity back-links to enquiry", opp.source_enquiry == enq_name)
        _check("Opportunity starts at Qualification", opp.stage == "Qualification")

        crm_pipeline.set_opportunity_stage(opp_name, "Proposal")
        _check("Stage advanced to Proposal",
               frappe.db.get_value("Vera CRM Opportunity", opp_name, "stage") == "Proposal")

        # Lost requires a reason. set_opportunity_stage is wrapped in
        # handle_api_error, so the ValidationError comes back as {success: False}
        # rather than being raised; the stage must stay unchanged.
        res_lost = crm_pipeline.set_opportunity_stage(opp_name, "Lost")
        stage_after = frappe.db.get_value("Vera CRM Opportunity", opp_name, "stage")
        _check("Marking Lost without a reason is rejected",
               res_lost.get("success") is False and stage_after != "Lost")

        crm_pipeline.set_opportunity_stage(opp_name, "Won")
        _check("Stage set to Won",
               frappe.db.get_value("Vera CRM Opportunity", opp_name, "stage") == "Won")

        # Envelope shape
        page = crm_pipeline.get_opportunities_page()
        _check("get_opportunities_page returns kpis+columns+rows",
               "kpis" in page and "columns" in page and "rows" in page)

    finally:
        if opp_name and frappe.db.exists("Vera CRM Opportunity", opp_name):
            frappe.delete_doc("Vera CRM Opportunity", opp_name, force=True)
        if enq_name and frappe.db.exists("Vera CRM Enquiry", enq_name):
            frappe.delete_doc("Vera CRM Enquiry", enq_name, force=True)
        frappe.db.commit()

    passed = sum(1 for _, ok in _results if ok)
    total = len(_results)
    print(f"\n=== {passed}/{total} checks passed ===")
    if passed != total:
        for label, ok in _results:
            if not ok:
                print(f"  - FAIL: {label}")
    return {"passed": passed, "total": total, "ok": passed == total}
