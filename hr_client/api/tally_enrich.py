"""
Tally Enrichment Pipeline — uses local Ollama (llama3.1) to enrich VE Tally Voucher data.

Adds per-voucher: normalized party name, transaction category, GST type, anomaly detection.
Links via tally_guid (stable across re-imports) — enrichment survives Tally XML re-uploads.
"""
import json
import time
import html as _html

import frappe
from frappe.utils import flt, now_datetime

_STATUS_KEY = "tally_enrich_status"
_OLLAMA_URL = "http://localhost:11434/api/generate"
_MODEL      = "llama3.1:latest"

VALID_CATEGORIES = frozenset({
    "B2B Sales", "B2C Sales", "B2B Purchase", "Project",
    "Stock Movement", "Collection", "Payment", "Journal/Contra", "Other",
})
VALID_GST_TYPES = frozenset({"Intrastate", "Interstate", "Exempt", "None"})

# Voucher types where we use the party-ledger amount (not max-ledger)
PARTY_AMOUNT_TYPES = frozenset({
    "Sales", "PERFORMA INVOICE", "Sales Order",
    "Purchase", "Purchase Order",
    "Credit Note", "Debit Note",
    "Receipt", "Payment", "Delivery Note",
})

# ── Prompt templates ──────────────────────────────────────────────────────────

_SYSTEM = (
    "You are an expert at analyzing Indian business accounting entries from Tally ERP. "
    "Return ONLY valid JSON. No markdown, no explanations, no extra text."
)

_USER_TMPL = """\
Analyze {n} Tally accounting vouchers from Vera Enterprises (Indian interior design/hardware company).
Return a JSON array of exactly {n} objects in the SAME ORDER as the input.

Each object must have these fields:
- "party_norm": string — cleaned party name (fix HTML entities: &apos;→', &amp;→&; normalize mixed casing)
- "tx_category": one of ["B2B Sales","B2C Sales","B2B Purchase","Project","Stock Movement","Collection","Payment","Journal/Contra","Other"]
  Use narration prefixes: LM_B2B→"B2B Sales", LM_B2C→"B2C Sales", LM_PJ→"Project", Stock_→"Stock Movement"
  Voucher type clues: Receipt→"Collection", Payment→"Payment", Journal/Contra→"Journal/Contra",
  Stock Journal/Delivery Note→"Stock Movement", Sales/PERFORMA INVOICE→"B2B Sales" or "B2C Sales" by narration
- "gst_type": one of ["Intrastate","Interstate","Exempt","None"]
  Intrastate: CGST or SGST appears in debit/credit ledger names
  Interstate: IGST appears in debit/credit ledger names
  None: no GST ledger names; Exempt: clearly exempt transaction
- "anomaly": true or false — flag if suspicious:
  amount is 0 for a non-stock voucher; debit and credit ledger are the same; party is empty for a Sales/Purchase voucher
- "anomaly_reason": short string if anomaly=true, else null
- "confidence": integer 65-99 (your confidence in this enrichment)

Vouchers:
{vouchers}"""


# ── Status helpers ────────────────────────────────────────────────────────────

def _set_status(status: str, progress: int, processed: int, total: int, msg: str):
    frappe.cache().set_value(_STATUS_KEY, json.dumps({
        "status": status, "progress": progress,
        "processed": processed, "total": total,
        "message": msg, "ts": time.time(),
    }), expires_in_sec=14400)


def _get_status() -> dict:
    raw = frappe.cache().get_value(_STATUS_KEY)
    if not raw:
        return {"status": "idle", "progress": 0, "processed": 0, "total": 0, "message": ""}
    return json.loads(raw)


# ── Ollama helpers ────────────────────────────────────────────────────────────

def _call_ollama(prompt: str) -> str:
    import requests
    try:
        resp = requests.post(_OLLAMA_URL, json={
            "model":  _MODEL,
            "prompt": prompt,
            "system": _SYSTEM,
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.05, "num_ctx": 4096, "num_predict": 1200},
        }, timeout=120)
        resp.raise_for_status()
        return resp.json().get("response", "[]")
    except Exception as e:
        frappe.log_error(str(e)[:500], "Ollama Call Failed")
        return "[]"


