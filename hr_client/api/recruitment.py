import frappe
import json
from frappe import _

# ─── CONSTANTS ────────────────────────────────────────────────────────────────

PIPELINE_STAGES = [
	"Application Received",
	"Screening",
	"Interview",
	"Offer Sent",
	"Hired",
	"Rejected",
]

# These stages are set only by automated hooks, not by move_candidate
_SYSTEM_ONLY_STAGES = {"Offer Sent", "Hired"}

# ─── DOC EVENT HANDLERS ───────────────────────────────────────────────────────

def on_applicant_insert(doc, method=None):
	"""Set initial pipeline stage when a Job Applicant is created."""
	doc.db_set("custom_pipeline_stage", "Application Received", update_modified=False)


def on_interview_insert(doc, method=None):
	"""Move applicant to Interview stage when a new Interview is scheduled."""
	if not doc.job_applicant:
		return
	current_stage = frappe.db.get_value(
		"Job Applicant", doc.job_applicant, "custom_pipeline_stage"
	)
	# Only advance — don't move backwards from Offer Sent/Hired/Rejected
	if current_stage not in ("Offer Sent", "Hired", "Rejected", "Interview"):
		frappe.db.set_value(
			"Job Applicant",
			doc.job_applicant,
			{
				"custom_pipeline_stage": "Interview",
				"custom_current_interview_round": doc.interview_round,
			},
		)


def on_offer_insert(doc, method=None):
	"""Move applicant to Offer Sent when a Job Offer is created."""
	if not doc.job_applicant:
		return
	frappe.db.set_value(
		"Job Applicant",
		doc.job_applicant,
		"custom_pipeline_stage",
		"Offer Sent",
	)


def on_offer_update(doc, method=None):
	"""Move applicant to Hired or Rejected when Job Offer status is updated."""
	if not doc.job_applicant:
		return
	if doc.status == "Accepted":
		frappe.db.set_value(
			"Job Applicant",
			doc.job_applicant,
			{
				"custom_pipeline_stage": "Hired",
				"status": "Accepted",
			},
		)
	elif doc.status == "Rejected":
		frappe.db.set_value(
			"Job Applicant",
			doc.job_applicant,
			{
				"custom_pipeline_stage": "Rejected",
				"status": "Rejected",
			},
		)


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def _require_hr_role():
	"""Raise PermissionError if user is not HR Manager or System Manager."""
	if not {"HR Manager", "System Manager"}.intersection(set(frappe.get_roles())):
		frappe.throw(_("Only HR Manager can access recruitment features"), frappe.PermissionError)


# ─── API ENDPOINTS ────────────────────────────────────────────────────────────

@frappe.whitelist()
def get_job_openings(status=None):
	"""Return all Job Openings with per-stage applicant counts."""
	_require_hr_role()

	filters = {"status": status or "Open"}
	openings = frappe.get_all(
		"Job Opening",
		filters=filters,
		fields=["name", "job_title", "designation", "department", "status", "posted_on", "closes_on"],
		order_by="posted_on desc",
	)

	for opening in openings:
		counts = {
			stage: frappe.db.count(
				"Job Applicant",
				{"job_title": opening["name"], "custom_pipeline_stage": stage},
			)
			for stage in PIPELINE_STAGES
		}
		counts["total"] = sum(counts.values())
		opening["applicant_counts"] = counts

	return {"job_openings": openings}


@frappe.whitelist()
def get_pipeline(job_opening):
	"""Return all candidates grouped by pipeline stage for the Kanban board."""
	_require_hr_role()

	try:
		jo = frappe.get_doc("Job Opening", job_opening)
	except frappe.DoesNotExistError:
		frappe.response.http_status_code = 404
		return {"error": "Job Opening not found"}

	rounds = sorted(
		[
			{
				"sequence": r.sequence,
				"interview_round": r.interview_round,
				"round_name": r.round_name,
				"is_required": r.is_required,
			}
			for r in (jo.get("custom_interview_rounds") or [])
		],
		key=lambda x: x["sequence"] or 0,
	)

	applicant_fields = [
		"name", "applicant_name", "email_id", "phone_number",
		"applicant_rating", "custom_pipeline_stage",
		"custom_current_interview_round", "resume_attachment",
		"resume_link", "source", "creation",
	]

	stages = []
	for stage in PIPELINE_STAGES:
		applicants = frappe.get_all(
			"Job Applicant",
			filters={"job_title": job_opening, "custom_pipeline_stage": stage},
			fields=applicant_fields,
			order_by="creation asc",
		)
		for a in applicants:
			a["custom_current_interview_round_name"] = (
				frappe.db.get_value(
					"Interview Round", a["custom_current_interview_round"], "round_name"
				)
				if a.get("custom_current_interview_round")
				else None
			)
		stages.append({"stage": stage, "applicants": applicants})

	return {
		"job_opening": {
			"name": jo.name,
			"job_title": jo.job_title,
			"designation": jo.designation,
			"department": jo.department,
			"status": jo.status,
			"interview_rounds": rounds,
		},
		"stages": stages,
	}


