import type { EmployeeListItem, EmployeeDetail, EmployeeExitRecord, DocumentsChecklist, ITSetupChecklist } from "./types"

const ALL_DOCS_RECEIVED: DocumentsChecklist = {
  offer_letter_signed: "received",
  passport_photo: "received",
  address_proof: "received",
  educational_certificates: "received",
  bank_details: "received",
  pan_card: "received",
  aadhaar: "received",
}

const ALL_DOCS_PENDING: DocumentsChecklist = {
  offer_letter_signed: "pending",
  passport_photo: "pending",
  address_proof: "pending",
  educational_certificates: "pending",
  bank_details: "pending",
  pan_card: "pending",
  aadhaar: "pending",
}

const ALL_IT_DONE: ITSetupChecklist = {
  email_created: true,
  laptop_assigned: true,
  system_access: true,
  software_installed: true,
  access_card: true,
}

const ALL_IT_PENDING: ITSetupChecklist = {
  email_created: false,
  laptop_assigned: false,
  system_access: false,
  software_installed: false,
  access_card: false,
}

// 15 active employees
export const mockActiveEmployees: EmployeeListItem[] = [
  { name: "HR-EMP-00001", employee_name: "Priya Sharma", designation: "Senior Software Engineer", department: "Engineering", company_email: "priya.sharma@clienterp.com", date_of_joining: "2022-06-01", status: "Active", custom_onboarding_stage: "Active", image: null },
  { name: "HR-EMP-00002", employee_name: "Arjun Mehta", designation: "Product Manager", department: "Product", company_email: "arjun.mehta@clienterp.com", date_of_joining: "2021-09-15", status: "Active", custom_onboarding_stage: "Active", image: null },
  { name: "HR-EMP-00003", employee_name: "Sneha Kapoor", designation: "UX Designer", department: "Design", company_email: "sneha.kapoor@clienterp.com", date_of_joining: "2023-01-10", status: "Active", custom_onboarding_stage: "Active", image: null },
  { name: "HR-EMP-00004", employee_name: "Rahul Verma", designation: "Finance Analyst", department: "Finance", company_email: "rahul.verma@clienterp.com", date_of_joining: "2022-03-20", status: "Active", custom_onboarding_stage: "Active", image: null },
  { name: "HR-EMP-00005", employee_name: "Divya Nair", designation: "HR Business Partner", department: "HR", company_email: "divya.nair@clienterp.com", date_of_joining: "2020-11-01", status: "Active", custom_onboarding_stage: "Active", image: null },
  { name: "HR-EMP-00006", employee_name: "Karan Patel", designation: "Marketing Manager", department: "Marketing", company_email: "karan.patel@clienterp.com", date_of_joining: "2021-04-12", status: "Active", custom_onboarding_stage: "Active", image: null },
  { name: "HR-EMP-00007", employee_name: "Ananya Krishnan", designation: "Backend Engineer", department: "Engineering", company_email: "ananya.krishnan@clienterp.com", date_of_joining: "2023-07-03", status: "Active", custom_onboarding_stage: "Active", image: null },
  { name: "HR-EMP-00008", employee_name: "Vikram Iyer", designation: "Sales Lead", department: "Sales", company_email: "vikram.iyer@clienterp.com", date_of_joining: "2022-08-22", status: "Active", custom_onboarding_stage: "Active", image: null },
  { name: "HR-EMP-00009", employee_name: "Meena Sharma", designation: "Operations Manager", department: "Operations", company_email: "meena.sharma@clienterp.com", date_of_joining: "2019-05-14", status: "Active", custom_onboarding_stage: "Active", image: null },
  { name: "HR-EMP-00010", employee_name: "Dev Patel", designation: "DevOps Engineer", department: "Engineering", company_email: "dev.patel@clienterp.com", date_of_joining: "2023-02-28", status: "Active", custom_onboarding_stage: "Active", image: null },
  { name: "HR-EMP-00011", employee_name: "Pooja Desai", designation: "Content Strategist", department: "Marketing", company_email: "pooja.desai@clienterp.com", date_of_joining: "2022-12-05", status: "Active", custom_onboarding_stage: "Active", image: null },
  { name: "HR-EMP-00012", employee_name: "Amit Joshi", designation: "QA Lead", department: "Engineering", company_email: "amit.joshi@clienterp.com", date_of_joining: "2021-06-18", status: "Active", custom_onboarding_stage: "Active", image: null },
  { name: "HR-EMP-00013", employee_name: "Riya Shah", designation: "Data Scientist", department: "Engineering", company_email: "riya.shah@clienterp.com", date_of_joining: "2023-04-10", status: "Active", custom_onboarding_stage: "Active", image: null },
  { name: "HR-EMP-00014", employee_name: "Suresh Kumar", designation: "Business Analyst", department: "Product", company_email: "suresh.kumar@clienterp.com", date_of_joining: "2022-10-03", status: "Active", custom_onboarding_stage: "Active", image: null },
  { name: "HR-EMP-00015", employee_name: "Neha Gupta", designation: "HR Coordinator", department: "HR", company_email: "neha.gupta@clienterp.com", date_of_joining: "2023-08-21", status: "Active", custom_onboarding_stage: "Active", image: null },
]

