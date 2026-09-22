"""Parse the owner's T&C master spec into a self-contained seed module."""
import re, json

SPEC = "/home/vera/new materials for erp/refernces/ERP Quotation Terms & Conditions Master – Vera Enterprises.txt"
OUT = "/home/vera/vera-erp/hr-client-erp/hr_client/api/quotation_terms.py"

CAT = {"GEN":"General","SCP":"Scope of Supply","PRC":"Pricing","TAX":"Taxes",
 "VAL":"Validity","PAY":"Payment","CRD":"Credit","MSR":"Measurement",
 "DWG":"Drawings & Approvals","MAT":"Materials","FIN":"Finishes","HDW":"Hardware",
 "APP":"Appliances","STN":"Countertop / Stone","SNK":"Sink & Faucet","MFG":"Manufacturing",
 "DLV":"Delivery","TRN":"Transportation","STO":"Storage","SIT":"Site","INS":"Installation",
 "LBR":"Labour","CHG":"Variations","DLY":"Delays","DMG":"Damage","WAR":"Warranty",
 "CAN":"Cancellation","LGL":"Legal","HLD":"Commercial Hold","OWN":"Ownership","FMJ":"Force Majeure","ACC":"Acceptance"}

lines = open(SPEC, encoding="utf-8").read().splitlines()
HEAD = re.compile(r"^##\s+(TC-([A-Z]+)-\d+)\s*[—\-]\s*(.+?)\s*$")

clauses, i = [], 0
while i < len(lines):
    m = HEAD.match(lines[i])
    if not m:
        i += 1; continue
    code, prefix, title = m.group(1), m.group(2), m.group(3)
    i += 1
    body = []
    while i < len(lines) and not lines[i].startswith("#"):
        body.append(lines[i]); i += 1
    mandatory = 1 if (prefix in {"GEN","SCP","PRC","TAX","VAL","PAY"} or re.search(r"Mandatory:\**\s*Yes", "\n".join(body), re.I)) else 0
    # clean markdown -> plain customer text
    txt = []
    for ln in body:
        s = ln.strip()
        if not s or s == "---": continue
        if re.match(r"^\*\*(Mandatory|Applicable|Customer Visible|Editable)", s): continue
        s = s.replace("**", "")
        s = re.sub(r"^\*\s+", "• ", s)      # bullet
        txt.append(s)
    customer_text = "\n".join(txt).strip()
    if customer_text:
        clauses.append({"code": code, "title": title, "prefix": prefix,
                        "category": CAT.get(prefix, prefix), "mandatory": mandatory,
                        "customer_text": customer_text})

# Templates by category membership
TRADING = {"GEN","SCP","PRC","TAX","VAL","PAY","CRD","DLV","TRN","STO","DMG","DLY",
           "HDW","APP","SNK","STN","WAR","CAN","LGL"}
templates = [
    {"code":"TMPL-TRD","name":"Trading Standard","category":"Trading",
     "clauses":[c["code"] for c in clauses if c["prefix"] in TRADING]},
    {"code":"TMPL-PRJ","name":"Project / Modular Standard","category":"Project",
     "clauses":[c["code"] for c in clauses]},
]

with open(OUT, "w") as fh:
    fh.write('"""Seed the coded Terms & Conditions master (owner spec: "ERP Quotation\n')
    fh.write('Terms & Conditions Master"). Auto-generated from that spec by\n')
    fh.write('_gen (tools/gen_terms). Idempotent — run after bench migrate:\n')
    fh.write('    bench --site vera.local execute hr_client.api.quotation_terms.seed_all\n"""\n\n')
    fh.write("import frappe\n\n")
    fh.write("CLAUSES = " + json.dumps(clauses, ensure_ascii=False, indent=1) + "\n\n")
    fh.write("TEMPLATES = " + json.dumps(templates, ensure_ascii=False, indent=1) + "\n\n\n")
    fh.write('''def seed_all():
    made = {"clauses": 0, "templates": 0}
    for c in CLAUSES:
        if frappe.db.exists("Vera Terms Clause", c["code"]):
            continue
        doc = frappe.new_doc("Vera Terms Clause")
        doc.update({"code": c["code"], "title": c["title"][:140], "category": c["category"],
                    "applies_to_scope": "All", "mandatory": c["mandatory"],
                    "status": "Active", "customer_text": c["customer_text"]})
        doc.insert(ignore_permissions=True)
        made["clauses"] += 1
    by_code = {c["code"]: c for c in CLAUSES}
    for t in TEMPLATES:
        if frappe.db.exists("Vera Terms Template", t["code"]):
            continue
        doc = frappe.new_doc("Vera Terms Template")
        doc.update({"code": t["code"], "template_name": t["name"], "category": t["category"],
                    "version": "1", "status": "Active"})
        for code in t["clauses"]:
            c = by_code.get(code)
            if not c:
                continue
            doc.append("clauses", {"clause": code, "title": c["title"][:140],
                                   "mandatory": c["mandatory"], "customer_text": c["customer_text"]})
        doc.insert(ignore_permissions=True)
        made["templates"] += 1
    frappe.db.commit()
    return made
''')

print("parsed clauses:", len(clauses))
from collections import Counter
print("by category:", dict(Counter(c["prefix"] for c in clauses)))
print("mandatory:", sum(c["mandatory"] for c in clauses))
print("templates:", [(t["code"], len(t["clauses"])) for t in templates])
