import { ErrorBoundary } from "@/components/ErrorBoundary"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/context/AuthContext"
import { PermissionsProvider } from "@/context/PermissionsContext"
import { ProtectedRoute, PublicOnlyRoute } from "@/components/auth/ProtectedRoute"
import { Layout } from "@/components/layout/Layout"
import { Login } from "@/pages/Login"
import { Dashboard } from "@/pages/Dashboard"
import { RecruitmentPage } from "@/pages/recruitment/RecruitmentPage"
import { PipelinePage } from "@/pages/recruitment/PipelinePage"
import { EmployeesPage } from "@/pages/employees/EmployeesPage"
import { EmployeeDetailPage } from "@/pages/employees/EmployeeDetailPage"
import { PermissionsPage } from "@/pages/admin/permissions/PermissionsPage"
import { UserManagement } from "@/pages/admin/UserManagement"
import { EmployeeProfilePage } from "@/pages/profile/EmployeeProfilePage"
import { AdminEmployeesPage } from "@/pages/admin/employees/AdminEmployeesPage"
import { AdminEmployeeDetailPage } from "@/pages/admin/employees/AdminEmployeeDetailPage"
import { AttendancePage } from "@/pages/admin/attendance/AttendancePage"
import { LeavePage } from "@/pages/leave/LeavePage"
import { PipelineBoard } from "@/pages/crm/PipelineBoard"
import { NewLeadForm } from "@/pages/crm/NewLeadForm"
import { LeadDetail } from "@/pages/crm/LeadDetail"
import { MyClaimsDashboard } from "@/pages/expenses/MyClaimsDashboard"
import { NewClaimForm } from "@/pages/expenses/NewClaimForm"
import { AdminClaimsView } from "@/pages/expenses/AdminClaimsView"
import AccountsPage from "@/pages/Accounts"
import { HolidaysPage } from "@/pages/holidays/HolidaysPage"
import BusinessDashboard from "@/pages/BusinessDashboard"
import AIInsights from "@/pages/AIInsights"
import VerificationPage from "@/pages/Verification"
import AIChat from "@/components/AIChat"
import { VeDrivePage } from "@/pages/drive/VeDrivePage"
import { ChatPage } from "@/pages/chat/ChatPage"
import OperationsPage from "@/pages/Operations"
import GraphsPage from "@/pages/Graphs"
import InventoryPage from "@/pages/Inventory"
import PurchasingPage from "@/pages/Purchasing"
import SalesRegisterPage from "@/pages/SalesRegister"
import LogisticsPage from "@/pages/Logistics"
import ReturnsPage from "@/pages/Returns"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 30, retry: 1 },
  },
})

function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <PermissionsProvider>
          <Routes>
            {/* Public — redirects to / if already logged in */}
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<Login />} />
            </Route>

            {/* Protected — redirects to /login if not authenticated */}
            <Route element={<ProtectedRoute />}>
              <Route element={<><Layout /><AIChat /></>}>
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
                {/* Accounting Dashboard (formerly Operations) */}
                <Route path="/accounting" element={<OperationsPage />} />
                <Route path="/operations" element={<Navigate to="/accounting" replace />} />
                {/* Tally-derived modules */}
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/purchasing" element={<PurchasingPage />} />
                <Route path="/sales-register" element={<SalesRegisterPage />} />
                <Route path="/logistics" element={<LogisticsPage />} />
                <Route path="/returns" element={<ReturnsPage />} />
                {/* Holidays */}
                <Route path="/holidays" element={<HolidaysPage />} />
                {/* Catch-all: redirect unknown paths to dashboard */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
          </PermissionsProvider>
        </AuthProvider>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
