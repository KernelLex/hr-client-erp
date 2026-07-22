"""
Patch: seed_org_hub_content
Seeds starter Org Hub content for Vera Enterprises (VE), Schones Leben (SL), Hagan Modular (HM).
Idempotent — checks each record by name/code before inserting.
"""
import frappe


COMPANY_VE = "Vera Enterprises"
COMPANY_SL = "Schones Leben"
COMPANY_HM = "Hagan Modular"

DEPT_MGMT = "Management - V"
DEPT_ACCOUNTS = "Accounts - V"
DEPT_PROJECT = "Project - V"
DEPT_LOGISTICS = "Logistics - V"


# ─── helpers ──────────────────────────────────────────────────────────────────

def _ins(doctype, data):
    """Insert if not already present (idempotent)."""
    try:
        doc = frappe.new_doc(doctype)
        doc.update(data)
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
    except Exception as e:
        if "Duplicate" in str(e) or "already exists" in str(e) or "UniqueValidation" in str(e):
            pass  # already seeded
        else:
            print(f"  WARNING {doctype}: {e}")


def _exists_kra(company, dept, designation, title):
    return frappe.db.exists("VE KRA", {
        "company": company,
        "department": dept,
        "designation": designation,
        "kra_title": title,
    })


def _exists_kpi(company, dept, designation, name_field):
    return frappe.db.exists("VE KPI", {
        "company": company,
        "department": dept,
        "designation": designation,
        "kpi_name": name_field,
    })


# ─── Job Descriptions ─────────────────────────────────────────────────────────

def seed_job_descriptions():
    jds = [
        {
            "company": COMPANY_VE,
            "department": DEPT_MGMT,
            "designation": "Manager",
            "reports_to": "—",
            "effective_date": "2024-01-01",
            "purpose": "Lead and manage operations across all departments to achieve business objectives.",
            "responsibilities": "- Oversee daily operations and team performance\n- Develop and execute business strategies\n- Manage client relationships and key accounts\n- Ensure compliance with statutory obligations\n- Review financial performance and take corrective actions",
            "qualifications": "- Bachelor's degree in Business Administration or related field\n- 5+ years of management experience\n- Strong leadership and communication skills",
            "competencies": "Leadership, Strategic Thinking, Communication, Decision Making, Financial Acumen",
        },
        {
            "company": COMPANY_VE,
            "department": DEPT_ACCOUNTS,
            "designation": "Accounts Manager",
            "reports_to": "Manager",
            "effective_date": "2024-01-01",
            "purpose": "Manage all accounting functions including bookkeeping, GST compliance, and financial reporting.",
            "responsibilities": "- Maintain books of accounts in Tally\n- Prepare and file GST returns (GSTR-1, GSTR-3B)\n- Manage TDS deductions and filings\n- Prepare monthly P&L and balance sheet\n- Coordinate with CA for audits and compliance",
            "qualifications": "- B.Com / M.Com or CA Inter\n- 3+ years in accounting role\n- Proficiency in Tally ERP\n- Knowledge of GST laws",
            "competencies": "Accuracy, GST Compliance, Tally ERP, Financial Reporting, Attention to Detail",
        },
        {
            "company": COMPANY_VE,
            "department": DEPT_LOGISTICS,
            "designation": "Logistics Manager",
            "reports_to": "Manager",
            "effective_date": "2024-01-01",
            "purpose": "Oversee procurement, inventory management, and logistics operations.",
            "responsibilities": "- Manage vendor relationships and purchase orders\n- Monitor stock levels and coordinate replenishment\n- Supervise inward and outward logistics\n- Coordinate with Porter/Rapido for delivery operations\n- Maintain stock records and GRN documentation",
            "qualifications": "- Degree in Supply Chain / Business Administration\n- 2+ years in logistics or supply chain role\n- Experience with inventory management systems",
            "competencies": "Supply Chain Management, Vendor Negotiation, Inventory Control, Coordination",
        },
        {
            "company": COMPANY_VE,
            "department": DEPT_PROJECT,
            "designation": "Project Manager",
            "reports_to": "Manager",
            "effective_date": "2024-01-01",
            "purpose": "Plan, execute, and deliver client projects on time and within budget.",
            "responsibilities": "- Define project scope, timeline, and deliverables\n- Coordinate with clients and internal teams\n- Track project milestones and report progress\n- Manage project risks and resolve issues\n- Ensure quality standards are met",
            "qualifications": "- Degree in Engineering / Business\n- 3+ years project management experience\n- Strong MS Office and project tracking skills",
            "competencies": "Project Planning, Client Management, Risk Management, Communication, Leadership",
        },
    ]
    for jd in jds:
        name = f"{jd['company']}-{jd['designation']}"
        if not frappe.db.exists("VE Job Description", {"company": jd["company"], "designation": jd["designation"]}):
            jd["jd_title"] = name
            _ins("VE Job Description", jd)
            print(f"  JD: {name}")
        else:
            print(f"  JD exists: {name}")


