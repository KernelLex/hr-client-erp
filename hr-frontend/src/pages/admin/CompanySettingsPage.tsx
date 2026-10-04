// Admin · Company Profile / Letterhead settings.
// Lets the owner enter GSTIN, address, phone, email and website per company —
// exactly the fields the customer quotation print reads for the letterhead.
import { useEffect, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { companyProfileGet, companyProfilePost } from "../peoplework/client"

type Profile = {
  company: string; company_name: string; gstin: string; phone: string; email: string
  website: string; address_line1: string; address_line2: string; city: string
  state: string; pincode: string; country: string; has_address: boolean
}
type CompanyRow = { name: string; company_name?: string; tax_id?: string }

export function CompanySettingsPage() {
  const qc = useQueryClient()
  const [company, setCompany] = useState<string>("")
  const [form, setForm] = useState<Partial<Profile>>({})
  const [saved, setSaved] = useState(false)

  const companies = useQuery({
    queryKey: ["company_list"],
    queryFn: () => companyProfileGet<{ companies: CompanyRow[]; default: string }>("list_companies"),
  })

  useEffect(() => {
    if (!company && companies.data?.default) setCompany(companies.data.default)
  }, [companies.data, company])

  const profile = useQuery({
    queryKey: ["company_profile", company],
    queryFn: () => companyProfileGet<Profile>("get_company_profile", { company }),
    enabled: !!company,
  })

  useEffect(() => { if (profile.data) setForm(profile.data) }, [profile.data])

  const save = useMutation({
    mutationFn: () => companyProfilePost<Profile>("save_company_profile", { company, profile: form }),
    onSuccess: (data) => {
      setForm(data); setSaved(true); setTimeout(() => setSaved(false), 2500)
      qc.invalidateQueries({ queryKey: ["company_list"] })
    },
  })

  const set = (k: keyof Profile, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const field = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--border-subtle)] focus:outline-none"
  const label = "block text-xs font-medium text-gray-600 mb-1"

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Company Settings</h1>
      <p className="text-sm text-gray-500 mb-6">
        These details print on the customer quotation letterhead. Fill the GSTIN so the tax number shows on quotes.
      </p>

      <div className="mb-5">
        <label className={label}>Company</label>
        <select className={`${field} max-w-md`} value={company} onChange={(e) => setCompany(e.target.value)}>
          {(companies.data?.companies || []).map((c) => (
            <option key={c.name} value={c.name}>{c.company_name || c.name}{c.tax_id ? "  ✓ GSTIN set" : "  — no GSTIN"}</option>
          ))}
        </select>
      </div>

      {profile.isLoading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-5">
          <div>
            <h2 className="font-semibold text-slate-700 mb-3">Tax & Contact</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>GSTIN <span className="text-gray-400">(15 chars, Karnataka starts 29)</span></label>
                <input className={field} value={form.gstin || ""} maxLength={15}
                  placeholder="29ABCDE1234F1Z5"
                  onChange={(e) => set("gstin", e.target.value.toUpperCase())} />
              </div>
              <div><label className={label}>Phone</label>
                <input className={field} value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} /></div>
              <div><label className={label}>Email</label>
                <input className={field} value={form.email || ""} onChange={(e) => set("email", e.target.value)} /></div>
              <div><label className={label}>Website</label>
                <input className={field} value={form.website || ""} onChange={(e) => set("website", e.target.value)} /></div>
            </div>
          </div>

          <div>
            <h2 className="font-semibold text-slate-700 mb-3">Registered Address</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className={label}>Address Line 1</label>
                <input className={field} value={form.address_line1 || ""} onChange={(e) => set("address_line1", e.target.value)} /></div>
              <div className="col-span-2"><label className={label}>Address Line 2</label>
                <input className={field} value={form.address_line2 || ""} onChange={(e) => set("address_line2", e.target.value)} /></div>
              <div><label className={label}>City</label>
                <input className={field} value={form.city || ""} onChange={(e) => set("city", e.target.value)} /></div>
              <div><label className={label}>State</label>
                <input className={field} value={form.state || ""} onChange={(e) => set("state", e.target.value)} /></div>
              <div><label className={label}>Pincode</label>
                <input className={field} value={form.pincode || ""} onChange={(e) => set("pincode", e.target.value)} /></div>
              <div><label className={label}>Country</label>
                <input className={field} value={form.country || "India"} onChange={(e) => set("country", e.target.value)} /></div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="rounded-md bg-[var(--bg-inverse)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--bg-inverse)] disabled:opacity-50">
              {save.isPending ? "Saving…" : "Save"}
            </button>
            {saved && <span className="text-sm text-[var(--text-primary)] font-medium">✓ Saved</span>}
            {save.isError && <span className="text-sm text-red-600">{(save.error as Error).message}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
