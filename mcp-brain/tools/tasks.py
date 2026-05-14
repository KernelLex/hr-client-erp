import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "brain.db"


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def get_project_status() -> dict:
    with _conn() as c:
        rows = c.execute(
            "SELECT id, module, owner, title, status, notes FROM tasks ORDER BY module, id"
        ).fetchall()

    by_module: dict = {}
    counts = {"planned": 0, "in_progress": 0, "done": 0, "blocked": 0}
    for r in rows:
        m = r["module"]
        by_module.setdefault(m, []).append(dict(r))
        counts[r["status"]] += 1

    return {
        "sprint": "Sprint 1 — Employee Lifecycle Backend + Frontend",
        "summary": counts,
        "tasks_by_module": by_module,
    }


def get_task(task_id: str) -> dict:
    with _conn() as c:
        row = c.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()
    if not row:
        return {"error": f"Task {task_id!r} not found"}
    return dict(row)


def update_task(task_id: str, status: str, notes: str = "") -> dict:
    valid = {"planned", "in_progress", "done", "blocked"}
    if status not in valid:
        return {"error": f"status must be one of {sorted(valid)}"}
    with _conn() as c:
        c.execute(
            "UPDATE tasks SET status=?, notes=?, updated_at=datetime('now') WHERE id=?",
            (status, notes or None, task_id),
        )
        if c.rowcount == 0:
            return {"error": f"Task {task_id!r} not found"}
    return {"ok": True, "task_id": task_id, "status": status}