# ─── KRAs ─────────────────────────────────────────────────────────────────────

def seed_kras():
    kras = [
        {
            "company": COMPANY_VE, "department": DEPT_MGMT, "designation": "Manager",
            "kra_title": "Revenue Growth",
            "description": "Achieve targeted revenue growth quarter-on-quarter.",
            "frequency": "Quarterly", "weightage": 30,
            "measurement_criteria": "Quarterly revenue vs. prior quarter",
            "target": "10% QoQ growth",
        },
        {
            "company": COMPANY_VE, "department": DEPT_MGMT, "designation": "Manager",
            "kra_title": "Client Retention",
            "description": "Maintain and grow existing client relationships.",
            "frequency": "Annual", "weightage": 20,
            "measurement_criteria": "Client churn rate",
            "target": "< 5% annual churn",
        },
        {
            "company": COMPANY_VE, "department": DEPT_ACCOUNTS, "designation": "Accounts Manager",
            "kra_title": "GST Filing Accuracy & Timeliness",
            "description": "Ensure all GST returns are filed accurately and before the due date.",
            "frequency": "Monthly", "weightage": 35,
            "measurement_criteria": "Number of late filings / errors in a month",
            "target": "Zero late filings, zero reconciliation errors",
        },
        {
            "company": COMPANY_VE, "department": DEPT_ACCOUNTS, "designation": "Accounts Manager",
            "kra_title": "Monthly Books Closure",
            "description": "Close books of accounts by the 5th of each month.",
            "frequency": "Monthly", "weightage": 30,
            "measurement_criteria": "Date of monthly close completion",
            "target": "Closed by 5th of every month",
        },
        {
            "company": COMPANY_VE, "department": DEPT_LOGISTICS, "designation": "Logistics Manager",
            "kra_title": "On-Time Delivery Rate",
            "description": "Ensure customer orders are delivered within committed timelines.",
            "frequency": "Monthly", "weightage": 35,
            "measurement_criteria": "% deliveries on time vs. total deliveries",
            "target": "> 95% on-time delivery",
        },
        {
            "company": COMPANY_VE, "department": DEPT_LOGISTICS, "designation": "Logistics Manager",
            "kra_title": "Inventory Accuracy",
            "description": "Maintain accurate stock records with zero discrepancies.",
            "frequency": "Monthly", "weightage": 25,
            "measurement_criteria": "Physical stock vs. system stock variance",
            "target": "< 1% variance monthly",
        },
        {
            "company": COMPANY_VE, "department": DEPT_PROJECT, "designation": "Project Manager",
            "kra_title": "Project On-Time Delivery",
            "description": "Deliver projects within agreed timelines.",
            "frequency": "Quarterly", "weightage": 40,
            "measurement_criteria": "% projects delivered on or before deadline",
            "target": "> 90% on-time delivery",
        },
    ]
    for kra in kras:
        if not _exists_kra(kra["company"], kra["department"], kra["designation"], kra["kra_title"]):
            _ins("VE KRA", kra)
            print(f"  KRA: {kra['kra_title']}")
        else:
            print(f"  KRA exists: {kra['kra_title']}")


# ─── KPIs ─────────────────────────────────────────────────────────────────────

