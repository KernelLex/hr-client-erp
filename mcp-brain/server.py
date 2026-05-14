"""
ClientERP MCP Brain Server
Run: python server.py
"""
import json
import sys
from pathlib import Path

# Make tools importable when run from any working directory
sys.path.insert(0, str(Path(__file__).parent))

from mcp.server.fastmcp import FastMCP

from tools.tasks import get_project_status, get_task, update_task
from tools.api_contract import get_api_contract
from tools.decisions import get_decisions, log_decision
from tools.rules import get_rules
from tools.session import (
    get_last_session,
    update_session,
    add_blocker,
    get_blockers,
    resolve_blocker,
)

mcp = FastMCP("ClientERP Brain")


# ── Task tools ─────────────────────────────────────────────────────────────

@mcp.tool()
def get_project_status_tool() -> str:
    """
    Returns the current sprint name, a count summary (planned/in_progress/done/blocked),
    and every task grouped by module. Call this first in any new session.
    """
    return json.dumps(get_project_status(), indent=2)


@mcp.tool()
def get_task_tool(task_id: str) -> str:
    """
    Returns full detail for a single task.
    task_id: e.g. 'B-EL1', 'F-R3', 'B-F2'
    """
    return json.dumps(get_task(task_id), indent=2)


@mcp.tool()
def update_task_tool(task_id: str, status: str, notes: str = "") -> str:
    """
    Update a task's status (and optional notes).
    task_id: e.g. 'B-EL1'
    status: one of 'planned' | 'in_progress' | 'done' | 'blocked'
    notes: optional context about the update
    """
    return json.dumps(update_task(task_id, status, notes), indent=2)


# ── API Contract tools ─────────────────────────────────────────────────────

@mcp.tool()
def get_api_contract_tool(module: str = "", status: str = "") -> str:
    """
    Returns the API contract, optionally filtered.
    module: '' (all) | 'Recruitment' | 'EmployeeLifecycle' | 'FormsIntegration'
    status: '' (all) | 'live' | 'planned' | 'deprecated'

    Each entry includes full endpoint path, HTTP method, params, notes, and status.
    Base path: /api/method/hr_client.api.<module>.<endpoint>
    Auth: session cookie required (except submit_form which is allow_guest=True).
    """
    return json.dumps(get_api_contract(module, status), indent=2)


# ── Rules tools ────────────────────────────────────────────────────────────

@mcp.tool()
def get_rules_tool(category: str = "") -> str:
    """
    Returns all hard rules for the project.
    category: '' (all) | 'ERPNext' | 'Python' | 'Frontend' | 'Git'

    These are non-negotiable constraints. Violating them causes bugs, data loss,
    or infinite loops. Read before writing any code.
    """
    return json.dumps(get_rules(category), indent=2)


# ── Decision tools ─────────────────────────────────────────────────────────

@mcp.tool()
def get_decisions_tool() -> str:
    """
    Returns all logged architectural decisions with rationale.
    Use this before proposing a new approach to check if it was already decided.
    """
    return json.dumps(get_decisions(), indent=2)


@mcp.tool()
def log_decision_tool(title: str, body: str) -> str:
    """
    Saves an architectural decision to the brain.
    title: short name for the decision (e.g. 'Use Groq for AI JD generation')
    body:  full rationale including why alternatives were rejected
    """
    return json.dumps(log_decision(title, body), indent=2)


# ── Session tools ──────────────────────────────────────────────────────────

@mcp.tool()
def get_last_session_tool() -> str:
    """
    Returns the summary of the most recent work session.
    Call this at the start of any session to pick up where the last one left off.
    """
    return json.dumps(get_last_session(), indent=2)


@mcp.tool()
def update_session_tool(summary: str) -> str:
    """
    Writes an end-of-session summary to the brain.
    Call this at the END of every session. Include:
    - What was completed (task IDs)
    - Where you left off
    - What's next
    - Any gotchas discovered
    """
    return json.dumps(update_session(summary), indent=2)


# ── Blocker tools ──────────────────────────────────────────────────────────

@mcp.tool()
def add_blocker_tool(description: str, task_id: str = "") -> str:
    """
    Logs a blocker to the brain.
    description: what is blocked and why
    task_id: optional — the task ID this blocker affects (e.g. 'B-EL4')
    """
    return json.dumps(add_blocker(description, task_id), indent=2)


@mcp.tool()
def get_blockers_tool(status: str = "open") -> str:
    """
    Returns all blockers.
    status: 'open' (default) | 'resolved'
    """
    return json.dumps(get_blockers(status), indent=2)


@mcp.tool()
def resolve_blocker_tool(blocker_id: int) -> str:
    """
    Marks a blocker as resolved.
    blocker_id: the numeric ID returned by add_blocker or get_blockers
    """
    return json.dumps(resolve_blocker(blocker_id), indent=2)


if __name__ == "__main__":
    mcp.run(transport="stdio")
