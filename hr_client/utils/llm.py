import json
import re
import socket
import requests

OLLAMA_BASE = "http://localhost:11434"
DEFAULT_MODEL = "llama3.1"

VERA_SYSTEM_PROMPT = (
    "You are Vera, a concise financial assistant for Vera Enterprises (Indian SME, interior design). "
    "Use ₹ for money. Indian comma notation. Be brief and business-focused."
)


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


def _parse_json(raw: str) -> dict | None:
    """Extract and parse the first JSON object from a string."""
    raw = raw.strip().replace("```json", "").replace("```", "").strip()
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except Exception:
            pass
    return None


def ask_llm_json(
    prompt: str,
    system: str | None = None,
    model: str | None = None,
    temperature: float = 0.1,
    max_tokens: int = 200,
) -> dict | None:
    """
    Fast JSON generation using /api/generate (single-shot, no chat overhead).
    keep_alive=-1 keeps the model hot in memory between calls.
    max_tokens: tune per-caller — smaller = faster. 80 for tiny, 200 for normal, 400 for reports.
    """
    if not is_ollama_running():
        return None
    model = model or _pick_model()

    # Combine system + user into one string for /api/generate
    full_prompt = f"{system}\n\n{prompt}" if system else prompt

    try:
        resp = requests.post(
            f"{OLLAMA_BASE}/api/generate",
            json={
                "model": model,
                "prompt": full_prompt,
                "stream": False,
                "format": "json",
                "keep_alive": -1,           # keep model loaded forever
                "options": {
                    "temperature": temperature,
                    "num_predict": max_tokens,
                    "num_ctx": 512,          # fits any prompt we send; faster prefill than 1024
                },
            },
            timeout=120,
        )
        if resp.status_code == 200:
            raw = resp.json().get("response", "").strip()
            return _parse_json(raw)
    except Exception:
        pass
    return None


def ask_llm(
    prompt: str,
    system: str | None = None,
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 300,
) -> str:
    """
    Free-text generation (chat replies, reports).
    Uses /api/chat for multi-turn conversation with keep_alive.
    """
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
                "keep_alive": -1,
                "options": {"temperature": temperature, "num_predict": max_tokens, "num_ctx": 1024},
            },
            timeout=120,
        )
        if resp.status_code == 200:
            return resp.json().get("message", {}).get("content", "")
    except Exception:
        pass
    return ""


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

    totals = data.get("totals", {})
    if totals:
        parts.append(
            f"Summary: Receivables ₹{float(totals.get('total_receivables') or 0):,.0f}, "
            f"Payables ₹{float(totals.get('total_payables') or 0):,.0f}."
        )

    return "\n".join(parts)