def seed_kpis():
    kpis = [
        {
            "company": COMPANY_VE, "department": DEPT_MGMT, "designation": "Manager",
            "kpi_name": "Monthly Revenue (INR)",
            "unit": "INR", "target_value": 1000000,
            "frequency": "Monthly", "data_source": "Tally Sales Register",
        },
        {
            "company": COMPANY_VE, "department": DEPT_ACCOUNTS, "designation": "Accounts Manager",
            "kpi_name": "GST Returns Filed on Time",
            "unit": "Count", "target_value": 2,
            "frequency": "Monthly", "data_source": "GST Portal",
        },
        {
            "company": COMPANY_VE, "department": DEPT_ACCOUNTS, "designation": "Accounts Manager",
            "kpi_name": "Creditor Ageing > 45 days (INR)",
            "unit": "INR", "target_value": 0,
            "frequency": "Monthly", "data_source": "Tally Creditor Ledger",
        },
        {
            "company": COMPANY_VE, "department": DEPT_LOGISTICS, "designation": "Logistics Manager",
            "kpi_name": "Deliveries Completed",
            "unit": "Count", "target_value": 50,
            "frequency": "Monthly", "data_source": "Delivery Log",
        },
        {
            "company": COMPANY_VE, "department": DEPT_LOGISTICS, "designation": "Logistics Manager",
            "kpi_name": "Stock Variance (%)",
            "unit": "%", "target_value": 1,
            "frequency": "Monthly", "data_source": "Stock Audit",
        },
        {
            "company": COMPANY_VE, "department": DEPT_PROJECT, "designation": "Project Manager",
            "kpi_name": "Projects Delivered on Time",
            "unit": "Count", "target_value": 3,
            "frequency": "Quarterly", "data_source": "Project Tracker",
        },
    ]
    for kpi in kpis:
        if not _exists_kpi(kpi["company"], kpi["department"], kpi["designation"], kpi["kpi_name"]):
            _ins("VE KPI", kpi)
            print(f"  KPI: {kpi['kpi_name']}")
        else:
            print(f"  KPI exists: {kpi['kpi_name']}")


# ─── SOPs ─────────────────────────────────────────────────────────────────────

def seed_sops():
    sops = [
        {
            "sop_code": "VE-SOP-ACC-001",
            "sop_title": "Monthly GST Return Filing",
            "company": COMPANY_VE,
            "department": DEPT_ACCOUNTS,
            "version": "1.0",
            "effective_date": "2024-01-01",
            "purpose": "Ensure accurate and timely filing of GSTR-1 and GSTR-3B returns every month.",
            "scope": "Applies to Accounts Manager and Accounts Executive.",
            "responsible_role": "Accounts Manager",
            "procedure": "1. Export sales data from Tally for the month.\n2. Reconcile with purchase invoices and ITC.\n3. Prepare GSTR-1 (outward supplies) — file by 11th of next month.\n4. Prepare GSTR-3B — file by 20th of next month.\n5. Make GST payment if liability exists.\n6. Download filed returns and store in Google Drive > Accounts folder.\n7. Update Tally with GST payment entry.",
        },
        {
            "sop_code": "VE-SOP-LOG-001",
            "sop_title": "Stock Inward (GRN) Process",
            "company": COMPANY_VE,
            "department": DEPT_LOGISTICS,
            "version": "1.0",
            "effective_date": "2024-01-01",
            "purpose": "Standardise the receiving and recording of stock from suppliers.",
            "scope": "Applies to Logistics Manager and Porter Executive.",
            "responsible_role": "Logistics Manager",
            "procedure": "1. Receive goods from supplier with delivery challan / invoice.\n2. Physically verify quantity and condition against PO.\n3. Note discrepancies (if any) in GRN remarks.\n4. Create GRN entry in the system.\n5. Scan and upload invoice to Google Drive > Purchase folder.\n6. Notify Accounts team for payment processing.\n7. Update stock location in the warehouse.",
        },
        {
            "sop_code": "VE-SOP-HR-001",
            "sop_title": "Employee Onboarding Process",
            "company": COMPANY_VE,
            "department": DEPT_MGMT,
            "version": "1.0",
            "effective_date": "2024-01-01",
            "purpose": "Ensure every new employee is onboarded smoothly and has access to necessary tools and information.",
            "scope": "Applies to all departments; executed by Manager and relevant Department Head.",
            "responsible_role": "Manager",
            "procedure": "1. Prepare offer letter and get it signed.\n2. Create ERPNext user account and assign role.\n3. Create Jibble account for attendance.\n4. Add employee to WhatsApp groups.\n5. Provide system orientation (ERP, Google Drive, chat).\n6. Assign probation KRAs and review schedule.\n7. Complete document collection (Aadhaar, PAN, bank details).",
        },
    ]
    for sop in sops:
        if not frappe.db.exists("VE SOP", sop["sop_code"]):
            _ins("VE SOP", sop)
            print(f"  SOP: {sop['sop_code']}")
        else:
            print(f"  SOP exists: {sop['sop_code']}")


# ─── Policies ─────────────────────────────────────────────────────────────────

