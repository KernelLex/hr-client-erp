import { useState, useMemo } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEmployees } from "./hooks/useEmployeeLifecycle"
import { DirectoryEmployeeCard, OnboardingEmployeeCard } from "./components/EmployeeCard"
import { useNavigate } from "react-router-dom"
import { UserPlus, Search, Users } from "lucide-react"
import type { EmployeeListItem, OnboardingStage } from "./types"
import { STAGE_COLORS } from "./types"

const ONBOARDING_COLUMNS: Exclude<OnboardingStage, "Active">[] = [
  "Offer Accepted",
  "Documents Collected",
  "IT Setup",
  "First Day",
]

const COLUMN_LABELS: Record<string, string> = {
  "Offer Accepted": "Offer Accepted",
  "Documents Collected": "Documents",
  "IT Setup": "IT Setup",
  "First Day": "First Day",
}

const DEPARTMENTS = ["All", "Engineering", "Design", "Product", "Marketing", "HR", "Finance", "Sales", "Operations"]

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-gray-200 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
        </div>
      </div>
      <div className="space-y-2 mb-4">
        <div className="h-3 bg-gray-100 rounded w-2/3" />
        <div className="h-3 bg-gray-100 rounded w-full" />
        <div className="h-3 bg-gray-100 rounded w-1/2" />
      </div>
      <div className="h-8 bg-gray-100 rounded" />
    </div>
  )
}

export function EmployeesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [dept, setDept] = useState("All")

  const { data: directoryData, isLoading: dirLoading } = useEmployees({ tab: "directory" })
  const { data: onboardingData, isLoading: onbLoading } = useEmployees({ tab: "onboarding" })

  const directoryEmployees: EmployeeListItem[] = directoryData?.employees ?? []
  const onboardingEmployees: EmployeeListItem[] = onboardingData?.employees ?? []

  const filtered = useMemo(() => {
    return directoryEmployees.filter((emp) => {
      const matchSearch = !search || emp.employee_name.toLowerCase().includes(search.toLowerCase()) || emp.designation.toLowerCase().includes(search.toLowerCase())
      const matchDept = dept === "All" || emp.department === dept
      return matchSearch && matchDept
    })
  }, [directoryEmployees, search, dept])

  const onboardingByStage = useMemo(() => {
    const map: Record<string, EmployeeListItem[]> = {}
    ONBOARDING_COLUMNS.forEach((s) => { map[s] = [] })
    onboardingEmployees.forEach((emp) => {
      if (emp.custom_onboarding_stage in map) map[emp.custom_onboarding_stage].push(emp)
    })
    return map
  }, [onboardingEmployees])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Employees</h1>
          <p className="text-xs text-gray-500 mt-0.5">{directoryEmployees.length} active employees</p>
        </div>
        <Button className="gap-2" onClick={() => navigate("/employees/new")}>
          <UserPlus size={15} />
          Add Employee
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden px-6 py-4">
        <Tabs defaultValue="directory" className="h-full flex flex-col">
          <TabsList className="mb-4 w-fit">
            <TabsTrigger value="directory">
              Employee Directory
              {!dirLoading && <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5">{directoryEmployees.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="onboarding">
              Onboarding
              {!onbLoading && <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-600 rounded-full px-1.5 py-0.5">{onboardingEmployees.length}</span>}
            </TabsTrigger>
          </TabsList>

          {/* ── Directory Tab ── */}
          <TabsContent value="directory" className="flex-1 overflow-auto">
            {/* Filters */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-xs">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search by name or role…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <Select value={dept} onValueChange={(v) => setDept(v ?? "All")}>
                <SelectTrigger className="w-40 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {dirLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Users size={40} className="text-gray-200 mb-3" />
                <p className="text-sm font-medium text-gray-500">No employees found</p>
                <p className="text-xs text-gray-400 mt-1">Try adjusting your search or filters</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((emp) => (
                  <DirectoryEmployeeCard key={emp.name} employee={emp} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Onboarding Tab ── */}
          <TabsContent value="onboarding" className="flex-1 overflow-hidden">
            {onbLoading ? (
              <div className="flex gap-4 h-full">
                {ONBOARDING_COLUMNS.map((col) => (
                  <div key={col} className="flex flex-col w-64 shrink-0 rounded-xl bg-gray-50 border border-gray-100 p-3 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
                    {[1, 2].map((i) => <div key={i} className="h-24 bg-gray-200 rounded-lg mb-2" />)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex gap-4 overflow-x-auto h-full pb-2">
                {ONBOARDING_COLUMNS.map((stage) => {
                  const employees = onboardingByStage[stage] ?? []
                  const stageBadge = STAGE_COLORS[stage]
                  return (
                    <div key={stage} className="flex flex-col w-64 shrink-0 rounded-xl bg-gray-50 border border-gray-100">
                      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
                        <span className="text-xs font-semibold text-gray-700">{COLUMN_LABELS[stage]}</span>
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${stageBadge}`}>
                          {employees.length}
                        </span>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {employees.length === 0 ? (
                          <div className="flex items-center justify-center h-20 text-xs text-gray-400">
                            No employees
                          </div>
                        ) : (
                          employees.map((emp) => (
                            <OnboardingEmployeeCard
                              key={emp.name}
                              employee={emp}
                              onUpdate={(e: EmployeeListItem) => navigate(`/employees/${e.name}?tab=onboarding`)}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
