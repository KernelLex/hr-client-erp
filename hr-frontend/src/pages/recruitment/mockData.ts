import { JobOpeningListItem, PipelineData, PIPELINE_STAGES, CandidateDetail, InterviewRound } from "./types";

export const mockJobOpenings: JobOpeningListItem[] = [
  {
    name: "HR-OPN-2024-0001",
    job_title: "Senior Backend Engineer",
    designation: "Software Engineer",
    department: "Engineering",
    status: "Open",
    posted_on: "2024-04-01 10:00:00",
    applicant_counts: {
      "Application Received": 3,
      "Screening": 2,
      "Interview": 2,
      "Offer Sent": 1,
      "Hired": 1,
      "Rejected": 2,
      "total": 11,
    },
  },
  {
    name: "HR-OPN-2024-0002",
    job_title: "Product Designer",
    designation: "Senior Designer",
    department: "Design",
    status: "Open",
    posted_on: "2024-04-05 09:00:00",
    applicant_counts: {
      "Application Received": 5,
      "Screening": 1,
      "Interview": 0,
      "Offer Sent": 0,
      "Hired": 0,
      "Rejected": 1,
      "total": 7,
    },
  },
  {
    name: "HR-OPN-2024-0003",
    job_title: "Marketing Manager",
    designation: "Manager",
    department: "Marketing",
    status: "Closed",
    posted_on: "2024-03-01 10:00:00",
    applicant_counts: {
      "Application Received": 0,
      "Screening": 0,
      "Interview": 0,
      "Offer Sent": 0,
      "Hired": 1,
      "Rejected": 4,
      "total": 5,
    },
  },
];

export const mockPipeline: PipelineData = {
  job_opening: {
    name: "HR-OPN-2024-0001",
    job_title: "Senior Backend Engineer",
    designation: "Software Engineer",
    department: "Engineering",
    status: "Open",
    interview_rounds: [
      { sequence: 1, interview_round: "HR Screen", round_name: "HR Screen", is_required: 1 },
      { sequence: 2, interview_round: "Technical Round 1", round_name: "Technical Round 1", is_required: 1 },
      { sequence: 3, interview_round: "Culture Fit", round_name: "Culture Fit", is_required: 0 },
    ],
  },
  stages: PIPELINE_STAGES.map((stage) => ({
    stage,
    applicants: ({
      "Application Received": [
        {
          name: "HR-APP-2024-00001",
          applicant_name: "Jane Smith",
          email_id: "jane@example.com",
          phone_number: "+91 9876543210",
          applicant_rating: 4,
          custom_pipeline_stage: "Application Received",
          source: "LinkedIn",
          creation: "2024-04-08 10:00:00",
        },
        {
          name: "HR-APP-2024-00002",
          applicant_name: "Rahul Verma",
          email_id: "rahul@example.com",
          applicant_rating: 3,
          custom_pipeline_stage: "Application Received",
          source: "Referral",
          creation: "2024-04-09 14:30:00",
        },
        {
          name: "HR-APP-2024-00003",
          applicant_name: "Priya Nair",
          email_id: "priya@example.com",
          applicant_rating: 5,
          custom_pipeline_stage: "Application Received",
          source: "Job Portal",
          resume_link: "https://linkedin.com/in/priya",
          creation: "2024-04-10 09:15:00",
        },
      ],
      "Screening": [
        {
          name: "HR-APP-2024-00004",
          applicant_name: "Arjun Mehta",
          email_id: "arjun@example.com",
          applicant_rating: 4,
          custom_pipeline_stage: "Screening",
          source: "LinkedIn",
          creation: "2024-04-03 11:00:00",
        },
        {
          name: "HR-APP-2024-00005",
          applicant_name: "Sneha Kapoor",
          email_id: "sneha@example.com",
          applicant_rating: 3,
          custom_pipeline_stage: "Screening",
          source: "Direct",
          creation: "2024-04-04 16:45:00",
        },
      ],
      "Interview": [
        {
          name: "HR-APP-2024-00006",
          applicant_name: "Dev Patel",
          email_id: "dev@example.com",
          phone_number: "+91 9000000001",
          applicant_rating: 5,
          custom_pipeline_stage: "Interview",
          custom_current_interview_round: "Technical Round 1",
          custom_current_interview_round_name: "Technical Round 1",
          source: "LinkedIn",
          creation: "2024-03-28 10:00:00",
        },
        {
          name: "HR-APP-2024-00007",
          applicant_name: "Ananya Krishnan",
          email_id: "ananya@example.com",
          applicant_rating: 4,
          custom_pipeline_stage: "Interview",
          custom_current_interview_round: "HR Screen",
          custom_current_interview_round_name: "HR Screen",
          source: "Referral",
          creation: "2024-03-30 13:00:00",
        },
      ],
      "Offer Sent": [
        {
          name: "HR-APP-2024-00008",
          applicant_name: "Vikram Iyer",
          email_id: "vikram@example.com",
          applicant_rating: 5,
          custom_pipeline_stage: "Offer Sent",
          source: "LinkedIn",
          creation: "2024-03-20 09:00:00",
        },
      ],
      "Hired": [
        {
          name: "HR-APP-2024-00009",
          applicant_name: "Meena Sharma",
          email_id: "meena@example.com",
          applicant_rating: 5,
          custom_pipeline_stage: "Hired",
          source: "Referral",
          creation: "2024-03-10 10:00:00",
        },
      ],
      "Rejected": [
        {
          name: "HR-APP-2024-00010",
          applicant_name: "Amit Joshi",
          email_id: "amit@example.com",
          applicant_rating: 2,
          custom_pipeline_stage: "Rejected",
          source: "Direct",
          creation: "2024-04-01 10:00:00",
        },
        {
          name: "HR-APP-2024-00011",
          applicant_name: "Pooja Desai",
          email_id: "pooja@example.com",
          applicant_rating: 2,
          custom_pipeline_stage: "Rejected",
          source: "Job Portal",
          creation: "2024-04-02 12:00:00",
        },
      ],
    } as Record<string, import("./types").CandidateCard[]>)[stage] ?? [],
  })),
} as PipelineData;

