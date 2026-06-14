import { useState, useRef, useEffect, useCallback } from "react"
import ReactMarkdown from "react-markdown"
import jsPDF from "jspdf"
import { Sparkles, Pencil, Check, X, Download, Copy, Loader2, AlertTriangle, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useSaveJD, useDesignations, useDepartments } from "../hooks/useRecruitment"
import type { JDSection, JDFormDetails } from "../types"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// Raw shape returned by Gemini
interface GeminiJDRaw {
  job_title: string
  department: string
  location: string
  employment_type: string
  about_company: string
  role_overview: string
  responsibilities: string[]
  required_qualifications: string[]
  nice_to_have: string[]
  what_we_offer: string[]
  how_to_apply: string
}

const LOADING_MESSAGES = [
  "Analyzing role requirements...",
  "Writing responsibilities...",
  "Adding qualifications...",
  "Crafting benefits package...",
  "Polishing the document...",
]

// ─── OpenAI API ───────────────────────────────────────────────────────────────

async function callOpenAI(
  roughDescription: string,
  jobTitle: string,
  department: string
): Promise<GeminiJDRaw> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content:
            "You are an expert HR professional. Return only valid JSON, no explanation.",
        },
        {
          role: "user",
          content: `Generate a complete professional Job Description based on this rough description:
"${roughDescription}"

Job Title hint: ${jobTitle || "extract from description"}
Department hint: ${department || "extract from description"}

Return a JSON object with exactly these keys:
{
  "job_title": "job title",
  "department": "department",
  "location": "location or Bangalore",
  "employment_type": "Full-time",
  "about_company": "2-3 sentences about a growing tech company",
  "role_overview": "2-3 sentences about the role",
  "responsibilities": ["item 1","item 2","item 3","item 4","item 5","item 6","item 7","item 8"],
  "required_qualifications": ["qual 1","qual 2","qual 3","qual 4","qual 5","qual 6"],
  "nice_to_have": ["nice 1","nice 2","nice 3","nice 4"],
  "what_we_offer": ["offer 1","offer 2","offer 3","offer 4","offer 5"],
  "how_to_apply": "one sentence instructions"
}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => "(no body)")
    throw new Error(`OpenAI ${response.status}: ${errBody}`)
  }

  const data = await response.json()
  const text: string = data.choices?.[0]?.message?.content ?? ""
  if (!text) throw new Error(`Unexpected OpenAI response: ${JSON.stringify(data)}`)

  return JSON.parse(text) as GeminiJDRaw
}

// ─── PDF generation ───────────────────────────────────────────────────────────

function generatePDF(jdData: GeminiJDRaw) {
  const doc = new jsPDF("p", "mm", "a4")
  const pageWidth = 210
  const margin = 20
  const contentWidth = pageWidth - margin * 2
  let y = 0

  // Dark navy header
  doc.setFillColor(30, 41, 59)
  doc.rect(0, 0, pageWidth, 38, "F")

  // Company name
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont("helvetica", "bold")
  doc.text("ClientERP", margin, 14)

  // Job title
  doc.setFontSize(13)
  doc.setFont("helvetica", "normal")
  doc.text(jdData.job_title, margin, 24)

  // Subtitle metadata
  doc.setFontSize(9)
  doc.setTextColor(148, 163, 184)
  doc.text(
    `${jdData.department} · ${jdData.location} · ${jdData.employment_type}`,
    margin,
    32
  )

  // Blue accent line
  doc.setFillColor(59, 130, 246)
  doc.rect(0, 38, pageWidth, 1.5, "F")

  y = 48

  const addSection = (title: string, content: string | string[]) => {
    if (y > 260) {
      doc.addPage()
      y = 20
    }

    // Blue left border accent
    doc.setFillColor(59, 130, 246)
    doc.rect(margin, y, 1.5, 7, "F")

    // Section title
    doc.setTextColor(30, 41, 59)
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.text(title, margin + 5, y + 5.5)
    y += 11

    // Section content
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9.5)
    doc.setTextColor(55, 65, 81)

    if (Array.isArray(content)) {
      content.forEach((item) => {
        if (y > 265) { doc.addPage(); y = 20 }
        const lines = doc.splitTextToSize(`• ${item}`, contentWidth - 8)
        doc.text(lines, margin + 5, y)
        y += lines.length * 4.5
      })
    } else {
      const lines = doc.splitTextToSize(content, contentWidth - 8)
      doc.text(lines, margin + 5, y)
      y += lines.length * 4.5
    }
    y += 7
  }

  const addTwoColumnSection = (
    leftTitle: string,
    leftContent: string[],
    rightTitle: string,
    rightContent: string[]
  ) => {
    if (y > 230) { doc.addPage(); y = 20 }

    const colWidth = contentWidth / 2 - 3
    const startY = y

    // Left column
    doc.setFillColor(59, 130, 246)
    doc.rect(margin, y, 1.5, 7, "F")
    doc.setTextColor(30, 41, 59)
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.text(leftTitle, margin + 5, y + 5.5)
    y += 11
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9.5)
    doc.setTextColor(55, 65, 81)
    let leftY = y
    leftContent.forEach((item) => {
      const lines = doc.splitTextToSize(`• ${item}`, colWidth - 5)
      doc.text(lines, margin + 5, leftY)
      leftY += lines.length * 4.5
    })

    // Right column
    const rightX = margin + colWidth + 6
    doc.setFillColor(59, 130, 246)
    doc.rect(rightX, startY, 1.5, 7, "F")
    doc.setTextColor(30, 41, 59)
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.text(rightTitle, rightX + 5, startY + 5.5)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9.5)
    doc.setTextColor(55, 65, 81)
    let rightY = startY + 11
    rightContent.forEach((item) => {
      const lines = doc.splitTextToSize(`• ${item}`, colWidth - 5)
      doc.text(lines, rightX + 5, rightY)
      rightY += lines.length * 4.5
    })

    y = Math.max(leftY, rightY) + 7
  }

  addSection("About the Company", jdData.about_company)
  addSection("Role Overview", jdData.role_overview)
  addTwoColumnSection(
    "Key Responsibilities", jdData.responsibilities,
    "Required Qualifications", jdData.required_qualifications
  )
  addTwoColumnSection(
    "Nice to Have", jdData.nice_to_have,
    "What We Offer", jdData.what_we_offer
  )
  addSection("How to Apply", jdData.how_to_apply)

  // Footer on every page
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFillColor(248, 250, 252)
    doc.rect(0, 282, pageWidth, 15, "F")
    doc.setFontSize(7.5)
    doc.setTextColor(148, 163, 184)
    doc.text("ClientERP HR System · Confidential Document", margin, 289)
    doc.text(
      `Generated: ${new Date().toLocaleDateString("en-IN")} · Page ${i} of ${totalPages}`,
      pageWidth - margin - 45,
      289
    )
  }

  doc.save(
    `JD_${jdData.job_title.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rawToSections(raw: GeminiJDRaw): JDSection[] {
  return [
    { key: "about_company", title: "About the Company", content: raw.about_company },
    { key: "role_overview", title: "Role Overview", content: raw.role_overview },
    {
      key: "responsibilities",
      title: "Key Responsibilities",
      content: raw.responsibilities.map((r) => `- ${r}`).join("\n"),
    },
    {
      key: "required_qualifications",
      title: "Required Qualifications",
      content: raw.required_qualifications.map((r) => `- ${r}`).join("\n"),
    },
    {
      key: "nice_to_have",
      title: "Nice to Have",
      content: raw.nice_to_have.map((r) => `- ${r}`).join("\n"),
    },
    {
      key: "what_we_offer",
      title: "What We Offer",
      content: raw.what_we_offer.map((r) => `- ${r}`).join("\n"),
    },
    { key: "how_to_apply", title: "How to Apply", content: raw.how_to_apply },
  ]
}

function sectionToArray(content: string): string[] {
  return content
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
}

function buildPdfData(
  rawJD: GeminiJDRaw,
  form: JDFormDetails,
  sections: JDSection[]
): GeminiJDRaw {
  const get = (key: string) => sections.find((s) => s.key === key)?.content ?? ""
  return {
    job_title: form.job_title || rawJD.job_title,
    department: form.department || rawJD.department,
    location: form.location || rawJD.location,
    employment_type: form.employment_type || rawJD.employment_type,
    about_company: get("about_company") || rawJD.about_company,
    role_overview: get("role_overview") || rawJD.role_overview,
    responsibilities: sectionToArray(get("responsibilities")) || rawJD.responsibilities,
    required_qualifications:
      sectionToArray(get("required_qualifications")) || rawJD.required_qualifications,
    nice_to_have: sectionToArray(get("nice_to_have")) || rawJD.nice_to_have,
    what_we_offer: sectionToArray(get("what_we_offer")) || rawJD.what_we_offer,
    how_to_apply: get("how_to_apply") || rawJD.how_to_apply,
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingScreen() {
  const [msgIndex, setMsgIndex] = useState(0)
  const [fade, setFade] = useState(true)

  useEffect(() => {
    const iv = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length)
        setFade(true)
      }, 300)
    }, 2000)
    return () => clearInterval(iv)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center min-h-[380px] relative overflow-hidden rounded-xl">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900" />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(circle at 30% 40%, rgba(139,92,246,0.6) 0%, transparent 60%), radial-gradient(circle at 70% 60%, rgba(59,130,246,0.6) 0%, transparent 60%)",
        }}
      />
      <div className="relative z-10 flex flex-col items-center gap-6">
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center border border-white/20 backdrop-blur-sm">
            <Sparkles className="text-white w-8 h-8" />
          </div>
          {/* Spinning ring */}
          <svg
            className="absolute inset-0 w-16 h-16 animate-spin"
            viewBox="0 0 64 64"
            fill="none"
          >
            <circle cx="32" cy="32" r="30" stroke="url(#spinGrad)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="80 120" />
            <defs>
              <linearGradient id="spinGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div className="text-center space-y-2">
          <p className="text-white font-semibold text-lg">Generating Job Description</p>
          <p
            className="text-purple-200 text-sm transition-opacity duration-300"
            style={{ opacity: fade ? 1 : 0 }}
          >
            {LOADING_MESSAGES[msgIndex]}
          </p>
        </div>
        <div className="flex gap-1.5 mt-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-white/50"
              style={{ animation: `jdBounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
        <p className="text-white/40 text-xs">This takes a few seconds…</p>
      </div>
      <style>{`
        @keyframes jdBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-8px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function JDSectionBlock({
  section,
  onUpdate,
}: {
  section: JDSection
  onUpdate: (key: string, content: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(section.content)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setDraft(section.content)
  }, [section.content])

  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus()
      taRef.current.style.height = "auto"
      taRef.current.style.height = taRef.current.scrollHeight + "px"
    }
  }, [editing])

  function save() {
    onUpdate(section.key, draft)
    setEditing(false)
  }

  function cancel() {
    setDraft(section.content)
    setEditing(false)
  }

  return (
    <div className="group mb-1">
      <div className="flex items-center justify-between mb-1.5">
        <h4 className="text-sm font-semibold text-gray-800">{section.title}</h4>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <Pencil size={13} />
          </button>
        ) : (
          <div className="flex gap-1">
            <button onClick={save} className="p-1 rounded hover:bg-green-50 text-green-600">
              <Check size={13} />
            </button>
            <button onClick={cancel} className="p-1 rounded hover:bg-red-50 text-red-500">
              <X size={13} />
            </button>
          </div>
        )}
      </div>
      {editing ? (
        <textarea
          ref={taRef}
          className="w-full text-sm border rounded-lg p-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-purple-400 min-h-[80px] font-mono"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            e.target.style.height = "auto"
            e.target.style.height = e.target.scrollHeight + "px"
          }}
        />
      ) : (
        <div className="text-sm text-gray-700 prose prose-sm max-w-none prose-p:my-1 prose-li:my-0.5">
          <ReactMarkdown>{section.content}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  onCreated?: (name: string) => void
}