def _parse_batch(raw: str, expected: int) -> list:
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return data
        for v in data.values():
            if isinstance(v, list):
                return v
    except Exception:
        pass
    return [{}] * expected


def _clean(s: str) -> str:
    return _html.unescape(str(s or "").replace("&amp;", "&").replace("&apos;", "'").replace("&lt;", "<").replace("&gt;", ">"))


def _cat(v) -> str:
    v = str(v or "Other").strip()
    return v if v in VALID_CATEGORIES else "Other"


def _gst(v) -> str:
    v = str(v or "None").strip()
    return v if v in VALID_GST_TYPES else "None"


def _fmt(amount):
    v = flt(amount)
    if v >= 10_000_000: return f"₹ {v/10_000_000:.2f} Cr"
    if v >= 100_000:    return f"₹ {v/100_000:.2f} L"
    if v >= 1_000:      return f"₹ {v/1_000:.1f}K"
    return f"₹ {v:.0f}"


def _require_admin():
    if frappe.session.user == "Guest":
        frappe.throw("Not permitted", frappe.PermissionError)


# ── Public API endpoints ──────────────────────────────────────────────────────

@frappe.whitelist()
def get_enrichment_status():
    return _get_status()


@frappe.whitelist()
def get_enrichment_stats():
    _require_admin()
    total    = frappe.db.count("VE Tally Voucher", {"is_cancelled": 0})
    enriched = frappe.db.sql("SELECT COUNT(*) FROM `tabVE Tally Enrichment` WHERE status IN ('Enriched','Verified','Needs Review')", as_list=True)[0][0]
    anomalies    = frappe.db.sql("SELECT COUNT(*) FROM `tabVE Tally Enrichment` WHERE anomaly=1", as_list=True)[0][0]
    needs_review = frappe.db.sql("SELECT COUNT(*) FROM `tabVE Tally Enrichment` WHERE status='Needs Review' AND human_reviewed=0", as_list=True)[0][0]
    verified     = frappe.db.sql("SELECT COUNT(*) FROM `tabVE Tally Enrichment` WHERE human_reviewed=1", as_list=True)[0][0]
    cats = frappe.db.sql("""
        SELECT tx_category, COUNT(*) as n FROM `tabVE Tally Enrichment`
        WHERE tx_category != '' GROUP BY tx_category ORDER BY n DESC
    """, as_dict=True)
    return {
        "total":        total,
        "enriched":     int(enriched),
        "pending":      total - int(enriched),
        "anomalies":    int(anomalies),
        "needs_review": int(needs_review),
        "verified":     int(verified),
        "categories":   {r.tx_category: int(r.n) for r in cats},
    }


@frappe.whitelist()
def start_enrichment():
    _require_admin()

    current = _get_status()
    if current.get("status") == "running":
        return {"queued": False, "message": "Enrichment already running"}

    pending_count = frappe.db.sql("""
        SELECT COUNT(*) FROM `tabVE Tally Voucher` v
        LEFT JOIN `tabVE Tally Enrichment` e ON e.name = v.tally_guid
        WHERE v.is_cancelled = 0 AND e.name IS NULL
    """, as_list=True)[0][0]

    if not pending_count:
        return {"queued": False, "message": "All vouchers already enriched"}

    _set_status("running", 0, 0, int(pending_count), f"Queued: enriching {pending_count:,} vouchers…")
    frappe.enqueue("hr_client.api.tally_enrich.run_enrichment", queue="long", timeout=18000)
    return {"queued": True, "pending": int(pending_count)}


@frappe.whitelist()
def stop_enrichment():
    _require_admin()
    _set_status("idle", 0, 0, 0, "Stopped by user")
    return {"stopped": True}


