// Reclaimed Materials · detail / editor. Full spec + storage + a photo gallery
// and the "where can this be used" panel — the reuse matcher's hits on current
// BOQ lines, each with a reserve action. Lifecycle: Available→Reserved→Reused.
import { useEffect, useMemo, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Upload, Star, Trash2, Recycle, MapPin } from "lucide-react"
import { toast } from "sonner"
import { reclaimedGet, reclaimedPost, boqGet } from "../peoplework/client"
import { uploadChatFile } from "../../api/chat"

interface Img { image: string; caption?: string | null; is_primary?: number }
interface Suggestion {
  boq: string; boq_title: string; opportunity: string | null; customer: string | null
  area: string | null; unit_name: string | null; required: string; score: number; why: string
}
interface Material {
  name: string; material_title: string; status: string
  source_project: string | null; source_project_label: string | null; source_boq: string | null
  returned_by: string | null; return_date: string | null; return_reason: string | null
  category: string | null; core_material: string | null; finish: string | null; colour: string | null
  thickness: string | null; edge_banding: string | null; condition: string | null; salvage_value: number | null
  width: number | null; height: number | null; depth: number | null; quantity: number | null; uom: string | null
  warehouse: string | null; rack: string | null; bin: string | null; storage_notes: string | null
  reserved_for: string | null; reserved_for_label: string | null; reused_in: string | null; notes: string | null
  images: Img[]; primary_image: string | null; reuse_suggestions: Suggestion[]
}

const STATUS_TONE: Record<string, string> = { Available: "#171717", Reserved: "#171717", Reused: "#6b7280", Scrapped: "#dc2626" }

