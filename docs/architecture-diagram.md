# Vera ERP — Architecture Diagrams

> Visual companion to [`ARCHITECTURE.md`](../ARCHITECTURE.md). Every diagram below is
> [Mermaid](https://mermaid.js.org/) and renders natively on GitHub. One site, one
> database, **three companies** — Vera Enterprises (VE), Schönes Leben (SL),
> Hagan Modular (HM) — served by a single React SPA over a company-scoped API.

Company accents used throughout: **VE** forest/gold · **SL** plum `#6B3F58` · **HM** steel `#2F4858`.

---

## 1. System topology — request to storage

How a browser request reaches data, and every long-lived process behind it.

```mermaid
flowchart LR
    subgraph client["🌐 Client"]
        B["Browser<br/><i>React SPA · TypeScript + Vite</i>"]
    end

    subgraph edge["☁️ Edge"]
        CF["Cloudflare<br/><i>TLS Full · Tunnel</i>"]
        CD["cloudflared<br/><i>outbound QUIC</i>"]
    end

    subgraph host["🖥️ Home PC — Ubuntu · 192.168.1.16"]
        NGINX["nginx :80"]
        subgraph bench["Frappe bench — supervisor (7 procs)"]
            GUN["gunicorn :8000<br/><i>frappe-web</i>"]
            SIO["node-socketio"]
            SCH["scheduler"]
            SW["short-worker"]
            LW["long-worker"]
        end
        subgraph data["Data & services"]
            DB[("MariaDB 11.8<br/><i>DocType tables</i>")]
            RC[("Redis cache")]
            RQ[("Redis queue")]
            OLL["Ollama<br/><i>qwen2.5 3B/7B</i>"]
            FS["/files · tally_uploads/"]
        end
    end

    B -->|"HTTPS"| CF --> CD --> NGINX
    NGINX -->|"/ → static build"| B
    NGINX -->|"/api/method/*"| GUN
    NGINX -->|"/files/ · /private/"| FS
    NGINX -.->|"/app · /desk → 403"| B
    GUN --> DB
    GUN --> RC
    GUN --> RQ
    GUN --> OLL
    RQ --> SW
    RQ --> LW
    LW -->|"Tally import job"| DB
    SCH --> DB
    SIO -. "realtime" .-> B

    classDef edgeC fill:#f3e8ff,stroke:#7c3aed,color:#4c1d95;
    classDef webC fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e;
    classDef dataC fill:#ecfdf5,stroke:#047857,color:#064e3b;
    class CF,CD edgeC;
    class NGINX,GUN,SIO,SCH,SW,LW webC;
    class DB,RC,RQ,OLL,FS dataC;
```

**No shared type contract.** The SPA calls a dotted Python path and reads
`res.data.message`; the frontend re-declares the shapes each endpoint returns.

---

## 2. The multi-company scoping kernel

Everything siloed flows through one kernel in `hr_client/api/utils.py`. A single
`company` dimension on every siloed DocType; global masters are never scoped.

```mermaid
flowchart TB
    REQ["whitelisted endpoint<br/><code>@company_scoped</code>"]

    subgraph kernel["Scoping kernel — api/utils.py"]
        CC["current_company()<br/><i>form_dict → session → default → first allowed</i>"]
        RC["require_company(c)<br/><i>PermissionError unless allowed</i>"]
        SC["scoped(filters)<br/><i>adds company= to ORM filters</i>"]
        SQL["company_sql(c)<br/><i>AND company = %(company)s</i>"]
        AC["allowed_companies(user)"]
    end

    subgraph tiers["Role tiers (membership, not just roles)"]
        GO["Group Owner<br/><b>owais@</b> — all 3 + __ALL__ + grant"]
        PA["Platform Admin<br/><b>amogh@</b> — all 3, no grant"]
        CA["Company Admin<br/><i>per granted company</i>"]
        EMP["Employee<br/><i>module-gated, per company</i>"]
    end

    REQ --> CC --> RC --> Q{{"scoped read / write"}}
    REQ --> SC --> Q
    REQ --> SQL --> Q
    AC --> RC
    GO & PA & CA & EMP -->|"ve_company_access rows"| AC
    Q --> DB[("MariaDB — rows carry company")]
    GO -. "__ALL__ only for owner" .-> Q

    classDef k fill:#fef9c3,stroke:#a16207,color:#713f12;
    classDef t fill:#eef2ff,stroke:#4338ca,color:#312e81;
    class CC,RC,SC,SQL,AC k;
    class GO,PA,CA,EMP t;
```

> **CI guard** (`hr_client/tests/verify_company_scoping.py`) walks every
> `@frappe.whitelist` function and fails the build if one touches siloed data
> without a scoping primitive, an explicit global allowlist entry, or a tracked
> pending-debt entry. **369 scoped · 17 global · 7 tracked · 0 offenders.**

---

## 3. Auth flow — company picker → login → 2FA → scoped app

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant SPA as React SPA
    participant API as Frappe API
    participant S as Session

    U->>SPA: open /login
    SPA->>API: company.get_login_companies() (guest)
    API-->>SPA: enabled companies (name, label, accent)
    U->>SPA: pick company → branded login
    SPA->>API: /api/method/login (usr, pwd, company)
    API->>API: on_session_creation → company.on_login
    Note over API: company ∉ allowed → logout()<br/>+ GENERIC error (no enumeration)
    API-->>S: session.active_company = company
    U->>SPA: TOTP (before_request: twofa.enforce)
    SPA->>API: company.resolve (after 2FA)
    API-->>SPA: boots scoped to active company
```

Wrong-password and no-access-to-company return **byte-identical** messages so
staff↔company membership can't be enumerated.

---

## 4. Quotation Studio — six-stage chain & the Phase 7 inter-company PO

The commercial pipeline, and how confirming a Sales Order raises internal POs to
sibling companies (Phase 7 §3).

```mermaid
flowchart TB
    subgraph chain["Quotation Studio (per company)"]
        M["1 · Measurement"] --> BOQ["2 · BOQ<br/><i>lines carry supplying_company</i>"]
        BOQ --> CS["3 · Cost Sheet"]
        CS --> QU["4 · Quotation<br/><i>§4.6 approval engine</i>"]
        QU --> AP{"Approved?"}
        AP -->|"gated §4.11"| SO["6 · Sales Order<br/><i>confirm</i>"]
    end

    SO --> CONF{{"line.supplying_company<br/>≠ own company?"}}
    CONF -->|"no"| DONE["single-company order"]
    CONF -->|"yes · group per company"| IPO["Vera Internal PO<br/><i>one per supplying company</i>"]

    subgraph phase7["Phase 7 — inter-company"]
        IPO --> TAG["is_intercompany = 1<br/>counterparty_company set"]
        IPO --> LAD{"§4.6 value ladder<br/>in SUPPLYING company"}
        LAD -->|"≤ ₹50k"| AUTO["auto-Approved"]
        LAD -->|"> threshold"| PEND["Pending Approval →<br/>supplying-co admin approves"]
    end

    TAG --> ELIM["Phase 8 group console<br/><i>elimination on __ALL__</i>"]

    classDef s fill:#ecfeff,stroke:#0e7490,color:#164e63;
    classDef p fill:#fdf2f8,stroke:#be185d,color:#831843;
    class M,BOQ,CS,QU,SO s;
    class IPO,TAG,LAD,AUTO,PEND,ELIM p;
```

---

## 5. Tally import pipeline (Phase 6A) — upload to scoped books

Two files per company (Masters + full Transactions, up to ~1.6 GB), imported
into one company's books without ever crossing into another's.

```mermaid
flowchart LR
    subgraph browser["Browser — /tally-upload"]
        GZ["gzip (CompressionStream)<br/><i>~10–20:1</i>"] --> CH["48 MB chunks"]
    end

    subgraph server["Server"]
        RE["reassemble +<br/>stream-decompress .gz → .xml"]
        VER{{"SVCURRENTCOMPANY<br/>== active company?"}}
        JOB["long-worker import job<br/><i>streamed voucher parse</i>"]
        LEAK{{"other companies'<br/>counts unchanged?"}}
    end

    CH -->|"proxy_request_buffering off"| RE --> VER
    VER -->|"mismatch"| Q["🚫 quarantine + block"]
    VER -->|"match"| JOB --> LEAK
    LEAK -->|"moved"| RB["rollback + fail"]
    LEAK -->|"clean"| WRITE[("scoped write:<br/>Tally Voucher/Ledger/Item<br/>company-prefixed keys")]

    classDef b fill:#eff6ff,stroke:#1d4ed8,color:#1e3a8a;
    classDef g fill:#fef2f2,stroke:#b91c1c,color:#7f1d1d;
    class GZ,CH b;
    class Q,RB g;
```

---

## 6. Repository & module map

```mermaid
flowchart TB
    subgraph repo["KernelLex/hr-client-erp (monorepo)"]
        subgraph be["hr_client — Frappe app (Python)"]
            API["api/*.py<br/><i>whitelisted endpoints</i>"]
            DT["doctype/*<br/><i>custom DocTypes</i>"]
            UT["api/utils.py<br/><i>scoping kernel</i>"]
            TST["tests/verify_company_scoping.py<br/><i>CI guard</i>"]
        end
        subgraph fe["hr-frontend — React SPA (TS)"]
            CTX["CompanyContext ·<br/>AuthContext · PermissionsContext"]
            PG["pages/* (per module)"]
        end
        subgraph vd["vera_drive — Frappe app"]
            DR["Google Drive sync"]
        end
    end
    PG -->|"/api/method/*"| API
    API --> UT
    API --> DT
    CTX -->|"company param on every call"| API
    TST -. "guards" .-> API

    classDef beC fill:#ecfdf5,stroke:#047857,color:#064e3b;
    classDef feC fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e;
    class API,DT,UT,TST beC;
    class CTX,PG feC;
```

---

_See [`ARCHITECTURE.md`](../ARCHITECTURE.md) for the prose deep-dive and
[`HANDOFF_MULTICOMPANY.md`](../HANDOFF_MULTICOMPANY.md) for build status._
