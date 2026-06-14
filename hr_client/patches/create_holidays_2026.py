import frappe

def execute():
    holidays = [
        {"date": "2026-01-01", "name": "Happy New Year"},
        {"date": "2026-01-15", "name": "Maatu Pongal / Makar Sankranthi / Lohri"},
        {"date": "2026-01-26", "name": "Republic Day"},
        {"date": "2026-03-19", "name": "Gudi Padwa / Ugadi"},
        {"date": "2026-03-20", "name": "Ramzan Id / Eid-Ul-Fitar"},
        {"date": "2026-05-01", "name": "Labour's Day"},
        {"date": "2026-08-15", "name": "Independence Day"},
        {"date": "2026-09-14", "name": "Ganesh Chaturthi"},
        {"date": "2026-10-02", "name": "Gandhi Jayanti"},
        {"date": "2026-10-19", "name": "Ashtami / Ayudha Pooja"},
        {"date": "2026-10-20", "name": "Dussehra"},
        {"date": "2026-11-10", "name": "Diwali / Padwa"},
        {"date": "2026-11-11", "name": "Diwali"},
        {"date": "2026-12-25", "name": "Christmas"},
    ]

    if not frappe.db.exists("Holiday List", "Vera Enterprises 2026"):
        hl = frappe.get_doc({
            "doctype": "Holiday List",
            "holiday_list_name": "Vera Enterprises 2026",
            "from_date": "2026-01-01",
            "to_date": "2026-12-31",
            "holidays": [
                {"holiday_date": h["date"], "description": h["name"]}
                for h in holidays
            ]
        })
        hl.insert(ignore_permissions=True)
        frappe.db.commit()
        print("Holiday list created successfully")
    else:
        print("Holiday list already exists")
