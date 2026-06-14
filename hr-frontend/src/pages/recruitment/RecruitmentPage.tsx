import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  useJobOpenings,
  useCloseJobOpening,
  useDeleteJobOpening,
  useCreateJobOpeningMutation,
  useDesignations,
  useDepartments,
} from "./hooks/useRecruitment"
import { AIJobDescriptionGenerator } from "./components/AIJobDescriptionGenerator"
import { useAuth } from "@/context/AuthContext"
import {
  Plus, Briefcase, Users, Building2, Calendar,
  X, Trash2, ChevronDown, ChevronRight,
} from "lucide-react"

const OWAIS_USERS = new Set(["owais@veraenterprises.in", "Administrator"])

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

type JobOpening = {
  name: string
  job_title: string
  designation: string
  department: string | null
  status: string
  posted_on: string
  closes_on: string | null
  applicant_counts: Record<string, number>
}

function JobCard({
  job,
  isAdmin,
  onClose,
  onDelete,
  onViewPipeline,
}: {
  job: JobOpening
  isAdmin: boolean
  onClose: (id: string) => void
  onDelete: (id: string) => void
  onViewPipeline: (id: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isClosed = job.status === "Closed"

  return (
    <div
      className="rounded-xl p-5 transition-all duration-200"
      style={{
        background: "#FFFFFF",
        border: isClosed ? "1px solid #E2E8F0" : "var(--border-card)",
        boxShadow: isClosed ? "none" : "var(--shadow-card)",
        opacity: isClosed ? 0.7 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-base" style={{ color: "var(--text-primary)" }}>
              {job.job_title}
            </h3>
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: isClosed ? "#F1F5F9" : "#EEF2FF",
                color: isClosed ? "#64748B" : "#4F46E5",
              }}
            >
              {isClosed ? "Closed" : "Open"}
            </span>
          </div>

          <div className="flex items-center gap-4 mt-2 flex-wrap">
            {job.designation && (
              <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                <Briefcase size={12} />
                {job.designation}
              </span>
            )}
            {job.department && (
              <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                <Building2 size={12} />
                {job.department.replace(" - V", "")}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
              <Calendar size={12} />
              Posted {formatDate(job.posted_on)}
            </span>
          </div>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-1.5 shrink-0">
            {!isClosed && (
              <button
                onClick={() => onClose(job.name)}
                title="Close job opening"
                className="flex items-center justify-center rounded-lg transition-colors"
                style={{
                  width: 30, height: 30,
                  backgroundColor: "#FEF3C7",
                  color: "#92400E",
                  border: "1px solid #FDE68A",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#FDE68A")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#FEF3C7")}
              >
                <X size={13} />
              </button>
            )}
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <span className="text-xs" style={{ color: "#EF4444" }}>Sure?</span>
                <button
                  onClick={() => { onDelete(job.name); setConfirmDelete(false) }}
                  className="text-xs font-semibold px-2 py-1 rounded"
                  style={{ backgroundColor: "#FEE2E2", color: "#B91C1C", border: "1px solid #FCA5A5" }}
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs px-2 py-1 rounded"
                  style={{ backgroundColor: "#F1F5F9", color: "#64748B", border: "1px solid #E2E8F0" }}
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                title="Delete job opening"
                className="flex items-center justify-center rounded-lg transition-colors"
                style={{
                  width: 30, height: 30,
                  backgroundColor: "#FEE2E2",
                  color: "#B91C1C",
                  border: "1px solid #FCA5A5",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#FCA5A5")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#FEE2E2")}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "#0F172A" }}>
            <Users size={12} style={{ color: "#4F46E5" }} />
            {job.applicant_counts.total ?? 0} candidate{(job.applicant_counts.total ?? 0) !== 1 ? "s" : ""}
          </span>
          {(job.applicant_counts["Application Received"] ?? 0) > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#EEF2FF", color: "#4F46E5" }}>
              {job.applicant_counts["Application Received"]} new
            </span>
          )}
        </div>

        <button
          onClick={() => onViewPipeline(job.name)}
          className="flex items-center gap-1 text-xs font-semibold transition-colors"
          style={{ color: "#4F46E5" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#3730A3")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#4F46E5")}
        >
          View Pipeline
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}

function PostJobModal({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string) => void }) {
  const { data: designations } = useDesignations()
  const { data: departments } = useDepartments()
  const createMutation = useCreateJobOpeningMutation()

  const [form, setForm] = useState({
    job_title: "",
    designation: "",
    department: "",
    num_positions: "1",
    description: "",
  })

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.job_title.trim() || !form.designation) return

    const result = await createMutation.mutateAsync({
      job_title: form.job_title.trim(),
      designation: form.designation,
      department: form.department || undefined,
      description: form.description || undefined,
      num_positions: Number(form.num_positions) || undefined,
    } as Parameters<typeof createMutation.mutateAsync>[0])

    if (result?.job_opening?.name) {
      onCreated(result.job_opening.name)
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" style={{ padding: "28px 28px 24px" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>Post New Job</h2>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-gray-100 transition-colors">
            <X size={16} style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Job Title <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <input
              type="text"
              value={form.job_title}
              onChange={(e) => set("job_title", e.target.value)}
              placeholder="e.g. Accounts Executive"
              required
              className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
              style={{
                border: "1px solid #E2E8F0",
                backgroundColor: "#F8FAFC",
                color: "var(--text-primary)",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#A5B4FC"; e.currentTarget.style.backgroundColor = "#EEF2FF" }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.backgroundColor = "#F8FAFC" }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Designation <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <select
              value={form.designation}
              onChange={(e) => set("designation", e.target.value)}
              required
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                border: "1px solid #E2E8F0",
                backgroundColor: "#F8FAFC",
                color: form.designation ? "var(--text-primary)" : "#94A3B8",
              }}
            >
              <option value="">Select designation</option>
              {(designations ?? []).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Department</label>
            <select
              value={form.department}
              onChange={(e) => set("department", e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                border: "1px solid #E2E8F0",
                backgroundColor: "#F8FAFC",
                color: form.department ? "var(--text-primary)" : "#94A3B8",
              }}
            >
              <option value="">Select department</option>
              {(departments ?? []).map((d) => (
                <option key={d.name} value={d.name}>{d.label.replace(" - V", "")}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Number of Positions
            </label>
            <input
              type="number"
              min={1}
              value={form.num_positions}
              onChange={(e) => set("num_positions", e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ border: "1px solid #E2E8F0", backgroundColor: "#F8FAFC", color: "var(--text-primary)" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#A5B4FC"; e.currentTarget.style.backgroundColor = "#EEF2FF" }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.backgroundColor = "#F8FAFC" }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              placeholder="Brief role description..."
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
              style={{ border: "1px solid #E2E8F0", backgroundColor: "#F8FAFC", color: "var(--text-primary)" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#A5B4FC"; e.currentTarget.style.backgroundColor = "#EEF2FF" }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.backgroundColor = "#F8FAFC" }}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ backgroundColor: "#F1F5F9", color: "var(--text-secondary)", border: "1px solid #E2E8F0" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#E2E8F0")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#F1F5F9")}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-all"
              style={{
                backgroundColor: createMutation.isPending ? "#A5B4FC" : "#4F46E5",
                cursor: createMutation.isPending ? "not-allowed" : "pointer",
              }}
            >
              {createMutation.isPending ? "Posting…" : "Post Job"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function RecruitmentPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user && OWAIS_USERS.has(user.name)

  const { data: openData, isLoading: openLoading } = useJobOpenings("Open")
  const { data: closedData, isLoading: closedLoading } = useJobOpenings("Closed")

  const openJobs: JobOpening[] = openData?.job_openings ?? []
  const closedJobs: JobOpening[] = closedData?.job_openings ?? []

  const closeJob = useCloseJobOpening()
  const deleteJob = useDeleteJobOpening()

  const [showPostModal, setShowPostModal] = useState(false)
  const [showAIGenerator, setShowAIGenerator] = useState(false)
  const [showClosed, setShowClosed] = useState(false)

  const isLoading = openLoading || closedLoading

  function handleViewPipeline(name: string) {
    navigate(`/recruitment/pipeline/${name}`)
  }

  return (
    <div className="p-6 max-w-4xl space-y-6 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold" style={{ fontSize: "22px", color: "var(--text-primary)" }}>
            Recruitment
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {openJobs.length} open position{openJobs.length !== 1 ? "s" : ""}
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAIGenerator(true)}
              className="flex items-center gap-2 text-sm font-medium transition-all px-3 py-2 rounded-lg"
              style={{
                backgroundColor: "#F5F3FF",
                color: "#5B21B6",
                border: "1px solid #DDD6FE",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#EDE9FE")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#F5F3FF")}
            >
              ✨ AI Job Description
            </button>
            <button
              onClick={() => setShowPostModal(true)}
              className="flex items-center gap-2 text-sm font-semibold text-white transition-all px-4 py-2 rounded-lg"
              style={{ backgroundColor: "#4F46E5" }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#3730A3"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(79,70,229,0.4)" }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#4F46E5"; e.currentTarget.style.boxShadow = "none" }}
            >
              <Plus size={15} />
              Post New Job
            </button>
          </div>
        )}
      </div>

      {/* Open Jobs */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl p-5 animate-pulse"
              style={{ background: "#FFFFFF", border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
                <div className="h-8 w-16 bg-gray-100 rounded-lg" />
              </div>
              <div className="mt-4 h-3 bg-gray-100 rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : openJobs.length === 0 ? (
        <div
          className="rounded-xl p-12 text-center"
          style={{ background: "#FFFFFF", border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}
        >
          <Briefcase size={40} className="mx-auto mb-3 opacity-20" style={{ color: "var(--text-muted)" }} />
          <p className="font-medium" style={{ color: "var(--text-secondary)" }}>No open positions</p>
          {isAdmin && (
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Click "+ Post New Job" to create your first opening.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {openJobs.map((job) => (
            <JobCard
              key={job.name}
              job={job}
              isAdmin={!!isAdmin}
              onClose={(id) => closeJob.mutate(id)}
              onDelete={(id) => deleteJob.mutate(id)}
              onViewPipeline={handleViewPipeline}
            />
          ))}
        </div>
      )}

      {/* Closed Jobs */}
      {closedJobs.length > 0 && (
        <div>
          <button
            onClick={() => setShowClosed(!showClosed)}
            className="flex items-center gap-2 text-sm font-medium mb-3 transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            {showClosed ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Closed positions ({closedJobs.length})
          </button>
          {showClosed && (
            <div className="space-y-3">
              {closedJobs.map((job) => (
                <JobCard
                  key={job.name}
                  job={job}
                  isAdmin={!!isAdmin}
                  onClose={(id) => closeJob.mutate(id)}
                  onDelete={(id) => deleteJob.mutate(id)}
                  onViewPipeline={handleViewPipeline}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showPostModal && (
        <PostJobModal
          onClose={() => setShowPostModal(false)}
          onCreated={(name) => handleViewPipeline(name)}
        />
      )}

      <AIJobDescriptionGenerator
        open={showAIGenerator}
        onClose={() => setShowAIGenerator(false)}
        onCreated={(name) => handleViewPipeline(name)}
      />
    </div>
  )
}