export const mockCandidateDetail: CandidateDetail = {
  applicant: {
    name: "HR-APP-2024-00006",
    applicant_name: "Dev Patel",
    email_id: "dev@example.com",
    phone_number: "+91 9000000001",
    job_title: "HR-OPN-2024-0001",
    job_title_display: "Senior Backend Engineer",
    designation: "Software Engineer",
    status: "Open",
    custom_pipeline_stage: "Interview",
    custom_current_interview_round: "Technical Round 1",
    custom_rejection_reason: undefined,
    custom_internal_notes: "Strong Python background, 5 years at Razorpay.",
    applicant_rating: 5,
    source: "LinkedIn",
    cover_letter: "I am excited to apply for this role. I have 5 years of experience building scalable backend systems.",
    resume_link: "https://linkedin.com/in/devpatel",
    creation: "2024-03-28 10:00:00",
  },
  interviews: [
    {
      name: "HR-INT-2024-0001",
      interview_round: "HR Screen",
      round_name: "HR Screen",
      scheduled_on: "2024-04-02",
      from_time: "10:00:00",
      to_time: "11:00:00",
      status: "Cleared",
      average_rating: 4.0,
      interview_summary: "Strong communicator, clear about expectations.",
    },
    {
      name: "HR-INT-2024-0002",
      interview_round: "Technical Round 1",
      round_name: "Technical Round 1",
      scheduled_on: "2024-04-10",
      from_time: "14:00:00",
      to_time: "15:30:00",
      status: "Pending",
    },
  ],
  offer: null,
};

