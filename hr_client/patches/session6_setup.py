"""
Session 6 setup patch:
1. Reset all AI-auto-verified records back to Unverified
2. Add 4 new Custom Fields to all 12 VE DocTypes:
   - extraction_attempts (Int)
   - extraction_history (Long Text)
   - manual_review_required (Check)
   - last_extraction_at (Datetime)
"""
import frappe

VE_DOCTYPES = [
    "VE Sales Invoice", "VE Purchase Invoice", "VE Purchase Order", "VE Quotation",
    "VE Credit Note", "VE Debit Note", "VE Financial Report", "VE Salary Record",
    "VE Stock Record", "VE Sales Order", "VE GRN", "VE Payment Record",
]

NEW_FIELDS = [
    {
        "fieldname": "extraction_attempts",
        "label": "Extraction Attempts",
        "fieldtype": "Int",
        "default": "0",
        "insert_after": "extraction_confidence",
    },
    {
        "fieldname": "extraction_history",
        "label": "Extraction History",
        "fieldtype": "Long Text",
        "insert_after": "extraction_attempts",
    },
    {
        "fieldname": "manual_review_required",
        "label": "Manual Review Required",
        "fieldtype": "Check",
        "default": "0",
        "insert_after": "extraction_history",
    },
    {
        "fieldname": "last_extraction_at",
        "label": "Last Extraction At",
        "fieldtype": "Datetime",
        "insert_after": "manual_review_required",
    },
]


def execute():
    # Part 1: Reset AI-auto-verified records
    total_reset = 0
    print("\n=== PART 1: Reset AI auto-verified records ===")
    for dt in VE_DOCTYPES:
        table = f"tab{dt}"
        frappe.db.sql(f"""
            UPDATE `{table}`
            SET verification_status = 'Unverified',
                verified_by = NULL,
                verified_on = NULL,
                correction_notes = NULL
            WHERE verified_by = 'Vera AI (auto)'
               OR (verification_status = 'Verified' AND (verified_by IS NULL OR verified_by = ''))
        """)
        count = frappe.db.sql("SELECT ROW_COUNT()")[0][0]
        if count:
            print(f"  {dt}: {count} reset to Unverified")
            total_reset += count
    frappe.db.commit()
    print(f"Total reset: {total_reset} records")

    # Part 2: Add Custom Fields
    print("\n=== PART 2: Add Custom Fields ===")
    for dt in VE_DOCTYPES:
        for field in NEW_FIELDS:
            cf_name = f"{dt}-{field['fieldname']}"
            if frappe.db.exists("Custom Field", cf_name):
                print(f"  EXISTS: {cf_name}")
                continue
            cf = frappe.new_doc("Custom Field")
            cf.dt = dt
            cf.fieldname = field["fieldname"]
            cf.label = field["label"]
            cf.fieldtype = field["fieldtype"]
            cf.insert_after = field.get("insert_after", "")
            if "default" in field:
                cf.default = field["default"]
            cf.insert(ignore_permissions=True)
            print(f"  CREATED: {cf_name}")
    frappe.db.commit()
    print("Custom fields done.")

    # Initialize extraction_attempts = 0 for existing records
    print("\n=== PART 2b: Initialize extraction_attempts ===")
    for dt in VE_DOCTYPES:
        table = f"tab{dt}"
        try:
            frappe.db.sql(f"""
                UPDATE `{table}`
                SET extraction_attempts = 1
                WHERE (extraction_attempts IS NULL OR extraction_attempts = 0)
                  AND (original_extracted IS NOT NULL AND original_extracted != '')
            """)
            count = frappe.db.sql("SELECT ROW_COUNT()")[0][0]
            if count:
                print(f"  {dt}: initialized {count} records to extraction_attempts=1")
        except Exception as e:
            print(f"  {dt}: SKIP (column may not exist yet) — {e}")
    frappe.db.commit()

    print("\n=== DONE ===")
