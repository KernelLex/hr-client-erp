# hr_client/api/payroll.py
# ---------------------------------------------------------------------------
# Payroll — full processing system on native Frappe-HRMS payroll. The admin:
#   1. defines Salary Structures (standard component set, driven by a base),
#   2. assigns a structure + base to each employee,
#   3. runs payroll for a period (generates Salary Slips), and
#   4. reviews and submits the slips.
# Every screen returns the uniform archetype envelope; the mutation endpoints
# drive the real ERPNext payroll engine so PF / PT / net-pay are computed for us.
# ---------------------------------------------------------------------------
import frappe
from frappe.utils import getdate, flt, fmt_money

from hr_client.api.utils import require_admin, handle_api_error, COMPANY_NAME

# Standard component set — earnings sum to base; PF is 12% of Basic; PT is fixed.
STD_EARNINGS = [
    ("Basic", "BASIC", "base * 0.5"),
    ("House Rent Allowance", "HRA", "base * 0.2"),
    ("Special Allowance", "SA", "base * 0.3"),
]
STD_DEDUCTIONS_FORMULA = [
    ("Provident Fund", "PF", "base * 0.5 * 0.12"),
]
STD_DEDUCTIONS_FIXED = [
    ("Professional Tax", "PT", 200),
]


def _money(v):
    return fmt_money(flt(v), currency="INR")


def _company_currency(company):
    return frappe.db.get_value("Company", company, "default_currency") or "INR"


# ── Component setup ──────────────────────────────────────────────────────────
def _ensure_component(name, abbr, ctype, *, formula=None, amount=None):
    if frappe.db.exists("Salary Component", name):
        return name
    doc = frappe.get_doc(
        {
            "doctype": "Salary Component",
            "salary_component": name,
            "salary_component_abbr": abbr,
            "type": ctype,
            "depends_on_payment_days": 1 if ctype == "Earning" else 0,
        }
    )
    if formula:
        doc.amount_based_on_formula = 1
        doc.formula = formula
    elif amount is not None:
        doc.amount = amount
    doc.insert(ignore_permissions=True)
    return doc.name


def _ensure_standard_components():
    for nm, ab, _f in STD_EARNINGS:
        _ensure_component(nm, ab, "Earning")
    for nm, ab, _f in STD_DEDUCTIONS_FORMULA:
        _ensure_component(nm, ab, "Deduction")
    for nm, ab, _a in STD_DEDUCTIONS_FIXED:
        _ensure_component(nm, ab, "Deduction")