@frappe.whitelist()
def get_anomaly_queue(page=1, page_size=25):
    _require_admin()
    pg = max(1, int(flt(page)))
    ps = max(10, min(100, int(flt(page_size))))
    off = (pg - 1) * ps

    total = frappe.db.sql(
        "SELECT COUNT(*) FROM `tabVE Tally Enrichment` WHERE anomaly=1 AND human_reviewed=0",
        as_list=True)[0][0]

    rows = frappe.db.sql("""
        SELECT v.name as voucher_name, v.tally_guid,
               v.voucher_type, v.voucher_number, v.voucher_date,
               v.party_name, v.amount, v.narration, v.debit_ledger, v.credit_ledger,
               e.party_norm, e.anomaly_reason, e.tx_category, e.gst_type, e.confidence
        FROM `tabVE Tally Enrichment` e
        JOIN `tabVE Tally Voucher` v ON v.tally_guid = e.name
        WHERE e.anomaly = 1 AND e.human_reviewed = 0
        ORDER BY e.confidence ASC, v.voucher_date DESC
        LIMIT %s OFFSET %s
    """, (ps, off), as_dict=True)

    result = [{
        "voucher_name":   r.voucher_name,
        "tally_guid":     r.tally_guid,
        "voucher_type":   r.voucher_type,
        "voucher_number": r.voucher_number or "",
        "voucher_date":   str(r.voucher_date or ""),
        "party_name":     _clean(r.party_name),
        "party_norm":     r.party_norm or "",
        "amount":         round(float(r.amount or 0), 2),
        "amount_fmt":     _fmt(r.amount),
        "narration":      _clean(r.narration),
        "debit_ledger":   _clean(r.debit_ledger),
        "credit_ledger":  _clean(r.credit_ledger),
        "anomaly_reason": r.anomaly_reason or "",
        "tx_category":    r.tx_category or "",
        "gst_type":       r.gst_type or "",
        "confidence":     int(r.confidence or 0),
    } for r in rows]

    return {"rows": result, "total": int(total), "page": pg, "page_size": ps,
            "pages": max(1, -(-int(total) // ps))}


@frappe.whitelist()
def get_normalization_queue(page=1, page_size=25):
    _require_admin()
    pg = max(1, int(flt(page)))
    ps = max(10, min(100, int(flt(page_size))))
    off = (pg - 1) * ps

    total = frappe.db.sql("""
        SELECT COUNT(DISTINCT LOWER(TRIM(v.party_name)))
        FROM `tabVE Tally Enrichment` e
        JOIN `tabVE Tally Voucher` v ON v.tally_guid = e.name
        WHERE e.party_norm != '' AND e.human_reviewed = 0
          AND LOWER(TRIM(e.party_norm)) != LOWER(TRIM(COALESCE(v.party_name, '')))
          AND v.party_name != ''
    """, as_list=True)[0][0]

    rows = frappe.db.sql("""
        SELECT v.party_name as original, e.party_norm as normalized,
               COUNT(*) as cnt, MIN(v.name) as sample_voucher
        FROM `tabVE Tally Enrichment` e
        JOIN `tabVE Tally Voucher` v ON v.tally_guid = e.name
        WHERE e.party_norm != '' AND e.human_reviewed = 0
          AND LOWER(TRIM(e.party_norm)) != LOWER(TRIM(COALESCE(v.party_name, '')))
          AND v.party_name != ''
        GROUP BY v.party_name, e.party_norm
        ORDER BY cnt DESC
        LIMIT %s OFFSET %s
    """, (ps, off), as_dict=True)

    result = [{
        "original":       _clean(r.original),
        "normalized":     r.normalized or "",
        "count":          int(r.cnt),
        "sample_voucher": r.sample_voucher or "",
    } for r in rows]

    return {"rows": result, "total": int(total), "page": pg, "page_size": ps,
            "pages": max(1, -(-int(total) // ps))}


@frappe.whitelist()
def mark_anomaly_reviewed(tally_guid, confirmed=False, note=None):
    _require_admin()
    if frappe.db.exists("VE Tally Enrichment", tally_guid):
        frappe.db.set_value("VE Tally Enrichment", tally_guid, {
            "human_reviewed": 1,
            "status": "Needs Review" if frappe.utils.cint(confirmed) else "Verified",
            "human_note": str(note or "")[:200],
        })
    return {"success": True}


@frappe.whitelist()
def bulk_dismiss_anomalies(tally_guids_json):
    _require_admin()
    guids = json.loads(tally_guids_json or "[]")
    for g in guids[:500]:
        if frappe.db.exists("VE Tally Enrichment", g):
            frappe.db.set_value("VE Tally Enrichment", g, {
                "human_reviewed": 1, "status": "Verified",
                "human_note": "Bulk dismissed",
            })
    frappe.db.commit()
    return {"dismissed": len(guids)}


# ── Background job ────────────────────────────────────────────────────────────

def run_enrichment():
    """Called via frappe.enqueue — processes unenriched vouchers in batches of 8."""
    rows = frappe.db.sql("""
        SELECT v.name, v.tally_guid, v.voucher_type, v.voucher_number, v.voucher_date,
               v.party_name, v.amount, v.narration, v.debit_ledger, v.credit_ledger
        FROM `tabVE Tally Voucher` v
        LEFT JOIN `tabVE Tally Enrichment` e ON e.name = v.tally_guid
        WHERE v.is_cancelled = 0 AND e.name IS NULL
        ORDER BY v.voucher_date
    """, as_dict=True)

    total = len(rows)
    if not total:
        _set_status("done", 100, 0, 0, "All vouchers already enriched")
        return

    _set_status("running", 0, 0, total, f"Starting enrichment of {total:,} vouchers…")

    BATCH    = 8
    NOW      = now_datetime()
    processed = 0
    errors    = 0

    for i in range(0, total, BATCH):
        # Honour stop signal
        if _get_status().get("status") == "idle":
            break

        batch = rows[i:i + BATCH]

        v_list = [{
            "type":     v.voucher_type,
            "number":   v.voucher_number or "",
            "date":     str(v.voucher_date or ""),
            "party":    _clean(v.party_name),
            "amount":   round(float(v.amount or 0), 2),
            "narration":_clean(v.narration),
            "debit":    _clean(v.debit_ledger),
            "credit":   _clean(v.credit_ledger),
        } for v in batch]

        prompt = _USER_TMPL.format(n=len(batch), vouchers=json.dumps(v_list, ensure_ascii=False))

        try:
            raw   = _call_ollama(prompt)
            enrs  = _parse_batch(raw, len(batch))

            for j, v in enumerate(batch):
                e = enrs[j] if j < len(enrs) else {}
                is_anom = bool(e.get("anomaly", False))
                try:
                    frappe.db.sql("""
                        INSERT INTO `tabVE Tally Enrichment`
                        (name, tally_guid, party_norm, tx_category, gst_type,
                         anomaly, anomaly_reason, confidence, status, human_reviewed,
                         enriched_at, creation, modified, owner, modified_by, docstatus, idx)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,0,%s,%s,%s,
                                'Administrator','Administrator',1,0)
                    """, (
                        v.tally_guid,
                        v.tally_guid,
                        str(e.get("party_norm") or v.party_name or "")[:140],
                        _cat(e.get("tx_category")),
                        _gst(e.get("gst_type")),
                        1 if is_anom else 0,
                        str(e.get("anomaly_reason") or "")[:200],
                        max(0, min(100, int(e.get("confidence") or 70))),
                        "Needs Review" if is_anom else "Enriched",
                        NOW, NOW, NOW, NOW,
                    ))
                except Exception as ie:
                    frappe.log_error(str(ie)[:300], "Enrichment Insert Error")
                processed += 1

        except Exception as be:
            frappe.log_error(str(be)[:500], "Enrichment Batch Error")
            errors   += 1
            processed += len(batch)

        if processed % 400 == 0:
            frappe.db.commit()

        pct = min(99, int(processed / total * 100))
        _set_status("running", pct, processed, total,
                    f"Enriched {processed:,} / {total:,} · {errors} errors")

    frappe.db.commit()
    _set_status("done", 100, processed, total,
                f"Complete: {processed:,} vouchers enriched, {errors} errors")
