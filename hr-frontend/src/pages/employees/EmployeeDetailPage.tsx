import { useState } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { useEmployeeDetail } from "./hooks/useEmployeeLifecycle"
import { OnboardingTracker } from "./components/OnboardingTracker"
import { ExitModal } from "./components/ExitModal"
import { ArrowLeft, Mail, Phone, MapPin, Calendar, User, Building2, Shield, Loader2, ThumbsUp, Minus, ThumbsDown, AlertTriangle } from "lucide-react"
import { DEPT_COLORS, STAGE_COLORS, type OnboardingStage } from "./types"
import { formatDate } from "@/lib/dateUtils"
import { cn } from "@/lib/utils"

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
}

function deptColor(dept: string) {
  return DEPT_COLORS[dept] ?? "bg-gray-500"
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={14} className="text-gray-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-[11px] text-gray-400 leading-none mb-0.5">{label}</p>
        <p className="text-sm text-gray-800">{value}</p>
      </div>
    </div>
  )
}

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const defaultTab = searchParams.get("tab") ?? "profile"

  const [exitOpen, setExitOpen] = useState(false)
  const { data: detail, isLoading } = useEmployeeDetail(id ?? null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm text-gray-500">Employee not found</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/employees")}>
          Back to Employees
        </Button>
      </div>
    )
  }

  const { employee: emp, exit } = detail

  const stageBadge = STAGE_COLORS[emp.custom_onboarding_stage as OnboardingStage] ?? ""
  const isOnboarding = emp.custom_onboarding_stage !== "Active"
  const hasExit = !!exit

  return (
    <div className="flex flex-col h-full">
      {/* Back nav */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 bg-white shrink-0">
        <button onClick={() => navigate("/employees")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft size={15} />
          Employees
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-800 font-medium">{emp.employee_name}</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left sidebar (30%) ── */}
        <div className="w-64 shrink-0 border-r border-gray-100 bg-white p-5 flex flex-col gap-5 overflow-y-auto">
          {/* Avatar + name */}
          <div className="flex flex-col items-center text-center pt-2">
            <div className={`w-20 h-20 rounded-full ${deptColor(emp.department)} flex items-center justify-center text-white font-bold text-2xl mb-3`}>
              {initials(emp.employee_name)}
            </div>
            <h2 className="font-semibold text-gray-900 text-base leading-tight">{emp.employee_name}</h2>
            <p className="text-xs text-gray-500 mt-1">{emp.designation}</p>
            <p className="text-xs text-gray-400">{emp.department}</p>
            <p className="text-[11px] font-mono text-gray-400 mt-1">{emp.name}</p>
          </div>

          {/* Status badges */}
          <div className="flex flex-col gap-1.5 items-center">
            <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", emp.status === "Active" ? "bg-green-100 text-green-700" : emp.status === "Left" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600")}>
              {emp.status}
            </span>
            {isOnboarding && (
              <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", stageBadge)}>
                {emp.custom_onboarding_stage}
              </span>
            )}
            {hasExit && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-orange-100 text-orange-700">
                Resigned
              </span>
            )}
          </div>

          {/* Quick actions */}
          <div className="space-y-2">
            <Button variant="outline" size="sm" className="w-full gap-2 text-xs justify-start" onClick={() => window.open(`mailto:${emp.company_email}`)}>
              <Mail size={13} />
              Send Email
            </Button>
            {!hasExit && emp.status !== "Left" && (
              <Button variant="outline" size="sm" className="w-full gap-2 text-xs justify-start text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={() => setExitOpen(true)}>
                <Shield size={13} />
                Submit Resignation
              </Button>
            )}
          </div>
        </div>

        {/* ── Right content (70%) ── */}
        <div className="flex-1 overflow-auto p-6">
          <Tabs defaultValue={defaultTab} className="flex flex-col h-full">
            <TabsList className="mb-5 w-fit">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
              {hasExit && <TabsTrigger value="exit">Exit</TabsTrigger>}
            </TabsList>

            {/* ── Profile tab ── */}
            <TabsContent value="profile">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Personal details */}
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Personal Details</h3>
                  <div className="space-y-3.5">
                    <InfoRow icon={User} label="Date of Birth" value={emp.date_of_birth ? formatDate(emp.date_of_birth) : null} />
                    <InfoRow icon={Phone} label="Mobile" value={emp.cell_number} />
                    <InfoRow icon={Mail} label="Personal Email" value={emp.personal_email} />
                    <InfoRow icon={MapPin} label="Address" value={emp.permanent_address} />
                  </div>
                </div>

                {/* Work details */}
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Work Details</h3>
                  <div className="space-y-3.5">
                    <InfoRow icon={Calendar} label="Date of Joining" value={emp.date_of_joining ? formatDate(emp.date_of_joining) : null} />
                    <InfoRow icon={Mail} label="Work Email" value={emp.company_email} />
                    <InfoRow icon={Building2} label="Department" value={emp.department} />
                    <InfoRow icon={User} label="Reports To" value={emp.reports_to_name ?? undefined} />
                  </div>
                </div>

                {/* Emergency contact */}
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Emergency Contact</h3>
                  <div className="space-y-3.5">
                    <InfoRow icon={User} label="Name" value={emp.emergency_contact_name} />
                    <InfoRow icon={Phone} label="Phone" value={emp.emergency_contact_phone} />
                  </div>
                </div>

                {/* Bank */}
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Bank Details</h3>
                  <div className="space-y-3.5">
                    <InfoRow icon={Building2} label="Bank" value={emp.bank_name} />
                    <InfoRow icon={Shield} label="Account No." value={emp.bank_ac_no} />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── Onboarding tab ── */}
            <TabsContent value="onboarding">
              <div className="bg-white rounded-xl border border-gray-100 p-6 max-w-2xl">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Onboarding Progress</h3>
                <p className="text-xs text-gray-400 mb-6">Track {emp.first_name}'s journey from offer acceptance to active status.</p>
                <OnboardingTracker
                  employeeId={emp.name}
                  currentStage={emp.custom_onboarding_stage}
                  docsChecklist={emp.documents_checklist}
                  itChecklist={emp.it_setup_checklist}
                />
              </div>
            </TabsContent>

            {/* ── Exit tab (only if resignation submitted) ── */}
            {hasExit && (
              <TabsContent value="exit">
                <div className="bg-white rounded-xl border border-gray-100 p-6 max-w-2xl">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Exit Details</h3>

                  {/* Exit summary */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[11px] text-gray-400 mb-0.5">Resignation Date</p>
                      <p className="text-sm font-medium text-gray-800">{exit.resignation_date ? formatDate(exit.resignation_date) : "—"}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[11px] text-gray-400 mb-0.5">Last Working Day</p>
                      <p className="text-sm font-medium text-gray-800">{exit.last_working_day ? formatDate(exit.last_working_day) : "Not set"}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[11px] text-gray-400 mb-0.5">Status</p>
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", exit.status === "Settled" ? "bg-green-100 text-green-700" : exit.status === "Interview Done" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600")}>
                        {exit.status}
                      </span>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[11px] text-gray-400 mb-0.5">Final Settlement</p>
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", exit.final_settlement_status === "Done" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
                        {exit.final_settlement_status}
                      </span>
                    </div>
                  </div>

                  {/* Exit interview answers */}
                  {exit.status === "Interview Done" || exit.exit_reason ? (
                    <div className="space-y-4">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Exit Interview</h4>

                      {exit.exit_reason && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1">Reason for leaving</p>
                          <p className="text-sm text-gray-800">{exit.exit_reason}</p>
                        </div>
                      )}

                      {exit.would_recommend && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1.5">Would recommend this company?</p>
                          <div className="flex items-center gap-2">
                            {exit.would_recommend === "Yes" && <ThumbsUp size={16} className="text-green-600" />}
                            {exit.would_recommend === "Maybe" && <Minus size={16} className="text-yellow-600" />}
                            {exit.would_recommend === "No" && <ThumbsDown size={16} className="text-red-600" />}
                            <span className="text-sm font-medium text-gray-800">{exit.would_recommend}</span>
                          </div>
                        </div>
                      )}

                      {exit.enjoyed_most && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1">What they enjoyed most</p>
                          <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{exit.enjoyed_most}</p>
                        </div>
                      )}

                      {exit.improvement_suggestions && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1">Improvement suggestions</p>
                          <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{exit.improvement_suggestions}</p>
                        </div>
                      )}

                      {exit.management_feedback && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1">Management feedback</p>
                          <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{exit.management_feedback}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-xs text-amber-700">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      Exit interview not yet completed.
                    </div>
                  )}
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>

      {/* Exit modal */}
      <ExitModal
        open={exitOpen}
        onClose={() => setExitOpen(false)}
        employeeId={emp.name}
        employeeName={emp.employee_name}
      />
    </div>
  )
}
