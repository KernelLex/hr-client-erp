import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "brain.db"


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def get_rules(category: str = "") -> dict:
    """
    category: optional filter — 'ERPNext', 'Python', 'Frontend', 'Git'
    """
    query = "SELECT category, rule FROM rules"
    params: list = []
    if category:
        query += " WHERE category = ?"
        params.append(category)
    query += " ORDER BY category, id"

    with _conn() as c:
        rows = c.execute(query, params).fetchall()

    grouped: dict = {}
    for r in rows:
        grouped.setdefault(r["category"], []).append(r["rule"])
    return {"rules": grouped}