type Step = "input" | "loading" | "review" | "error"

const EMPTY_FORM: JDFormDetails = {
  job_title: "", designation: "", department: "", location: "",
  employment_type: "Full-time", lower_range: "", upper_range: "", hiring_manager: "", description: "",
}

export function AIJobDescriptionGenerator({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>("input")
  const [roleDescription, setRoleDescription] = useState("")
  const [rawJD, setRawJD] = useState<GeminiJDRaw | null>(null)
  const [sections, setSections] = useState<JDSection[]>([])
  const [form, setForm] = useState<JDFormDetails>(EMPTY_FORM)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [rounds] = useState<Array<{ interview_round: string; is_required: number }>>([])

  const saveJD = useSaveJD()
  const { data: designations = [] } = useDesignations()
  const { data: departments = [] } = useDepartments()

  function setFormField(k: keyof JDFormDetails, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  const handleGenerate = useCallback(async () => {
    if (!roleDescription.trim()) return
    setStep("loading")
    try {
      const result = await callOpenAI(roleDescription, form.job_title, form.department)
      setRawJD(result)
      setSections(rawToSections(result))
      setForm((f) => ({
        ...f,
        job_title: result.job_title || f.job_title,
        designation: result.job_title || f.designation,
        department: result.department || f.department,
        employment_type: result.employment_type || f.employment_type,
        location: result.location || f.location,
      }))
      setStep("review")
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg, { duration: 8000 })
      setStep("error")
    }
  }, [roleDescription, form.job_title, form.department])

  function handleSectionUpdate(key: string, content: string) {
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, content } : s)))
  }

  async function handleSave() {
    if (!form.job_title || !form.designation) {
      toast.error("Job title and designation are required")
      return
    }
    const fullDescription = sections.map((s) => `## ${s.title}\n\n${s.content}`).join("\n\n")
    const payload = {
      job_title: form.job_title,
      designation: form.designation,
      department: form.department || undefined,
      description: fullDescription,
      employment_type: form.employment_type || undefined,
      location: form.location || undefined,
      lower_range: form.lower_range ? Number(form.lower_range) : undefined,
      upper_range: form.upper_range ? Number(form.upper_range) : undefined,
      interview_rounds: rounds
        .filter((r) => r.interview_round)
        .map((r, i) => ({ sequence: i + 1, interview_round: r.interview_round, is_required: r.is_required })),
    }
    saveJD.mutate(payload, {
      onSuccess: (data) => {
        toast.success("Job opening created!")
        handleClose()
        if (onCreated && data?.job_opening?.name) onCreated(data.job_opening.name)
      },
      onError: () => toast.error("Failed to save job opening"),
    })
  }

  function handleDownloadPdf() {
    if (!rawJD) return
    setPdfLoading(true)
    try {
      const pdfData = buildPdfData(rawJD, form, sections)
      generatePDF(pdfData)
      toast.success("PDF downloaded!")
    } catch {
      toast.error("PDF export failed")
    } finally {
      setPdfLoading(false)
    }
  }

  function handleCopyShareLink() {
    const text = [
      `Job Opening: ${form.job_title} at ClientERP`,
      "",
      ...sections.map((s) => `${s.title}\n${s.content}`),
    ].join("\n\n")
    navigator.clipboard.writeText(text).then(() => toast.success("Copied to clipboard!"))
  }

  function handleSkipToManual() {
    onClose()
  }

  function handleClose() {
    setStep("input")
    setRoleDescription("")
    setRawJD(null)
    setSections([])
    setForm(EMPTY_FORM)
    onClose()
  }

  const isReview = step === "review"

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        className={cn(
          "transition-all duration-300",
          isReview ? "max-w-5xl max-h-[92vh]" : "max-w-lg"
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="text-purple-500" size={18} />
            {isReview ? "Review Job Description" : "New Job Opening"}
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1 — Input */}
        {step === "input" && (
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-gray-800 mb-2 block">
                Describe the role in your own words
              </label>
              <textarea
                className="w-full text-sm border rounded-xl p-3.5 resize-none min-h-[140px] focus:outline-none focus:ring-2 focus:ring-purple-400 transition leading-relaxed"
                placeholder="e.g. Need a senior Python developer for our backend team, 5+ years experience, based in Bangalore, competitive salary..."
                value={roleDescription}
                onChange={(e) => setRoleDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate()
                }}
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1.5">
                Tip: the more detail you give, the better the output. Press ⌘↵ to generate.
              </p>
            </div>

            <button
              onClick={handleGenerate}
              disabled={!roleDescription.trim()}
              className={cn(
                "w-full py-3 rounded-xl font-semibold text-white text-sm transition-all duration-200 flex items-center justify-center gap-2",
                "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500",
                "disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              )}
            >
              <Sparkles size={16} className="shrink-0" />
              Generate Job Description with AI
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-3 text-xs text-gray-400">or</span>
              </div>
            </div>

            <button
              onClick={handleSkipToManual}
              className="w-full text-sm text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1 py-1 transition-colors"
            >
              Fill the form manually
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Loading */}
        {step === "loading" && <LoadingScreen />}

        {/* Error */}
        {step === "error" && (
          <div className="py-8 flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle className="text-red-500" size={24} />
            </div>
            <div>
              <p className="font-medium text-gray-800">AI generation failed</p>
              <p className="text-sm text-gray-500 mt-1">Fill manually instead or try again.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep("input")}>
                Try again
              </Button>
              <Button size="sm" onClick={handleSkipToManual}>
                Fill manually
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2 — Review */}
        {step === "review" && rawJD && (
          <div
            className="flex flex-col overflow-hidden"
            style={{ maxHeight: "calc(92vh - 100px)" }}
          >
            <div className="flex gap-5 overflow-hidden flex-1 min-h-0">
              {/* Left — JD Preview (60%) */}
              <div className="flex-[3] overflow-y-auto pr-2 min-w-0">
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">
                    {form.job_title || rawJD.job_title}
                  </h3>
                  <p className="text-sm text-gray-500 mb-5">
                    {[form.department, form.location, form.employment_type]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="divide-y divide-gray-100">
                    {sections.map((section) => (
                      <div key={section.key} className="py-4 first:pt-0">
                        <JDSectionBlock section={section} onUpdate={handleSectionUpdate} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right — Job Details Form (40%) */}
              <div className="flex-[2] overflow-y-auto min-w-0 space-y-3 shrink-0">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Job Details
                </p>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Job Title *</label>
                  <Input value={form.job_title} onChange={(e) => setFormField("job_title", e.target.value)} placeholder="Senior Backend Engineer" className="text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Designation *</label>
                  <select
                    className="w-full text-sm border rounded-md px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white"
                    value={form.designation}
                    onChange={(e) => setFormField("designation", e.target.value)}
                  >
                    <option value="">Select designation…</option>
                    {designations.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Department</label>
                  <select
                    className="w-full text-sm border rounded-md px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white"
                    value={form.department}
                    onChange={(e) => setFormField("department", e.target.value)}
                  >
                    <option value="">Select department…</option>
                    {departments.map((d) => <option key={d.name} value={d.name}>{d.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Location</label>
                  <Input value={form.location} onChange={(e) => setFormField("location", e.target.value)} placeholder="Bangalore" className="text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Employment Type</label>
                  <select
                    className="w-full text-sm border rounded-md px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400"
                    value={form.employment_type}
                    onChange={(e) => setFormField("employment_type", e.target.value)}
                  >
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Contract">Contract</option>
                    <option value="Internship">Internship</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">Salary From (₹)</label>
                    <Input type="number" value={form.lower_range} onChange={(e) => setFormField("lower_range", e.target.value)} placeholder="800000" className="text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">Salary To (₹)</label>
                    <Input type="number" value={form.upper_range} onChange={(e) => setFormField("upper_range", e.target.value)} placeholder="1200000" className="text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Hiring Manager</label>
                  <Input value={form.hiring_manager} onChange={(e) => setFormField("hiring_manager", e.target.value)} placeholder="Rahul Sharma" className="text-sm" />
                </div>
              </div>
            </div>

            {/* Bottom action bar */}
            <div className="flex items-center justify-between pt-4 border-t mt-4 shrink-0">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPdf}
                  disabled={pdfLoading}
                  className="gap-1.5"
                >
                  {pdfLoading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  Download PDF
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopyShareLink} className="gap-1.5">
                  <Copy size={13} />
                  Copy Share Link
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saveJD.isPending || !form.job_title || !form.designation}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white border-0 gap-1.5"
                >
                  {saveJD.isPending ? (
                    <><Loader2 size={13} className="animate-spin" />Saving…</>
                  ) : (
                    <><Check size={13} />Save & Create Opening</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
