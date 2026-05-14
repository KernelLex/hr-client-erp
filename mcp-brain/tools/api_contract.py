import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "brain.db"
BASE = "/api/method/hr_client.api"


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def get_api_contract(module: str = "", status: str = "") -> dict:
    """
    module: filter by module name (e.g. 'Recruitment', 'EmployeeLifecycle', 'FormsIntegration')
    status: filter by status ('live', 'planned', 'deprecated')
    """
    query = "SELECT * FROM api_endpoints WHERE 1=1"
    params: list = []
    if module:
        query += " AND module = ?"
        params.append(module)
    if status:
        query += " AND status = ?"
        params.append(status)
    query += " ORDER BY module, id"

    with _conn() as c:
        rows = c.execute(query, params).fetchall()

    grouped: dict = {}
    for r in rows:
        m = r["module"]
        grouped.setdefault(m, []).append({
            "method":   r["method"],
            "endpoint": f"{BASE}.{_module_path(m)}.{r['endpoint']}",
            "params":   r["params"],
            "notes":    r["notes"],
            "status":   r["status"],
        })
    return {"base": BASE, "endpoints": grouped}


def _module_path(module: str) -> str:
    return {
        "Recruitment":       "recruitment",
        "EmployeeLifecycle": "employee_lifecycle",
        "FormsIntegration":  "forms",
    }.get(module, module.lower())