@frappe.whitelist()
def get_candidate(name):
	"""Return full candidate details including interviews and offer."""
	_require_hr_role()

	try:
		doc = frappe.get_doc("Job Applicant", name)
	except frappe.DoesNotExistError:
		frappe.response.http_status_code = 404
		return {"error": "Applicant not found"}

	job_title_display = (
		frappe.db.get_value("Job Opening", doc.job_title, "job_title")
		if doc.job_title
		else None
	)

	interviews = frappe.get_all(
		"Interview",
		filters={"job_applicant": name},
		fields=[
			"name", "interview_round", "scheduled_on", "from_time",
			"to_time", "status", "average_rating", "interview_summary",
		],
		order_by="scheduled_on asc",
	)
	for iv in interviews:
		iv["round_name"] = (
			frappe.db.get_value("Interview Round", iv["interview_round"], "round_name")
			if iv.get("interview_round")
			else None
		)

	offer = frappe.db.get_value(
		"Job Offer",
		{"job_applicant": name},
		["name", "status", "offer_date", "designation"],
		as_dict=True,
	)

	return {
		"applicant": {
			"name": doc.name,
			"applicant_name": doc.applicant_name,
			"email_id": doc.email_id,
			"phone_number": doc.phone_number,
			"job_title": doc.job_title,
			"job_title_display": job_title_display,
			"designation": doc.designation,
			"status": doc.status,
			"custom_pipeline_stage": doc.custom_pipeline_stage,
			"custom_current_interview_round": doc.custom_current_interview_round,
			"custom_rejection_reason": doc.custom_rejection_reason,
			"custom_internal_notes": doc.custom_internal_notes,
			"applicant_rating": doc.applicant_rating,
			"source": doc.source,
			"cover_letter": doc.cover_letter,
			"resume_attachment": doc.resume_attachment,
			"resume_link": doc.resume_link,
			"creation": str(doc.creation),
		},
		"interviews": interviews,
		"offer": offer,
	}


@frappe.whitelist(methods=["POST"])
def create_job_opening(job_title, designation, department=None, description=None,
						employment_type=None, location=None, lower_range=None,
						upper_range=None, num_positions=None, interview_rounds=None):
	"""Create a new Job Opening with optional interview round sequence."""
	_require_hr_role()

	doc = frappe.new_doc("Job Opening")
	doc.job_title = job_title
	doc.designation = designation
	doc.department = department
	doc.description = description
	doc.employment_type = employment_type
	doc.location = location
	doc.status = "Open"
	doc.company = frappe.defaults.get_user_default("Company")

	if lower_range:
		doc.lower_range = float(lower_range)
	if upper_range:
		doc.upper_range = float(upper_range)
	if num_positions:
		doc.no_of_positions = int(num_positions)

	if interview_rounds:
		rounds = (
			interview_rounds
			if isinstance(interview_rounds, list)
			else json.loads(interview_rounds)
		)
		for r in rounds:
			doc.append(
				"custom_interview_rounds",
				{
					"sequence": r.get("sequence"),
					"interview_round": r.get("interview_round"),
					"is_required": r.get("is_required", 1),
				},
			)

	doc.insert()
	frappe.db.commit()

	return {
		"success": True,
		"job_opening": {
			"name": doc.name,
			"job_title": doc.job_title,
			"status": doc.status,
		},
	}


