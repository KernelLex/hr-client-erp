import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, apiUrl } from "@/lib/api"

function jibbleUrl(method: string) {
  return apiUrl(`hr_client.api.jibble.${method}`)
}

async function jibbleGet<T>(method: string, params?: Record<string, string>): Promise<T> {
  const res = await api.get(jibbleUrl(method), { params })
  return res.data.message as T
}

export type JibbleResult<T> = { success: true; data: T } | { success: false; error: string }

export interface JibblePerson {
  id: string
  fullName?: string
  name?: string
  email?: string
  status?: string
  time?: string        // WhoIsWorkingNow clock-in time
  timeZone?: string
  [key: string]: unknown
}

export interface AttendanceEntry {
  person_id: string
  person_name: string
  date: string
  clock_in: string | null
  clock_out: string | null
  hours: number
  break_minutes: number
  status: "on_time" | "late" | "working" | "absent"
}

export interface AttendanceDateGroup {
  date: string
  date_label: string
  entries: AttendanceEntry[]
}

export interface WeeklySummaryItem {
  person_id: string
  person_name: string
  total_hours: number
  days_worked: number
}

export interface MonthlySummaryItem {
  person_id: string
  person_name: string
  total_hours: number
  working_days: number
  avg_hours_per_day: number
  overtime_days: number
}

export interface LateEmployee {
  person_id: string
  person_name: string
  clock_in: string
  minutes_late: number
}

export interface AbsentEmployee {
  person_id: string
  person_name: string
  email?: string
}

export interface OvertimeEntry {
  person_id: string
  person_name: string
  total_overtime_hours: number
  overtime_days: Array<{ date: string; hours: number; overtime_hours: number }>
}

export interface AttendanceRangeResult {
  success: true
  data: AttendanceDateGroup[]
  date_from: string
  date_to: string
  last_synced: string
}

// ── Hooks ──────────────────────────────────────────────────────────────────

export function useJibblePeople() {
  return useQuery({
    queryKey: ["jibble_people"],
    queryFn: () => jibbleGet<JibbleResult<{ value: JibblePerson[] }>>("get_people"),
    staleTime: 1000 * 60,
    refetchInterval: 60_000,
  })
}

export function useWhosIn() {
  return useQuery({
    queryKey: ["jibble_whos_in"],
    queryFn: () => jibbleGet<JibbleResult<{ value: JibblePerson[] }>>("get_whos_in"),
    staleTime: 1000 * 30,
    refetchInterval: 60_000,
  })
}

export function useAttendanceToday() {
  return useQuery({
    queryKey: ["jibble_attendance_today"],
    queryFn: () =>
      jibbleGet<JibbleResult<AttendanceEntry[]> & { date?: string; last_synced?: string }>(
        "get_attendance_today"
      ),
    staleTime: 1000 * 60,
    refetchInterval: 60_000,
  })
}

export function useAttendanceRange(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ["jibble_attendance_range", dateFrom, dateTo],
    queryFn: () =>
      api
        .get(jibbleUrl("get_attendance_range"), { params: { date_from: dateFrom, date_to: dateTo } })
        .then((r) => r.data.message as AttendanceRangeResult | { success: false; error: string }),
    staleTime: 1000 * 60,
    refetchInterval: 60_000,
    enabled: !!dateFrom && !!dateTo,
  })
}

export function useWeeklySummary() {
  return useQuery({
    queryKey: ["jibble_weekly_summary"],
    queryFn: () =>
      jibbleGet<JibbleResult<WeeklySummaryItem[]> & { week_start?: string; week_end?: string }>(
        "get_weekly_summary"
      ),
    staleTime: 1000 * 60 * 5,
  })
}

export function useMonthlySummary() {
  return useQuery({
    queryKey: ["jibble_monthly_summary"],
    queryFn: () =>
      jibbleGet<JibbleResult<MonthlySummaryItem[]> & { month_start?: string; month_end?: string }>(
        "get_monthly_summary"
      ),
    staleTime: 1000 * 60 * 5,
  })
}

export function useLateToday() {
  return useQuery({
    queryKey: ["jibble_late_today"],
    queryFn: () => jibbleGet<JibbleResult<LateEmployee[]>>("get_late_today"),
    staleTime: 1000 * 60,
    refetchInterval: 60_000,
  })
}

export function useAbsentToday() {
  return useQuery({
    queryKey: ["jibble_absent_today"],
    queryFn: () => jibbleGet<JibbleResult<AbsentEmployee[]>>("get_absent_today"),
    staleTime: 1000 * 60,
    refetchInterval: 60_000,
  })
}

export function useOvertime() {
  return useQuery({
    queryKey: ["jibble_overtime"],
    queryFn: () => jibbleGet<JibbleResult<OvertimeEntry[]>>("get_overtime"),
    staleTime: 1000 * 60 * 10,
  })
}

export function useProjects() {
  return useQuery({
    queryKey: ["jibble_projects"],
    queryFn: () => jibbleGet<JibbleResult<{ value: unknown[] }>>("get_projects"),
    staleTime: 1000 * 60 * 10,
  })
}

export function useJibbleTestConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api
        .get(jibbleUrl("test_connection"))
        .then(
          (r) =>
            r.data.message as {
              success: boolean
              connected: boolean
              organization?: string
              error?: string
            }
        ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jibble_people"] })
    },
  })
}

export function useJibbleBustCache() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) =>
      api
        .get(jibbleUrl("bust_cache"), { params: { date_from: dateFrom, date_to: dateTo } })
        .then((r) => r.data.message),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jibble_attendance_range"] })
      qc.invalidateQueries({ queryKey: ["jibble_attendance_today"] })
      qc.invalidateQueries({ queryKey: ["jibble_late_today"] })
      qc.invalidateQueries({ queryKey: ["jibble_absent_today"] })
    },
  })
}
