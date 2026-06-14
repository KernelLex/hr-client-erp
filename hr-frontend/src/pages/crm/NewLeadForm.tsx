import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useCreateLead } from "./useCRM"
import { SERVICE_INTERESTS, SOURCES } from "./types"

export function NewLeadForm() {
  const navigate = useNavigate()
  const createLead = useCreateLead()

  const [form, setForm] = useState({
    lead_title: "",
    company_name: "",
    contact_person: "",
    phone: "",
    email: "",
    service_interest: "",
    source: "",
    notes: "",
  })

  function setField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.service_interest) return
    const result = await createLead.mutateAsync(form)
    if (result?.lead?.name) {
      navigate(`/crm/${result.lead.name}`)
    } else {
      navigate("/crm")
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <button onClick={() => navigate("/crm")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ArrowLeft size={14} /> Back to Pipeline
      </button>
      <Card className="bg-white shadow-md border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">New Lead</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="lead_title">Lead Title *</Label>
              <Input id="lead_title" placeholder="e.g. Acme Corp – May 2026"
                value={form.lead_title} onChange={(e) => setField("lead_title", e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="company_name">Company Name *</Label>
                <Input id="company_name" placeholder="Company"
                  value={form.company_name} onChange={(e) => setField("company_name", e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="contact_person">Contact Person *</Label>
                <Input id="contact_person" placeholder="Name"
                  value={form.contact_person} onChange={(e) => setField("contact_person", e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">Phone *</Label>
                <Input id="phone" placeholder="+91 XXXXX XXXXX"
                  value={form.phone} onChange={(e) => setField("phone", e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input id="email" type="email" placeholder="contact@company.com"
                  value={form.email} onChange={(e) => setField("email", e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Service Interest *</Label>
                <Select value={form.service_interest} onValueChange={(v) => setField("service_interest", v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="Select service" /></SelectTrigger>
                  <SelectContent>
                    {SERVICE_INTERESTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Source</Label>
                <Select value={form.source} onValueChange={(v) => setField("source", v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="How did they find us?" /></SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <textarea id="notes"
                className="w-full min-h-[80px] px-3 py-2 text-sm border border-gray-200 rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Any additional notes..." value={form.notes}
                onChange={(e) => setField("notes", e.target.value)} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={createLead.isPending} className="flex-1">
                {createLead.isPending ? "Creating…" : "Create Lead"}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate("/crm")}>Cancel</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
