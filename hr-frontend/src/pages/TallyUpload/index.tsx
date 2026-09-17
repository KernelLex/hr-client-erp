import { useState, useRef, useEffect, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Upload, CheckCircle2, XCircle, Loader2, AlertCircle,
  RefreshCw, ShieldCheck, ShieldAlert, FileCheck2, Building2,
} from "lucide-react"
import { PageHeader, HeaderPill } from "@/components/dashboard"
import { useCompany, ALL_COMPANIES } from "@/context/CompanyContext"

// ── CSRF + API helpers (same contract as Operations page) ───────────────────────
function getCsrf(): string {
  const m = document.cookie.match(/csrf_token=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : "fetch"
}
async function apiFetch(method: string) {
  const res = await fetch(`/api/method/${method}`, { credentials: "include" })
  if (!res.ok) throw new Error(`Failed: ${method}`)
  return (await res.json()).message
}
async function apiPost(method: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/method/${method}`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": getCsrf() },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok || json.exc) throw new Error(json.exc || "Request failed")
  return json.message
}

// ── Types ───────────────────────────────────────────────────────────────────────
interface ServerFile {
  path: string; filename: string; size: number; size_fmt: string; modified: string
  role: "masters" | "transactions" | "unknown"
}
interface ServerListing { files: ServerFile[]; suggested_masters: string | null; suggested_transactions: string | null }

interface DetectResult {
  detected: string
  active_company: string | null
  expected: string
  matches: boolean
  confirmed: boolean
}

function fmtSize(b: number) {
  return b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(0)} MB` : `${(b / 1e3).toFixed(0)} KB`
}

// ── Chunked upload (48MB chunks — clears the Cloudflare tunnel per-request cap) ──
const CHUNK_SIZE = 48 * 1024 * 1024
function uploadChunk(uploadId: string, index: number, total: number, blob: Blob, onProgress: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const fd = new FormData()
    fd.append("upload_id", uploadId)
    fd.append("chunk_index", String(index))
    fd.append("total_chunks", String(total))
    fd.append("chunk", blob, "chunk")
    const xhr = new XMLHttpRequest()
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded) }
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300 && !json.exc) resolve()
        else if (xhr.status === 413) reject(new Error("Chunk rejected (413) — upload size limit smaller than expected."))
        else reject(new Error(json.exc || `Upload failed (${xhr.status})`))
      } catch { reject(new Error("Invalid server response during upload")) }
    }
    xhr.onerror = () => reject(new Error("Network error during upload — check your connection and retry"))
    xhr.open("POST", "/api/method/hr_client.api.operations.upload_tally_chunk")
    xhr.setRequestHeader("X-Frappe-CSRF-Token", getCsrf())
    xhr.send(fd)
  })
}
// Gzip the file in the browser with the native CompressionStream before chunking.
// Tally XML is highly repetitive and compresses ~10-20:1, turning the ~1.5GB
// Transactions export into ~100MB — far fewer, smaller chunks over the tunnel and
// a much faster upload. Falls back to the raw file when CompressionStream is
// unavailable (older browsers); the server handles both via the `gzipped` flag.
async function maybeGzip(file: File): Promise<{ blob: Blob; gzipped: boolean }> {
  const CS = (window as unknown as { CompressionStream?: unknown }).CompressionStream
  if (typeof CS !== "function") return { blob: file, gzipped: false }
  try {
    const stream = file.stream().pipeThrough(new (CS as new (f: string) => GenericTransformStream)("gzip"))
    const blob = await new Response(stream as ReadableStream).blob()
    return { blob, gzipped: true }
  } catch {
    return { blob: file, gzipped: false }
  }
}