@frappe.whitelist(methods=["POST"])
def add_candidate(job_opening, applicant_name, email_id, phone_number=None,
				   source=None, cover_letter=None, resume_link=None, applicant_rating=None):
	"""Add a new candidate to a Job Opening."""
	_require_hr_role()

	jo = frappe.db.get_value(
		"Job Opening", job_opening, ["name", "status"], as_dict=True
	)
	if not jo:
		frappe.response.http_status_code = 404
		return {"error": "Job Opening not found"}
	if jo.status == "Closed":
		frappe.response.http_status_code = 400
		return {"error": "Job Opening is closed"}

	doc = frappe.new_doc("Job Applicant")
	doc.applicant_name = applicant_name
	doc.email_id = email_id
	doc.phone_number = phone_number
	doc.job_title = job_opening
	# source is a Link → Job Applicant Source; only set if the record exists
	if source and frappe.db.exists("Job Applicant Source", source):
		doc.source = source
	doc.cover_letter = cover_letter
	doc.resume_link = resume_link
	doc.status = "Open"
	if applicant_rating:
		doc.applicant_rating = float(applicant_rating)

	doc.insert()
	# on_applicant_insert hook fires after insert and sets custom_pipeline_stage
	frappe.db.commit()

	return {
		"success": True,
		"applicant": {
			"name": doc.name,
			"applicant_name": doc.applicant_name,
			"custom_pipeline_stage": "Application Received",
		},
	}


@frappe.whitelist(methods=["POST"])
def move_candidate(applicant, stage):
	"""Manually move a candidate to a different pipeline stage."""
	_require_hr_role()

	if stage not in PIPELINE_STAGES:
		frappe.response.http_status_code = 400
		return {"error": f"Invalid stage. Valid stages: {', '.join(PIPELINE_STAGES)}"}

	if stage in _SYSTEM_ONLY_STAGES:
		frappe.response.http_status_code = 400
		return {"error": f"Stage '{stage}' is managed automatically by the system"}

	if not frappe.db.exists("Job Applicant", applicant):
		frappe.response.http_status_code = 404
		return {"error": "Applicant not found"}

	frappe.db.set_value("Job Applicant", applicant, "custom_pipeline_stage", stage)
	frappe.db.commit()

	return {
		"success": True,
		"applicant": {"name": applicant, "custom_pipeline_stage": stage},
	}


@frappe.whitelist(methods=["POST"])
def reject_candidate(applicant, rejection_reason=None):
	"""Reject a candidate with an optional reason."""
	_require_hr_role()

	if not frappe.db.exists("Job Applicant", applicant):
		frappe.response.http_status_code = 404
		return {"error": "Applicant not found"}

	frappe.db.set_value(
		"Job Applicant",
		applicant,
		{
			"custom_pipeline_stage": "Rejected",
			"custom_rejection_reason": rejection_reason or "",
			"status": "Rejected",
		},
	)
	frappe.db.commit()

	return {"success": True}


@frappe.whitelist(methods=["POST"])
def schedule_interview(job_applicant, interview_round, scheduled_on, from_time, to_time):
	"""Create an Interview record for a candidate."""
	_require_hr_role()

	if not frappe.db.exists("Job Applicant", job_applicant):
		frappe.response.http_status_code = 404
		return {"error": "Applicant not found"}

	if not frappe.db.exists("Interview Round", interview_round):
		frappe.response.http_status_code = 404
		return {"error": "Interview Round not found"}

	doc = frappe.new_doc("Interview")
	doc.job_applicant = job_applicant
	doc.interview_round = interview_round
	doc.scheduled_on = scheduled_on
	doc.from_time = from_time
	doc.to_time = to_time
	doc.status = "Pending"
	doc.insert()
	# on_interview_insert hook fires — updates applicant stage to Interview
	frappe.db.commit()

	return {
		"success": True,
		"interview": {
			"name": doc.name,
			"interview_round": doc.interview_round,
			"scheduled_on": str(doc.scheduled_on),
			"status": doc.status,
		},
	}


@frappe.whitelist(methods=["POST"])
def send_offer(job_applicant, offer_date, designation, company):
	"""Create a Job Offer for a candidate."""
	_require_hr_role()

	if not frappe.db.exists("Job Applicant", job_applicant):
		frappe.response.http_status_code = 404
		return {"error": "Applicant not found"}

	existing = frappe.db.get_value("Job Offer", {"job_applicant": job_applicant}, "name")
	if existing:
		frappe.response.http_status_code = 400
		return {"error": f"A Job Offer already exists: {existing}"}

	doc = frappe.new_doc("Job Offer")
	doc.job_applicant = job_applicant
	doc.offer_date = offer_date
	doc.designation = designation
	doc.company = company
	doc.status = "Awaiting Response"
	doc.insert()
	# on_offer_insert hook fires — updates applicant stage to Offer Sent
	frappe.db.commit()

	return {
		"success": True,
		"offer": {
			"name": doc.name,
			"status": doc.status,
			"offer_date": str(doc.offer_date),
		},
	}


