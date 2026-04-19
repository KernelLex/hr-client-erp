# ClientERP — Master Context
_Last updated: 2026-04-19_

## INSTRUCTIONS FOR CLAUDE (READ FIRST)
You are working on a custom ERPNext v15 + Frappe HRMS system.
At the end of EVERY session you MUST:
1. Move completed tasks to "What's been built" with ✅
2. Update "In progress" with what you left off at
3. Update "What's next" with remaining tasks
4. Add new decisions to "Decisions made"
5. Add new guardrails to "DO NOT DO"
Do this automatically without being asked.

## Project
Full ERP system for a client built on ERPNext v15 + Frappe HRMS.
Starting with HR module — Forms Integration first.
Will expand to full ERP over time.

## Stack
- ERPNext v15 + Frappe HRMS
- Custom app: hr_client (extends HRMS, never modifies core)
- React + Vite + Tailwind + shadcn/ui (frontend)
- Jibble API (attendance sync)
- WSL2 local → Linux server production

## Site & Commands
- Site: hrms.localhost
- Bench: ~/frappe-bench/
- Custom app: ~/frappe-bench/apps/hr_client/
- Frontend: ~/hr-frontend/
- Start bench: cd ~/frappe-bench && bench start
- Clear cache: bench --site hrms.localhost clear-cache
- Migrate: bench --site hrms.localhost migrate
- Console: bench --site hrms.localhost console
- Restart: bench --site hrms.localhost migrate && bench --site hrms.localhost clear-cache

## ERPNext Rules (CRITICAL)
- NEVER modify files in apps/frappe/ or apps/erpnext/ or apps/hrms/
- ALWAYS extend via hr_client custom app only
- ALWAYS use Custom Fields for extending existing DocTypes
- ALWAYS run bench migrate after any DocType change
- ALWAYS run bench clear-cache after any change
- ALWAYS whitelist API methods with @frappe.whitelist()
- NEVER hardcode site name — use frappe.local.site
- ALWAYS handle frappe.exceptions properly in API methods

## Account 1 — BACKEND (this instance)
Owns: ~/frappe-bench/apps/hr_client/
- DocTypes, APIs, hooks, Jibble sync
- Writes API-Contract section below
- NEVER touches ~/hr-frontend/

## Account 2 — FRONTEND (other instance)
Owns: ~/hr-frontend/
- React components, forms, UI
- Reads API-Contract section only
- NEVER touches ~/frappe-bench/apps/hr_client/

## Modules to build (in order)
1. Forms Integration (MS Forms → ERPNext) ← START HERE
2. Recruitment
3. Employee Lifecycle
4. Performance Management
5. Attendance & Leave (Jibble)
6. Expense Management

## What's been built
(nothing yet)

## In progress
(nothing yet)

## What's next
- Create FormSubmission DocType
- Create form intake API endpoint
- Build React form renderer

## API Contract
(Account 1 fills this as endpoints are built,
Account 2 reads this before building anything)

## Decisions made
- Using shadcn/ui for all form components
- Odoo-style left sidebar
- No Frappe desk in production — pure React
- Extend HRMS via hr_client, never modify core

## DO NOT DO
- DO NOT modify core frappe/erpnext/hrms files
- DO NOT create endpoints without @frappe.whitelist()
- DO NOT run migrate without cache clear after
- DO NOT store Jibble API key in code — use site_config
- DO NOT call API endpoints not listed in API Contract
- DO NOT push directly to main branch
