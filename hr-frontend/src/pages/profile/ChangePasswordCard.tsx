import { useState } from "react"
import { Eye, EyeOff, Lock, Check, X } from "lucide-react"
import { toast } from "sonner"
import { changeMyPassword } from "@/api/employee"

// Mirrors the server-side strength policy so users get instant feedback.
const RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: "At least 8 characters", test: (p) => p.length >= 8 },
  { label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "One number", test: (p) => /[0-9]/.test(p) },
  { label: "One special character", test: (p) => /[!@#$%^&*()\-_=+[\]{}|;:,.<>?/\\'"~`]/.test(p) },
]

function PwInput({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border px-3 py-2 pr-10 text-sm outline-none focus:ring-2"
        style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
      />
      <button type="button" tabIndex={-1} onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}

export function ChangePasswordCard() {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const allRulesPass = RULES.every((r) => r.test(next))
  const matches = next.length > 0 && next === confirm
  const canSubmit = current.length > 0 && allRulesPass && matches && next !== current && !busy

  async function submit() {
    setError("")
    if (next === current) return setError("New password must be different from your current one.")
    if (!matches) return setError("New passwords don't match.")
    if (!allRulesPass) return setError("New password doesn't meet the requirements below.")
    setBusy(true)
    try {
      const res = await changeMyPassword(current, next)
      if (res?.success) {
        toast.success(res.message || "Password updated.")
        setCurrent(""); setNext(""); setConfirm("")
      } else {
        setError("Could not update password. Please try again.")
      }
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { exc?: string; message?: string; _server_messages?: string } } })?.response?.data
      let msg = d?.message
      // Frappe often returns thrown messages in _server_messages as a JSON array.
      if (!msg && d?._server_messages) {
        try { msg = JSON.parse(JSON.parse(d._server_messages)[0]).message } catch { /* ignore */ }
      }
      setError(msg || d?.exc?.split("\n").pop() || "Could not update password.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border bg-white p-5 max-w-md" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center gap-2 mb-4">
        <Lock size={16} style={{ color: "var(--text-secondary)" }} />
        <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Change Password</h3>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Current password</label>
          <div className="mt-1"><PwInput value={current} onChange={setCurrent} placeholder="Enter current password" autoFocus /></div>
        </div>
        <div>
          <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>New password</label>
          <div className="mt-1"><PwInput value={next} onChange={setNext} placeholder="Enter new password" /></div>
        </div>
        <div>
          <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Confirm new password</label>
          <div className="mt-1"><PwInput value={confirm} onChange={setConfirm} placeholder="Re-enter new password" /></div>
          {confirm.length > 0 && !matches && <p className="text-xs text-red-600 mt-1">Passwords don't match</p>}
        </div>

        {next.length > 0 && (
          <ul className="space-y-1 pt-1">
            {RULES.map((r) => {
              const ok = r.test(next)
              return (
                <li key={r.label} className="flex items-center gap-1.5 text-xs" style={{ color: ok ? "var(--text-secondary)" : "var(--text-tertiary)" }}>
                  {ok ? <Check size={13} className="text-green-600" /> : <X size={13} className="text-gray-400" />}
                  {r.label}
                </li>
              )
            })}
          </ul>
        )}

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <X size={14} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <button
          onClick={submit}
          disabled={!canSubmit}
          className="w-full rounded-lg py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
          style={{ background: "var(--bg-inverse)" }}
        >
          {busy ? "Updating…" : "Update Password"}
        </button>
      </div>
    </div>
  )
}

export default ChangePasswordCard
