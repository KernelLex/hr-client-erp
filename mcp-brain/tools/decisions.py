import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "brain.db"


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def get_decisions() -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT id, title, body, created_at FROM decisions ORDER BY id"
        ).fetchall()
    return [dict(r) for r in rows]


def log_decision(title: str, body: str) -> dict:
    with _conn() as c:
        cur = c.execute(
            "INSERT INTO decisions(title, body) VALUES (?,?)", (title, body)
        )
    return {"ok": True, "id": cur.lastrowid, "title": title}
