export interface Holiday {
  date: string
  name: string
  day: string
  month: string
  is_past: boolean
  is_today: boolean
  is_upcoming: boolean
  days_until: number
}

export interface LeaveTypePolicy {
  type: string
  days: number
  days_label: string
  color: string
  icon: string
  rules: string[]
}

export interface LeavePolicy {
  summary: {
    public_holidays: number
    happy_holiday: number
    earned_leave: number
    sick_leave: number
    max_carry_forward: number
  }
  leave_types: LeaveTypePolicy[]
  important_rules: string[]
}

export const LEAVE_TYPES = [
  "Casual Leave",
  "Sick Leave",
  "Emergency Leave",
  "Maternity Leave",
  "Paternity Leave",
  "Unpaid Leave",
  "Work From Home",
  "Compensatory Leave",
  "Happy Holiday",
] as const

export type LeaveType = (typeof LEAVE_TYPES)[number]
export type LeaveStatus = "Pending" | "Approved" | "Rejected"

export interface LeaveApplication {
  name: string
  employee: string
  employee_name: string
  leave_type: LeaveType
  from_date: string
  to_date: string
  total_days: number
  reason: string
  status: LeaveStatus
  admin_remarks?: string
  applied_on: string
  approved_by?: string
  approved_on?: string
  department?: string
  designation?: string
}

export interface LeaveDocument {
  name: string
  file_name: string
  file_url: string
  creation: string
  file_size: number
}

export interface LeaveSummaryItem {
  employee: string
  employee_name: string
  department: string
  designation: string
  total_days_taken: number
  pending: number
  approved: number
  rejected: number
  by_type: Record<string, number>
}
