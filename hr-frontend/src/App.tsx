import { lazy, Suspense } from "react"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/context/AuthContext"
import { PermissionsProvider } from "@/context/PermissionsContext"
import { ProtectedRoute, PublicOnlyRoute } from "@/components/auth/ProtectedRoute"
import { Layout } from "@/components/layout/Layout"
// Critical path — kept eager so the login → dashboard flow needs no extra fetch.
import { Login } from "@/pages/Login"
import { Dashboard } from "@/pages/Dashboard"

// Everything else is code-split: each page loads on demand, so the initial
// bundle stays small. Named exports are mapped to a default for React.lazy.
const AIChat = lazy(() => import("@/components/AIChat"))
const RecruitmentPage = lazy(() => import("@/pages/recruitment/RecruitmentPage").then(m => ({ default: m.RecruitmentPage })))
const PipelinePage = lazy(() => import("@/pages/recruitment/PipelinePage").then(m => ({ default: m.PipelinePage })))
const EmployeesPage = lazy(() => import("@/pages/employees/EmployeesPage").then(m => ({ default: m.EmployeesPage })))
const EmployeeDetailPage = lazy(() => import("@/pages/employees/EmployeeDetailPage").then(m => ({ default: m.EmployeeDetailPage })))
const PermissionsPage = lazy(() => import("@/pages/admin/permissions/PermissionsPage").then(m => ({ default: m.PermissionsPage })))
const UserManagement = lazy(() => import("@/pages/admin/UserManagement").then(m => ({ default: m.UserManagement })))
const EmployeeProfilePage = lazy(() => import("@/pages/profile/EmployeeProfilePage").then(m => ({ default: m.EmployeeProfilePage })))
const AdminEmployeesPage = lazy(() => import("@/pages/admin/employees/AdminEmployeesPage").then(m => ({ default: m.AdminEmployeesPage })))
const AdminEmployeeDetailPage = lazy(() => import("@/pages/admin/employees/AdminEmployeeDetailPage").then(m => ({ default: m.AdminEmployeeDetailPage })))
const AttendancePage = lazy(() => import("@/pages/admin/attendance/AttendancePage").then(m => ({ default: m.AttendancePage })))
const LeavePage = lazy(() => import("@/pages/leave/LeavePage").then(m => ({ default: m.LeavePage })))
const PipelineBoard = lazy(() => import("@/pages/crm/PipelineBoard").then(m => ({ default: m.PipelineBoard })))
const NewLeadForm = lazy(() => import("@/pages/crm/NewLeadForm").then(m => ({ default: m.NewLeadForm })))
const LeadDetail = lazy(() => import("@/pages/crm/LeadDetail").then(m => ({ default: m.LeadDetail })))
const MyClaimsDashboard = lazy(() => import("@/pages/expenses/MyClaimsDashboard").then(m => ({ default: m.MyClaimsDashboard })))
const NewClaimForm = lazy(() => import("@/pages/expenses/NewClaimForm").then(m => ({ default: m.NewClaimForm })))
const AdminClaimsView = lazy(() => import("@/pages/expenses/AdminClaimsView").then(m => ({ default: m.AdminClaimsView })))
const AccountsPage = lazy(() => import("@/pages/Accounts"))
const HolidaysPage = lazy(() => import("@/pages/holidays/HolidaysPage").then(m => ({ default: m.HolidaysPage })))
const BusinessDashboard = lazy(() => import("@/pages/BusinessDashboard"))
const AIInsights = lazy(() => import("@/pages/AIInsights"))
const VerificationPage = lazy(() => import("@/pages/Verification"))
const VeDrivePage = lazy(() => import("@/pages/drive/VeDrivePage").then(m => ({ default: m.VeDrivePage })))
const ChatPage = lazy(() => import("@/pages/chat/ChatPage").then(m => ({ default: m.ChatPage })))
const OperationsPage = lazy(() => import("@/pages/Operations"))
const AccountingPage = lazy(() => import("@/pages/Accounting"))
const ErpEntriesPage = lazy(() => import("@/pages/erp_entries/ErpEntriesPage").then(m => ({ default: m.ErpEntriesPage })))
const DataEntryRequestsPage = lazy(() => import("@/pages/erp_entries/DataEntryRequestsPage").then(m => ({ default: m.DataEntryRequestsPage })))
const EnquiriesPage = lazy(() => import("@/pages/crm/EnquiriesPage").then(m => ({ default: m.EnquiriesPage })))
const OpportunitiesPage = lazy(() => import("@/pages/crm/OpportunitiesPage").then(m => ({ default: m.OpportunitiesPage })))
const GraphsPage = lazy(() => import("@/pages/Graphs"))
const InventoryPage = lazy(() => import("@/pages/Inventory"))
const PurchasingPage = lazy(() => import("@/pages/Purchasing"))
const SalesRegisterPage = lazy(() => import("@/pages/SalesRegister"))
const LogisticsPage = lazy(() => import("@/pages/Logistics"))
const ReturnsPage = lazy(() => import("@/pages/Returns"))
const OrgHubPage = lazy(() => import("@/pages/admin/OrgHub/OrgHubPage").then(m => ({ default: m.OrgHubPage })))
const DepartmentsPage = lazy(() => import("@/pages/peoplework/screens/HrmsMasters").then(m => ({ default: m.DepartmentsPage })))
const DesignationsPage = lazy(() => import("@/pages/peoplework/screens/HrmsMasters").then(m => ({ default: m.DesignationsPage })))
const EmployeeMasterPage = lazy(() => import("@/pages/peoplework/screens/EmployeeMaster").then(m => ({ default: m.EmployeeMasterPage })))
const PersonalTasksPage = lazy(() => import("@/pages/peoplework/screens/Tasks").then(m => ({ default: m.PersonalTasksPage })))
const TeamTasksPage = lazy(() => import("@/pages/peoplework/screens/Tasks").then(m => ({ default: m.TeamTasksPage })))
const NotesPage = lazy(() => import("@/pages/peoplework/screens/Notes").then(m => ({ default: m.NotesPage })))
const ShiftTypesPage = lazy(() => import("@/pages/peoplework/screens/Shifts").then(m => ({ default: m.ShiftTypesPage })))
const ShiftAssignmentsPage = lazy(() => import("@/pages/peoplework/screens/Shifts").then(m => ({ default: m.ShiftAssignmentsPage })))
const CalendarPage = lazy(() => import("@/pages/peoplework/screens/Calendar").then(m => ({ default: m.CalendarPage })))
const MeetingsPage = lazy(() => import("@/pages/peoplework/screens/Calendar").then(m => ({ default: m.MeetingsPage })))
const RemindersPage = lazy(() => import("@/pages/peoplework/screens/Calendar").then(m => ({ default: m.RemindersPage })))
const WorkflowApprovalsPage = lazy(() => import("@/pages/peoplework/screens/Approvals").then(m => ({ default: m.WorkflowApprovalsPage })))
const TrainingProgramsPage = lazy(() => import("@/pages/peoplework/screens/Training").then(m => ({ default: m.TrainingProgramsPage })))
const TrainingSessionsPage = lazy(() => import("@/pages/peoplework/screens/Training").then(m => ({ default: m.TrainingSessionsPage })))
const ExitManagementPage = lazy(() => import("@/pages/peoplework/screens/ExitManagement").then(m => ({ default: m.ExitManagementPage })))
const SalaryStructuresPage = lazy(() => import("@/pages/peoplework/screens/Payroll").then(m => ({ default: m.SalaryStructuresPage })))
const SalaryAssignmentsPage = lazy(() => import("@/pages/peoplework/screens/Payroll").then(m => ({ default: m.SalaryAssignmentsPage })))
const PayrollRunsPage = lazy(() => import("@/pages/peoplework/screens/Payroll").then(m => ({ default: m.PayrollRunsPage })))
const SalarySlipsPage = lazy(() => import("@/pages/peoplework/screens/Payroll").then(m => ({ default: m.SalarySlipsPage })))
const OnboardingPage = lazy(() => import("@/pages/peoplework/screens/Onboarding").then(m => ({ default: m.OnboardingPage })))
const AppraisalCyclesPage = lazy(() => import("@/pages/peoplework/screens/Appraisal").then(m => ({ default: m.AppraisalCyclesPage })))
const AppraisalsPage = lazy(() => import("@/pages/peoplework/screens/Appraisal").then(m => ({ default: m.AppraisalsPage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 30, retry: 1 },
  },
})

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-screen" style={{ background: "var(--bg-app)" }}>
      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--brand-primary)", borderTopColor: "transparent" }} />
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <PermissionsProvider>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public — redirects to / if already logged in */}
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<Login />} />
            </Route>

            {/* Protected — redirects to /login if not authenticated */}
            <Route element={<ProtectedRoute />}>
              <Route element={<><Layout /><Suspense fallback={null}><AIChat /></Suspense></>}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/recruitment" element={<RecruitmentPage />} />
                <Route path="/recruitment/pipeline/:jobOpening" element={<PipelinePage />} />
                <Route path="/employees" element={<EmployeesPage />} />
                <Route path="/employees/:id" element={<EmployeeDetailPage />} />
                {/* Profile routes */}
                <Route path="/my-profile" element={<EmployeeProfilePage />} />
                <Route path="/employee/profile/:id" element={<EmployeeProfilePage />} />
                {/* Admin routes */}
                <Route path="/admin/employees" element={<AdminEmployeesPage />} />
                <Route path="/admin/employees/:email" element={<AdminEmployeeDetailPage />} />
                <Route path="/admin/permissions" element={<PermissionsPage />} />
                <Route path="/admin/users" element={<UserManagement />} />
                <Route path="/admin/attendance" element={<AttendancePage />} />
                <Route path="/leave" element={<LeavePage />} />
                {/* CRM routes */}
                <Route path="/crm" element={<PipelineBoard />} />
                <Route path="/crm/new" element={<NewLeadForm />} />
                <Route path="/crm/enquiries" element={<EnquiriesPage />} />
                <Route path="/crm/opportunities" element={<OpportunitiesPage />} />
                <Route path="/crm/:id" element={<LeadDetail />} />
                {/* Expense routes */}
                <Route path="/expenses" element={<MyClaimsDashboard />} />
                <Route path="/expenses/new" element={<NewClaimForm />} />
                <Route path="/expenses/admin" element={<AdminClaimsView />} />
                {/* Accounts module */}
                <Route path="/accounts" element={<AccountsPage />} />
                <Route path="/business" element={<BusinessDashboard />} />
                <Route path="/verify" element={<VerificationPage />} />
                <Route path="/ai-insights" element={<AIInsights key="ai-insights" />} />
                <Route path="/graphs" element={<GraphsPage />} />
                {/* Drive Index */}
                <Route path="/drive" element={<VeDrivePage />} />
                {/* Chat */}
                <Route path="/chat" element={<ChatPage />} />
                {/* ERP Entries + data-entry request queue (Phase 2 §2) */}
                <Route path="/erp-entries" element={<ErpEntriesPage />} />
                <Route path="/data-entry-requests" element={<DataEntryRequestsPage />} />
                {/* Accounting — Tally voucher browser (original) */}
                <Route path="/accounting" element={<OperationsPage />} />
                <Route path="/accounts-dashboard" element={<OperationsPage />} />
                {/* Accounting Module — 18-tab COA / ledger page */}
                <Route path="/accounting-module" element={<AccountingPage />} />
                <Route path="/operations" element={<Navigate to="/accounting" replace />} />
                {/* Tally-derived modules */}
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/purchasing" element={<PurchasingPage />} />
                <Route path="/sales-register" element={<SalesRegisterPage />} />
                <Route path="/logistics" element={<LogisticsPage />} />
                <Route path="/returns" element={<ReturnsPage />} />
                {/* Org Hub */}
                <Route path="/org-hub" element={<OrgHubPage />} />
                <Route path="/admin/org-hub" element={<OrgHubPage />} />
                {/* Holidays */}
                <Route path="/holidays" element={<HolidaysPage />} />
                {/* People & Work — HRMS + To-Do workspace */}
                <Route path="/hrms/employees" element={<EmployeeMasterPage />} />
                <Route path="/hrms/departments" element={<DepartmentsPage />} />
                <Route path="/hrms/designations" element={<DesignationsPage />} />
                <Route path="/hrms/shifts" element={<ShiftTypesPage />} />
                <Route path="/hrms/shift-assignments" element={<ShiftAssignmentsPage />} />
                <Route path="/hrms/training" element={<TrainingProgramsPage />} />
                <Route path="/hrms/training-sessions" element={<TrainingSessionsPage />} />
                <Route path="/hrms/onboarding" element={<OnboardingPage />} />
                <Route path="/hrms/exit" element={<ExitManagementPage />} />
                <Route path="/hrms/appraisal-cycles" element={<AppraisalCyclesPage />} />
                <Route path="/hrms/appraisals" element={<AppraisalsPage />} />
                <Route path="/hrms/payroll" element={<SalaryStructuresPage />} />
                <Route path="/hrms/salary-assignments" element={<SalaryAssignmentsPage />} />
                <Route path="/hrms/payroll-runs" element={<PayrollRunsPage />} />
                <Route path="/hrms/salary-slips" element={<SalarySlipsPage />} />
                <Route path="/todo/personal" element={<PersonalTasksPage />} />
                <Route path="/todo/team" element={<TeamTasksPage />} />
                <Route path="/todo/approvals" element={<WorkflowApprovalsPage />} />
                <Route path="/todo/reminders" element={<RemindersPage />} />
                <Route path="/todo/calendar" element={<CalendarPage />} />
                <Route path="/todo/meetings" element={<MeetingsPage />} />
                <Route path="/todo/notes" element={<NotesPage />} />
                {/* Catch-all: redirect unknown paths to dashboard */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
          </Suspense>
          </PermissionsProvider>
        </AuthProvider>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