// 4 onboarding employees
export const mockOnboardingEmployees: EmployeeListItem[] = [
  { name: "HR-EMP-00016", employee_name: "Rohit Malhotra", designation: "Frontend Developer", department: "Engineering", company_email: "rohit.malhotra@clienterp.com", date_of_joining: "2026-05-01", status: "Active", custom_onboarding_stage: "Offer Accepted", image: null },
  { name: "HR-EMP-00017", employee_name: "Kavya Reddy", designation: "UI/UX Designer", department: "Design", company_email: "kavya.reddy@clienterp.com", date_of_joining: "2026-04-25", status: "Active", custom_onboarding_stage: "Documents Collected", image: null },
  { name: "HR-EMP-00018", employee_name: "Aarav Singh", designation: "Product Analyst", department: "Product", company_email: "aarav.singh@clienterp.com", date_of_joining: "2026-04-22", status: "Active", custom_onboarding_stage: "IT Setup", image: null },
  { name: "HR-EMP-00019", employee_name: "Ishaan Chaudhary", designation: "Backend Developer", department: "Engineering", company_email: "ishaan.chaudhary@clienterp.com", date_of_joining: "2026-04-20", status: "Active", custom_onboarding_stage: "First Day", image: null },
]

// 2 employees with exit records
export const mockExitingEmployees: EmployeeListItem[] = [
  { name: "HR-EMP-00020", employee_name: "Manish Khanna", designation: "Senior Engineer", department: "Engineering", company_email: "manish.khanna@clienterp.com", date_of_joining: "2020-03-01", status: "Active", custom_onboarding_stage: "Active", image: null },
  { name: "HR-EMP-00021", employee_name: "Deepa Srinivas", designation: "HR Coordinator", department: "HR", company_email: "deepa.srinivas@clienterp.com", date_of_joining: "2021-07-15", status: "Left", custom_onboarding_stage: "Active", image: null },
]

export const mockExitRecords: Record<string, EmployeeExitRecord> = {
  "HR-EMP-00020": {
    name: "HR-EXIT-2026-0001",
    employee: "HR-EMP-00020",
    employee_name: "Manish Khanna",
    department: "Engineering",
    resignation_date: "2026-04-15",
    last_working_day: "2026-05-15",
    resignation_letter: null,
    status: "Pending",
    final_settlement_status: "Pending",
    exit_reason: null,
    would_recommend: null,
    enjoyed_most: null,
    improvement_suggestions: null,
    management_feedback: null,
  },
  "HR-EMP-00021": {
    name: "HR-EXIT-2026-0002",
    employee: "HR-EMP-00021",
    employee_name: "Deepa Srinivas",
    department: "HR",
    resignation_date: "2026-03-20",
    last_working_day: "2026-04-20",
    resignation_letter: "/files/deepa_resignation.pdf",
    status: "Interview Done",
    final_settlement_status: "Pending",
    exit_reason: "Better opportunity",
    would_recommend: "Yes",
    enjoyed_most: "The collaborative culture and the learning opportunities.",
    improvement_suggestions: "Better work-life balance and more flexible hours.",
    management_feedback: "Management was very supportive and approachable.",
  },
}