# ── Salary Structures ────────────────────────────────────────────────────────
@frappe.whitelist()
@handle_api_error
def get_salary_structures():
    require_admin()
    structs = frappe.get_all(
        "Salary Structure",
        filters={"docstatus": ["<", 2]},
        fields=["name", "company", "is_active", "payroll_frequency", "currency"],
        order_by="modified desc",
        limit_page_length=100,
    )
    rows = []
    for s in structs:
        assigned = frappe.db.count("Salary Structure Assignment", {"salary_structure": s.name, "docstatus": 1})
        rows.append(
            {
                "structure": s.name,
                "company": s.company,
                "frequency": s.payroll_frequency or "Monthly",
                "assigned": assigned,
                "status": "Active" if s.is_active == "Yes" else "Inactive",
            }
        )
    kpis = [
        {"label": "Structures", "value": str(len(rows))},
        {"label": "Active", "value": str(len([r for r in rows if r["status"] == "Active"])), "tone": "good"},
        {"label": "Employees Assigned", "value": str(sum(r["assigned"] for r in rows))},
        {"label": "Company", "value": COMPANY_NAME},
    ]
    columns = [
        {"key": "structure", "header": "Structure"},
        {"key": "company", "header": "Company"},
        {"key": "frequency", "header": "Frequency", "align": "center"},
        {"key": "assigned", "header": "Assigned", "align": "right", "kind": "number"},
        {"key": "status", "header": "Status", "align": "center", "kind": "status"},
    ]
    return {
        "kpis": kpis,
        "columns": columns,
        "rows": rows,
        "note": "Salary Structures — the pay template. A standard structure splits the base into Basic/HRA/Special Allowance and deducts PF + Professional Tax; assign it to employees with their base pay.",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_standard_structure(structure_name, company=None):
    """Create + submit a Salary Structure with the standard component set."""
    require_admin()
    if not structure_name or not str(structure_name).strip():
        frappe.throw("Structure name is required")
    company = company or COMPANY_NAME
    name = str(structure_name).strip()
    if frappe.db.exists("Salary Structure", name):
        frappe.throw(f"A structure named '{name}' already exists")

    _ensure_standard_components()

    earnings = [
        {"salary_component": nm, "abbr": ab, "amount_based_on_formula": 1, "formula": f}
        for nm, ab, f in STD_EARNINGS
    ]
    deductions = [
        {"salary_component": nm, "abbr": ab, "amount_based_on_formula": 1, "formula": f}
        for nm, ab, f in STD_DEDUCTIONS_FORMULA
    ] + [
        {"salary_component": nm, "abbr": ab, "amount": a} for nm, ab, a in STD_DEDUCTIONS_FIXED
    ]

    doc = frappe.get_doc(
        {
            "doctype": "Salary Structure",
            "__newname": name,
            "company": company,
            "is_active": "Yes",
            "currency": _company_currency(company),
            "payroll_frequency": "Monthly",
            "earnings": earnings,
            "deductions": deductions,
        }
    )
    doc.insert(ignore_permissions=True)
    doc.submit()
    frappe.db.commit()
    return {"success": True, "name": doc.name}


# ── Salary Structure Assignments ─────────────────────────────────────────────
@frappe.whitelist()
@handle_api_error
def get_assignments():
    require_admin()
    rows_raw = frappe.get_all(
        "Salary Structure Assignment",
        filters={"docstatus": ["<", 2]},
        fields=["name", "employee_name", "salary_structure", "from_date", "base", "docstatus"],
        order_by="from_date desc",
        limit_page_length=300,
    )
    rows = []
    for a in rows_raw:
        rows.append(
            {
                "id": a.name,
                "employee": a.employee_name or "—",
                "structure": a.salary_structure,
                "from": str(a.from_date) if a.from_date else "—",
                "base": _money(a.base),
                "status": "Active" if a.docstatus == 1 else "Draft",
            }
        )
    total_base = sum(flt(frappe.db.get_value("Salary Structure Assignment", r["id"], "base")) for r in rows)
    kpis = [
        {"label": "Assignments", "value": str(len(rows))},
        {"label": "Active", "value": str(len([r for r in rows if r["status"] == "Active"])), "tone": "good"},
        {"label": "Monthly Base Total", "value": _money(total_base)},
        {"label": "Employees", "value": str(len({r["employee"] for r in rows}))},
    ]
    columns = [
        {"key": "employee", "header": "Employee"},
        {"key": "structure", "header": "Structure"},
        {"key": "from", "header": "Effective From", "kind": "date"},
        {"key": "base", "header": "Base Pay", "align": "right", "kind": "amount"},
        {"key": "status", "header": "Status", "align": "center", "kind": "status"},
    ]
    return {
        "kpis": kpis,
        "columns": columns,
        "rows": rows,
        "note": "Salary Assignments — each employee's structure and base pay. The base drives every component via the structure's formulas.",
    }


@frappe.whitelist()
@handle_api_error
def get_structure_options():
    require_admin()
    rows = frappe.get_all("Salary Structure", filters={"docstatus": 1, "is_active": "Yes"}, fields=["name"], order_by="name asc")
    return {"options": [{"value": r.name, "label": r.name} for r in rows]}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def assign_structure(employee, salary_structure, from_date, base):
    require_admin()
    if not (employee and salary_structure and from_date):
        frappe.throw("Employee, structure and effective date are required")
    if not frappe.db.exists("Employee", employee):
        frappe.throw("Unknown employee")
    base_amt = flt(base)
    if base_amt <= 0:
        frappe.throw("Base pay must be greater than zero")

    company = frappe.db.get_value("Employee", employee, "company") or COMPANY_NAME
    doc = frappe.get_doc(
        {
            "doctype": "Salary Structure Assignment",
            "employee": employee,
            "salary_structure": salary_structure,
            "from_date": getdate(from_date),
            "company": company,
            "currency": _company_currency(company),
            "base": base_amt,
        }
    )
    doc.insert(ignore_permissions=True)
    doc.submit()
    frappe.db.commit()
    return {"success": True, "name": doc.name}


# ── Payroll Runs ─────────────────────────────────────────────────────────────
def _payroll_payable_account(company):
    return frappe.db.get_value("Company", company, "default_payroll_payable_account") or frappe.db.get_value(
        "Account", {"company": company, "account_type": "Payable", "is_group": 0}, "name"
    )


def _cost_center(company):
    return frappe.db.get_value("Company", company, "cost_center") or frappe.db.get_value(
        "Cost Center", {"company": company, "is_group": 0}, "name"
    )


def _ensure_fiscal_year(ref_date):
    """Salary slips post to a Fiscal Year. Create the Indian FY (Apr–Mar) covering
    the payroll date if none exists."""
    d = getdate(ref_date)
    existing = frappe.db.sql(
        "SELECT name FROM `tabFiscal Year` WHERE year_start_date <= %s AND year_end_date >= %s LIMIT 1",
        (d, d),
    )
    if existing:
        return existing[0][0]
    start_year = d.year if d.month >= 4 else d.year - 1
    name = f"{start_year}-{start_year + 1}"
    if not frappe.db.exists("Fiscal Year", name):
        fy = frappe.get_doc(
            {
                "doctype": "Fiscal Year",
                "year": name,
                "year_start_date": f"{start_year}-04-01",
                "year_end_date": f"{start_year + 1}-03-31",
            }
        )
        fy.insert(ignore_permissions=True)
        frappe.db.commit()
    return name


def _ensure_holiday_list(company, ref_date):
    """Salary Slip needs a holiday list to compute working days. Use the company
    default; else reuse any existing list; else create one for the year (Sundays
    off) and set it as the company default."""
    hl = frappe.db.get_value("Company", company, "default_holiday_list")
    if hl:
        return hl
    hl = frappe.db.get_value("Holiday List", {}, "name", order_by="from_date desc")
    if not hl:
        year = getdate(ref_date).year
        doc = frappe.get_doc(
            {
                "doctype": "Holiday List",
                "holiday_list_name": f"{company} {year}",
                "from_date": f"{year}-01-01",
                "to_date": f"{year}-12-31",
                "weekly_off": "Sunday",
            }
        )
        doc.insert(ignore_permissions=True)
        doc.get_weekly_off_dates()
        # Enrich with the company's public holidays (same list shown on /holidays)
        # so payroll working-day counts reflect real holidays, not just Sundays.
        existing = {h.holiday_date for h in doc.holidays}
        try:
            from hr_client.api import leave as _leave

            pub = _leave.get_holidays()
            for ph in (pub.get("holidays") if isinstance(pub, dict) else []) or []:
                hd = getdate(ph.get("date"))
                if getdate(f"{year}-01-01") <= hd <= getdate(f"{year}-12-31") and hd not in existing:
                    doc.append("holidays", {"holiday_date": hd, "description": ph.get("name", "Holiday")})
                    existing.add(hd)
        except Exception:
            frappe.log_error(frappe.get_traceback(), "payroll._ensure_holiday_list public holidays")
        doc.save(ignore_permissions=True)
        hl = doc.name
    frappe.db.set_value("Company", company, "default_holiday_list", hl)
    frappe.db.commit()
    return hl


@frappe.whitelist()
@handle_api_error
def get_payroll_runs():
    require_admin()
    runs = frappe.get_all(
        "Payroll Entry",
        filters={"docstatus": ["<", 2]},
        fields=["name", "start_date", "end_date", "number_of_employees", "status", "salary_slips_created", "salary_slips_submitted"],
        order_by="start_date desc",
        limit_page_length=100,
    )
    rows = []
    for r in runs:
        rows.append(
            {
                "id": r.name,
                "period": f"{r.start_date} → {r.end_date}",
                "employees": r.number_of_employees or 0,
                "slips": "Submitted" if r.salary_slips_submitted else ("Created" if r.salary_slips_created else "Pending"),
                "status": r.status or "Draft",
            }
        )
    kpis = [
        {"label": "Payroll Runs", "value": str(len(rows))},
        {"label": "Submitted", "value": str(len([r for r in rows if r["status"] == "Submitted"])), "tone": "good"},
        {"label": "In Draft", "value": str(len([r for r in rows if r["status"] == "Draft"])), "tone": "warn"},
        {"label": "Company", "value": COMPANY_NAME},
    ]
    columns = [
        {"key": "period", "header": "Period"},
        {"key": "employees", "header": "Employees", "align": "right", "kind": "number"},
        {"key": "slips", "header": "Slips", "align": "center"},
        {"key": "status", "header": "Status", "align": "center", "kind": "status"},
    ]
    return {
        "kpis": kpis,
        "columns": columns,
        "rows": rows,
        "note": "Payroll Runs — process a pay period end-to-end. Running a period generates a draft Salary Slip for every assigned employee; review them on the Salary Slips screen, then submit.",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def run_payroll(start_date, end_date, company=None):
    """Create a Payroll Entry for the period and generate draft Salary Slips."""
    require_admin()
    if not (start_date and end_date):
        frappe.throw("Start and end date are required")
    company = company or COMPANY_NAME

    payable = _payroll_payable_account(company)
    cc = _cost_center(company)
    if not payable:
        frappe.throw("No payroll payable account is set for the company — set one in Company settings.")
    if not cc:
        frappe.throw("No cost center is set for the company.")
    if not _ensure_holiday_list(company, end_date):
        frappe.throw("Could not set up a Holiday List for payroll.")
    _ensure_fiscal_year(start_date)
    _ensure_fiscal_year(end_date)

    # The ERPNext payroll engine creates Salary Slip documents under the current
    # user; System Manager alone lacks Salary Slip create rights. The caller is
    # already gated by require_admin(), so elevate to Administrator for the run.
    original_user = frappe.session.user
    frappe.set_user("Administrator")
    # Force synchronous slip creation so the result is known before we return.
    frappe.flags.enqueue_payroll_entry = False
    try:
        pe = frappe.get_doc(
            {
                "doctype": "Payroll Entry",
                "company": company,
                "posting_date": getdate(end_date),
                "payroll_frequency": "Monthly",
                "start_date": getdate(start_date),
                "end_date": getdate(end_date),
                "currency": _company_currency(company),
                "exchange_rate": 1,
                "payroll_payable_account": payable,
                "cost_center": cc,
            }
        )
        pe.insert()
        frappe.db.commit()
        pe.fill_employee_details()
        if not pe.get("employees"):
            pe.delete()
            frappe.db.commit()
            frappe.throw("No employees have an active salary structure assignment for this period. Assign structures first.")
        pe.save()
        frappe.db.commit()
        pe.submit()
        frappe.db.commit()
        pe.create_salary_slips()
        frappe.db.commit()
        created = frappe.db.count("Salary Slip", {"payroll_entry": pe.name})
        return {"success": True, "name": pe.name, "employees": len(pe.get("employees")), "slips_created": created}
    finally:
        frappe.set_user(original_user)


# ── Salary Slips ─────────────────────────────────────────────────────────────
@frappe.whitelist()
@handle_api_error
def get_salary_slips():
    require_admin()
    slips = frappe.get_all(
        "Salary Slip",
        filters={"docstatus": ["<", 2]},
        fields=["name", "employee_name", "start_date", "end_date", "gross_pay", "total_deduction", "net_pay", "status", "docstatus"],
        order_by="start_date desc",
        limit_page_length=300,
    )
    rows = []
    total_net = 0
    for s in slips:
        total_net += flt(s.net_pay)
        rows.append(
            {
                "id": s.name,
                "employee": s.employee_name or "—",
                "period": f"{s.start_date} → {s.end_date}",
                "gross": _money(s.gross_pay),
                "deductions": _money(s.total_deduction),
                "net": _money(s.net_pay),
                "status": "Submitted" if s.docstatus == 1 else (s.status or "Draft"),
            }
        )
    submitted = len([r for r in rows if r["status"] == "Submitted"])
    kpis = [
        {"label": "Salary Slips", "value": str(len(rows))},
        {"label": "Submitted", "value": str(submitted), "tone": "good"},
        {"label": "Draft", "value": str(len(rows) - submitted), "tone": "warn" if (len(rows) - submitted) else ""},
        {"label": "Net Payable", "value": _money(total_net)},
    ]
    columns = [
        {"key": "employee", "header": "Employee"},
        {"key": "period", "header": "Period"},
        {"key": "gross", "header": "Gross", "align": "right", "kind": "amount"},
        {"key": "deductions", "header": "Deductions", "align": "right", "kind": "amount"},
        {"key": "net", "header": "Net Pay", "align": "right", "kind": "amount"},
        {"key": "status", "header": "Status", "align": "center", "kind": "status"},
    ]
    return {
        "kpis": kpis,
        "columns": columns,
        "rows": rows,
        "note": "Salary Slips — the computed pay for each employee. Review the gross, deductions and net, then submit to finalise.",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def submit_slip(name):
    require_admin()
    original_user = frappe.session.user
    frappe.set_user("Administrator")
    try:
        slip = frappe.get_doc("Salary Slip", name)
        if slip.docstatus == 0:
            slip.submit()
            frappe.db.commit()
        return {"success": True}
    finally:
        frappe.set_user(original_user)
