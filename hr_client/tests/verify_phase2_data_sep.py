"""
Post-deploy smoke test for the Phase 2 data-separation foundation.

Run on the server AFTER `bench migrate && bench clear-cache`:

    bench --site <site> execute hr_client.tests.verify_phase2_data_sep.run

It checks source classification, the two new DocTypes, and the full
request → approve → void flow end to end, then deletes everything it created.
Prints PASS/FAIL per check and a final summary. Creates no lasting data.
"""

import frappe

from hr_client.api import data_source, erp_entries

_results = []


def _check(label, cond):
    _results.append((label, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    return cond


def run():
    print("\n=== Phase 2 data-separation verification ===\n")
    created_request = None
    created_entry = None

    try:
        # 1. Source classification
        print("1. Source classification")
        _check("VE Tally Ledger classifies as TALLY",
               data_source.classify("VE Tally Ledger") == data_source.SOURCE_TALLY)
        _check("VE Tally Voucher is tally-sourced",
               data_source.is_tally_sourced("VE Tally Voucher"))
        _check("Vera ERP Entry classifies as ERP",
               data_source.classify("Vera ERP Entry") == data_source.SOURCE_ERP)
        _check("Manual VE Bank Account Balance is ERP-native",
               not data_source.is_tally_sourced("VE Bank Account Balance"))
        badge = data_source.badge("VE Tally Ledger")
        _check("Tally badge is grey TALLY pill",
               badge["label"] == "TALLY" and badge["color"] == "grey")

        # 2. assert_writable
        print("2. Read-only enforcement")
        blocked = False
        try:
            data_source.assert_writable("VE Tally Ledger")
        except frappe.PermissionError:
            blocked = True
        _check("assert_writable blocks Tally DocType", blocked)

        frappe.flags.in_tally_sync = True
        allowed = True
        try:
            data_source.assert_writable("VE Tally Ledger")
        except frappe.PermissionError:
            allowed = False
        _check("assert_writable allows the sync service (flag set)", allowed)
        frappe.flags.in_tally_sync = False
        _check("assert_writable never blocks ERP-native DocType",
               data_source.assert_writable("Vera ERP Entry") is None)

        # 3. subtotals tri-split
        print("3. Tri-split subtotals")
        st = data_source.subtotals([
            {"doctype": "VE Tally Ledger", "amount": 100},
            {"doctype": "Vera ERP Entry", "amount": 40},
        ])
        _check("subtotals returns tally=100, erp=40, combined=140",
               st["tally"] == 100 and st["erp"] == 40 and st["combined"] == 140)

        # 4. DocTypes exist
        print("4. DocTypes present")
        _check("Vera ERP Entry DocType exists",
               frappe.db.exists("DocType", "Vera ERP Entry"))
        _check("Vera Data Entry Request DocType exists",
               frappe.db.exists("DocType", "Vera Data Entry Request"))

        # 5. Full request → approve → void flow
        print("5. Request → approve → void flow")
        req = frappe.new_doc("Vera Data Entry Request")
        req.update({
            "entry_type": "Manual Adjustment",
            "entry_date": frappe.utils.today(),
            "party": "VERIFY TEST PARTY",
            "amount": 123.45,
            "description": "Phase 2 verification — safe to delete",
            "reason": "smoke test",
        })
        req.request_status = "Submitted"
        req.submitted_on = frappe.utils.now_datetime()
        req.insert(ignore_permissions=True)
        created_request = req.name
        _check("Request created & submitted", req.request_status == "Submitted")

        res = erp_entries.approve_request(req.name, admin_notes="verified")
        created_entry = res.get("created_entry")
        req.reload()
        _check("Approve created a linked ERP Entry", bool(created_entry))
        _check("Request status is Approved", req.request_status == "Approved")
        _check("Request links to created entry", req.created_entry == created_entry)

        entry = frappe.get_doc("Vera ERP Entry", created_entry)
        _check("Entry source is permanently ERP", entry.source == "ERP")
        _check("Entry back-links to the request",
               entry.created_via_request == req.name)

        # Void, don't delete
        entry.void("verification cleanup")
        _check("Entry voided (not deleted)", entry.status == "Voided")

        # on_trash guard blocks hard delete without the flag
        guard_ok = False
        try:
            frappe.delete_doc("Vera ERP Entry", created_entry)
        except frappe.PermissionError:
            guard_ok = True
        _check("on_trash blocks hard delete of an entry", guard_ok)

    finally:
        # Cleanup — force-delete the test docs
        frappe.flags.allow_erp_entry_delete = True
        if created_entry and frappe.db.exists("Vera ERP Entry", created_entry):
            frappe.delete_doc("Vera ERP Entry", created_entry, force=True)
        if created_request and frappe.db.exists("Vera Data Entry Request", created_request):
            frappe.delete_doc("Vera Data Entry Request", created_request, force=True)
        frappe.flags.allow_erp_entry_delete = False
        frappe.db.commit()

    passed = sum(1 for _, ok in _results if ok)
    total = len(_results)
    print(f"\n=== {passed}/{total} checks passed ===")
    if passed != total:
        print("FAILURES:")
        for label, ok in _results:
            if not ok:
                print(f"  - {label}")
    return {"passed": passed, "total": total, "ok": passed == total}
