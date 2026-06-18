import json
import socket
import requests

OLLAMA_BASE = "http://localhost:11434"
DEFAULT_MODEL = "llama3.1"

VERA_SYSTEM_PROMPT = """You are Vera, an AI financial assistant for Vera Enterprises — an Indian SME.
You have access to real business data: sales invoices, purchase invoices, purchase orders, quotations, GRNs,
financial reports, salary records, attendance records, and payment records.

When answering:
- Be concise and business-focused
- Use INR (₹) for monetary values
- Reference specific document numbers when available
- Flag anomalies, overdue payments, or risks proactively
- Format numbers with Indian comma notation (e.g. ₹1,00,000)
- Today's date context should inform due date analysis

Always respond in plain text unless the user explicitly asks for JSON or a report."""


def is_ollama_running() -> bool:
    try:
        s = socket.create_connection(("localhost", 11434), timeout=1)
        s.close()
        return True
    except Exception:
        return False


def get_available_models() -> list[str]:
    if not is_ollama_running():
        return []
    try:
        resp = requests.get(f"{OLLAMA_BASE}/api/tags", timeout=5)
        if resp.status_code == 200:
            return [m["name"] for m in resp.json().get("models", [])]
    except Exception:
        pass
    return []


def _pick_model() -> str:
    models = get_available_models()
    if not models:
        return DEFAULT_MODEL
    for preferred in ["llama3.1", "llama3.1:8b", "llama3", "llama3:8b", "mistral"]:
        if preferred in models:
            return preferred
    return models[0]


def ask_llm(
    prompt: str,
    system: str = None,
    model: str = None,
    temperature: float = 0.3,
    max_tokens: int = 1024,
) -> str:
    if not is_ollama_running():
        return ""
    model = model or _pick_model()
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    try:
        resp = requests.post(
            f"{OLLAMA_BASE}/api/chat",
            json={
                "model": model,
                "messages": messages,
                "stream": False,
                "options": {"temperature": temperature, "num_predict": max_tokens},
            },
            timeout=60,
        )
        if resp.status_code == 200:
            return resp.json().get("message", {}).get("content", "")
    except Exception:
        pass
    return ""


_JSON_SYSTEM = "You are a JSON API. Output ONLY a single valid JSON object. No markdown, no code fences, no explanation."

def ask_llm_json(
    prompt: str,
    system: str = None,
    model: str = None,
    temperature: float = 0.1,
) -> dict | None:
    if not is_ollama_running():
        return None
    model = model or _pick_model()
    messages = [
        {"role": "system", "content": _JSON_SYSTEM},
        {"role": "user", "content": prompt},
    ]
    try:
        resp = requests.post(
            f"{OLLAMA_BASE}/api/chat",
            json={
                "model": model,
                "messages": messages,
                "stream": False,
                "format": "json",
                "options": {
                    "temperature": temperature,
                    "num_predict": 512,   # JSON output is ~100-200 tokens; 512 is a safe cap
                    "num_ctx": 2048,      # keep context large enough for the document text
                },
            },
            timeout=60,
        )
        if resp.status_code == 200:
            raw = resp.json().get("message", {}).get("content", "").strip()
            raw = raw.replace("```json", "").replace("```", "").strip()
            import re
            match = re.search(r'\{.*\}', raw, re.DOTALL)
            if match:
                return json.loads(match.group())
    except Exception:
        pass
    return None


def build_context(data: dict) -> str:
    parts = []

    sales = data.get("sales_invoices", [])
    if sales:
        pending = [i for i in sales if i.get("payment_status") == "Pending"]
        overdue = [i for i in sales if i.get("payment_status") == "Overdue"]
        total = sum(float(i.get("total_amount") or 0) for i in sales)
        parts.append(
            f"Sales Invoices: {len(sales)} total, ₹{total:,.0f} revenue. "
            f"{len(pending)} pending, {len(overdue)} overdue."
        )

    purchases = data.get("purchase_invoices", [])
    if purchases:
        pending_p = [i for i in purchases if i.get("payment_status") == "Pending"]
        total_p = sum(float(i.get("total_amount") or 0) for i in purchases)
        parts.append(
            f"Purchase Invoices: {len(purchases)} total, ₹{total_p:,.0f} spend. "
            f"{len(pending_p)} pending payment."
        )

    pos = data.get("purchase_orders", [])
    if pos:
        open_pos = [p for p in pos if p.get("status") == "Open"]
        parts.append(f"Purchase Orders: {len(pos)} total, {len(open_pos)} open.")

    quotes = data.get("quotations", [])
    if quotes:
        sent = [q for q in quotes if q.get("status") == "Sent"]
        parts.append(f"Quotations: {len(quotes)} total, {len(sent)} awaiting response.")

    fin = data.get("financial_reports", [])
    if fin:
        latest = fin[0]
        parts.append(
            f"Latest Financial Report ({latest.get('report_type', '')}, {latest.get('period', '')}): "
            f"Revenue ₹{float(latest.get('total_revenue') or 0):,.0f}, "
            f"Net Profit ₹{float(latest.get('net_profit') or 0):,.0f}."
        )

    totals = data.get("totals", {})
    if totals:
        parts.append(
            f"Summary: Receivables ₹{float(totals.get('total_receivables') or 0):,.0f}, "
            f"Payables ₹{float(totals.get('total_payables') or 0):,.0f}, "
            f"Gross Margin ₹{float(totals.get('gross_margin') or 0):,.0f}."
        )

    return "\n".join(parts)