def seed_policies():
    policies = [
        {
            "company": COMPANY_VE,
            "policy_name": "Leave & Attendance Policy",
            "policy_category": "HR",
            "version": "1.0",
            "effective_date": "2024-01-01",
            "content": """## Leave Policy — Vera Enterprises

### Earned Leave (EL)
- 12 days per year (1 per month)
- Carry forward up to 5 days to next year
- Application required 3 days in advance

### Sick Leave (SL)
- 5 days per year
- Medical certificate required for 2+ consecutive days

### Public Holidays
- 14 gazetted holidays + 1 Happy Holiday per year
- Refer to the 2026 Holiday Calendar

### Attendance
- Clocked via Jibble app
- Late arrival (after 9:30 AM) marked in system
- Three late arrivals = 1 day LOP (Loss of Pay)

### Work Hours
- Official hours: 9:30 AM – 6:30 PM (Mon–Sat)
- Minimum 9 hours per day expected""",
        },
        {
            "company": COMPANY_VE,
            "policy_name": "Expense Reimbursement Policy",
            "policy_category": "Finance",
            "version": "1.0",
            "effective_date": "2024-01-01",
            "content": """## Expense Reimbursement Policy — Vera Enterprises

### Petrol / Travel Claims
- Submit within 7 days of travel
- Attach fuel receipt or petrol bill
- Provide route (from → to) and km driven

### Material Purchases
- Pre-approval required for purchases > ₹5,000
- Attach vendor invoice / bill
- Only approved vendors eligible for reimbursement

### Approval Flow
- Submit claim via ERP system
- Manager approves within 3 working days
- Reimbursement credited with monthly salary

### Limits
- Petrol: Up to ₹10,000/month without pre-approval
- Material: Case-by-case basis with invoice""",
        },
        {
            "company": COMPANY_VE,
            "policy_name": "IT & Device Usage Policy",
            "policy_category": "IT",
            "version": "1.0",
            "effective_date": "2024-01-01",
            "content": """## IT & Device Usage Policy — Vera Enterprises

### Company Devices
- Laptops and mobile devices are company property
- Surrender on last working day
- Report damage within 24 hours

### Google Drive
- All business documents must be stored in the designated Google Drive folder
- Personal files must not be stored on company shared drives
- Naming convention: follow the VE File Naming Guide

### Data Security
- Do not share login credentials
- Use strong passwords (8+ chars, upper/lower/number/special)
- Lock device when away from desk

### SIM Cards
- Company SIM is for business calls only
- Report loss immediately to Manager""",
        },
    ]
    for pol in policies:
        if not frappe.db.exists("VE Policy", {
            "company": pol["company"],
            "policy_name": pol["policy_name"],
        }):
            _ins("VE Policy", pol)
            print(f"  Policy: {pol['policy_name']}")
        else:
            print(f"  Policy exists: {pol['policy_name']}")


# ─── Employee Handbook ─────────────────────────────────────────────────────────

def seed_handbook():
    sections = [
        {
            "company": COMPANY_VE,
            "section_order": 1,
            "section_title": "Welcome to Vera Enterprises",
            "content": """# Welcome to Vera Enterprises

We are a dynamic trading and project management company based in Bangalore.

Our business spans procurement, sales, logistics, and project delivery across multiple domains.

**Our Values:**
- Integrity — We do what we say
- Accountability — Own your outcomes
- Excellence — Strive for quality in every task
- Teamwork — We win together

This handbook is your guide to working at Vera Enterprises. Please read it carefully and reach out to the Manager with any questions.""",
        },
        {
            "company": COMPANY_VE,
            "section_order": 2,
            "section_title": "Code of Conduct",
            "content": """## Code of Conduct

All employees are expected to maintain the highest standards of professional conduct.

**Expected Behaviour:**
- Treat all colleagues, clients, and vendors with respect
- Maintain confidentiality of business information
- Avoid conflicts of interest
- Report unethical behaviour to the Manager

**Prohibited Actions:**
- Sharing client or company data with outsiders
- Using company resources for personal gain
- Creating a hostile work environment
- Accepting undisclosed gifts or kickbacks from vendors

Violation of the code of conduct may result in disciplinary action up to and including termination.""",
        },
        {
            "company": COMPANY_VE,
            "section_order": 3,
            "section_title": "Working Hours & Attendance",
            "content": """## Working Hours & Attendance

**Official Hours:** 9:30 AM – 6:30 PM (Monday to Saturday)

**Attendance:**
- Clock in/out via Jibble app on your mobile
- Attendance is monitored daily by the Manager
- Late arrival (after 9:30 AM) will be recorded

**Consequences of Late Arrival:**
- 3 late arrivals in a month = 1 day LOP (Loss of Pay)
- Habitual late arrival may result in performance action

**Work from Home:**
- WFH is available on a case-by-case basis with prior approval
- Attendance must still be clocked via Jibble""",
        },
        {
            "company": COMPANY_VE,
            "section_order": 4,
            "section_title": "Compensation & Benefits",
            "content": """## Compensation & Benefits

**Salary:**
- Paid on the last working day of the month
- Salary slip shared via email / ERP

**Leave:**
- 12 Earned Leave + 5 Sick Leave + 14 Public Holidays per year
- Refer to the Leave Policy for full details

**Expense Reimbursement:**
- Travel, fuel, and approved material purchases reimbursed
- Submit claims via the ERP system within 7 days

**Performance Review:**
- Annual performance appraisal in December
- KRA-linked increments and bonuses""",
        },
    ]
    for sec in sections:
        if not frappe.db.exists("VE Employee Handbook", {
            "company": sec["company"],
            "section_title": sec["section_title"],
        }):
            _ins("VE Employee Handbook", sec)
            print(f"  Handbook: {sec['section_title']}")
        else:
            print(f"  Handbook exists: {sec['section_title']}")


