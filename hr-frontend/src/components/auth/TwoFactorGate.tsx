import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/context/AuthContext"
import {
  getTwoFAStatus, beginEnroll, confirmEnroll, verifyTwoFA, type EnrollStart,
} from "@/api/twofa"

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center h-screen px-4" style={{ background: "var(--bg-sidebar, #1e3a2f)" }}>
      <div className="w-full bg-white rounded-2xl shadow-xl p-7" style={{ maxWidth: "440px", border: "0.5px solid var(--border, #e0d9cb)" }}>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-9 h-9 rounded-[10px] flex items-center justify-center font-heading text-lg"
            style={{ background: "linear-gradient(150deg, var(--gold-light,#d4b675), var(--gold,#c8a45c))", color: "var(--brand-primary,#1e3a2f)" }}>V</div>
          <div className="font-heading text-[17px] text-gray-900">Two-Factor Authentication</div>
        </div>
        {children}
      </div>
    </div>
  )
}

function CodeInput({ value, onChange, onEnter }: { value: string; onChange: (v: string) => void; onEnter?: () => void }) {
  return (
    <input
      autoFocus
      inputMode="numeric"
      placeholder="123456"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 8))}
      onKeyDown={(e) => { if (e.key === "Enter") onEnter?.() }}
      className="w-full text-center tracking-[0.4em] text-xl font-semibold rounded-lg border px-3 py-3 outline-none focus:ring-2"
      style={{ borderColor: "var(--border,#e0d9cb)", color: "#1e3a2f" }}
    />
  )
}

function GoldButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
      style={{ background: "var(--brand-primary,#1e3a2f)" }}>
      {children}
    </button>
  )
}

// ── Enroll ────────────────────────────────────────────────────────────────────
function EnrollScreen({ onDone }: { onDone: () => void }) {
  const [data, setData] = useState<EnrollStart | null>(null)
  const [code, setCode] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)
  const [backup, setBackup] = useState<string[] | null>(null)

  useEffect(() => {
    let alive = true
    beginEnroll().then((d) => { if (alive) { if (d.success) setData(d); else setErr(d.error || "Could not start enrollment") } })
    return () => { alive = false }
  }, [])

  async function confirm() {
    if (code.length < 6) return
    setBusy(true); setErr("")
    const r = await confirmEnroll(code)
    setBusy(false)
    if (r.success) setBackup(r.backup_codes || [])
    else setErr(r.error || "Invalid code")
  }

  if (backup) {
    return (
      <Shell>
        <p className="text-sm text-gray-700 mb-3">✅ 2FA is on. Save these <strong>backup codes</strong> somewhere safe — each works once if you lose your phone.</p>
        <div className="grid grid-cols-2 gap-2 mb-4 p-3 rounded-lg" style={{ background: "var(--cream,#f5efe4)" }}>
          {backup.map((c) => <code key={c} className="text-[13px] tracking-wider text-gray-800 text-center">{c}</code>)}
        </div>
        <GoldButton onClick={onDone}>I've saved them — continue</GoldButton>
      </Shell>
    )
  }

  return (
    <Shell>
      <p className="text-sm text-gray-600 mb-4">Set up 2FA to secure your account. Scan this QR in <strong>Google Authenticator</strong> (or Microsoft Authenticator / Authy), then enter the 6-digit code.</p>
      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
      {!data ? (
        <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Loading QR…</div>
      ) : (
        <>
          <div className="flex justify-center mb-3">
            <img src={data.qr} alt="2FA QR code" className="w-44 h-44" />
          </div>
          <p className="text-[11px] text-gray-500 text-center mb-4">
            Can't scan? Enter this key manually:<br />
            <code className="text-[12px] text-gray-800 break-all">{data.secret}</code>
          </p>
          <div className="space-y-3">
            <CodeInput value={code} onChange={setCode} onEnter={confirm} />
            <GoldButton onClick={confirm} disabled={busy || code.length < 6}>{busy ? "Verifying…" : "Verify & enable"}</GoldButton>
          </div>
        </>
      )}
    </Shell>
  )
}

// ── Verify ────────────────────────────────────────────────────────────────────
function VerifyScreen({ onDone }: { onDone: () => void }) {
  const { logout } = useAuth()
  const [code, setCode] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (code.length < 6) return
    setBusy(true); setErr("")
    const r = await verifyTwoFA(code)
    setBusy(false)
    if (r.success) onDone()
    else setErr(r.error || "Invalid code")
  }

  return (
    <Shell>
      <p className="text-sm text-gray-600 mb-4">Enter the 6-digit code from your authenticator app (or a backup code).</p>
      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
      <div className="space-y-3">
        <CodeInput value={code} onChange={setCode} onEnter={submit} />
        <GoldButton onClick={submit} disabled={busy || code.length < 6}>{busy ? "Verifying…" : "Verify"}</GoldButton>
        <button onClick={() => logout()} className="w-full text-xs text-gray-400 hover:text-gray-600 pt-1">Sign out</button>
      </div>
    </Shell>
  )
}

// ── Gate ──────────────────────────────────────────────────────────────────────
export function TwoFactorGate({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["twofa-status"],
    queryFn: getTwoFAStatus,
    staleTime: 0,
    refetchOnMount: "always",
    retry: 1,
  })

  function done() {
    qc.invalidateQueries({ queryKey: ["twofa-status"] })
  }

  // While unknown, don't flash the app — but fail open if the check errors,
  // so a status hiccup never hard-locks a user out (server gate still enforces).
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: "var(--bg-app)" }}>
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--brand-primary)", borderTopColor: "transparent" }} />
      </div>
    )
  }

  if (data?.action === "enroll") return <EnrollScreen onDone={done} />
  if (data?.action === "verify") return <VerifyScreen onDone={done} />
  return <>{children}</>
}