export const mockInterviewRounds: InterviewRound[] = [
  { name: "HR Screen", round_name: "HR Screen" },
  { name: "Technical Round 1", round_name: "Technical Round 1" },
  { name: "Technical Round 2", round_name: "Technical Round 2" },
  { name: "Culture Fit", round_name: "Culture Fit" },
  { name: "Final Round", round_name: "Final Round" },
];

import { JDGenerateInput, JDGenerateResult } from "./types";

export async function mockGenerateJD(input: JDGenerateInput): Promise<JDGenerateResult> {
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 3500));

  const titleGuess = input.role_description.match(/(?:senior|junior|lead|principal)?\s*([a-z]+\s+(?:engineer|developer|designer|manager|analyst|architect|scientist|consultant))/i)?.[0] ?? "Software Engineer";
  const titleFormatted = titleGuess.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");

  return {
    job_title: titleFormatted,
    department: input.role_description.toLowerCase().includes("design") ? "Design" : input.role_description.toLowerCase().includes("market") ? "Marketing" : "Engineering",
    employment_type: "Full-time",
    location: input.role_description.match(/\b([A-Z][a-z]+(?:,\s*[A-Z]{2})?)\b/)?.[0] ?? "Bangalore",
    sections: [
      {
        key: "about_company",
        title: "About the Company",
        content: "We are a fast-growing technology company building the next generation of enterprise software. Our team of 150+ engineers and designers is passionate about crafting tools that help businesses work smarter. We are backed by leading investors and serve 500+ customers across India and Southeast Asia.",
      },
      {
        key: "role_overview",
        title: "Role Overview",
        content: `We are looking for a talented ${titleFormatted} to join our growing team. In this role, you will work closely with product managers, designers, and other engineers to build scalable, high-quality systems that power our core platform. You will have significant ownership and the opportunity to shape the technical direction of key product areas.`,
      },
      {
        key: "responsibilities",
        title: "Key Responsibilities",
        content: "- Design, build, and maintain high-performance, scalable backend services\n- Collaborate with cross-functional teams to define, design, and ship new features\n- Write clean, well-documented, and tested code\n- Participate in code reviews and contribute to a strong engineering culture\n- Debug production issues and drive post-mortems\n- Mentor junior engineers and share knowledge across the team\n- Continuously improve our engineering standards, tooling, and processes",
      },
      {
        key: "required_qualifications",
        title: "Required Qualifications",
        content: "- 3–7 years of professional software engineering experience\n- Strong proficiency in Python, Go, or a comparable backend language\n- Experience designing and building RESTful APIs and microservices\n- Solid understanding of databases (PostgreSQL, MySQL) and data modeling\n- Familiarity with cloud platforms (AWS, GCP, or Azure)\n- Experience with containerization technologies (Docker, Kubernetes)\n- Strong problem-solving skills and attention to detail\n- Excellent communication skills and ability to work in a collaborative environment",
      },
      {
        key: "nice_to_have",
        title: "Nice to Have",
        content: "- Experience with event-driven architectures (Kafka, RabbitMQ)\n- Contributions to open-source projects\n- Experience in a fast-paced startup environment\n- Familiarity with ML/AI integrations\n- Prior experience with ERP or HR software",
      },
      {
        key: "what_we_offer",
        title: "What We Offer",
        content: "- Competitive salary and meaningful equity\n- Comprehensive health insurance (self + family)\n- Flexible working hours and hybrid work model\n- Annual learning & development budget of ₹50,000\n- 25 days of paid time off per year\n- MacBook Pro and home office setup allowance\n- Regular team events, offsites, and hackathons\n- Fast-tracked career growth in a high-ownership culture",
      },
      {
        key: "how_to_apply",
        title: "How to Apply",
        content: `Send your resume and a brief note about why you're excited about this role to careers@company.com with the subject line "${titleFormatted} — Application". We review every application and will get back to you within 5 business days.`,
      },
    ],
    raw_text: `${titleFormatted}\n\nA full job description has been generated. Review and edit each section before saving.`,
  };
}
