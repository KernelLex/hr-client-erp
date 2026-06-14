// Mock data + API helpers for the Employee Lifecycle module.
// Re-exports everything from mockData and adds API-shaped helper functions.
export {
  mockActiveEmployees,
  mockOnboardingEmployees,
  mockExitingEmployees,
  mockExitRecords,
  mockEmployeeDetails,
  mockAllEmployees,
} from "@/pages/employees/mockData"

export type {
  EmployeeListItem,
  EmployeeDetail,
  EmployeeExitRecord,
  DocumentsChecklist,
  ITSetupChecklist,
  OnboardingStage,
  DocStatus,
} from "@/pages/employees/types"
