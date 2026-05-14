import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "brain.db"


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def get_last_session() -> dict:
    with _conn() as c:
        row = c.execute(
            "SELECT id, summary, created_at FROM sessions ORDER BY id DESC LIMIT 1"
        ).fetchone()
    if not row:
        return {"summary": "No session recorded yet."}
    return dict(row)


def update_session(summary: str) -> dict:
    with _conn() as c:
        cur = c.execute("INSERT INTO sessions(summary) VALUES (?)", (summary,))
    return {"ok": True, "id": cur.lastrowid}


def add_blocker(description: str, task_id: str = "") -> dict:
    with _conn() as c:
        cur = c.execute(
            "INSERT INTO blockers(task_id, description) VALUES (?,?)",
            (task_id or None, description),
        )
    return {"ok": True, "blocker_id": cur.lastrowid}


def get_blockers(status: str = "open") -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM blockers WHERE status = ? ORDER BY id",
            (status,),
        ).fetchall()
    return [dict(r) for r in rows]


def resolve_blocker(blocker_id: int) -> dict:
    with _conn() as c:
        c.execute(
            "UPDATE blockers SET status='resolved' WHERE id=?", (blocker_id,)
        )
    return {"ok": True, "blocker_id": blocker_id, "status": "resolved"}
