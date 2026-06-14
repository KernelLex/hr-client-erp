export type PipelineStage =
  | "Application Received"
  | "Screening"
  | "Interview"
  | "Offer Sent"
  | "Hired"
  | "Rejected";

export const PIPELINE_STAGES: PipelineStage[] = [
  "Application Received",
  "Screening",
  "Interview",
  "Offer Sent",
  "Hired",
  "Rejected",
];

export interface JobOpeningListItem {
  name: string;
  job_title: string;
  designation: string;
  department: string;
  status: "Open" | "Closed";
  posted_on: string;
  applicant_counts: Record<PipelineStage | "total", number>;
}

export interface InterviewRoundConfig {
  sequence: number;
  interview_round: string;
  round_name: string;
  is_required: 0 | 1;
}

export interface JobOpeningDetail {
  name: string;
  job_title: string;
  designation: string;
  department: string;
  status: "Open" | "Closed";
  interview_rounds: InterviewRoundConfig[];
}

export interface CandidateCard {
  name: string;
  applicant_name: string;
  email_id: string;
  phone_number?: string;
  applicant_rating?: number;
  custom_pipeline_stage: PipelineStage;
  custom_current_interview_round?: string;
  custom_current_interview_round_name?: string;
  resume_attachment?: string;
  resume_link?: string;
  source?: string;
  creation: string;
}

export interface PipelineStageData {
  stage: PipelineStage;
  applicants: CandidateCard[];
}

export interface PipelineData {
  job_opening: JobOpeningDetail;
  stages: PipelineStageData[];
}

export interface Interview {
  name: string;
  interview_round: string;
  round_name?: string;
  scheduled_on: string;
  from_time: string;
  to_time: string;
  status: "Pending" | "Under Review" | "Cleared" | "Rejected";
  average_rating?: number;
  interview_summary?: string;
}

export interface Offer {
  name: string;
  status: "Awaiting Response" | "Accepted" | "Rejected";
  offer_date: string;
  designation: string;
}

export interface CandidateDetail {
  applicant: {
    name: string;
    applicant_name: string;
    email_id: string;
    phone_number?: string;
    job_title: string;
    job_title_display: string;
    designation: string;
    status: string;
    custom_pipeline_stage: PipelineStage;
    custom_current_interview_round?: string;
    custom_rejection_reason?: string;
    custom_internal_notes?: string;
    applicant_rating?: number;
    source?: string;
    cover_letter?: string;
    resume_attachment?: string;
    resume_link?: string;
    creation: string;
  };
  interviews: Interview[];
  offer: Offer | null;
}

export interface InterviewRound {
  name: string;
  round_name: string;
}

// AI Job Description Generator types
export interface JDSection {
  key: string;
  title: string;
  content: string;
}

export interface JDGenerateInput {
  role_description: string;
}

export interface JDGenerateResult {
  job_title: string;
  department: string;
  employment_type: string;
  location: string;
  sections: JDSection[];
  raw_text: string;
}

export interface JDFormDetails {
  job_title: string;
  designation: string;
  department: string;
  location: string;
  employment_type: string;
  lower_range: string;
  upper_range: string;
  hiring_manager: string;
  description: string;
}
