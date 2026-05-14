import frappe

KEEP = {
    "Manager", "Project Manager", "Accounts Manager", "Accounts Executive",
    "GST & TDS Specialist", "Logistics Manager", "Stock Monitor", "Porter Executive",
}

def execute():
    frappe.set_user("Administrator")
    all_desigs = frappe.db.get_all("Designation", pluck="name")
    deleted, skipped = [], []
    for d in all_desigs:
        if d not in KEEP:
            try:
                frappe.delete_doc("Designation", d, ignore_permissions=True, force=True)
                deleted.append(d)
            except Exception as e:
                skipped.append(f"{d}: {e}")
        else:
            print(f"  KEEP: {d}")
    frappe.db.commit()
    print(f"\nDeleted ({len(deleted)}): {deleted}")
    if skipped:
        print(f"Skipped ({len(skipped)}): {skipped}")
