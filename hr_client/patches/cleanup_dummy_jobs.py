import frappe


def execute():
    dummy_jobs = ["HR-OPN-2026-0001"]

    for job_name in dummy_jobs:
        if not frappe.db.exists("Job Opening", job_name):
            print(f"{job_name} not found — skipping")
            continue

        # Delete linked applicants first
        applicants = frappe.db.get_all("Job Applicant", filters={"job_title": job_name}, fields=["name"])
        for app in applicants:
            # Delete linked interviews
            interviews = frappe.db.get_all("Interview", filters={"job_applicant": app["name"]}, fields=["name"])
            for iv in interviews:
                frappe.delete_doc("Interview", iv["name"], ignore_permissions=True, force=True)
            # Delete linked offers
            offers = frappe.db.get_all("Job Offer", filters={"job_applicant": app["name"]}, fields=["name"])
            for offer in offers:
                frappe.delete_doc("Job Offer", offer["name"], ignore_permissions=True, force=True)
            frappe.delete_doc("Job Applicant", app["name"], ignore_permissions=True, force=True)
            print(f"Deleted applicant {app['name']}")

        frappe.delete_doc("Job Opening", job_name, ignore_permissions=True, force=True)
        frappe.db.commit()
        print(f"Deleted job opening {job_name}")

    print("Cleanup complete")