export const mockEmployeeDetails: Record<string, EmployeeDetail> = {
  "HR-EMP-00001": {
    employee: { ...mockActiveEmployees[0], first_name: "Priya", last_name: "Sharma", date_of_birth: "1995-08-12", gender: "Female", personal_email: "priya.sharma@gmail.com", cell_number: "+91 9876543201", permanent_address: "12 MG Road, Bengaluru, Karnataka 560001", emergency_contact_name: "Rahul Sharma", emergency_contact_phone: "+91 9876543202", bank_name: "HDFC Bank", bank_ac_no: "XXXX2341", reports_to: "HR-EMP-00002", reports_to_name: "Arjun Mehta", documents_checklist: ALL_DOCS_RECEIVED, it_setup_checklist: ALL_IT_DONE },
    exit: null,
  },
  "HR-EMP-00002": {
    employee: { ...mockActiveEmployees[1], first_name: "Arjun", last_name: "Mehta", date_of_birth: "1991-03-25", gender: "Male", personal_email: "arjun.mehta@gmail.com", cell_number: "+91 9876543210", permanent_address: "45 Koramangala, Bengaluru, Karnataka 560034", emergency_contact_name: "Sunita Mehta", emergency_contact_phone: "+91 9876543211", bank_name: "ICICI Bank", bank_ac_no: "XXXX5678", reports_to: null, reports_to_name: null, documents_checklist: ALL_DOCS_RECEIVED, it_setup_checklist: ALL_IT_DONE },
    exit: null,
  },
  "HR-EMP-00016": {
    employee: { ...mockOnboardingEmployees[0], first_name: "Rohit", last_name: "Malhotra", date_of_birth: "1999-11-05", gender: "Male", personal_email: "rohit.malhotra@gmail.com", cell_number: "+91 9876543216", permanent_address: "78 Indiranagar, Bengaluru, Karnataka 560038", emergency_contact_name: "Sunita Malhotra", emergency_contact_phone: "+91 9876543217", bank_name: "SBI", bank_ac_no: "XXXX9012", reports_to: "HR-EMP-00001", reports_to_name: "Priya Sharma", documents_checklist: ALL_DOCS_PENDING, it_setup_checklist: ALL_IT_PENDING },
    exit: null,
  },
  "HR-EMP-00017": {
    employee: { ...mockOnboardingEmployees[1], first_name: "Kavya", last_name: "Reddy", date_of_birth: "2000-02-14", gender: "Female", personal_email: "kavya.reddy@gmail.com", cell_number: "+91 9876543217", permanent_address: "22 HSR Layout, Bengaluru, Karnataka 560102", emergency_contact_name: "Ravi Reddy", emergency_contact_phone: "+91 9876543218", bank_name: "Axis Bank", bank_ac_no: "XXXX3456", reports_to: "HR-EMP-00003", reports_to_name: "Sneha Kapoor", documents_checklist: ALL_DOCS_RECEIVED, it_setup_checklist: ALL_IT_PENDING },
    exit: null,
  },
  "HR-EMP-00018": {
    employee: { ...mockOnboardingEmployees[2], first_name: "Aarav", last_name: "Singh", date_of_birth: "1998-07-20", gender: "Male", personal_email: "aarav.singh@gmail.com", cell_number: "+91 9876543218", permanent_address: "55 Whitefield, Bengaluru, Karnataka 560066", emergency_contact_name: "Ritu Singh", emergency_contact_phone: "+91 9876543219", bank_name: "Kotak Bank", bank_ac_no: "XXXX7890", reports_to: "HR-EMP-00002", reports_to_name: "Arjun Mehta", documents_checklist: ALL_DOCS_RECEIVED, it_setup_checklist: { email_created: true, laptop_assigned: true, system_access: false, software_installed: false, access_card: false } },
    exit: null,
  },
  "HR-EMP-00019": {
    employee: { ...mockOnboardingEmployees[3], first_name: "Ishaan", last_name: "Chaudhary", date_of_birth: "1997-04-08", gender: "Male", personal_email: "ishaan.chaudhary@gmail.com", cell_number: "+91 9876543219", permanent_address: "90 Electronic City, Bengaluru, Karnataka 560100", emergency_contact_name: "Priti Chaudhary", emergency_contact_phone: "+91 9876543220", bank_name: "Yes Bank", bank_ac_no: "XXXX1234", reports_to: "HR-EMP-00001", reports_to_name: "Priya Sharma", documents_checklist: ALL_DOCS_RECEIVED, it_setup_checklist: ALL_IT_DONE },
    exit: null,
  },
  "HR-EMP-00020": {
    employee: { ...mockExitingEmployees[0], first_name: "Manish", last_name: "Khanna", date_of_birth: "1990-06-30", gender: "Male", personal_email: "manish.khanna@gmail.com", cell_number: "+91 9876543220", permanent_address: "14 JP Nagar, Bengaluru, Karnataka 560078", emergency_contact_name: "Rekha Khanna", emergency_contact_phone: "+91 9876543221", bank_name: "HDFC Bank", bank_ac_no: "XXXX5678", reports_to: "HR-EMP-00001", reports_to_name: "Priya Sharma", documents_checklist: ALL_DOCS_RECEIVED, it_setup_checklist: ALL_IT_DONE },
    exit: mockExitRecords["HR-EMP-00020"],
  },
  "HR-EMP-00021": {
    employee: { ...mockExitingEmployees[1], first_name: "Deepa", last_name: "Srinivas", date_of_birth: "1993-12-18", gender: "Female", personal_email: "deepa.srinivas@gmail.com", cell_number: "+91 9876543221", permanent_address: "36 Jayanagar, Bengaluru, Karnataka 560041", emergency_contact_name: "Srinivas K", emergency_contact_phone: "+91 9876543222", bank_name: "Canara Bank", bank_ac_no: "XXXX9012", reports_to: "HR-EMP-00005", reports_to_name: "Divya Nair", documents_checklist: ALL_DOCS_RECEIVED, it_setup_checklist: ALL_IT_DONE },
    exit: mockExitRecords["HR-EMP-00021"],
  },
}

export const mockAllEmployees: EmployeeListItem[] = [
  ...mockActiveEmployees,
  ...mockOnboardingEmployees,
  ...mockExitingEmployees,
]