# ─── Operations Manual ─────────────────────────────────────────────────────────

def seed_operations_manual():
    manuals = [
        {
            "company": COMPANY_VE,
            "department": DEPT_ACCOUNTS,
            "section_title": "Accounts Department Operations",
            "content": """## Accounts Department — Operations Manual

### Daily Tasks
- Check and process vendor payments due
- Record bank transactions in Tally
- Verify Jibble attendance report

### Weekly Tasks
- Reconcile bank statement with Tally entries
- Review pending debtor collections
- Upload week's invoices to Google Drive

### Monthly Tasks
- Close books by 5th of month
- File GSTR-1 by 11th
- File GSTR-3B by 20th
- Prepare P&L and Balance Sheet
- TDS deduction and challan payment by 7th

### Tools Used
- Tally ERP (primary accounting)
- GST Portal (returns filing)
- Google Drive (document storage)
- VE ERP System (expense claims, leave management)""",
        },
        {
            "company": COMPANY_VE,
            "department": DEPT_LOGISTICS,
            "section_title": "Logistics Department Operations",
            "content": """## Logistics Department — Operations Manual

### Daily Tasks
- Process incoming purchase orders
- Coordinate deliveries with Porter/Rapido
- Update stock ledger for inward/outward movements

### Weekly Tasks
- Reconcile stock counts for fast-moving items
- Review pending POs with Accounts
- Coordinate with suppliers for pending deliveries

### Monthly Tasks
- Physical stock verification (first week)
- Submit stock report to Manager
- Review and clear pending GRNs

### Delivery Process
1. Receive delivery request from Manager/Client
2. Coordinate with Porter or Rapido
3. Prepare delivery challan
4. Dispatch and track delivery
5. Confirm receipt from customer
6. Update delivery log

### Tools Used
- VE ERP System (purchase orders, GRN)
- Google Drive (invoices, delivery challans)
- Porter / Rapido apps (last-mile delivery)""",
        },
    ]
    for manual in manuals:
        if not frappe.db.exists("VE Operations Manual", {
            "company": manual["company"],
            "department": manual["department"],
        }):
            _ins("VE Operations Manual", manual)
            print(f"  Operations Manual: {manual['department']}")
        else:
            print(f"  Operations Manual exists: {manual['department']}")


# ─── Department Processes ──────────────────────────────────────────────────────

