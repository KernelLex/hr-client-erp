# hr_client/api/todo.py
# ---------------------------------------------------------------------------
# To-Do System — Personal Tasks (Frappe core ToDo) and Team Tasks (ERPNext Task).
# A real operational system: the admin/staff create tasks, assign them, move them
# across a kanban, and close them out. Returns the uniform archetype envelope for
# the list/kanban view plus create/update endpoints for the workflow.
# ---------------------------------------------------------------------------
import frappe
from frappe.utils import strip_html, getdate, nowdate

from hr_client.api.utils import require_login, require_admin, handle_api_error

PERSONAL_LANES = ["Open", "Closed", "Cancelled"]
TEAM_LANES = ["Open", "Working", "Pending Review", "Completed", "Cancelled"]


def _emp_name_map():
    """user_id -> employee_name, for showing owners as people not emails."""
    rows = frappe.get_all(
        "Employee",
        filters={"status": "Active"},
        fields=["user_id", "employee_name"],
    )
    return {r.user_id: r.employee_name for r in rows if r.user_id}


# ── Personal Tasks (ToDo) ────────────────────────────────────────────────────
@frappe.whitelist()
@handle_api_error
def get_personal_tasks():
    """Current user's personal to-do items as a kanban board."""
    require_login()
    user = frappe.session.user

    todos = frappe.get_all(
        "ToDo",
        filters={"allocated_to": user},
        fields=["name", "description", "priority", "date", "status", "reference_type"],
        order_by="modified desc",
        limit_page_length=200,
    )

    rows = []
    for t in todos:
        rows.append(
            {
                "id": t.name,
                "task": strip_html(t.description or "").strip()[:140] or "(no description)",
                "priority": t.priority or "Medium",
                "due": str(t.date) if t.date else "—",
                "status": t.status or "Open",
            }
        )

    open_n = len([r for r in rows if r["status"] == "Open"])
    overdue = len([r for r in rows if r["status"] == "Open" and r["due"] != "—" and getdate(r["due"]) < getdate(nowdate())])
    done = len([r for r in rows if r["status"] == "Closed"])
    kpis = [
        {"label": "Total Tasks", "value": str(len(rows))},
        {"label": "Open", "value": str(open_n), "tone": "warn" if open_n else ""},
        {"label": "Overdue", "value": str(overdue), "tone": "bad" if overdue else "good"},
        {"label": "Completed", "value": str(done), "tone": "good"},
    ]
    columns = [
        {"key": "task", "header": "Task"},
        {"key": "priority", "header": "Priority", "align": "center", "kind": "priority"},
        {"key": "due", "header": "Due", "kind": "date"},
        {"key": "status", "header": "Status", "align": "center", "kind": "status"},
    ]
    return {
        "kpis": kpis,
        "columns": columns,
        "rows": rows,
        "note": "Personal Tasks — your private to-do list. Create, prioritise and close tasks; overdue items are flagged automatically.",
        "kanban": True,
        "kanban_status_key": "status",
        "kanban_lanes": PERSONAL_LANES,
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_task(task, priority="Medium", due=None):
    """Create a personal ToDo for the current user."""
    require_login()
    if not task or not str(task).strip():
        frappe.throw("Task description is required")

    doc = frappe.get_doc(
        {
            "doctype": "ToDo",
            "description": str(task).strip(),
            "priority": priority if priority in ("Low", "Medium", "High") else "Medium",
            "date": getdate(due) if due else None,
            "allocated_to": frappe.session.user,
            "status": "Open",
        }
    )
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def set_personal_status(name, status):
    """Move a personal task to a new status (Open / Closed / Cancelled)."""
    require_login()
    if status not in PERSONAL_LANES:
        frappe.throw("Invalid status")
    todo = frappe.get_doc("ToDo", name)
    if todo.allocated_to != frappe.session.user and frappe.session.user not in ("Administrator",):
        frappe.throw("Not permitted", frappe.PermissionError)
    todo.status = status
    todo.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


# ── Team Tasks (Task) ────────────────────────────────────────────────────────
@frappe.whitelist()
@handle_api_error
def get_team_tasks():
    """All team tasks (ERPNext Task) as a kanban board — admin operated."""
    require_admin()

    tasks = frappe.get_all(
        "Task",
        fields=["name", "subject", "status", "priority", "exp_end_date", "progress", "_assign"],
        order_by="modified desc",
        limit_page_length=300,
    )
    emap = _emp_name_map()

    rows = []
    for t in tasks:
        assignee = "—"
        if t._assign:
            try:
                users = frappe.parse_json(t._assign) or []
                if users:
                    assignee = emap.get(users[0], users[0])
            except Exception:
                pass
        rows.append(
            {
                "id": t.name,
                "task": t.subject or t.name,
                "owner": assignee,
                "priority": t.priority or "Medium",
                "due": str(t.exp_end_date) if t.exp_end_date else "—",
                "status": t.status or "Open",
            }
        )

    done = len([r for r in rows if r["status"] == "Completed"])
    open_n = len([r for r in rows if r["status"] in ("Open", "Working")])
    kpis = [
        {"label": "Total Tasks", "value": str(len(rows))},
        {"label": "Active", "value": str(open_n), "tone": "warn" if open_n else ""},
        {"label": "Completed", "value": str(done), "tone": "good"},
        {"label": "Completion", "value": (str(round(done / len(rows) * 100)) + "%") if rows else "0%"},
    ]
    columns = [
        {"key": "task", "header": "Task"},
        {"key": "owner", "header": "Owner"},
        {"key": "priority", "header": "Priority", "align": "center", "kind": "priority"},
        {"key": "due", "header": "Due", "kind": "date"},
        {"key": "status", "header": "Status", "align": "center", "kind": "status"},
    ]
    return {
        "kpis": kpis,
        "columns": columns,
        "rows": rows,
        "note": "Team Tasks — assign work across the team, track it across the board and drive it to completion.",
        "kanban": True,
        "kanban_status_key": "status",
        "kanban_lanes": TEAM_LANES,
    }


@frappe.whitelist()
@handle_api_error
def get_assignable_users():
    """Active employees with a login, for the Team Task assignee dropdown."""
    require_admin()
    rows = frappe.get_all(
        "Employee",
        filters={"status": "Active", "user_id": ["is", "set"]},
        fields=["user_id", "employee_name"],
        order_by="employee_name asc",
    )
    return {"options": [{"value": r.user_id, "label": r.employee_name} for r in rows if r.user_id]}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_team_task(subject, priority="Medium", due=None, assign_to=None, description=None):
    """Create an ERPNext Task and optionally assign it to a user."""
    require_admin()
    if not subject or not str(subject).strip():
        frappe.throw("Subject is required")

    doc = frappe.get_doc(
        {
            "doctype": "Task",
            "subject": str(subject).strip(),
            "priority": priority if priority in ("Low", "Medium", "High", "Urgent") else "Medium",
            "exp_end_date": getdate(due) if due else None,
            "description": description or None,
            "status": "Open",
        }
    )
    doc.insert(ignore_permissions=True)

    if assign_to:
        from frappe.desk.form.assign_to import add as assign_add

        try:
            assign_add(
                {
                    "assign_to": [assign_to],
                    "doctype": "Task",
                    "name": doc.name,
                    "description": doc.subject,
                }
            )
        except Exception:
            frappe.log_error(frappe.get_traceback(), "create_team_task.assign")

    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def set_team_status(name, status):
    """Move a team task to a new status."""
    require_admin()
    if status not in TEAM_LANES:
        frappe.throw("Invalid status")
    task = frappe.get_doc("Task", name)
    task.status = status
    task.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}
