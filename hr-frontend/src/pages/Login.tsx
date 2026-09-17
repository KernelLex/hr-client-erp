import { useState, useEffect } from "react"
import { Eye, EyeOff, CheckCircle2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/context/AuthContext"
import { getLoginCompanies, type CompanyBrand } from "@/api/company"
import { setActiveCompanyCache } from "@/lib/api"

const FEATURES = [
  "Complete HR management in one place",
  "Real-time attendance with Jibble sync",
  "Smart recruitment pipeline",
]

export function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  // Pre-login company picker. If only one company is login-enabled we skip
  // straight to its login form; the server still validates the choice.
  const [companies, setCompanies] = useState<CompanyBrand[] | null>(null)
  const [picked, setPicked] = useState<CompanyBrand | null>(null)

  useEffect(() => {
    // Reaching the login screen means no active session — drop any stale company
    // cache so the pick made here is the single source of truth for the next session.
    try { setActiveCompanyCache(null) } catch { /* ignore */ }
    getLoginCompanies()
      .then((cos) => {
        setCompanies(cos)
        if (cos.length === 1) setPicked(cos[0])
      })
      .catch(() => setCompanies([]))
  }, [])

  const accent = picked?.accent || "var(--brand-primary)"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await login(email, password, picked?.name)
    } catch {
      // Generic message — never reveals whether the account or company was wrong.
      setError("Invalid email or password. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // ── Company picker (shown until a company is chosen) ────────────────────────
  if (companies && companies.length > 1 && !picked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ background: "var(--bg-app)" }}>
        <div className="w-full max-w-md">
          <h1 className="font-heading text-2xl text-center mb-1" style={{ color: "var(--text-primary)" }}>
            Choose your company
          </h1>
          <p className="text-center text-sm text-gray-500 mb-8">Select a workspace to sign in to.</p>
          <div className="space-y-3">
            {companies.map((c) => (
              <button
                key={c.name}
                onClick={() => { setError(""); setPicked(c) }}
                className="w-full flex items-center gap-4 rounded-xl border bg-white p-4 text-left transition-all hover:shadow-md focus:outline-none focus-visible:ring-2"
                style={{ borderColor: "#e5e7eb", ["--tw-ring-color" as string]: c.accent }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.accent }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e7eb" }}
              >
                <div
                  className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0 font-heading text-lg text-white"
                  style={{ background: c.accent }}
                >
                  {c.abbr}
                </div>
                <div>
                  <div className="font-medium" style={{ color: "var(--text-primary)" }}>{c.label}</div>
                  <div className="text-xs text-gray-400">Sign in to {c.label}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-app)" }}>
      {/* Left panel */}
      <div
        className="hidden md:flex md:w-2/5 flex-col p-10 relative overflow-hidden"
        style={{ background: accent }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `linear-gradient(160deg, ${accent}, rgba(0,0,0,0.35))` }}
        />

        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 font-heading text-base bg-white/90"
              style={{ color: accent }}
            >
              {picked?.abbr || "V"}
            </div>
            <span className="font-heading text-lg text-white tracking-tight">{picked?.label || "Vera Enterprises"}</span>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <h1 className="font-heading text-4xl text-white leading-tight">Welcome back</h1>
            <p className="mt-3 text-lg" style={{ color: "#d4c8a8" }}>Sign in to your ERP workspace</p>
          </div>

          <div className="space-y-3">
            {FEATURES.map((f) => (
              <div key={f} className="flex items-center gap-3" style={{ color: "#d4c8a8" }}>
                <CheckCircle2 size={16} style={{ color: "var(--gold)" }} className="shrink-0" />
                <span className="text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-8" style={{ background: "#fff" }}>
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="md:hidden flex items-center gap-2 mb-8">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 font-heading text-sm"
              style={{ background: "linear-gradient(150deg, var(--gold-light), var(--gold))", color: "var(--brand-primary)" }}
            >
              V
            </div>
            <span className="font-heading text-base" style={{ color: "var(--text-primary)" }}>Vera Enterprises</span>
          </div>

          <div className="mb-8">
            <h2 className="font-heading text-2xl" style={{ color: "var(--text-primary)" }}>
              {picked ? `Sign in to ${picked.label}` : "Sign in to your account"}
            </h2>
            {picked && companies && companies.length > 1 && (
              <button
                type="button"
                onClick={() => { setPicked(null); setError("") }}
                className="mt-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                ← Change company
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Email</label>
              <Input
                type="email"
                placeholder="admin@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
              style={{ background: accent }}
            >
              {loading && (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="mt-10 text-center text-xs text-gray-400">Vera ERP · Vera Enterprises</p>
        </div>
      </div>
    </div>
  )
}
