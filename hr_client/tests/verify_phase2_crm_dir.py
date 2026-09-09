"""
Smoke test for CRM directory screens (Contacts, Sales Team, Follow-ups).

    bench --site <site> execute hr_client.tests.verify_phase2_crm_dir.run

Self-cleaning; prints PASS/FAIL per check.
"""

import frappe

from hr_client.api import crm_directory

_results = []


def _check(label, cond):
    _results.append((label, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    return cond


def run():
    print("\n=== CRM directory verification ===\n")
    contact = followup = team = None
    try:
        for dt in ("Vera CRM Contact", "Vera Sales Team Member", "Vera CRM Followup"):
            _check(f"{dt} DocType exists", frappe.db.exists("DocType", dt))

        # Contacts
        c = crm_directory.create_contact({"contact_name": "VERIFY Contact", "customer": "Verify Co", "preferred_channel": "WhatsApp"})
        contact = c.get("name")
        _check("create_contact returns a name", bool(contact))
        cp = crm_directory.get_contacts_page()
        _check("get_contacts_page envelope shape", all(k in cp for k in ("kpis", "columns", "rows")))

        # Follow-ups
        f = crm_directory.create_followup({"subject": "VERIFY call back", "linked_type": "Opportunity", "due_date": frappe.utils.today()})
        followup = f.get("name")
        _check("create_followup returns a name", bool(followup))
        done = crm_directory.complete_followup(followup, outcome="spoke, positive")
        _check("complete_followup sets Done", done.get("status") == "Done")

        # Sales Team (admin create; run as Administrator in bench execute)
        team_res = crm_directory.create_team_member({"member": "Administrator", "approval_authority": "Sales Manager"})
        team = team_res.get("name")
        _check("create_team_member returns a name", bool(team))
        dup = crm_directory.create_team_member({"member": "Administrator"})
        _check("duplicate team member rejected", dup.get("success") is False)
        tp = crm_directory.get_team_page()
        _check("get_team_page envelope shape", all(k in tp for k in ("kpis", "columns", "rows")))

    finally:
        for dt, nm in (("Vera CRM Contact", contact), ("Vera CRM Followup", followup), ("Vera Sales Team Member", team)):
            if nm and frappe.db.exists(dt, nm):
                frappe.delete_doc(dt, nm, force=True)
        frappe.db.commit()

    passed = sum(1 for _, ok in _results if ok)
    total = len(_results)
    print(f"\n=== {passed}/{total} checks passed ===")
    if passed != total:
        for label, ok in _results:
            if not ok:
                print(f"  - FAIL: {label}")
    return {"passed": passed, "total": total, "ok": passed == total}