export function ReclaimedDetail() {
  const { name = "" } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["reclaimed", name],
    queryFn: () => reclaimedGet<{ material: Material }>("get_reclaimed", { name }),
    staleTime: 0, refetchOnMount: "always",
  })
  const m = data?.material
  const { data: options } = useQuery({
    queryKey: ["q_boq_options"],
    queryFn: () => boqGet<Record<string, string[]>>("get_boq_options"),
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (!m) return
    setForm({
      material_title: m.material_title ?? "", category: m.category ?? "", core_material: m.core_material ?? "",
      finish: m.finish ?? "", colour: m.colour ?? "", thickness: m.thickness ?? "", edge_banding: m.edge_banding ?? "",
      condition: m.condition ?? "", salvage_value: String(m.salvage_value ?? ""),
      width: String(m.width ?? ""), height: String(m.height ?? ""), depth: String(m.depth ?? ""),
      quantity: String(m.quantity ?? ""), uom: m.uom ?? "",
      warehouse: m.warehouse ?? "", rack: m.rack ?? "", bin: m.bin ?? "", storage_notes: m.storage_notes ?? "",
      returned_by: m.returned_by ?? "", return_date: m.return_date ?? "", return_reason: m.return_reason ?? "",
      notes: m.notes ?? "",
    })
  }, [m])

  const refresh = () => qc.invalidateQueries({ queryKey: ["reclaimed", name] })
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }))

  async function save() {
    setBusy(true)
    try { await reclaimedPost("update_reclaimed", { name, payload: form }); toast.success("Saved"); refresh() }
    catch (e) { toast.error((e as Error)?.message ?? "Could not save") } finally { setBusy(false) }
  }
  async function post(endpoint: string, body: Record<string, unknown>, ok: string) {
    setBusy(true)
    try { await reclaimedPost(endpoint, body); toast.success(ok); refresh() }
    catch (e) { toast.error((e as Error)?.message ?? "Action failed") } finally { setBusy(false) }
  }

  async function onUpload(files: FileList | null) {
    if (!files?.length || !m) return
    setBusy(true)
    try {
      const uploaded: Img[] = [...m.images]
      for (const f of Array.from(files)) {
        const r = await uploadChatFile(f)
        uploaded.push({ image: r.file_url, caption: "", is_primary: uploaded.length === 0 ? 1 : 0 })
      }
      await reclaimedPost("save_images", { name, images: uploaded })
      toast.success("Images added"); refresh()
    } catch (e) { toast.error((e as Error)?.message ?? "Upload failed") } finally { setBusy(false) }
  }
  async function mutateImages(next: Img[]) {
    setBusy(true)
    try { await reclaimedPost("save_images", { name, images: next }); refresh() }
    catch (e) { toast.error((e as Error)?.message ?? "Could not update images") } finally { setBusy(false) }
  }

  const opt = useMemo(() => ({
    core_material: options?.carcass_material ?? [], finish: options?.internal_finish ?? [],
    thickness: options?.carcass_thickness ?? [], category: options?.category ?? [],
  }), [options])

  if (isLoading) return <div className="p-6" style={{ color: "var(--text-muted)" }}>Loading…</div>
  if (isError || !m) return <div className="p-6" style={{ color: "#dc2626" }}>Could not load: {(error as Error)?.message ?? "not found"}</div>

  const sel = (k: string, label: string, options: string[]) => (
    <div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <input list={`dl_${k}`} value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)}
        className="mt-0.5 w-full rounded px-2 py-1 text-sm" style={{ border: "0.5px solid var(--border, #E3E3E3)", background: "#fff", color: "var(--text-primary)" }} />
      <datalist id={`dl_${k}`}>{options.map((o) => <option key={o} value={o} />)}</datalist>
    </div>
  )
  const txt = (k: string, label: string, type = "text") => (
    <div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <input type={type} value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)}
        className="mt-0.5 w-full rounded px-2 py-1 text-sm" style={{ border: "0.5px solid var(--border, #E3E3E3)", background: "#fff", color: "var(--text-primary)" }} />
    </div>
  )

  return (
    <div className="p-6">
      <button onClick={() => navigate("/quotation/reclaimed")} className="mb-3 inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} /> Reclaimed inventory
      </button>

      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Reclaimed · {m.name}</div>
          <h1 className="font-heading text-2xl font-semibold" style={{ color: "var(--brand-primary)" }}>{m.material_title}</h1>
          {m.source_project_label && <div className="text-sm" style={{ color: "var(--text-muted)" }}>Returned from {m.source_project_label}</div>}
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md px-2 py-1 text-[11px] font-semibold text-white" style={{ background: STATUS_TONE[m.status] ?? "#6b7280" }}>{m.status}</span>
        </div>
      </div>

      {/* Lifecycle actions */}
      <div className="mb-4 flex flex-wrap gap-2">
        {m.status !== "Available" && <Action label="Make Available" onClick={() => post("set_status", { name, status: "Available" }, "Marked available")} busy={busy} />}
        {m.status === "Reserved" && <Action label="Mark Reused" onClick={() => post("mark_reused", { name }, "Marked reused")} busy={busy} primary />}
        {m.status !== "Scrapped" && <Action label="Scrap" onClick={() => post("set_status", { name, status: "Scrapped" }, "Scrapped")} busy={busy} danger />}
        {m.reserved_for_label && <span className="self-center text-xs" style={{ color: "var(--text-muted)" }}>Reserved for {m.reserved_for_label}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left 2 cols — spec + storage form */}
        <div className="space-y-4 lg:col-span-2">
          <Card title="Specification">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {sel("category", "Category", opt.category)}
              {sel("core_material", "Material", opt.core_material)}
              {sel("finish", "Finish", opt.finish)}
              {txt("colour", "Colour")}
              {sel("thickness", "Thickness", opt.thickness)}
              {txt("edge_banding", "Edge Banding")}
              <div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Condition</div>
                <select value={form.condition ?? ""} onChange={(e) => set("condition", e.target.value)} className="mt-0.5 w-full rounded px-2 py-1 text-sm" style={{ border: "0.5px solid var(--border, #E3E3E3)", background: "#fff", color: "var(--text-primary)" }}>
                  {["New", "Like New", "Good", "Usable with rework"].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {txt("salvage_value", "Salvage Value (₹)", "number")}
            </div>
          </Card>

          <Card title="Dimensions & Quantity">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {txt("width", "Width (mm)", "number")}
              {txt("height", "Height (mm)", "number")}
              {txt("depth", "Depth (mm)", "number")}
              {txt("quantity", "Qty", "number")}
              {txt("uom", "UOM")}
            </div>
          </Card>

          <Card title="Storage Location">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {txt("warehouse", "Warehouse / Store")}
              {txt("rack", "Rack / Zone")}
              {txt("bin", "Bin / Shelf")}
              {txt("return_reason", "Return Reason")}
            </div>
            <div className="mt-3">{txt("storage_notes", "Storage Notes")}</div>
          </Card>

          <div className="flex justify-end">
            <button onClick={save} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--brand-primary)" }}>Save</button>
          </div>
        </div>

        {/* Right col — images + reuse suggestions */}
        <div className="space-y-4">
          <Card title="Photos">
            <label className="mb-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold" style={{ border: "1px solid var(--border, #E3E3E3)", color: "var(--brand-primary)" }}>
              <Upload size={14} /> Add photos
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onUpload(e.target.files)} />
            </label>
            {m.images.length === 0 ? (
              <div className="text-xs italic" style={{ color: "var(--text-muted)" }}>No photos yet. Add pictures of the material and its storage spot.</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {m.images.map((img, i) => (
                  <div key={i} className="relative overflow-hidden rounded-lg" style={{ border: "0.5px solid var(--border, #E3E3E3)" }}>
                    <img src={img.image} alt={img.caption ?? ""} className="h-24 w-full object-cover" />
                    {!!img.is_primary && <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] font-semibold text-white">PRIMARY</span>}
                    <div className="flex items-center justify-between px-1 py-0.5">
                      <button title="Set primary" onClick={() => mutateImages(m.images.map((x, j) => ({ ...x, is_primary: j === i ? 1 : 0 })))} style={{ color: img.is_primary ? "#171717" : "var(--text-muted)" }}><Star size={13} /></button>
                      <button title="Remove" onClick={() => mutateImages(m.images.filter((_, j) => j !== i))} style={{ color: "#dc2626" }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Where it can be used">
            {m.reuse_suggestions.length === 0 ? (
              <div className="text-xs italic" style={{ color: "var(--text-muted)" }}>No matching open jobs yet. Set the material & finish so the matcher can find candidates.</div>
            ) : (
              <div className="space-y-2">
                {m.reuse_suggestions.map((s, i) => (
                  <div key={i} className="rounded-lg p-2.5" style={{ border: "0.5px solid var(--border, #E3E3E3)" }}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{s.boq_title}</div>
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: s.score >= 70 ? "#F5F5F5" : "#F5F5F5", color: s.score >= 70 ? "#171717" : "#171717" }}>{s.score}% match</span>
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>{[s.customer, s.area, s.unit_name].filter(Boolean).join(" · ")} · needs {s.required}</div>
                    <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{s.why}</div>
                    <div className="mt-1.5 flex gap-2">
                      <button onClick={() => navigate(`/quotation/boqs/${s.boq}`)} className="text-[11px] font-semibold" style={{ color: "var(--brand-primary)" }}>Open BOQ</button>
                      {s.opportunity && m.status === "Available" && (
                        <button onClick={() => post("reserve_reclaimed", { name, opportunity: s.opportunity }, "Reserved for this job")} className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#171717" }}>
                          <MapPin size={11} /> Reserve for this
                        </button>
                      )}
                      {s.opportunity && m.status === "Reserved" && m.reserved_for === s.opportunity && (
                        <button onClick={() => post("mark_reused", { name, opportunity: s.opportunity }, "Marked reused")} className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#171717" }}>
                          <Recycle size={11} /> Mark reused here
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm" style={{ border: "0.5px solid var(--border, #E3E3E3)" }}>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{title}</div>
      {children}
    </div>
  )
}

function Action({ label, onClick, busy, primary, danger }: { label: string; onClick: () => void; busy: boolean; primary?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy}
      className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
      style={primary ? { background: "var(--brand-primary)", color: "#fff" } : danger ? { border: "1px solid #fecaca", color: "#dc2626" } : { border: "1px solid var(--border, #E3E3E3)", color: "var(--text-primary)" }}>
      {label}
    </button>
  )
}