async function uploadFile(
  file: File,
  onProgress: (n: number) => void,
  onStage?: (stage: string) => void,
): Promise<{ path: string }> {
  onStage?.("Compressing")
  const { blob: payload, gzipped } = await maybeGzip(file)
  onStage?.("Uploading")
  const total = Math.max(1, Math.ceil(payload.size / CHUNK_SIZE))
  const uploadId = (crypto.randomUUID?.() ?? `up-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  for (let i = 0; i < total; i++) {
    const blob = payload.slice(i * CHUNK_SIZE, Math.min(payload.size, (i + 1) * CHUNK_SIZE))
    await uploadChunk(uploadId, i, total, blob, (loaded) => {
      const overall = ((i + (loaded / blob.size)) / total) * 100
      onProgress(Math.min(99, Math.round(overall)))
    })
  }
  onProgress(99)
  const res = await apiPost("hr_client.api.operations.finalize_tally_upload", {
    upload_id: uploadId, total_chunks: total, filename: file.name, gzipped: gzipped ? 1 : 0,
  }) as { path: string }
  onProgress(100)
  return res
}

// ═══════════════════════════════════════════════════════════════════════════════
// Per-company Tally upload page. Wires the chunked-upload + detect/confirm +
// run_tally_import endpoints into one company-scoped flow, tinted to the active
// company's accent. Step 1 pick files → Step 2 verify the file's own
// <SVCURRENTCOMPANY> matches the active company (owner confirms first time) →
// Step 3 import + live progress.
// ═══════════════════════════════════════════════════════════════════════════════
export default function TallyUploadPage() {
  const queryClient = useQueryClient()
  const { activeCompany, availableCompanies, accentOf, isGroupOwner, setCompany } = useCompany()
  const accent = accentOf(activeCompany)
  const isAll = activeCompany === ALL_COMPANIES

  const companyLabel =
    availableCompanies.find((c) => c.name === activeCompany)?.label ?? activeCompany ?? "—"

  // File selection — either uploaded-from-computer or picked-from-server
  const [mode, setMode] = useState<"server" | "upload">("server")
  const [mastersFile, setMastersFile] = useState<File | null>(null)
  const [transFile, setTransFile] = useState<File | null>(null)
  const [selMasters, setSelMasters] = useState("")
  const [selTrans, setSelTrans] = useState("")
  const mastersRef = useRef<HTMLInputElement>(null)
  const transRef = useRef<HTMLInputElement>(null)

  // Resolved server paths for the chosen pair (post-upload or server-selected)
  const [mastersPath, setMastersPath] = useState("")
  const [transPath, setTransPath] = useState("")

  // Detection / verification of the transactions file's stamped company
  const [detect, setDetect] = useState<DetectResult | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const [phase, setPhase] = useState<"pick" | "uploading" | "verify" | "importing" | "done" | "error">("pick")
  const [uploadStep, setUploadStep] = useState("")
  const [pct, setPct] = useState(0)
  const [msg, setMsg] = useState("")
  const [err, setErr] = useState("")
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const { data: listing, refetch: refetchFiles, isFetching: filesLoading } = useQuery<ServerListing>({
    queryKey: ["tally-server-files", activeCompany],
    queryFn: () => apiFetch("hr_client.api.operations.list_tally_files"),
    staleTime: 30_000,
    enabled: !isAll,
  })
  useEffect(() => {
    if (!listing) return
    if (!selMasters && listing.suggested_masters) setSelMasters(listing.suggested_masters)
    if (!selTrans && listing.suggested_transactions) setSelTrans(listing.suggested_transactions)
  }, [listing]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Verify: read the transactions file's <SVCURRENTCOMPANY> and compare it to
  //    the active company's confirmed Tally name. This is the control that stops
  //    one company's books being imported into another's book.
  const runDetect = useCallback(async (transactionsPath: string) => {
    setDetecting(true); setErr("")
    try {
      const d = await apiFetch(
        `hr_client.api.operations.detect_tally_file_company?path=${encodeURIComponent(transactionsPath)}`,
      ) as DetectResult
      setDetect(d)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read the company from the file")
    } finally {
      setDetecting(false)
    }
  }, [])

  // ── Owner confirms the detected name is this company's Tally company string ──
  async function confirmName() {
    if (!detect?.detected || !activeCompany) return
    setConfirming(true); setErr("")
    try {
      await apiPost("hr_client.api.operations.confirm_tally_company_name", {
        company: activeCompany, tally_company_name: detect.detected,
      })
      await runDetect(transPath)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the company name")
    } finally {
      setConfirming(false)
    }
  }

  function startPolling() {
    pollRef.current = setInterval(async () => {
      const s = await apiFetch("hr_client.api.operations.get_import_status") as { status: string; progress: number; message: string }
      setPct(s.progress); setMsg(s.message)
      if (s.status === "done" || s.status === "completed") {
        clearInterval(pollRef.current!); setPhase("done")
        queryClient.invalidateQueries()
      } else if (s.status === "error") {
        clearInterval(pollRef.current!); setPhase("error"); setErr(s.message)
      }
    }, 2000)
  }

  // ── Move from file-selection → verification ──
  async function proceedToVerify() {
    setErr("")
    try {
      if (mode === "server") {
        if (!selMasters || !selTrans) return
        setMastersPath(selMasters); setTransPath(selTrans)
        setPhase("verify")
        await runDetect(selTrans)
      } else {
        if (!mastersFile || !transFile) return
        setPhase("uploading")
        setUploadStep("Masters"); setPct(0); setMsg(`Uploading ${mastersFile.name}…`)
        const m = await uploadFile(mastersFile, setPct, (s) => setMsg(`${s} ${mastersFile.name}…`)); setPct(100)
        setUploadStep("Transactions"); setPct(0); setMsg(`Uploading ${transFile.name} (${fmtSize(transFile.size)})…`)
        const t = await uploadFile(transFile, setPct, (s) => setMsg(`${s} ${transFile.name} (${fmtSize(transFile.size)})…`)); setPct(100)
        setMastersPath(m.path); setTransPath(t.path)
        setPhase("verify")
        await runDetect(t.path)
      }
    } catch (e) {
      setPhase("error"); setErr(e instanceof Error ? e.message : "Upload failed")
    }
  }

  // ── Verified → import + poll ──
  async function startImport() {
    if (!mastersPath || !transPath) return
    setPhase("importing"); setPct(0); setErr(""); setMsg("Queuing import…")
    try {
      await apiPost("hr_client.api.operations.run_tally_import", {
        masters_path: mastersPath, transactions_path: transPath,
      })
      startPolling()
    } catch (e) {
      setPhase("error"); setErr(e instanceof Error ? e.message : "Failed to start import")
    }
  }

  function reset() {
    setPhase("pick"); setMastersFile(null); setTransFile(null)
    setMastersPath(""); setTransPath(""); setDetect(null)
    setPct(0); setMsg(""); setErr(""); setUploadStep("")
    if (pollRef.current) clearInterval(pollRef.current)
    refetchFiles()
  }

  const fileLabel = (f: ServerFile) => `${f.filename} · ${f.size_fmt} · ${f.modified}`
  const roleBadge = (role: string) =>
    role === "masters" ? "bg-blue-100 text-blue-700" : role === "transactions" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"

  // ── Group console: no single company selected — nothing to import into ──
  if (isAll) {
    return (
      <div>
        <PageHeader workspaceLabel="Finance" title="Tally Data Import" />
        <div className="px-6 md:px-7 pb-8">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800 flex items-start gap-3 max-w-2xl">
            <Building2 size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Pick a company first</p>
              <p className="mt-1">Tally imports load into one company's books. Switch from the group
                console to a specific company using the company switcher, then return here.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {availableCompanies.map((c) => (
                  <button key={c.name} onClick={() => setCompany(c.name)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                    style={{ background: accentOf(c.name) }}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        workspaceLabel="Finance"
        title="Tally Data Import"
        right={
          <HeaderPill>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: accent }} />
              Importing into <strong className="font-semibold">{companyLabel}</strong>
            </span>
          </HeaderPill>
        }
      />

      <div className="px-6 md:px-7 pb-10 max-w-3xl space-y-5">
        {/* ── Step banner ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 text-xs font-medium">
          {(["pick", "verify", "importing"] as const).map((s, i) => {
            const order = { pick: 0, uploading: 0, verify: 1, importing: 2, done: 2, error: 0 }
            const active = order[phase] === i
            const done = order[phase] > i
            return (
              <div key={s} className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white"
                  style={{ background: active || done ? accent : "#cbd5e1" }}>
                  {done ? "✓" : i + 1}
                </span>
                <span style={{ color: active ? accent : "var(--text-secondary)" }}>
                  {["Choose files", "Verify company", "Import"][i]}
                </span>
                {i < 2 && <span className="w-6 h-px bg-gray-200" />}
              </div>
            )
          })}
        </div>

        {/* ── ERROR ───────────────────────────────────────────────────── */}
        {phase === "error" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <XCircle size={40} className="text-red-500" />
            <p className="font-semibold text-gray-800">Something went wrong</p>
            <p className="text-sm text-red-500 text-center max-w-md">{err}</p>
            <button onClick={reset} className="mt-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">Start over</button>
          </div>
        )}

        {/* ── DONE ────────────────────────────────────────────────────── */}
        {phase === "done" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 size={40} className="text-emerald-500" />
            <p className="font-semibold text-gray-800">Import complete — {companyLabel} figures refreshed</p>
            <p className="text-sm text-gray-500 text-center max-w-lg">{msg}</p>
            <button onClick={reset} className="mt-1 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: accent }}>Import again</button>
          </div>
        )}

        {/* ── UPLOADING / IMPORTING progress ──────────────────────────── */}
        {(phase === "uploading" || phase === "importing") && (
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2.5">
              <Loader2 size={16} className="animate-spin shrink-0" style={{ color: accent }} />
              <p className="text-sm text-gray-700">{msg}</p>
            </div>
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>{phase === "uploading"
                  ? `Uploading ${uploadStep} (${uploadStep === "Masters" ? "1" : "2"}/2)`
                  : "Extracting & rebuilding all derived data"}</span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: accent }} />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              A full import (masters + full transaction history) takes a few minutes. You can leave this
              page — it runs in the background.
            </p>
          </div>
        )}

        {/* ── STEP 1 — pick files ─────────────────────────────────────── */}
        {phase === "pick" && (
          <>
            <div className="flex gap-1 p-1 rounded-lg w-fit bg-gray-100">
              {([["server", "From server files"], ["upload", "Upload from computer"]] as const).map(([id, label]) => (
                <button key={id} onClick={() => setMode(id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${mode === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                  {label}
                </button>
              ))}
            </div>

            {mode === "server" ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  Pick the Masters + full Transactions export already on the server. The next step reads the
                  company stamped inside the file and checks it matches <strong>{companyLabel}</strong> before importing.
                </p>
                {filesLoading && !listing ? (
                  <div className="flex items-center gap-2 py-6 text-sm text-gray-400"><Loader2 size={16} className="animate-spin" /> Scanning server for Tally files…</div>
                ) : !listing || listing.files.length === 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    No Tally XML files found on the server. Upload from your computer instead, or place exports
                    in <code className="font-mono">/home/vera/tally_uploads</code> then rescan.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Masters file</label>
                        <select value={selMasters} onChange={e => setSelMasters(e.target.value)}
                          className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none">
                          <option value="">Select masters export…</option>
                          {listing.files.map(f => <option key={f.path} value={f.path}>{fileLabel(f)}{f.role === "masters" ? "  ✓" : ""}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Transactions file</label>
                        <select value={selTrans} onChange={e => setSelTrans(e.target.value)}
                          className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none">
                          <option value="">Select transactions export…</option>
                          {listing.files.map(f => <option key={f.path} value={f.path}>{fileLabel(f)}{f.role === "transactions" ? "  ✓" : ""}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-100 divide-y divide-gray-50">
                      {listing.files.map(f => (
                        <div key={f.path} className="flex items-center gap-2 px-3 py-2 text-xs">
                          <span className={`px-1.5 py-0.5 rounded font-semibold ${roleBadge(f.role)}`}>{f.role}</span>
                          <span className="text-gray-700 truncate flex-1">{f.filename}</span>
                          <span className="text-gray-400 shrink-0">{f.size_fmt}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between">
                  <button onClick={() => refetchFiles()} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800">
                    <RefreshCw size={12} className={filesLoading ? "animate-spin" : ""} /> Rescan server
                  </button>
                  <button disabled={!selMasters || !selTrans} onClick={proceedToVerify}
                    className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    style={{ background: accent }}>
                    Verify &amp; continue →
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-800 flex items-start gap-2">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <span>Large files are supported — they upload in chunks, so the full Transactions export
                    (~1.5 GB) and Masters (~120 MB) work fine over the internet. Keep this tab open until upload finishes.</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { label: "Masters XML", hint: "All Master_DD.MM.YYYY.xml", file: mastersFile, ref: mastersRef, set: setMastersFile },
                    { label: "Transactions XML", hint: "All Transactions.xml", file: transFile, ref: transRef, set: setTransFile },
                  ].map(({ label, hint, file, ref, set }) => (
                    <div key={label} onClick={() => ref.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all ${file ? "bg-slate-50" : "border-gray-200 hover:bg-slate-50"}`}
                      style={file ? { borderColor: accent } : undefined}>
                      <input ref={ref} type="file" accept=".xml" className="hidden" onChange={e => set(e.target.files?.[0] ?? null)} />
                      <div className="flex items-start gap-3">
                        {file ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" style={{ color: accent }} /> : <Upload size={15} className="text-gray-300 mt-0.5 shrink-0" />}
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{label}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{file ? `${file.name} (${fmtSize(file.size)})` : hint}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">Gateway of Tally → Data → Export</p>
                  <button disabled={!mastersFile || !transFile} onClick={proceedToVerify}
                    className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    style={{ background: accent }}>
                    Upload &amp; verify →
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── STEP 2 — verify company ─────────────────────────────────── */}
        {phase === "verify" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-100 bg-white p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <FileCheck2 size={16} style={{ color: accent }} /> Company check
              </div>
              <p className="text-xs text-gray-500 mt-1">
                We read the company name Tally stamped inside the Transactions file and check it matches
                the company you're importing into.
              </p>

              {detecting ? (
                <div className="flex items-center gap-2 py-6 text-sm text-gray-400">
                  <Loader2 size={16} className="animate-spin" /> Reading company from the file…
                </div>
              ) : detect ? (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-gray-400">Importing into</p>
                      <p className="font-semibold text-gray-800 mt-0.5">{companyLabel}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-gray-400">File belongs to</p>
                      <p className="font-semibold text-gray-800 mt-0.5">{detect.detected || "— not found —"}</p>
                    </div>
                  </div>

                  {/* Case A — verified match */}
                  {detect.matches && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-start gap-2">
                      <ShieldCheck size={16} className="shrink-0 mt-0.5" />
                      <span>Verified — this file belongs to <strong>{companyLabel}</strong>. Safe to import.</span>
                    </div>
                  )}

                  {/* Case B — nothing confirmed yet: owner confirms the detected name */}
                  {!detect.matches && detect.detected && !detect.expected && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-2">
                      <div className="flex items-start gap-2">
                        <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                        <span>No Tally company name is saved for <strong>{companyLabel}</strong> yet.
                          Confirm the detected name below to lock it in — every future import for this
                          company will be checked against it.</span>
                      </div>
                      {isGroupOwner ? (
                        <button onClick={confirmName} disabled={confirming}
                          className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                          style={{ background: accent }}>
                          {confirming ? "Saving…" : `Confirm “${detect.detected}” is ${companyLabel}'s Tally name`}
                        </button>
                      ) : (
                        <p className="text-xs">Only the group owner can confirm a company's Tally name. Ask the owner to confirm, then retry.</p>
                      )}
                    </div>
                  )}

                  {/* Case C — mismatch: this file belongs to a different company */}
                  {!detect.matches && detect.detected && detect.expected && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                      <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                      <span>This file belongs to <strong>{detect.detected}</strong>, but you're importing into
                        <strong> {companyLabel}</strong> (expected <strong>{detect.expected}</strong>). Import blocked
                        to protect the books. Switch to the right company or choose the correct file.</span>
                    </div>
                  )}

                  {/* Case D — couldn't read a company from the file */}
                  {!detect.detected && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                      <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                      <span>Couldn't read a company name from this file. A valid Tally export must carry
                        <code className="font-mono"> &lt;SVCURRENTCOMPANY&gt;</code>. Re-export from Tally and try again.</span>
                    </div>
                  )}
                </div>
              ) : null}

              {err && <p className="text-xs text-red-500 mt-3">{err}</p>}
            </div>

            <div className="flex items-center justify-between">
              <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-800">← Back</button>
              <button disabled={!detect?.matches} onClick={startImport}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                style={{ background: accent }}>
                Import &amp; refresh {companyLabel}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