@frappe.whitelist(methods=["POST"])
def update_offer_status(offer, status):
	"""Accept or reject a Job Offer. Creates Employee on Accept."""
	_require_hr_role()

	if status not in ("Accepted", "Rejected"):
		frappe.response.http_status_code = 400
		return {"error": "Status must be 'Accepted' or 'Rejected'"}

	try:
		doc = frappe.get_doc("Job Offer", offer)
	except frappe.DoesNotExistError:
		frappe.response.http_status_code = 404
		return {"error": "Job Offer not found"}

	doc.status = status
	doc.save()
	# on_offer_update hook fires — updates applicant to Hired or Rejected
	frappe.db.commit()

	employee_name = None
	if status == "Accepted":
		try:
			from hrms.hr.doctype.job_offer.job_offer import make_employee
			emp_doc = make_employee(offer)
			emp_doc.insert(ignore_permissions=True)
			frappe.db.commit()
			employee_name = emp_doc.name
		except Exception:
			frappe.log_error(frappe.get_traceback(), "Recruitment: make_employee failed")

	return {"success": True, "employee": employee_name}


@frappe.whitelist()
def get_interview_rounds():
	"""Return all Interview Round masters for use in dropdowns."""
	_require_hr_role()

	rounds = frappe.get_all(
		"Interview Round",
		fields=["name", "round_name"],
		order_by="round_name asc",
	)
	return {"rounds": rounds}


@frappe.whitelist(methods=["POST"])
def update_candidate_notes(applicant, notes):
	"""Save internal HR notes on a candidate."""
	_require_hr_role()

	if not frappe.db.exists("Job Applicant", applicant):
		frappe.response.http_status_code = 404
		return {"error": "Applicant not found"}

	frappe.db.set_value("Job Applicant", applicant, "custom_internal_notes", notes)
	frappe.db.commit()

	return {"success": True}


@frappe.whitelist()
def get_applicant_sources():
	"""Return all Job Applicant Source records for use in dropdowns."""
	_require_hr_role()
	sources = frappe.get_all("Job Applicant Source", fields=["name", "source_name"], order_by="name asc")
	return {"sources": sources}


OWAIS_USERS = {"owais@veraenterprises.in", "Administrator"}


def _require_owais():
    if frappe.session.user not in OWAIS_USERS:
        frappe.throw("Admin access required", frappe.PermissionError)


@frappe.whitelist(methods=["POST"])
def close_job_opening(job_id):
    """Close a job opening (admin only)."""
    _require_owais()

    if not frappe.db.exists("Job Opening", job_id):
        frappe.response.http_status_code = 404
        return {"error": "Job Opening not found"}

    frappe.db.set_value("Job Opening", job_id, "status", "Closed")
    frappe.db.commit()
    return {"success": True}


@frappe.whitelist(methods=["POST"])
def delete_job_opening(job_id):
    """Delete a job opening and all linked applicants (admin only)."""
    _require_owais()

    if not frappe.db.exists("Job Opening", job_id):
        frappe.response.http_status_code = 404
        return {"error": "Job Opening not found"}

    applicants = frappe.db.get_all("Job Applicant", filters={"job_title": job_id}, fields=["name"])
    for app in applicants:
        interviews = frappe.db.get_all("Interview", filters={"job_applicant": app["name"]}, fields=["name"])
        for iv in interviews:
            frappe.delete_doc("Interview", iv["name"], ignore_permissions=True, force=True)
        offers = frappe.db.get_all("Job Offer", filters={"job_applicant": app["name"]}, fields=["name"])
        for offer in offers:
            frappe.delete_doc("Job Offer", offer["name"], ignore_permissions=True, force=True)
        frappe.delete_doc("Job Applicant", app["name"], ignore_permissions=True, force=True)

    frappe.delete_doc("Job Opening", job_id, ignore_permissions=True, force=True)
    frappe.db.commit()
    return {"success": True}


@frappe.whitelist()
def get_designations():
	"""Return all Designation records (Vera Enterprises roles only)."""
	_require_hr_role()
	designations = frappe.get_all("Designation", fields=["name"], order_by="name asc")
	return {"designations": [d.name for d in designations]}


@frappe.whitelist()
def get_departments():
	"""Return all Departments for Vera Enterprises."""
	_require_hr_role()
	departments = frappe.get_all(
		"Department",
		filters={"company": "Vera Enterprises"},
		fields=["name", "department_name"],
		order_by="department_name asc",
	)
	return {"departments": [{"name": d.name, "label": d.department_name} for d in departments]}
