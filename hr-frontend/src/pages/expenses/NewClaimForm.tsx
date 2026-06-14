import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Paperclip, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSubmitClaim } from "./useExpenses"
import type { ClaimType } from "./types"

const PETROL_RATE = 4

function getCsrfToken(): string {
  return (
    document.cookie
      .split("; ")
      .find((row) => row.startsWith("csrf_token="))
      ?.split("=")[1] ?? "fetch"
  )
}

async function uploadFile(file: File): Promise<string> {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("is_private", "0")
  formData.append("folder", "Home/Attachments")

  const res = await fetch("/api/method/upload_file", {
    method: "POST",
    credentials: "include",
    headers: { "X-Frappe-CSRF-Token": getCsrfToken() },
    body: formData,
  })
  const json = await res.json()
  if (!json.message?.file_url) throw new Error("File upload failed")
  return json.message.file_url as string
}

export function NewClaimForm() {
  const navigate = useNavigate()
  const submitClaim = useSubmitClaim()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [claimType, setClaimType] = useState<ClaimType | null>(null)
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const [form, setForm] = useState({
    claim_date: new Date().toISOString().slice(0, 10),
    purpose: "",
    // Petrol
    km_driven: "",
    vehicle_number: "",
    route_from: "",
    route_to: "",
    // Material
    amount: "",
    material_description: "",
    vendor_name: "",
  })

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const kmValue = parseFloat(form.km_driven) || 0
  const calculatedAmount = Math.round(kmValue * PETROL_RATE * 100) / 100

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!claimType) return

    const payload: Record<string, unknown> = {
      claim_type: claimType,
      claim_date: form.claim_date,
      purpose: form.purpose,
    }

    if (claimType === "Petrol") {
      if (!form.km_driven || kmValue <= 0) {
        toast.error("Kilometers traveled must be greater than 0")
        return
      }
      payload.km_driven = kmValue
      if (form.vehicle_number) payload.vehicle_number = form.vehicle_number
      if (form.route_from) payload.route_from = form.route_from
      if (form.route_to) payload.route_to = form.route_to
    } else {
      const amt = parseFloat(form.amount)
      if (!form.amount || amt <= 0) {
        toast.error("Amount must be greater than 0")
        return
      }
      payload.amount = amt
      if (form.material_description) payload.material_description = form.material_description
      if (form.vendor_name) payload.vendor_name = form.vendor_name

      // Upload invoice if selected
      if (invoiceFile) {
        try {
          setUploading(true)
          const fileUrl = await uploadFile(invoiceFile)
          payload.material_receipt = fileUrl
        } catch {
          toast.error("Invoice upload failed — please try again")
          setUploading(false)
          return
        } finally {
          setUploading(false)
        }
      }
    }

    const res = await submitClaim.mutateAsync(payload)
    if (res.claim?.pdf_path && claimType === "Petrol") {
      window.open(res.claim.pdf_path, "_blank")
    }
    navigate("/expenses")
  }

  if (!claimType) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <button onClick={() => navigate("/expenses")}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6">
          <ArrowLeft size={14} /> Back
        </button>
        <h1 className="text-xl font-semibold text-gray-900 mb-6">Submit Expense Claim</h1>
        <p className="text-sm text-gray-600 mb-4">Choose claim type:</p>
        <div className="grid grid-cols-2 gap-4">
          <button
            className="flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all group"
            onClick={() => setClaimType("Petrol")}
          >
            <span className="text-4xl">⛽</span>
            <div className="text-center">
              <p className="font-semibold text-gray-900 group-hover:text-blue-700">Petrol Claim</p>
              <p className="text-xs text-gray-500 mt-1">₹{PETROL_RATE}/km — auto calculated</p>
            </div>
          </button>
          <button
            className="flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-gray-200 hover:border-purple-400 hover:bg-purple-50 transition-all group"
            onClick={() => setClaimType("Material")}
          >
            <span className="text-4xl">📦</span>
            <div className="text-center">
              <p className="font-semibold text-gray-900 group-hover:text-purple-700">Material Claim</p>
              <p className="text-xs text-gray-500 mt-1">Purchases &amp; supplies</p>
            </div>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <button onClick={() => setClaimType(null)}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ArrowLeft size={14} /> Change type
      </button>

      <Card className="bg-white shadow-md border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl flex items-center gap-2">
            {claimType === "Petrol" ? "⛽" : "📦"} {claimType} Claim
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="claim_date">Date *</Label>
              <Input id="claim_date" type="date" value={form.claim_date}
                onChange={(e) => set("claim_date", e.target.value)} required />
            </div>

            {claimType === "Petrol" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="km_driven">Kilometers Traveled *</Label>
                    <Input id="km_driven" type="number" min="0.1" step="0.1"
                      placeholder="0" value={form.km_driven}
                      onChange={(e) => set("km_driven", e.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="vehicle_number">Vehicle Number</Label>
                    <Input id="vehicle_number" placeholder="KA 01 AB 1234"
                      value={form.vehicle_number}
                      onChange={(e) => set("vehicle_number", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="route_from">From</Label>
                    <Input id="route_from" placeholder="Office"
                      value={form.route_from}
                      onChange={(e) => set("route_from", e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="route_to">To</Label>
                    <Input id="route_to" placeholder="Client Site"
                      value={form.route_to}
                      onChange={(e) => set("route_to", e.target.value)} />
                  </div>
                </div>
                {/* Auto-calculated amount display */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <p className="text-xs text-blue-600 font-medium mb-1">Calculated Amount</p>
                  <p className="text-2xl font-bold text-blue-700">
                    ₹{kmValue > 0 ? calculatedAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "0.00"}
                  </p>
                  <p className="text-xs text-blue-500 mt-1">
                    {kmValue > 0 ? `${kmValue} km × ₹${PETROL_RATE}/km` : "Enter km to calculate"}
                  </p>
                </div>
                <p className="text-xs text-gray-400">
                  A PDF receipt will be generated and downloaded automatically on submission.
                </p>
              </>
            )}

            {claimType === "Material" && (
              <>
                <div>
                  <Label htmlFor="amount">Amount (₹) *</Label>
                  <Input id="amount" type="number" min="0.01" step="0.01"
                    placeholder="0.00" value={form.amount}
                    onChange={(e) => set("amount", e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="material_description">Material Description *</Label>
                  <textarea id="material_description"
                    className="w-full min-h-[80px] px-3 py-2 text-sm border border-gray-200 rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Describe what was purchased..."
                    value={form.material_description}
                    onChange={(e) => set("material_description", e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="vendor_name">Vendor / Shop Name</Label>
                  <Input id="vendor_name" placeholder="Where was it purchased?"
                    value={form.vendor_name}
                    onChange={(e) => set("vendor_name", e.target.value)} />
                </div>
                {/* Invoice file upload */}
                <div>
                  <Label>Invoice / Receipt</Label>
                  <div className="mt-1">
                    {invoiceFile ? (
                      <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                        <Paperclip size={14} className="text-purple-500 shrink-0" />
                        <span className="text-sm text-purple-700 truncate flex-1">{invoiceFile.name}</span>
                        <button type="button" onClick={() => setInvoiceFile(null)}
                          className="text-purple-400 hover:text-purple-700">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 w-full border-2 border-dashed border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-500 hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50 transition-all"
                      >
                        <Paperclip size={14} />
                        Attach invoice (PDF, JPG, PNG)
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <Label htmlFor="purpose">Purpose *</Label>
              <textarea id="purpose"
                className="w-full min-h-[80px] px-3 py-2 text-sm border border-gray-200 rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={claimType === "Petrol"
                  ? "Why was this trip made? e.g. Client visit for project X"
                  : "What was this for? e.g. Office supplies for project Y"}
                value={form.purpose}
                onChange={(e) => set("purpose", e.target.value)} required />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit"
                disabled={submitClaim.isPending || uploading}
                className="flex-1">
                {uploading ? "Uploading invoice…" : submitClaim.isPending ? "Submitting…" : "Submit Claim"}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate("/expenses")}>Cancel</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