def seed_department_processes():
    processes = [
        {
            "company": COMPANY_VE,
            "department": DEPT_ACCOUNTS,
            "process_name": "New Vendor Onboarding",
            "trigger_event": "New purchase relationship initiated",
            "responsible_roles": "Accounts Manager, Manager",
            "tools_used": "Tally ERP, Google Drive",
            "steps": "1. Collect vendor details (name, GST, PAN, bank account)\n2. Verify GSTIN on GST portal\n3. Create vendor master in Tally\n4. Store KYC documents in Drive > Purchase > Vendors\n5. Obtain Manager approval for credit terms\n6. Create first PO",
        },
        {
            "company": COMPANY_VE,
            "department": DEPT_LOGISTICS,
            "process_name": "Purchase Order Cycle",
            "trigger_event": "Stock level below reorder point or client requirement",
            "responsible_roles": "Logistics Manager, Accounts Manager",
            "tools_used": "VE ERP, Tally, Google Drive",
            "steps": "1. Identify requirement (stock reorder or client order)\n2. Get Manager approval for PO\n3. Create PO and share with vendor\n4. Follow up on delivery timeline\n5. Receive goods and create GRN\n6. Upload invoice to Drive\n7. Forward to Accounts for payment processing",
        },
        {
            "company": COMPANY_VE,
            "department": DEPT_PROJECT,
            "process_name": "Client Project Kickoff",
            "trigger_event": "New project order received from client",
            "responsible_roles": "Project Manager, Manager",
            "tools_used": "MS Project, Google Drive, VE ERP",
            "steps": "1. Review client requirements and scope\n2. Create project plan with milestones\n3. Assign resources and responsibilities\n4. Share project plan with client for approval\n5. Create project folder in Google Drive\n6. Hold kickoff meeting with team\n7. Set up progress review cadence (weekly/bi-weekly)",
        },
    ]
    for proc in processes:
        if not frappe.db.exists("VE Department Process", {
            "company": proc["company"],
            "department": proc["department"],
            "process_name": proc["process_name"],
        }):
            _ins("VE Department Process", proc)
            print(f"  Process: {proc['process_name']}")
        else:
            print(f"  Process exists: {proc['process_name']}")


# ─── Forms & Checklists ────────────────────────────────────────────────────────

def seed_forms_checklists():
    forms = [
        {
            "company": COMPANY_VE,
            "department": DEPT_MGMT,
            "form_title": "Employee Onboarding Checklist",
            "form_type": "Checklist",
            "instructions": "Complete all items before or on the employee's first day.",
            "items": "- [ ] Offer letter signed and filed\n- [ ] ERPNext user account created\n- [ ] Jibble account set up\n- [ ] WhatsApp group added\n- [ ] System orientation completed\n- [ ] Aadhaar / PAN collected\n- [ ] Bank account details collected\n- [ ] KRA document shared and explained",
        },
        {
            "company": COMPANY_VE,
            "department": DEPT_MGMT,
            "form_title": "Employee Exit Checklist",
            "form_type": "Checklist",
            "instructions": "Complete all items on or before the employee's last working day.",
            "items": "- [ ] Resignation letter received\n- [ ] Company devices returned (laptop, mobile, SIM)\n- [ ] Access card returned\n- [ ] ERPNext account disabled\n- [ ] Jibble account removed\n- [ ] Final settlement calculated and approved\n- [ ] Experience letter issued\n- [ ] Exit interview completed",
        },
        {
            "company": COMPANY_VE,
            "department": DEPT_LOGISTICS,
            "form_title": "Goods Receipt Note (GRN) Template",
            "form_type": "Form",
            "instructions": "Fill this form for every stock inward. Attach the supplier invoice.",
            "items": "- Supplier Name:\n- Invoice Number:\n- Invoice Date:\n- PO Reference:\n- Items Received (with quantity):\n- Condition of Goods:\n- Discrepancies (if any):\n- Received By:\n- Date of Receipt:",
        },
    ]
    for form in forms:
        if not frappe.db.exists("VE Forms Checklist", {
            "company": form["company"],
            "form_title": form["form_title"],
        }):
            _ins("VE Forms Checklist", form)
            print(f"  Form/Checklist: {form['form_title']}")
        else:
            print(f"  Form/Checklist exists: {form['form_title']}")


# ─── Main ──────────────────────────────────────────────────────────────────────

def execute():
    print("=== Seeding Org Hub Content ===")

    print("\n[1] Job Descriptions")
    seed_job_descriptions()

    print("\n[2] KRAs")
    seed_kras()

    print("\n[3] KPIs")
    seed_kpis()

    print("\n[4] SOPs")
    seed_sops()

    print("\n[5] Policies")
    seed_policies()

    print("\n[6] Employee Handbook")
    seed_handbook()

    print("\n[7] Operations Manuals")
    seed_operations_manual()

    print("\n[8] Department Processes")
    seed_department_processes()

    print("\n[9] Forms & Checklists")
    seed_forms_checklists()

    frappe.db.commit()
    print("\n=== Org Hub Content Seeded Successfully ===")
