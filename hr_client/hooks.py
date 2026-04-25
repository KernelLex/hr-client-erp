app_name = "hr_client"
app_title = "HR Client"
app_publisher = "Amogh"
app_description = "Custom HR module for client"
app_email = "amoghprashanth158@gmail.com"
app_license = "mit"

# CORS — allow React frontend on same host different port
allow_cors = "*"

# Custom Fields shipped with the app (synced on bench migrate)
fixtures = [
	{
		"dt": "Custom Field",
		"filters": [
			[
				"name",
				"in",
				[
					"Job Applicant-custom_pipeline_stage",
					"Job Applicant-custom_current_interview_round",
					"Job Applicant-custom_rejection_reason",
					"Job Applicant-custom_internal_notes",
					"Job Opening-custom_interview_rounds",
				],
			]
		],
	}
]

# Auto-manage pipeline stage on existing DocType events
doc_events = {
	"Job Applicant": {
		"after_insert": "hr_client.api.recruitment.on_applicant_insert",
	},
	"Interview": {
		"after_insert": "hr_client.api.recruitment.on_interview_insert",
	},
	"Job Offer": {
		"after_insert": "hr_client.api.recruitment.on_offer_insert",
		"on_update": "hr_client.api.recruitment.on_offer_update",
	},
}

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "hr_client",
# 		"logo": "/assets/hr_client/logo.png",
# 		"title": "HR Client",
# 		"route": "/hr_client",
# 		"has_permission": "hr_client.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/hr_client/css/hr_client.css"
# app_include_js = "/assets/hr_client/js/hr_client.js"

# include js, css files in header of web template
# web_include_css = "/assets/hr_client/css/hr_client.css"
# web_include_js = "/assets/hr_client/js/hr_client.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "hr_client/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "hr_client/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "hr_client.utils.jinja_methods",
# 	"filters": "hr_client.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "hr_client.install.before_install"
# after_install = "hr_client.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "hr_client.uninstall.before_uninstall"
# after_uninstall = "hr_client.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "hr_client.utils.before_app_install"
# after_app_install = "hr_client.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "hr_client.utils.before_app_uninstall"
# after_app_uninstall = "hr_client.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "hr_client.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"hr_client.tasks.all"
# 	],
# 	"daily": [
# 		"hr_client.tasks.daily"
# 	],
# 	"hourly": [
# 		"hr_client.tasks.hourly"
# 	],
# 	"weekly": [
# 		"hr_client.tasks.weekly"
# 	],
# 	"monthly": [
# 		"hr_client.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "hr_client.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "hr_client.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "hr_client.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["hr_client.utils.before_request"]
# after_request = ["hr_client.utils.after_request"]

# Job Events
# ----------
# before_job = ["hr_client.utils.before_job"]
# after_job = ["hr_client.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"hr_client.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

