import { useState } from "react"
import { Check, ChevronDown, Building2 } from "lucide-react"
import { useCompany, ALL_COMPANIES } from "@/context/CompanyContext"

/**
 * Always-visible active-company control in the top bar. Switching is deliberate
 * and produces a visible, whole-app state change (queryClient.clear on switch) —
 * this is what stops one company's document landing in another's books.
 * The group owner additionally gets an "All companies" (group console) option.
 */
export function CompanySwitcher() {
  const { activeCompany, availableCompanies, isGroupOwner, setCompany } = useCompany()
  const [open, setOpen] = useState(false)

  // Nothing to switch between and not the owner → don't clutter the bar.
  if (availableCompanies.length <= 1 && !isGroupOwner) return null

  const isAll = activeCompany === ALL_COMPANIES
  const activeBrand = availableCompanies.find((c) => c.name === activeCompany)
  const label = isAll ? "All companies" : activeBrand?.label || activeCompany || "Company"
  // Monochrome overhaul — the switcher is neutral; companies are told apart by
  // name + the active check, not by an accent colour.

  function choose(name: string) {
    setOpen(false)
    if (name !== activeCompany) void setCompany(name)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors"
        style={{ borderColor: "var(--border-control)", color: "var(--text-primary)" }}
      >
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "var(--text-primary)" }} />
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown size={13} className="text-gray-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 mt-2 w-60 bg-white rounded-xl shadow-xl z-50 overflow-hidden py-1"
            style={{ border: "0.5px solid var(--border,#E3E3E3)" }}
          >
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
              <Building2 size={11} /> Active company
            </div>
            {availableCompanies.map((c) => (
              <button
                key={c.name}
                onClick={() => choose(c.name)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--cream,#F5F5F5)]"
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "var(--text-tertiary)" }} />
                <span className="flex-1 text-[13px] text-gray-900 truncate">{c.label}</span>
                {c.name === activeCompany && <Check size={14} style={{ color: "var(--text-primary)" }} />}
              </button>
            ))}

            {isGroupOwner && (
              <>
                <div className="my-1 border-t" style={{ borderColor: "var(--border,#E3E3E3)" }} />
                <button
                  onClick={() => choose(ALL_COMPANIES)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--cream,#F5F5F5)]"
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "var(--text-tertiary)" }} />
                  <span className="flex-1 text-[13px] font-medium text-gray-900">All companies</span>
                  {isAll && <Check size={14} style={{ color: "var(--text-primary)" }} />}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
