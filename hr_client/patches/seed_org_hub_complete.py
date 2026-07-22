"""Seed complete Org Hub content for VE, SL, HM. Idempotent."""
import frappe

VE = "Vera Enterprises"
SL = "Schones Leben"
HM = "Hagan Modular"


def _ins(doctype, match_key, match_val, data):
    if frappe.db.exists(doctype, {match_key: match_val}):
        return
    doc = frappe.new_doc(doctype)
    doc.update(data)
    doc.flags.ignore_mandatory = True
    try:
        doc.insert(ignore_permissions=True)
    except Exception as e:
        if "Duplicate" not in str(e):
            print(f"  SKIP {doctype} {match_val}: {e}")


def execute():
    frappe.set_user("Administrator")
    _seed_jds()
    _seed_kras()
    _seed_kpis()
    _seed_sops()
    _seed_policies()
    _seed_handbook()
    _seed_ops_manual()
    _seed_processes()
    _seed_forms()
    frappe.db.commit()
    print("seed_org_hub_complete done")


# ── JOB DESCRIPTIONS ──────────────────────────────────────────────────────────

def _seed_jds():
    jds = [
        # ── VERA ENTERPRISES ──────────────────────────────────────────────────
        dict(company=VE, department="Management - V", designation="Co-founder",
             reports_to="Board of Directors",
             purpose="Provide overall strategic leadership, drive business growth, and ensure the company achieves its financial and operational objectives.",
             responsibilities="""• Define and execute the company's short-term and long-term business strategy
• Lead business development, client acquisition, and key account management
• Oversee all departments — Accounts, Sales, Logistics — and ensure alignment with company goals
• Manage relationships with key vendors, suppliers, and financial institutions
• Monitor monthly P&L, cash flow, and working capital; take corrective action as needed
• Represent the company in negotiations, contracts, and legal matters
• Build and retain a high-performing team through mentoring and performance management
• Ensure statutory compliance — GST, TDS, ROC, labour laws
• Report business performance to co-founders and stakeholders on a regular cadence""",
             qualifications="Graduate/Post-graduate in Business, Commerce, or related field. 5+ years of business leadership experience. Prior experience in trading or distribution preferred.",
             competencies="Strategic thinking, financial acumen, negotiation, leadership, stakeholder management, decision-making under uncertainty"),

        dict(company=VE, department="Accounts - V", designation="Chartered Accountant",
             reports_to="Co-founder",
             purpose="Ensure complete financial integrity, statutory compliance, and provide timely management information to support business decisions.",
             responsibilities="""• Prepare and review monthly, quarterly, and annual financial statements (P&L, Balance Sheet, Cash Flow)
• File GST returns — GSTR-1, GSTR-3B, GSTR-9 — accurately and within due dates
• Manage TDS deductions, quarterly TDS returns (Form 24Q, 26Q), and issue Form 16/16A
• Conduct internal audits and liaise with statutory auditors for annual audit
• Manage advance tax computations and income tax return filing
• Advise management on tax planning, cost optimisation, and financial risk
• Oversee accounts payable and receivable, ensure ageing is within acceptable limits
• Reconcile bank statements, vendor accounts, and customer accounts monthly
• Maintain fixed asset register and compute depreciation as per Companies Act and IT Act
• Ensure compliance with MSME payment norms and other regulatory requirements""",
             qualifications="CA (ICAI qualified). 3+ years post-qualification experience in a trading or manufacturing firm. Proficient in Tally/ERPNext and MS Excel.",
             competencies="Tax compliance, financial reporting, audit management, analytical thinking, attention to detail, deadline orientation"),

        dict(company=VE, department="Accounts - V", designation="Accounts Manager",
             reports_to="Chartered Accountant",
             purpose="Manage day-to-day accounting operations, ensure accurate books of accounts, and support the CA in compliance and reporting activities.",
             responsibilities="""• Record all accounting transactions — sales, purchases, receipts, payments — in the ERP daily
• Prepare and verify purchase invoices against POs and GRNs before booking
• Process vendor payments as per the payment schedule and maintain vendor ledger accuracy
• Follow up on outstanding receivables; prepare weekly ageing report for management
• Perform monthly bank reconciliation for all company accounts
• Prepare monthly MIS reports — revenue, expenses, outstanding debtors/creditors
• Assist CA in GST working — GSTR-2B reconciliation, input credit claims
• Maintain petty cash and prepare petty cash reconciliation weekly
• Coordinate with sales and logistics teams for invoice and delivery documentation
• Ensure proper filing and archiving of all vouchers, bills, and financial documents""",
             qualifications="B.Com / M.Com. 3+ years of accounting experience in a trading firm. Proficient in Tally or ERPNext, MS Excel. Knowledge of GST and TDS.",
             competencies="Bookkeeping accuracy, GST knowledge, vendor management, time management, MS Excel, ERP proficiency"),

        dict(company=VE, department="Accounts - V", designation="Accountant",
             reports_to="Accounts Manager",
             purpose="Handle data entry, voucher preparation, and routine accounting tasks to maintain accurate and up-to-date books of accounts.",
             responsibilities="""• Enter sales invoices, purchase bills, and expense vouchers in the ERP accurately and daily
• Verify supporting documents (bills, receipts, delivery notes) before data entry
• Prepare payment vouchers and assist in processing vendor payments
• Maintain petty cash register and submit daily petty cash reconciliation
• File physical documents — bills, vouchers, bank statements — in an organised manner
• Assist in bank reconciliation by matching transactions in ERP with bank statement
• Generate reports from ERP as directed by Accounts Manager or CA
• Follow up with vendors for pending invoices and supporting documents
• Assist in GST working — extract data from ERP for monthly GSTR preparation
• Support year-end audit by providing documents and schedules as required""",
             qualifications="B.Com / Diploma in Accounts. 1-3 years of experience in accounts data entry. Tally or ERP experience preferred.",
             competencies="Data entry accuracy, document management, basic GST knowledge, punctuality, attention to detail"),

        dict(company=VE, department="Sales - V", designation="Sales & Collection Coordinator",
             reports_to="Co-founder",
             purpose="Coordinate the end-to-end sales process, maintain customer relationships, and ensure timely collection of outstanding payments.",
             responsibilities="""• Receive customer enquiries and coordinate with sales representatives to prepare quotations
• Track and follow up on open quotations; update status in CRM
• Prepare sales orders in ERP upon order confirmation and share with logistics for dispatch
• Coordinate with accounts for invoicing and ensure invoices reach customers promptly
• Maintain a daily collection tracker; follow up with customers on overdue invoices
• Prepare weekly and monthly sales reports — order inflow, invoicing, collections
• Maintain customer master data — contact details, credit limits, payment terms
• Coordinate with logistics team for delivery schedules and resolve delivery issues
• Handle customer complaints and escalations; coordinate resolution across departments
• Support management with customer data, market insights, and competitor information""",
             qualifications="Graduate in any stream. 2+ years in sales coordination or inside sales. Proficient in MS Excel and ERP. Good communication in Kannada, Hindi, and English.",
             competencies="Customer communication, coordination, follow-up discipline, MS Excel, ERP usage, problem-solving"),

        dict(company=VE, department="Sales - V", designation="Sales Representative",
             reports_to="Sales & Collection Coordinator",
             purpose="Drive sales in the assigned territory by acquiring new customers, servicing existing accounts, and ensuring timely order booking and collection.",
             responsibilities="""• Visit existing and prospective customers in the assigned territory as per journey plan
• Present products, negotiate prices, and close sales orders as per company pricing policy
• Achieve monthly and quarterly sales targets — volume and value
• Collect payments from customers and deposit within 24 hours; maintain zero overdue
• Submit daily sales report (DSR) — visits, orders booked, collections made
• Monitor competitor activities and report market intelligence to management
• Handle customer complaints and coordinate resolution with the coordination team
• Identify new business opportunities and onboard new customers
• Ensure product visibility and relationship management at customer premises
• Attend weekly sales review meetings and present territory performance""",
             qualifications="Graduate in any stream. 1-3 years of field sales experience. Two-wheeler and valid driving licence mandatory. Fluent in Kannada.",
             competencies="Field sales, negotiation, territory management, customer relationship, self-motivation, target orientation"),

        dict(company=VE, department="Logistics - V", designation="Logistics In-charge",
             reports_to="Co-founder",
             purpose="Oversee all warehouse and logistics operations to ensure accurate inventory, timely dispatch, and cost-efficient delivery to customers.",
             responsibilities="""• Supervise receiving of goods — verify quantity and quality against PO and GRN; raise discrepancies immediately
• Manage warehouse layout and ensure FIFO (First In First Out) is followed for all stock
• Coordinate dispatch of sales orders — prepare delivery challans, arrange transport, ensure on-time delivery
• Conduct weekly cycle counts and monthly full stock count; report variances to management
• Maintain inventory records in ERP — ensure real-time accuracy of stock quantities and locations
• Coordinate with vendors for timely material delivery and manage inbound logistics
• Monitor transport costs and negotiate with transporters for competitive rates
• Ensure warehouse hygiene, safety, and proper storage of all materials
• Supervise Material Shifting In-charge and daily labour; assign work and monitor output
• Report daily dispatch summary and weekly inventory status to management""",
             qualifications="Graduate. 3+ years in warehouse/logistics operations. Experience with ERP inventory module. Knowledge of Bengaluru transport routes preferred.",
             competencies="Inventory management, warehouse operations, team supervision, ERP usage, cost control, time management"),

        dict(company=VE, department="Logistics - V", designation="Material Shifting In-charge",
             reports_to="Logistics In-charge",
             purpose="Supervise physical material movement within the warehouse — loading, unloading, and internal shifting — ensuring accuracy and safety.",
             responsibilities="""• Supervise loading and unloading of vehicles; verify material count against delivery challan / GRN
• Direct daily labour in material shifting, stacking, and rearrangement as per instructions
• Ensure materials are stored in designated locations and labelled correctly
• Report damages, shortages, or discrepancies immediately to Logistics In-charge
• Maintain cleanliness and orderliness of the warehouse floor at all times
• Assist in conducting cycle counts and physical stock verification
• Ensure no material leaves the warehouse without proper documentation (delivery challan)
• Maintain daily activity log — materials received, dispatched, and shifted
• Follow all safety norms — PPE usage, safe stacking heights, forklift/trolley safety
• Report any equipment defects or safety hazards immediately""",
             qualifications="10th / 12th pass. 2+ years in warehouse operations. Physically fit. Knowledge of basic stock documentation.",
             competencies="Physical fitness, attention to detail, team leadership, safety awareness, basic documentation"),

        # ── SCHONES LEBEN ─────────────────────────────────────────────────────
        dict(company=SL, department="Management - SL", designation="Co-founder",
             reports_to="Board",
             purpose="Lead Schones Leben's business strategy, client relationships, and ensure delivery of premium interior design and installation services.",
             responsibilities="""• Define business direction, service offerings, and pricing strategy for Schones Leben
• Develop and maintain relationships with high-value clients, architects, and developers
• Lead business development — identify new project opportunities, attend client pitches
• Oversee project pipeline — ensure all projects are on schedule, budget, and quality
• Monitor financials — revenue, project margins, outstanding payments
• Build and develop the team — designers, project managers, carpenters
• Establish quality standards and ensure all deliverables meet the Schones Leben brand promise
• Manage vendor and subcontractor relationships; negotiate contracts
• Handle escalated client issues and ensure resolution
• Drive showroom footfall and brand visibility in the Bengaluru interior design market""",
             qualifications="Graduate/Post-graduate. Background in interior design, architecture, or business. 5+ years in the interior design or real estate sector.",
             competencies="Business acumen, client management, design sensibility, leadership, financial oversight, negotiation"),

        dict(company=SL, department="Designing - SL", designation="Design Head",
             reports_to="Co-founder",
             purpose="Lead the design team to create innovative, client-centric interior design concepts that deliver aesthetic excellence and functional spaces.",
             responsibilities="""• Lead and mentor the interior design team; review and approve all design concepts before client presentation
• Develop design concepts based on client briefs — space planning, material palettes, lighting, furniture
• Conduct client consultation meetings; understand lifestyle, taste, and budget requirements
• Create detailed working drawings, 3D renders, and material specifications using AutoCAD / SketchUp / 3ds Max
• Source and approve materials, finishes, and furniture in line with design concept and client budget
• Coordinate with project managers to ensure design intent is faithfully executed on site
• Manage design revisions — ensure changes are documented and client-approved before implementation
• Develop and maintain the material library — tiles, fabrics, laminates, hardware, lighting
• Prepare design presentations — mood boards, layouts, 3D visualisations
• Stay updated on interior design trends, materials, and industry developments""",
             qualifications="B.Des / B.Arch / Diploma in Interior Design. 5+ years of experience in residential and commercial interiors. Proficient in AutoCAD, SketchUp, 3ds Max, and MS Office.",
             competencies="Design creativity, technical drawing, client communication, team leadership, material knowledge, project coordination"),

        dict(company=SL, department="Designing - SL", designation="Interior Designer",
             reports_to="Design Head",
             purpose="Design functional and aesthetically pleasing interior spaces based on client briefs and execute designs in coordination with the project team.",
             responsibilities="""• Conduct site visits and take accurate measurements of spaces to be designed
• Prepare design concepts — space plans, mood boards, material specifications — based on client brief
• Develop detailed drawings — floor plans, elevations, section drawings — in AutoCAD
• Create 3D visualisations and render design presentations for client approval
• Prepare BOQ (Bill of Quantities) for design scope — furniture, finishes, fittings
• Source materials, finishes, and furniture — obtain samples and quotations from vendors
• Coordinate with project manager and carpentry team to ensure design execution on site
• Visit sites during execution to monitor quality and adherence to design intent
• Manage design revisions based on client feedback; update drawings and specifications accordingly
• Maintain project documentation — design briefs, approval records, change orders""",
             qualifications="B.Des / Diploma in Interior Design. 2+ years of experience in interior design. AutoCAD mandatory; SketchUp/3ds Max preferred.",
             competencies="Spatial design, AutoCAD drafting, 3D visualisation, client interaction, material knowledge, coordination"),

        dict(company=SL, department="Operations - SL", designation="Operation Manager",
             reports_to="Co-founder",
             purpose="Manage day-to-day operations of Schones Leben — showroom, procurement, vendor management, and ensure seamless project execution.",
             responsibilities="""• Oversee showroom operations — walk-in client management, sample display maintenance, vendor meet coordination
• Manage procurement — raise POs for materials as per project requirements, track deliveries
• Maintain vendor database and evaluate vendor performance on quality, delivery, and pricing
• Coordinate material delivery to project sites with logistics and project teams
• Manage office administration — utility payments, petty cash, staff attendance
• Prepare monthly operational reports — project status, material procurement, expense tracking
• Handle subcontractor agreements — carpentry, electrical, plumbing — coordination and billing
• Support Design Head and Project Managers in documentation and client communication
• Ensure showroom is clean, well-maintained, and product displays are updated regularly
• Manage after-sales service requests — coordinate resolution and follow up with clients""",
             qualifications="Graduate in Business/Commerce. 3+ years in operations management in an interior design, construction, or real estate firm.",
             competencies="Operations management, vendor management, procurement, coordination, MS Office, problem-solving"),

        dict(company=SL, department="Projects - SL", designation="Project Manager",
             reports_to="Operation Manager",
             purpose="Manage interior design projects from concept approval through to final handover, ensuring on-time, on-budget, and quality delivery.",
             responsibilities="""• Prepare detailed project plan — scope, timeline, milestones, material procurement schedule
• Coordinate with designers to understand design intent and translate to execution on site
• Manage site contractors — carpentry, electrical, plumbing, painting — and ensure work is per specification
• Conduct daily site inspections; maintain daily site progress report (SPR)
• Identify and resolve on-site issues — material shortage, quality defects, scope changes
• Communicate project status to client proactively; manage client expectations
• Control project budget — monitor actual vs planned costs; flag overruns early
• Prepare and manage punch list at project completion; ensure all snag items are closed before handover
• Coordinate final site cleaning and ensure handover documents are complete — handover checklist, warranties, maintenance guide
• Manage subcontractor billing — verify work completion before approving invoices""",
             qualifications="Graduate in Civil / Architecture / Interior Design. 3+ years of site project management. Experience with residential and commercial fit-outs.",
             competencies="Project planning, site management, client communication, cost control, problem-solving, leadership"),

        dict(company=SL, department="Carpentry - SL", designation="Carpenter",
             reports_to="Project Manager",
             purpose="Fabricate and install high-quality woodwork and furniture as per design specifications and drawings.",
             responsibilities="""• Read and interpret design drawings, elevations, and cutting lists
• Fabricate wardrobes, cabinets, TV units, modular kitchen components, and other woodwork as specified
• Cut, shape, and finish wood, MDF, plywood, and laminates using hand tools and power tools
• Ensure joints, edges, and finishes meet quality standards — no gaps, clean edges, smooth surfaces
• Install fabricated furniture and woodwork on site — anchoring, levelling, alignment
• Apply laminates, veneers, and PU finishes as per design requirement
• Fit hardware — hinges, handles, drawer channels, soft-close mechanisms
• Follow safety norms — PPE usage, safe use of power tools, dust management
• Coordinate with Project Manager on daily work plan and material requirements
• Report material shortages, quality issues, and site obstacles to Project Manager""",
             qualifications="ITI in Carpentry or 5+ years of hands-on carpentry experience. Experience with modular furniture and interior woodwork preferred.",
             competencies="Carpentry skills, drawing reading, quality consciousness, tool proficiency, safety awareness"),

        dict(company=SL, department="Carpentry - SL", designation="Carpenter Helper",
             reports_to="Carpenter",
             purpose="Assist the lead carpenter in fabrication and installation activities to ensure smooth and efficient execution of woodwork.",
             responsibilities="""• Assist carpenter in cutting, shaping, and assembling wood panels as directed
• Handle and transport materials on site safely — carry boards, tools, hardware
• Prepare work area — clear space, lay protective sheets, ensure tools are available
• Sand surfaces, apply primer or base coat as instructed by carpenter
• Fetch materials, hardware, and tools as required during work
• Clean work area at the end of each shift — dispose of waste, store tools safely
• Hold panels and components steady during cutting, drilling, or assembly
• Follow all safety instructions — PPE usage, safe material handling
• Report any material damage or shortage to the lead carpenter immediately""",
             qualifications="8th / 10th pass. Basic familiarity with carpentry tools. Physically fit. Willing to learn.",
             competencies="Physical fitness, tool handling, teamwork, safety awareness, willingness to learn"),

        # ── HAGAN MODULAR ─────────────────────────────────────────────────────
        dict(company=HM, department="Management - HM", designation="Co-founder",
             reports_to="Board",
             purpose="Lead Hagan Modular's manufacturing operations, business development, and ensure the factory delivers quality modular furniture on schedule.",
             responsibilities="""• Define product strategy, capacity planning, and capital investment decisions for the factory
• Drive business development — acquire new clients (interior designers, builders, retailers)
• Oversee production planning, quality standards, and operational efficiency
• Monitor factory KPIs — daily output, rejection rate, machine OEE, on-time delivery
• Manage relationships with raw material vendors — MDF, HDF, laminates, hardware
• Ensure financial health — revenue, margins, cash flow, working capital
• Build and manage the manufacturing team — production managers, supervisors, operators
• Ensure factory safety and statutory compliance — factory act, PF/ESI, pollution norms
• Lead product development — new designs, finishes, and product catalogue updates
• Report business performance and growth plans to co-founders/investors""",
             qualifications="Graduate in Engineering/Business or Diploma in Mechanical/Woodworking. 5+ years in furniture manufacturing or related industry.",
             competencies="Manufacturing leadership, business development, financial management, production planning, team building"),

        dict(company=HM, department="Designing - HM", designation="Design Head",
             reports_to="Co-founder",
             purpose="Design modular furniture products and translate client requirements into precise production-ready drawings and cutting lists.",
             responsibilities="""• Develop new modular furniture designs — wardrobes, kitchens, TV units, storage systems
• Prepare detailed production drawings — elevations, sections, hardware specifications
• Generate cutting lists (nesting plans) optimised for minimum material wastage
• Liaise with Production Manager to ensure designs are manufacturable within capability
• Handle custom client orders — understand requirements, prepare design, obtain approval before production
• Maintain and update the product catalogue with new designs, dimensions, and finish options
• Coordinate with vendors for new materials, laminates, and hardware samples
• Provide technical guidance to production team during fabrication of complex designs
• Maintain design library — all approved drawings, cutting lists, and hardware BOQs
• Stay updated on global modular furniture trends and introduce innovations to the product range""",
             qualifications="Diploma / B.Tech in Furniture Design, Mechanical, or Interior Design. Proficient in AutoCAD and CNC programming software. 3+ years in furniture/modular manufacturing.",
             competencies="Product design, AutoCAD/CNC programming, nesting optimisation, technical drawing, manufacturing knowledge"),

        dict(company=HM, department="Manufacturing - HM", designation="Production Manager",
             reports_to="Co-founder",
             purpose="Plan and manage the end-to-end production process to achieve output targets, quality standards, and delivery schedules.",
             responsibilities="""• Prepare daily and weekly production plans based on order backlog and delivery commitments
• Allocate work to production supervisors and operators; monitor shift-wise progress
• Monitor machine utilisation, identify bottlenecks, and implement process improvements
• Ensure raw material availability — coordinate with procurement for timely material supply
• Track key production metrics — units produced, rejection rate, material wastage, machine downtime
• Lead quality reviews — inspect finished goods, identify root causes of defects, implement corrective actions
• Manage preventive maintenance schedule for all machines — Panel Saw, CNC, Edgebander
• Coordinate with Design Head for production drawings and cutting lists
• Prepare production reports — daily output, weekly summary, monthly performance review
• Enforce safety norms — conduct daily toolbox talks, ensure PPE compliance, maintain accident log""",
             qualifications="Diploma/B.Tech in Mechanical / Production Engineering. 5+ years in furniture or wood product manufacturing. Experience with CNC and panel processing machines.",
             competencies="Production planning, quality management, machine knowledge, team management, data-driven decision making, safety management"),

        dict(company=HM, department="Manufacturing - HM", designation="Production Supervisor",
             reports_to="Production Manager",
             purpose="Supervise the factory floor to achieve daily production targets while maintaining quality and safety standards.",
             responsibilities="""• Supervise all operators and helpers on the factory floor during the shift
• Assign work to operators as per daily production plan provided by Production Manager
• Monitor machine performance during the shift — report breakdowns immediately for maintenance
• Conduct visual quality checks at each stage — cutting, edgebanding, assembly
• Ensure correct cutting lists and drawings are being used for each job
• Maintain production log — quantities produced, materials consumed, reject quantities per shift
• Enforce safety rules — PPE usage, no loose clothing near machines, safe material handling
• Conduct pre-shift machine safety checks with operators before starting production
• Manage material flow on the floor — ensure materials are available at each workstation
• Report daily shift summary to Production Manager — output, issues, observations""",
             qualifications="Diploma in Mechanical / Production or 5+ years of factory supervisory experience. Knowledge of panel furniture manufacturing machines.",
             competencies="Team supervision, production monitoring, quality awareness, safety enforcement, shift reporting"),

        dict(company=HM, department="Manufacturing - HM", designation="Panel Saw Operator",
             reports_to="Production Supervisor",
             purpose="Operate the panel saw machine to cut boards (MDF, plywood, HDF) to specified dimensions as per cutting list with minimum wastage.",
             responsibilities="""• Read and interpret cutting lists accurately before starting each job
• Set up the panel saw — adjust fence, scoring blade, and main blade to required dimensions
• Cut boards to specified sizes following the nesting plan for minimum wastage
• Conduct pre-shift safety checks — blade guard in position, emergency stop functional, table clean
• Label each cut panel with job number, dimension, and quantity immediately after cutting
• Stack cut panels safely and in an organised manner for the next process
• Report any blade defects, machine malfunctions, or unusual sounds to supervisor immediately
• Maintain panel saw cleanliness — remove sawdust from table and guides after each job
• Ensure no material is cut without a matching cutting list entry
• Follow all safety norms — PPE (safety glasses, ear protection, dust mask) at all times near the machine""",
             qualifications="ITI/Diploma or 3+ years operating a beam saw / sliding table saw in a furniture manufacturing unit. Ability to read cutting lists.",
             competencies="Panel saw operation, cutting list reading, material optimisation, machine safety, accuracy"),

        dict(company=HM, department="Manufacturing - HM", designation="CNC Machine Operator",
             reports_to="Production Supervisor",
             purpose="Operate the CNC routing/boring machine to produce precise cuts, holes, and profiles as per design specifications.",
             responsibilities="""• Load CNC programs from the design system onto the machine controller for each job
• Set up the CNC machine — fix tooling, set work zero point, verify program before running
• Load panels onto the CNC table, secure with vacuum/clamps, and run the program
• Monitor machine during operation — verify cut quality after first piece (first-off inspection)
• Identify and correct toolpath issues — incorrect depth, missed operations, tool chatter
• Change tools (router bits, boring heads) as per tool life schedule
• Conduct pre-shift checks — vacuum system, tool condition, X/Y/Z axis movement
• Maintain production log — job number, quantity processed, start/end time
• Clean machine after each job — remove chips from table and vacuum holes
• Report machine errors, tool breakages, and quality defects immediately to supervisor""",
             qualifications="ITI/Diploma in Mechanical/Electronics or 3+ years operating a CNC woodworking machine. Experience with Biesse, Homag, or SCM machines preferred.",
             competencies="CNC operation, program loading, tooling management, precision, machine safety, quality checking"),

        dict(company=HM, department="Manufacturing - HM", designation="Edgeband Machine Operator",
             reports_to="Production Supervisor",
             purpose="Operate the edgebanding machine to apply edge tape to all exposed panel edges for a clean, durable finish.",
             responsibilities="""• Set up the edgebanding machine for the required edge tape type and thickness (0.4mm, 1mm, 2mm ABS/PVC)
• Load edge tape rolls correctly and ensure glue pot is at the correct temperature before starting
• Feed panels through the machine ensuring correct panel face orientation and tight edge contact
• Monitor edge bonding quality — check for glue squeeze-out, gaps, or lifting after application
• Trim and buff edges using the trimming and scraping units; inspect finished edge quality
• Clean glue residue from rollers, pressure pads, and trimming units after each material change
• Conduct pre-shift checks — glue level, temperature, blade sharpness, roller condition
• Organise edgebanded panels for next process and label with job number
• Report machine malfunctions, edge quality issues, or material shortages to supervisor
• Follow safety norms — PPE, safe handling of hot glue pots, no loose clothing near rollers""",
             qualifications="ITI or 2+ years operating an edgebanding machine in furniture manufacturing. Experience with hot-melt glue edgebanders.",
             competencies="Edgebanding operation, glue management, quality inspection, machine maintenance, safety compliance"),

        dict(company=HM, department="Manufacturing - HM", designation="Helper",
             reports_to="Production Supervisor",
             purpose="Support production activities — material movement, machine feeding, panel stacking, and workshop housekeeping.",
             responsibilities="""• Move raw material boards from storage to machine stations as directed by supervisor
• Feed panels to machine operators and receive processed panels for stacking
• Stack finished panels safely — correct height, no damage to edges or surfaces
• Transport finished panels to the packing/dispatch area using trolleys
• Maintain factory floor cleanliness — sweep sawdust, dispose of edge trim waste
• Assist in loading and unloading of material deliveries and dispatch trucks
• Organise hardware, edge tape rolls, and consumables at work stations
• Follow all safety rules — PPE at all times, safe stacking, clear aisles
• Report any damaged materials, safety hazards, or equipment issues to supervisor
• Assist in cycle count and inventory activities as directed""",
             qualifications="8th / 10th pass. Physically fit. Willing to work in a factory environment. Basic understanding of safety rules.",
             competencies="Physical fitness, reliability, teamwork, safety compliance, following instructions"),

        dict(company=HM, department="Manufacturing - HM", designation="Semi Carpenter",
             reports_to="Production Supervisor",
             purpose="Perform intermediate carpentry tasks — drilling, dowelling, hardware fitting, and panel assembly.",
             responsibilities="""• Drill holes for dowels, hinges, and hardware as per assembly drawings
• Insert dowels, screws, and cam locks for panel assembly
• Assemble cabinet carcasses — base, sides, top, back panels
• Fit hinges, drawer channels, soft-close mechanisms, and other hardware
• Inspect assembled units for squareness, panel alignment, and hardware function
• Report broken or damaged panels, defective hardware to supervisor
• Use hand tools — screwdrivers, drills, mallets — safely and correctly
• Prepare assembled units for dispatch — wrap or pack as per instruction
• Maintain work area cleanliness after each assembly job""",
             qualifications="ITI in Carpentry or 2+ years of furniture assembly experience. Ability to read assembly drawings. Familiar with standard hardware.",
             competencies="Assembly skills, hardware fitting, drawing reading, quality awareness, tool safety"),

        dict(company=HM, department="Carpentry - HM", designation="Carpenter",
             reports_to="Production Supervisor",
             purpose="Perform skilled carpentry tasks for custom and site-specific woodwork in the factory and at client sites.",
             responsibilities="""• Fabricate custom furniture components as per design drawings
• Cut, shape, joint, and assemble wood, MDF, and plywood panels using hand and power tools
• Apply laminates, veneers, and edge finishes to a high standard
• Fit hardware — hinges, drawer systems, handles, locks
• Install furniture on-site when required — ensure alignment, levelling, and fixing
• Inspect finished work for quality — no gaps, clean edges, correct dimensions
• Follow safe tool usage — PPE, blade guards, dust extraction
• Maintain tools in good working condition; report defective tools to supervisor
• Coordinate with Production Supervisor on material requirements and work schedule""",
             qualifications="ITI in Carpentry or 5+ years of experience. Able to read design drawings. Experience in modular and site carpentry.",
             competencies="Carpentry skills, tool proficiency, drawing reading, quality consciousness, safety"),

        dict(company=HM, department="Security - HM", designation="Security",
             reports_to="Production Manager",
             purpose="Protect factory premises, personnel, and assets; control access and maintain a safe and secure environment.",
             responsibilities="""• Man the factory gate — control entry and exit of personnel, vehicles, and materials
• Verify and record all visitor and contractor details in the visitor register before allowing entry
• Inspect incoming vehicles for materials vs documentation (delivery challans, POs)
• Inspect outgoing vehicles — verify dispatch documentation matches materials loaded
• Monitor factory premises through CCTV and conduct regular rounds during shift
• Maintain security log — shift-wise entry, incidents, visitor log
• Report any suspicious activity, unauthorised entry attempts, or safety hazards immediately
• Ensure factory gate is locked outside working hours; manage key register
• Respond to emergencies — raise alarm, call for assistance, guide emergency services
• Ensure no factory assets, materials, or tools leave without proper authorisation""",
             qualifications="10th pass. Ex-serviceman or 2+ years of security/guard experience preferred. Ability to read and write in Kannada.",
             competencies="Vigilance, access control, record-keeping, emergency response, reliability, integrity"),
    ]
    for jd in jds:
        jd["jd_title"] = f"{jd['designation']} — {jd['company']}"
        _ins("VE Job Description", "jd_title", jd["jd_title"], jd)


# ── KRAs ──────────────────────────────────────────────────────────────────────

def _seed_kras():
    kras = [
        # VE – Chartered Accountant
        dict(company=VE, department="Accounts - V", designation="Chartered Accountant",
             kra_title="GST & TDS Compliance", description="Ensure timely and accurate filing of all GST returns (GSTR-1, GSTR-3B, GSTR-9) and TDS returns (24Q, 26Q). Zero penalties or notices from GST/TDS authorities.",
             weightage=30, measurement_criteria="Filing date vs due date; notices received", target="100% on-time, 0 notices", frequency="Monthly"),
        dict(company=VE, department="Accounts - V", designation="Chartered Accountant",
             kra_title="Financial Reporting Accuracy", description="Produce monthly P&L, Balance Sheet, and Cash Flow statements that are accurate and provided by the 7th of each month.",
             weightage=25, measurement_criteria="Report delivery date; error rate in statements", target="By 7th of month, 0 errors", frequency="Monthly"),
        dict(company=VE, department="Accounts - V", designation="Chartered Accountant",
             kra_title="Accounts Receivable Management", description="Maintain debtor outstanding within 30 days average. Follow up with Accounts team on overdue accounts.",
             weightage=20, measurement_criteria="Average debtor days; % overdue > 45 days", target="< 30 avg days; 0% > 60 days", frequency="Monthly"),
        dict(company=VE, department="Accounts - V", designation="Chartered Accountant",
             kra_title="Tax Planning & Advisory", description="Provide quarterly tax planning advice to management on advance tax, optimisation opportunities, and regulatory changes.",
             weightage=15, measurement_criteria="Advance tax deposited on time; advisory meetings held", target="On-time deposits; 1 advisory/quarter", frequency="Quarterly"),
        dict(company=VE, department="Accounts - V", designation="Chartered Accountant",
             kra_title="Audit Readiness", description="Maintain books in audit-ready condition. Complete statutory audit within 3 months of year-end with clean or qualified opinion.",
             weightage=10, measurement_criteria="Audit completion date; observations raised", target="Within 3 months of year end; < 3 major observations", frequency="Annual"),

        # VE – Accounts Manager
        dict(company=VE, department="Accounts - V", designation="Accounts Manager",
             kra_title="Daily Voucher Entry", description="Ensure all accounting transactions are entered in ERP same day with supporting documents attached.",
             weightage=25, measurement_criteria="Same-day entry rate; pending vouchers count", target="100% same day; 0 pending at month-end", frequency="Monthly"),
        dict(company=VE, department="Accounts - V", designation="Accounts Manager",
             kra_title="Bank Reconciliation", description="Complete monthly bank reconciliation for all accounts by the 5th of the following month.",
             weightage=20, measurement_criteria="Reconciliation completion date; unreconciled items", target="By 5th; 0 unreconciled items > 7 days", frequency="Monthly"),
        dict(company=VE, department="Accounts - V", designation="Accounts Manager",
             kra_title="Vendor Payment Processing", description="Process all vendor payments within agreed payment terms. No overdue payables beyond terms.",
             weightage=25, measurement_criteria="Payment turnaround vs terms; overdue payables count", target="Within terms for 100% of vendors", frequency="Monthly"),
        dict(company=VE, department="Accounts - V", designation="Accounts Manager",
             kra_title="MIS Reporting", description="Prepare and submit weekly debtors/creditors ageing report and monthly MIS to management.",
             weightage=15, measurement_criteria="Report delivery date; accuracy of figures", target="Weekly ageing by Monday; monthly MIS by 7th", frequency="Monthly"),
        dict(company=VE, department="Accounts - V", designation="Accounts Manager",
             kra_title="GST Working Assistance", description="Prepare GSTR-2B reconciliation and provide input credit data to CA by the 12th of each month.",
             weightage=15, measurement_criteria="Data submission date; reconciliation accuracy", target="By 12th of each month; 0 mismatches", frequency="Monthly"),

        # VE – Sales Representative
        dict(company=VE, department="Sales - V", designation="Sales Representative",
             kra_title="Sales Target Achievement", description="Achieve monthly and quarterly revenue targets for the assigned territory.",
             weightage=40, measurement_criteria="Actual sales vs monthly target (%)", target=">= 100% of monthly target", frequency="Monthly"),
        dict(company=VE, department="Sales - V", designation="Sales Representative",
             kra_title="New Customer Acquisition", description="Identify and onboard new customers in the assigned territory.",
             weightage=20, measurement_criteria="New accounts added per month", target=">= 3 new accounts/month", frequency="Monthly"),
        dict(company=VE, department="Sales - V", designation="Sales Representative",
             kra_title="Collection Efficiency", description="Collect payments from customers within credit period. Zero overdue outstanding.",
             weightage=25, measurement_criteria="Collection vs billing (%); overdue > 30 days", target=">= 95% collection; 0% overdue > 30 days", frequency="Monthly"),
        dict(company=VE, department="Sales - V", designation="Sales Representative",
             kra_title="Customer Visit Frequency", description="Execute territory journey plan — visit existing customers as per frequency norms.",
             weightage=15, measurement_criteria="Visits vs plan; DSR submission rate", target=">= 90% plan adherence; DSR submitted daily", frequency="Monthly"),

        # VE – Logistics In-charge
        dict(company=VE, department="Logistics - V", designation="Logistics In-charge",
             kra_title="On-Time Dispatch", description="Ensure all confirmed sales orders are dispatched within the committed delivery timeline.",
             weightage=35, measurement_criteria="Orders dispatched on time vs total orders (%)", target=">= 95% on-time dispatch", frequency="Monthly"),
        dict(company=VE, department="Logistics - V", designation="Logistics In-charge",
             kra_title="Inventory Accuracy", description="Maintain ERP stock records that match physical stock. Conduct weekly cycle counts.",
             weightage=30, measurement_criteria="ERP vs physical variance (%)", target="< 1% variance on cycle count", frequency="Monthly"),
        dict(company=VE, department="Logistics - V", designation="Logistics In-charge",
             kra_title="Material Damage Control", description="Minimise material damage during storage and handling.",
             weightage=20, measurement_criteria="Damage incidents per month; value of damaged goods", target="0 avoidable damage incidents", frequency="Monthly"),
        dict(company=VE, department="Logistics - V", designation="Logistics In-charge",
             kra_title="Logistics Cost Management", description="Control inbound and outbound logistics costs within the approved budget.",
             weightage=15, measurement_criteria="Logistics cost as % of sales vs budget", target="Within budget; optimise by 5% YoY", frequency="Monthly"),

        # SL – Project Manager
        dict(company=SL, department="Projects - SL", designation="Project Manager",
             kra_title="On-Time Project Delivery", description="Deliver all assigned projects by the committed handover date.",
             weightage=35, measurement_criteria="Projects delivered on time vs total projects (%)", target=">= 90% on-time delivery", frequency="Monthly"),
        dict(company=SL, department="Projects - SL", designation="Project Manager",
             kra_title="Budget Adherence", description="Complete projects within the approved project budget. Flag overruns early.",
             weightage=25, measurement_criteria="Actual cost vs approved budget (%)", target="< 5% overrun", frequency="Quarterly"),
        dict(company=SL, department="Projects - SL", designation="Project Manager",
             kra_title="Client Satisfaction Score", description="Achieve high client satisfaction at project handover.",
             weightage=25, measurement_criteria="Post-handover client satisfaction survey score", target=">= 4.5 / 5", frequency="Quarterly"),
        dict(company=SL, department="Projects - SL", designation="Project Manager",
             kra_title="Snagging Items at Handover", description="Minimise pending snagging/defect items at time of handover.",
             weightage=15, measurement_criteria="Open snag items at handover", target="<= 3 items at handover", frequency="Quarterly"),

        # SL – Interior Designer
        dict(company=SL, department="Designing - SL", designation="Interior Designer",
             kra_title="First-Pass Design Approval", description="Get client approval on design concept in the first or second presentation.",
             weightage=30, measurement_criteria="% designs approved in first/second presentation", target=">= 80% first-pass approval", frequency="Quarterly"),
        dict(company=SL, department="Designing - SL", designation="Interior Designer",
             kra_title="Design Delivery Timeline", description="Submit design concept within 7 working days of receiving the client brief.",
             weightage=25, measurement_criteria="Design submission date vs brief received date", target="<= 7 working days", frequency="Quarterly"),
        dict(company=SL, department="Designing - SL", designation="Interior Designer",
             kra_title="Design Revision Count", description="Keep design revisions per project within acceptable limits.",
             weightage=25, measurement_criteria="Average revisions per project", target="<= 3 revisions per project", frequency="Quarterly"),
        dict(company=SL, department="Designing - SL", designation="Interior Designer",
             kra_title="BOQ Accuracy", description="Prepare Bill of Quantities that are within 5% of actual project material cost.",
             weightage=20, measurement_criteria="BOQ estimate vs actual material cost (%)", target="< 5% variance", frequency="Quarterly"),

        # HM – Production Manager
        dict(company=HM, department="Manufacturing - HM", designation="Production Manager",
             kra_title="Production Output vs Plan", description="Achieve daily and weekly production targets as per the production plan.",
             weightage=35, measurement_criteria="Actual units produced vs planned (%)", target=">= 95% plan achievement", frequency="Monthly"),
        dict(company=HM, department="Manufacturing - HM", designation="Production Manager",
             kra_title="Quality Rejection Rate", description="Maintain finished goods quality rejection rate within target.",
             weightage=25, measurement_criteria="Rejected units / total units produced (%)", target="<= 2% rejection rate", frequency="Monthly"),
        dict(company=HM, department="Manufacturing - HM", designation="Production Manager",
             kra_title="Machine OEE (Overall Equipment Effectiveness)", description="Maximise productive utilisation of all machines.",
             weightage=20, measurement_criteria="OEE % per machine (Availability x Performance x Quality)", target=">= 80% OEE", frequency="Monthly"),
        dict(company=HM, department="Manufacturing - HM", designation="Production Manager",
             kra_title="Material Wastage", description="Control raw material wastage through optimised nesting and handling.",
             weightage=20, measurement_criteria="Material consumed vs standard BOQ (%)", target="<= 5% wastage above standard", frequency="Monthly"),

        # HM – Production Supervisor
        dict(company=HM, department="Manufacturing - HM", designation="Production Supervisor",
             kra_title="Shift Output Target", description="Achieve daily shift production quantity as per plan.",
             weightage=40, measurement_criteria="Shift output vs target (units)", target=">= 95% of shift target", frequency="Monthly"),
        dict(company=HM, department="Manufacturing - HM", designation="Production Supervisor",
             kra_title="Safety Compliance", description="Ensure 100% PPE compliance and zero safety incidents on the shift.",
             weightage=25, measurement_criteria="PPE compliance rate (%); incidents count", target="100% PPE; 0 incidents", frequency="Monthly"),
        dict(company=HM, department="Manufacturing - HM", designation="Production Supervisor",
             kra_title="Defect Rate at Inspection", description="Maintain in-process defect rate within acceptable limits.",
             weightage=20, measurement_criteria="Defects identified at in-process check / units inspected (%)", target="<= 3% defect rate", frequency="Monthly"),
        dict(company=HM, department="Manufacturing - HM", designation="Production Supervisor",
             kra_title="Report Submission", description="Submit accurate daily shift production report by end of shift.",
             weightage=15, measurement_criteria="Report submitted on time; accuracy of entries", target="100% on-time, 0 data errors", frequency="Monthly"),
    ]
    for kra in kras:
        _ins("VE KRA", "kra_title", kra["kra_title"] + "|" + kra.get("company", ""), kra)


# ── KPIs ──────────────────────────────────────────────────────────────────────

def _seed_kpis():
    kpis = [
        # VE – Accounts Manager
        dict(company=VE, department="Accounts - V", designation="Accounts Manager",
             kpi_name="Vouchers Entered Same Day", unit="%", target_value="100", frequency="Monthly", data_source="ERP transaction log"),
        dict(company=VE, department="Accounts - V", designation="Accounts Manager",
             kpi_name="Bank Reconciliation Completion Day", unit="Day of month", target_value="By 5th", frequency="Monthly", data_source="Reconciliation report"),
        dict(company=VE, department="Accounts - V", designation="Accounts Manager",
             kpi_name="Vendor Payments Within Terms", unit="%", target_value="100", frequency="Monthly", data_source="ERP payables report"),
        dict(company=VE, department="Accounts - V", designation="Accounts Manager",
             kpi_name="Debtors Overdue > 45 Days", unit="INR", target_value="0", frequency="Monthly", data_source="ERP ageing report"),
        dict(company=VE, department="Accounts - V", designation="Accounts Manager",
             kpi_name="MIS Report Delivery", unit="Day of month", target_value="By 7th", frequency="Monthly", data_source="Report submission record"),

        # VE – Sales Representative
        dict(company=VE, department="Sales - V", designation="Sales Representative",
             kpi_name="Monthly Sales Achievement", unit="%", target_value="100", frequency="Monthly", data_source="ERP sales report"),
        dict(company=VE, department="Sales - V", designation="Sales Representative",
             kpi_name="New Accounts Added", unit="Count", target_value="3", frequency="Monthly", data_source="CRM / customer master"),
        dict(company=VE, department="Sales - V", designation="Sales Representative",
             kpi_name="Collection Rate", unit="%", target_value="95", frequency="Monthly", data_source="ERP collections report"),
        dict(company=VE, department="Sales - V", designation="Sales Representative",
             kpi_name="DSR Submission Rate", unit="%", target_value="100", frequency="Monthly", data_source="Sales daily report log"),
        dict(company=VE, department="Sales - V", designation="Sales Representative",
             kpi_name="Customer Visit Adherence", unit="%", target_value="90", frequency="Monthly", data_source="Journey plan vs actual"),

        # VE – Logistics In-charge
        dict(company=VE, department="Logistics - V", designation="Logistics In-charge",
             kpi_name="On-Time Dispatch Rate", unit="%", target_value="95", frequency="Monthly", data_source="ERP dispatch report"),
        dict(company=VE, department="Logistics - V", designation="Logistics In-charge",
             kpi_name="Inventory Variance on Cycle Count", unit="%", target_value="1", frequency="Monthly", data_source="Cycle count report"),
        dict(company=VE, department="Logistics - V", designation="Logistics In-charge",
             kpi_name="Material Damage Incidents", unit="Count", target_value="0", frequency="Monthly", data_source="Damage incident log"),
        dict(company=VE, department="Logistics - V", designation="Logistics In-charge",
             kpi_name="Logistics Cost as % of Sales", unit="%", target_value="Per budget", frequency="Monthly", data_source="P&L / cost tracker"),

        # SL – Project Manager
        dict(company=SL, department="Projects - SL", designation="Project Manager",
             kpi_name="Projects Delivered On Time", unit="%", target_value="90", frequency="Monthly", data_source="Project tracker"),
        dict(company=SL, department="Projects - SL", designation="Project Manager",
             kpi_name="Budget Overrun", unit="%", target_value="5", frequency="Quarterly", data_source="Project cost report"),
        dict(company=SL, department="Projects - SL", designation="Project Manager",
             kpi_name="Client Satisfaction Score", unit="Score /5", target_value="4.5", frequency="Quarterly", data_source="Client survey"),
        dict(company=SL, department="Projects - SL", designation="Project Manager",
             kpi_name="Snag Items at Handover", unit="Count", target_value="3", frequency="Quarterly", data_source="Snagging checklist"),
        dict(company=SL, department="Projects - SL", designation="Project Manager",
             kpi_name="Daily Site Progress Report Submitted", unit="%", target_value="100", frequency="Monthly", data_source="SPR log"),

        # HM – Production Manager
        dict(company=HM, department="Manufacturing - HM", designation="Production Manager",
             kpi_name="Daily Production Achievement", unit="%", target_value="95", frequency="Monthly", data_source="Production report"),
        dict(company=HM, department="Manufacturing - HM", designation="Production Manager",
             kpi_name="Finished Goods Rejection Rate", unit="%", target_value="2", frequency="Monthly", data_source="QC inspection report"),
        dict(company=HM, department="Manufacturing - HM", designation="Production Manager",
             kpi_name="Machine OEE", unit="%", target_value="80", frequency="Monthly", data_source="Machine log / OEE tracker"),
        dict(company=HM, department="Manufacturing - HM", designation="Production Manager",
             kpi_name="Material Wastage Above BOQ", unit="%", target_value="5", frequency="Monthly", data_source="Material consumption report"),
        dict(company=HM, department="Manufacturing - HM", designation="Production Manager",
             kpi_name="On-Time Delivery to Clients", unit="%", target_value="95", frequency="Monthly", data_source="Dispatch & delivery log"),
        dict(company=HM, department="Manufacturing - HM", designation="Production Manager",
             kpi_name="Machine Downtime per Month", unit="Hours", target_value="4", frequency="Monthly", data_source="Machine breakdown log"),

        # HM – Panel Saw Operator
        dict(company=HM, department="Manufacturing - HM", designation="Panel Saw Operator",
             kpi_name="Panels Cut per Shift", unit="Panels", target_value="Per plan", frequency="Monthly", data_source="Production log"),
        dict(company=HM, department="Manufacturing - HM", designation="Panel Saw Operator",
             kpi_name="Cutting Accuracy (Dimension Tolerance)", unit="mm", target_value="± 0.5", frequency="Monthly", data_source="QC check"),
        dict(company=HM, department="Manufacturing - HM", designation="Panel Saw Operator",
             kpi_name="Material Wastage vs Nesting Plan", unit="%", target_value="3", frequency="Monthly", data_source="Nesting report"),
        dict(company=HM, department="Manufacturing - HM", designation="Panel Saw Operator",
             kpi_name="Safety Compliance (PPE)", unit="%", target_value="100", frequency="Monthly", data_source="Supervisor observation"),

        # HM – CNC Machine Operator
        dict(company=HM, department="Manufacturing - HM", designation="CNC Machine Operator",
             kpi_name="CNC Jobs Completed per Shift", unit="Jobs", target_value="Per plan", frequency="Monthly", data_source="Production log"),
        dict(company=HM, department="Manufacturing - HM", designation="CNC Machine Operator",
             kpi_name="First-Off Rejection Rate", unit="%", target_value="5", frequency="Monthly", data_source="First-off inspection log"),
        dict(company=HM, department="Manufacturing - HM", designation="CNC Machine Operator",
             kpi_name="Tool Life Adherence", unit="Hrs", target_value="Per tool schedule", frequency="Monthly", data_source="Tool change log"),
        dict(company=HM, department="Manufacturing - HM", designation="CNC Machine Operator",
             kpi_name="Machine Downtime Caused by Operator Error", unit="Hours", target_value="0", frequency="Monthly", data_source="Breakdown log"),
    ]
    for kpi in kpis:
        _ins("VE KPI", "kpi_name", kpi["kpi_name"] + "|" + kpi.get("company", ""), kpi)


# ── SOPs ──────────────────────────────────────────────────────────────────────

def _seed_sops():
    sops = [
        # VE SOPs
        dict(company=VE, department="Sales - V", sop_title="Sales Order Processing",
             sop_code="VE-SOP-SAL-01", version="1.0", effective_date="2026-01-01",
             purpose="Standardise the process from receiving a customer enquiry to confirming a sales order in the ERP.",
             scope="Applicable to Sales & Collection Coordinator and all Sales Representatives.",
             responsible_role="Sales & Collection Coordinator",
             procedure="""Step 1 — Receive Enquiry
• Enquiry received via call, WhatsApp, email, or in-person visit
• Log enquiry in CRM with: customer name, contact, product/quantity required, required delivery date

Step 2 — Prepare Quotation
• Check stock availability in ERP
• Prepare quotation with item, quantity, unit price, GST rate, total, payment terms, validity
• Get approval from Co-founder if order value > ₹50,000
• Share quotation to customer within 4 working hours of enquiry

Step 3 — Follow Up
• Follow up within 24 hours if no response received
• Update CRM with customer feedback / status (Interested / Negotiating / Lost)

Step 4 — Order Confirmation
• On customer confirmation, obtain written PO (email/WhatsApp message accepted)
• Create Sales Order in ERP — enter items, qty, price, delivery date, payment terms
• Share Sales Order copy to customer for confirmation

Step 5 — Handover to Logistics
• Notify Logistics In-charge of confirmed order — product, quantity, delivery date
• Update ERP Sales Order status to 'Confirmed'

Step 6 — Documentation
• File customer PO, quotation, and Sales Order in the customer folder (physical + drive)"""),

        dict(company=VE, department="Accounts - V", sop_title="Monthly GST Return Filing",
             sop_code="VE-SOP-ACC-01", version="1.0", effective_date="2026-01-01",
             purpose="Ensure GSTR-1 and GSTR-3B are filed accurately and on time every month.",
             scope="Chartered Accountant and Accounts Manager.",
             responsible_role="Chartered Accountant",
             procedure="""Step 1 — Data Preparation (by 5th of month)
• Accounts Manager to extract sales invoice data from ERP — customer GSTIN, invoice no, date, taxable value, GST rate, GST amount
• Cross-check against physical invoices / drive copies for completeness

Step 2 — GSTR-1 Filing (due 11th of month)
• Log in to GST portal (www.gst.gov.in)
• Navigate to Returns → GSTR-1 for the relevant period
• Upload B2B invoice data (HSN-wise); verify auto-populated data
• Add B2C (unregistered) sales summary
• Verify HSN summary; ensure totals match ERP
• File GSTR-1 using DSC or EVC; note ARN number

Step 3 — GSTR-2B Reconciliation (by 12th)
• Download GSTR-2B from GST portal
• Accounts Manager to reconcile GSTR-2B with ERP purchase records
• Identify mismatches — missing invoices, GSTIN errors — follow up with vendors

Step 4 — GSTR-3B Filing (due 20th of month)
• Compute outward tax liability from GSTR-1
• Compute eligible Input Tax Credit from GSTR-2B reconciliation
• Calculate net tax payable; make GST payment via internet banking if balance due
• File GSTR-3B; note ARN number

Step 5 — Record Keeping
• Save filed returns (PDF) to the GST folder on Drive — folder: Accounts / GST / YYYY-MM
• Update GST filing tracker with: month, GSTR-1 ARN, GSTR-3B ARN, tax paid, date filed"""),

        dict(company=VE, department="Logistics - V", sop_title="Goods Dispatch & Delivery",
             sop_code="VE-SOP-LOG-01", version="1.0", effective_date="2026-01-01",
             purpose="Ensure accurate, safe, and timely dispatch of goods to customers with proper documentation.",
             scope="Logistics In-charge and Material Shifting In-charge.",
             responsible_role="Logistics In-charge",
             procedure="""Step 1 — Pick List Generation
• Logistics In-charge reviews confirmed Sales Orders due for dispatch
• Generate pick list from ERP — item, quantity, bin location

Step 2 — Picking & Verification
• Material Shifting In-charge picks stock per pick list
• Logistics In-charge verifies picked quantity vs pick list — both sign off

Step 3 — Delivery Challan
• Create Delivery Challan in ERP — customer, items, quantity, vehicle no, driver name
• Print 3 copies: 1 for customer, 1 for transporter, 1 retained at warehouse
• Attach copy of invoice to Delivery Challan

Step 4 — Loading
• Supervise loading of goods onto vehicle — correct count, no damage
• Wrap fragile items with bubble wrap / corrugated sheet
• Seal vehicle / ensure goods are secured

Step 5 — Dispatch
• Update ERP Stock Ledger — stock moved out against Delivery Challan
• Share Delivery Challan number and ETA with Sales Coordinator to inform customer
• Take transporter acknowledgement on retained Delivery Challan copy

Step 6 — Proof of Delivery
• Collect signed Delivery Challan from transporter on delivery
• Scan and upload to Drive — folder: Logistics / Delivery Challans / YYYY-MM
• Update ERP delivery status to 'Delivered'"""),

        # SL SOPs
        dict(company=SL, department="Projects - SL", sop_title="Project Initiation & Client Brief",
             sop_code="SL-SOP-PRJ-01", version="1.0", effective_date="2026-01-01",
             purpose="Establish a clear project brief, scope, and expectations before commencing any design or execution work.",
             scope="Project Manager, Interior Designer, Operations Manager.",
             responsible_role="Project Manager",
             procedure="""Step 1 — Initial Client Meeting
• Arrange site visit or showroom meeting within 3 days of lead confirmation
• Project Manager and Designer attend together
• Document: client name, contact, project address, scope (rooms/areas), budget range, timeline expectation

Step 2 — Site Measurement
• Designer measures all rooms to be designed — length, width, height, window/door positions
• Capture photographs of the existing site condition
• Note any structural constraints — beams, columns, electrical points

Step 3 — Design Brief Document
• Prepare Design Brief covering: scope, client style preference, material budget per area, special requirements
• Get client sign-off on Design Brief — email confirmation or physical signature

Step 4 — Scope of Work & Quotation
• Project Manager prepares scope of work — areas, items, quantities
• Operations Manager prepares cost estimate — materials + labour + overheads + margin
• Review with Co-founder before sharing to client
• Share formal quotation with payment terms (typically: 30% advance, 40% at material stage, 30% at completion)

Step 5 — Agreement & Advance
• On client acceptance, prepare Work Order / Agreement — scope, timeline, payment schedule, warranty terms
• Collect advance payment as per agreement before commencing design
• Register project in project tracker with: client name, project code, start date, target completion, PM assigned"""),

        dict(company=SL, department="Projects - SL", sop_title="Project Handover & Snagging",
             sop_code="SL-SOP-PRJ-02", version="1.0", effective_date="2026-01-01",
             purpose="Ensure all completed projects are handed over to clients with zero outstanding defects and full documentation.",
             scope="Project Manager, Site Team, Operations Manager.",
             responsible_role="Project Manager",
             procedure="""Step 1 — Internal Snagging (2 days before handover)
• Project Manager and Designer conduct a thorough internal walk-through
• Prepare internal snagging list — defects, unfinished items, wrong specifications
• Assign snagging items to carpentry/painting/electrical contractors with 24-hour deadline

Step 2 — Snagging Closure
• Verify each snag item is rectified before client walk-through
• Photograph completed corrections for records

Step 3 — Client Walk-Through
• Arrange joint walk-through — client, Project Manager, Designer
• Walk through each area systematically; demonstrate all hardware, fittings, and movable elements
• Note any client observations or final touch-up requests

Step 4 — Punch List
• Document all client-raised items in the Punch List — item, location, action required, responsible party, deadline
• Resolve all punch list items within 7 days of walk-through

Step 5 — Handover Documentation
• Prepare and share with client:
  - Handover Certificate (signed by client)
  - Warranty Card — 1 year warranty on carpentry and hardware
  - Maintenance Guide — do's and don'ts for wood finishes, cleaning, hardware maintenance
  - Vendor contacts for specialized items (imported hardware, specific tiles)

Step 6 — Final Payment & Closure
• Raise final invoice upon handover completion
• Collect final payment as per agreement
• Update project tracker to 'Completed'; archive all project documents on Drive"""),

        # HM SOPs
        dict(company=HM, department="Manufacturing - HM", sop_title="Daily Production Planning",
             sop_code="HM-SOP-PRD-01", version="1.0", effective_date="2026-01-01",
             purpose="Ensure every production shift starts with a clear, achievable plan and all resources are in place.",
             scope="Production Manager, Production Supervisor.",
             responsible_role="Production Manager",
             procedure="""Step 1 — Order Review (previous evening / morning before shift)
• Production Manager reviews pending order backlog in ERP — customer, items, quantities, delivery dates
• Prioritise jobs by delivery date — most urgent first

Step 2 — Material Check
• Verify raw material availability in store — MDF sheets, laminates, edge tape, hardware
• Raise material requisition for shortages; notify Procurement if lead time issue

Step 3 — Cutting List & CNC Programs
• Confirm cutting lists from Design Head are available for all planned jobs
• Verify CNC programs are loaded / available on the machine controller

Step 4 — Production Plan Sheet
• Prepare daily production plan — machine-wise, operator-wise work allocation
• Machine assignments: Panel Saw → CNC → Edgebander → Assembly → QC → Packing
• Share plan with Production Supervisor before shift start

Step 5 — Pre-Shift Toolbox Talk (10 minutes)
• Supervisor conducts brief toolbox talk — safety reminder, plan for the day, any special instructions
• Address previous shift's issues or near-misses

Step 6 — Plan Monitoring
• Supervisor updates production count every 2 hours vs plan
• Production Manager reviews mid-shift; reallocates resources if plan is behind
• End-of-shift production report submitted by Supervisor"""),

        dict(company=HM, department="Manufacturing - HM", sop_title="Panel Saw Operation & Safety",
             sop_code="HM-SOP-PSW-01", version="1.0", effective_date="2026-01-01",
             purpose="Ensure safe and accurate operation of the panel saw machine for cutting MDF, plywood, and HDF boards.",
             scope="Panel Saw Operator and Production Supervisor.",
             responsible_role="Panel Saw Operator",
             procedure="""PRE-SHIFT SAFETY CHECKS (mandatory before first cut)
• Check blade guard is in position — do NOT operate without guard
• Test emergency stop button — must stop all movement immediately
• Check scoring blade and main blade for cracks, missing teeth, or damage — replace if found
• Clear table surface of offcuts and debris
• Verify PPE: safety glasses, ear protection, dust mask worn at all times
• Confirm dust extraction is connected and operational

SETUP FOR JOB
• Read cutting list — note dimensions, material type, quantity
• Refer to nesting plan for optimal sheet layout to minimise wastage
• Set fence to required dimension using digital readout; verify with measuring tape
• Set blade height to 3mm above board thickness

CUTTING OPERATION
• Place board with good face DOWN on the table (to minimise tear-out on visible face)
• Use push stick for cuts where hands would come within 300mm of blade
• Apply steady, even feed rate — do not force material through blade
• After each cut, check first piece dimension against cutting list
• Label cut panels immediately: job number, dimension code, quantity

SAFETY RULES (MANDATORY — Zero Tolerance)
• NEVER reach over or behind the blade during operation
• NEVER remove blade guard for any reason during operation
• NEVER leave machine running unattended
• NEVER wear loose clothing, jewellery, or gloves while operating
• Report any unusual vibration, noise, or blade behaviour immediately to Supervisor

POST-SHIFT
• Switch off machine and wait for blade to fully stop before any cleaning
• Remove sawdust from table, fence, and surrounding area
• Log: sheets consumed, panels cut, any issues observed"""),

        dict(company=HM, department="Manufacturing - HM", sop_title="In-Process Quality Inspection",
             sop_code="HM-SOP-QC-01", version="1.0", effective_date="2026-01-01",
             purpose="Catch defects at each production stage before work progresses to the next process.",
             scope="Production Supervisor, all operators.",
             responsible_role="Production Supervisor",
             procedure="""STAGE 1 — POST CUTTING (Panel Saw output)
Inspect: dimensions (tolerance ±0.5mm), squareness, surface damage, correct labelling
Accept: panels within tolerance, no surface damage, correctly labelled
Reject: dimensions out of tolerance, damaged surface, mislabelled — segregate and report

STAGE 2 — POST CNC MACHINING
Inspect: hole positions and diameter, routing depth and profile, edge quality at machined areas
Accept: holes within ±0.3mm of drawing; profiles clean and to depth
Reject: wrong hole position or diameter; chipped edges at machining; incomplete routing

STAGE 3 — POST EDGEBANDING
Inspect: edge tape adhesion (no lifting, gaps), trim quality (flush to panel), glue squeeze-out cleaned
Accept: edge tape fully adhered, flush trim, no glue residue
Reject: lifting edges, unclean trim, glue visible on panel face — return to edgebander for rectification

STAGE 4 — ASSEMBLY CHECK
Inspect: squareness (diagonal check), all hardware fitted and functional, panel faces undamaged
Accept: diagonals within 2mm of each other; all hardware operates smoothly; no scratches
Reject: out-of-square assembly; missing/non-functional hardware; surface damage

STAGE 5 — FINAL FINISHED GOODS INSPECTION
100% inspection of all finished units before packing
• Verify model/size matches customer order
• Check all faces and edges for damage, scratches, or edge defects
• Operate all hinges, drawers, and soft-close mechanisms
• Confirm correct finish/colour as per order
• Approve: stamp/tag as 'PASS' and move to packing
• Reject: tag as 'FAIL', document defect type, route to rework or scrap"""),
    ]
    for sop in sops:
        _ins("VE SOP", "sop_code", sop["sop_code"], sop)


# ── POLICIES ──────────────────────────────────────────────────────────────────

def _seed_policies():
    policies = [
        dict(company=VE, policy_name="Attendance & Leave Policy", policy_category="HR", version="1.0", effective_date="2026-01-01",
             content="""ATTENDANCE POLICY — VERA ENTERPRISES

1. WORKING HOURS
Standard working hours: 9:30 AM to 6:30 PM, Monday to Saturday.
Field sales staff: flexible based on territory requirements; DSR submission mandatory daily.
Warehouse staff: shift as assigned by Logistics In-charge.

2. ATTENDANCE MARKING
All office staff must mark attendance in the ERP/attendance system at arrival and departure.
Unexcused absence beyond 2 consecutive days requires written explanation to HR.

3. LEAVE ENTITLEMENTS (per calendar year)
• Earned Leave (EL): 12 days
• Sick Leave (SL): 6 days
• Casual Leave (CL): 6 days
• Public Holidays: as per company holiday list (14 days for 2026)
• New employees in probation: half leave entitlement

4. LEAVE APPLICATION PROCESS
• Apply in ERP at least 3 days in advance for planned leave
• Sick leave: inform manager by 9:30 AM on the day; submit medical certificate for absence > 2 days
• Leave without prior approval will be marked as Loss of Pay (LOP)

5. LATE ARRIVAL
• 3 late arrivals per month = 1 day LOP
• Habitual late arrival will be noted in performance review

6. LOSS OF PAY (LOP)
LOP will be deducted from monthly salary for unapproved absences.

Policy Owner: HR / Co-founder | Review: Annual"""),

        dict(company=VE, policy_name="Expense Reimbursement Policy", policy_category="Finance", version="1.0", effective_date="2026-01-01",
             content="""EXPENSE REIMBURSEMENT POLICY — VERA ENTERPRISES

1. ELIGIBLE EXPENSES
• Travel: local conveyance for business visits (auto, cab, bus — receipts required)
• Petrol: field sales staff reimbursed at ₹8/km (two-wheeler) with odometer reading submitted
• Client entertainment: up to ₹500 per occasion with prior approval from Co-founder
• Stationery / office supplies: up to ₹300 per month without approval; above with approval

2. INELIGIBLE EXPENSES
• Personal meals (other than approved client entertainment)
• Personal travel or accommodation
• Traffic fines or penalties

3. CLAIM SUBMISSION
• Submit claim via ERP Expense Claim module by the last working day of each month
• Attach original receipts or bills for all expenses above ₹100
• WhatsApp receipts acceptable for petrol pumps; note vehicle number

4. APPROVAL PROCESS
• Claims up to ₹2,000: approved by Department Head
• Claims above ₹2,000: requires Co-founder approval
• Accounts processes approved claims by 7th of next month

5. ADVANCE AGAINST EXPENSE
• Advance up to ₹3,000 available for travel; apply 3 days before travel
• Settlement of advance mandatory within 5 days of return

Policy Owner: Accounts / Co-founder | Review: Annual"""),

        dict(company=VE, policy_name="Code of Conduct", policy_category="HR", version="1.0", effective_date="2026-01-01",
             content="""CODE OF CONDUCT — VERA ENTERPRISES

All employees of Vera Enterprises are expected to conduct themselves professionally and ethically at all times.

1. PROFESSIONAL BEHAVIOUR
• Treat all colleagues, customers, and vendors with respect and courtesy
• Maintain punctuality — arrive on time for work, meetings, and client appointments
• Dress appropriately — business casual for office; field staff in company-branded attire if provided

2. INTEGRITY & HONESTY
• Never misrepresent company products, pricing, or commitments to customers
• Do not accept gifts, kickbacks, or favours from vendors or customers beyond nominal value (> ₹500)
• Report any actual or perceived conflict of interest to the Co-founder immediately

3. COMPANY PROPERTY
• Use company assets (laptop, SIM card, vehicle if provided) only for business purposes
• Do not share company data, pricing, or customer lists with third parties
• Return all company assets immediately upon resignation or termination

4. CONFIDENTIALITY
• All customer, financial, and business information is confidential — do not share externally
• Do not discuss company financials, margins, or business plans in public or on social media

5. SOCIAL MEDIA
• Do not post company-related content, client information, or site photographs on personal social media without approval

6. DISCIPLINARY ACTION
Violations of this Code of Conduct may result in verbal warning, written warning, suspension, or termination depending on severity.

Policy Owner: Co-founder | Review: Annual"""),

        dict(company=VE, policy_name="Asset Management Policy", policy_category="IT", version="1.0", effective_date="2026-01-01",
             content="""ASSET MANAGEMENT POLICY — VERA ENTERPRISES

1. COMPANY ASSETS
Company assets include: SIM cards, laptops/systems, mobile devices, vehicles, warehouse equipment.
All assets issued to employees are logged in the HRMS Company Assets register.

2. ISSUANCE
• Assets issued against a signed Asset Acknowledgement form
• Employee acknowledges responsibility for safekeeping and correct use

3. ACCEPTABLE USE
• Assets to be used exclusively for company business
• SIM cards: only for official calls; personal usage above plan limits charged to employee
• Laptops: no installation of unlicensed software; no use for personal gaming or streaming

4. CARE & MAINTENANCE
• Report damage immediately — intentional damage or negligence may result in cost recovery
• Laptops to be kept in provided bags/cases; screen protector mandatory

5. RETURN ON EXIT
• All company assets must be returned on the last working day
• Assets not returned within 3 days of exit will have value deducted from Full & Final settlement

6. LOSS OR THEFT
• Report loss/theft to manager within 2 hours of discovery
• File police complaint within 24 hours for theft
• Replacement cost may be partially or fully recovered from employee depending on circumstances

Policy Owner: HR / IT | Review: Annual"""),

        dict(company=SL, policy_name="Site Safety Policy", policy_category="Safety", version="1.0", effective_date="2026-01-01",
             content="""SITE SAFETY POLICY — SCHONES LEBEN

All Schones Leben site staff (Project Managers, Carpenters, Helpers) must comply with this policy at all times.

1. PERSONAL PROTECTIVE EQUIPMENT (PPE)
Mandatory at all times on site:
• Safety shoes (closed toe) — no flip-flops or chappals on site
• Dust mask when cutting, sanding, or working with adhesives
• Safety glasses when using power tools
• Gloves when handling sharp materials

2. TOOL SAFETY
• Power tools to be operated only by trained personnel
• Inspect power tools before use — damaged tools must not be used
• Unplug tools when not in use; never leave running tools unattended
• Keep tool cords away from cutting paths

3. MATERIAL HANDLING
• Use trolleys for heavy panels — do not carry boards exceeding 20kg alone
• Stack materials flat and stable — not exceeding 1.5m height
• Keep walkways and emergency exits clear at all times

4. ELECTRICAL SAFETY
• Do not overload extension boards
• Report exposed wires or electrical hazards to Project Manager immediately
• No electrical work by non-electricians

5. FIRE SAFETY
• No open flame near adhesives, varnishes, or solvents
• Fire extinguisher location must be known to all site team members
• No smoking on client premises

6. INCIDENT REPORTING
• Report ALL accidents, injuries, and near-misses to Project Manager within 1 hour
• Complete Incident Report Form and submit to Operations Manager within 24 hours

Policy Owner: Operations Manager / Co-founder | Review: Annual"""),

        dict(company=HM, policy_name="Factory Safety Policy", policy_category="Safety", version="1.0", effective_date="2026-01-01",
             content="""FACTORY SAFETY POLICY — HAGAN MODULAR

Safety is the highest priority at Hagan Modular. All violations will be treated with zero tolerance.

1. MANDATORY PPE IN FACTORY
• Safety shoes: all persons entering the factory floor at all times
• Safety glasses: all operators within 3 metres of any running machine
• Ear protection: mandatory for Panel Saw, CNC, and Edgebander operators
• Dust mask (minimum N95): mandatory when cutting, routing, or edgebanding
• No loose clothing, bangles, rings, or ties near any moving machine part

2. MACHINE SAFETY RULES
• Operate only machines you are trained and authorised to use
• Never remove or bypass any machine guard or safety device
• Stop machine before adjusting, cleaning, or loading material near the cutting zone
• Report any unusual machine noise, vibration, or error code to supervisor immediately
• No machine to be operated under the influence of any substance

3. HOUSEKEEPING
• Clear sawdust from floor and machines regularly — sawdust is a fire hazard
• Remove off-cuts from floor immediately after cutting
• All aisles and emergency exits to be kept clear at all times

4. FIRE SAFETY
• Fire extinguishers at: machine entry gate, Panel Saw area, CNC area, Edgebander area
• Monthly fire extinguisher check by Production Supervisor
• No smoking anywhere in or around the factory

5. ELECTRICAL SAFETY
• Only authorised personnel to work on electrical panels
• Report any exposed cable, sparking, or burning smell immediately

6. EMERGENCY RESPONSE
• Emergency contacts posted at factory entrance and near each machine
• Assembly point: outside main factory gate
• First aid box location: office room near factory entry

Policy Owner: Production Manager / Co-founder | Review: Annual"""),

        dict(company=HM, policy_name="Quality Standards Policy", policy_category="Operations", version="1.0", effective_date="2026-01-01",
             content="""QUALITY STANDARDS POLICY — HAGAN MODULAR

1. QUALITY OBJECTIVES
• Finished goods rejection rate: < 2%
• Customer complaint rate: < 5% of orders
• On-time delivery: > 95% of committed dates

2. IN-PROCESS QUALITY CHECKS
Quality inspection is mandatory at every production stage:
• Post-cutting: dimension tolerance ±0.5mm; no surface damage
• Post-CNC: hole position ±0.3mm; profile depth to drawing
• Post-edgebanding: no lifting, flush trim, no glue residue
• Assembly: diagonal squareness within 2mm; hardware 100% functional
• Final inspection: 100% of units checked before packing

3. DEFECT CLASSIFICATION
• Minor defect: cosmetic issue, can be repaired on-site
• Major defect: functional issue or visible damage, requires rework
• Critical defect: non-conforming to customer specs — reject and remanufacture

4. NON-CONFORMING MATERIAL
• Segregate defective panels/units immediately — do not mix with accepted stock
• Tag with red 'REJECT' sticker — note defect type, job number, date
• Route to rework area; Production Manager to approve rework plan
• Scrap material to be recorded and reported monthly

5. CUSTOMER COMPLAINT HANDLING
• Log complaint in complaint register within 24 hours of receipt
• Investigate root cause and prepare corrective action within 3 working days
• Replace or rework defective product within agreed timeline with customer

Policy Owner: Production Manager | Review: Quarterly"""),
    ]
    for p in policies:
        _ins("VE Policy", "policy_name", p["policy_name"] + "|" + p["company"], p)


# ── EMPLOYEE HANDBOOK ─────────────────────────────────────────────────────────

def _seed_handbook():
    sections = [
        # VERA ENTERPRISES
        dict(company=VE, section_order=1, section_title="Welcome to Vera Enterprises",
             content="""Welcome to Vera Enterprises!

We are delighted to have you join our team. Vera Enterprises is a Bengaluru-based trading and distribution company committed to delivering quality products and exceptional service to our customers.

This handbook is your guide to how we work, what we expect from each other, and how we support you as a member of our team. Please read it carefully and keep it for reference.

Our Values:
• Integrity — we do what we say and say what we do
• Customer First — our customers' success is our success
• Teamwork — we achieve more together
• Accountability — we own our results

Our Leadership:
Vera Enterprises is founded and led by Owais Ahmed Khan and the co-founding team. We believe in an open-door culture — any team member can approach leadership with ideas, concerns, or feedback.

Head Office: Bengaluru
Warehouse: Rajajijagar, Bengaluru"""),

        dict(company=VE, section_order=2, section_title="Employment Terms & Conditions",
             content="""EMPLOYMENT TERMS — VERA ENTERPRISES

1. OFFER LETTER & APPOINTMENT
Your appointment is confirmed through an Offer Letter which specifies your designation, department, CTC, and joining date. Please retain a signed copy.

2. PROBATION PERIOD
New employees serve a probation period of 6 months. Confirmation of employment is based on satisfactory performance review at the end of probation.

3. WORKING HOURS
Standard working hours: 9:30 AM to 6:30 PM, Monday to Saturday.
Overtime, if required, will be compensated as per applicable law.

4. EMPLOYMENT TYPE
Employment may be full-time, probationary, or contractual. Your offer letter specifies your employment type.

5. TERMINATION
• Notice period: 1 month (or as specified in offer letter)
• Company may terminate employment for cause without notice period as per the terms of appointment
• Employees wishing to resign must submit written notice to HR

6. FULL & FINAL SETTLEMENT
Upon exit, all dues (pending salary, leave encashment, expense reimbursements) and deductions (LOP, outstanding advances, asset recovery) will be settled within 30 days of last working day."""),

        dict(company=VE, section_order=3, section_title="Working Hours & Attendance",
             content="""WORKING HOURS & ATTENDANCE — VERA ENTERPRISES

Working Days: Monday to Saturday
Working Hours: 9:30 AM – 6:30 PM (1-hour lunch break 1:30 PM – 2:30 PM)

Attendance Marking:
All employees mark attendance via the ERP/attendance system on arrival and departure.
Field staff submit a daily call report (DCR/DSR) as their attendance record.

Late Arrivals:
• Arrivals after 9:45 AM are considered late
• 3 late arrivals in a month = 1 day Loss of Pay deduction

Absenteeism:
• Inform your manager before 9:30 AM on any day you are unable to come in
• Consecutive absence of 3 or more days without informing management is treated as abandonment of employment

Public Holidays:
A list of public holidays for the year is posted on the company notice board and shared at the start of each calendar year."""),

        dict(company=VE, section_order=4, section_title="Leave Entitlements",
             content="""LEAVE POLICY — VERA ENTERPRISES

LEAVE TYPES & DAYS PER YEAR:
• Earned Leave (EL): 12 days — accrues at 1 day per month; can be carried forward up to 12 days
• Sick Leave (SL): 6 days — not carried forward; medical certificate required for > 2 consecutive days
• Casual Leave (CL): 6 days — for personal/urgent matters; minimum 1 day; not carried forward
• Public Holidays: as per company holiday calendar (2026: 14 days)

APPLYING FOR LEAVE:
• Apply in ERP Expense/Leave module at least 3 working days before planned leave
• Emergency leave: inform manager before 9:30 AM; apply in system same day

LEAVE WITHOUT PAY (LWP):
• LWP applicable when leave balance is exhausted or leave is taken without approval
• Salary deducted on pro-rata basis for LWP days

LEAVE DURING PROBATION:
• EL does not accrue during probation
• 3 days CL and 3 days SL permitted during 6-month probation

YEAR-END CARRY FORWARD:
• EL carry forward: max 12 days; balance above 12 lapses on 31st December
• SL and CL: not carried forward; lapse on 31st December"""),

        dict(company=VE, section_order=5, section_title="Compensation & Benefits",
             content="""COMPENSATION & BENEFITS — VERA ENTERPRISES

SALARY:
• Salary credited by the 5th of each month for the previous month
• Salary structure as per offer letter: Basic, HRA, Special Allowance, Other Allowances

STATUTORY DEDUCTIONS:
• PF (Provident Fund): 12% of Basic if applicable (as per law)
• ESI: applicable if gross salary ≤ ₹21,000/month
• Professional Tax: as per Karnataka state slab
• TDS: deducted at source if income above taxable limit; Form 16 issued annually

PERFORMANCE APPRAISAL:
• Annual performance review in March–April
• Salary revision effective April 1 each year based on performance and company policy

FIELD STAFF ALLOWANCES:
• Travel/Petrol reimbursement as per Expense Policy
• Mobile reimbursement: as per offer letter or policy

GRATUITY:
• Eligible after 5 years of continuous service as per Payment of Gratuity Act

ADVANCE AGAINST SALARY:
• One advance per year permitted; maximum 50% of one month gross salary
• Recovery over 3 monthly installments"""),

        dict(company=VE, section_order=6, section_title="Code of Conduct & Ethics",
             content="""CODE OF CONDUCT — VERA ENTERPRISES

We expect every Vera Enterprises team member to uphold the highest standards of professional conduct.

PROFESSIONALISM:
• Be punctual — for work, meetings, and client appointments
• Communicate clearly and respectfully — in person, email, and WhatsApp
• Dress appropriately — office: business casual; client visits: formal attire

INTEGRITY:
• Never misrepresent our products, pricing, or commitments
• Do not accept gifts from vendors or customers worth more than ₹500
• Declare any conflict of interest (family-owned vendor, etc.) to management immediately

RESPECT IN THE WORKPLACE:
• Treat all colleagues, customers, and vendors with dignity
• Harassment of any form — verbal, physical, or online — will not be tolerated
• Raise concerns with management or HR without fear of retaliation

CUSTOMER DATA & CONFIDENTIALITY:
• Customer information, pricing, and business data are confidential
• Do not share with competitors, ex-colleagues, or on social media
• Data protection applies even after leaving the company

SOCIAL MEDIA:
• Do not post client sites, company financials, or internal matters on personal social media
• Positive posts about the company's work are encouraged but must not reveal confidential client information"""),

        dict(company=VE, section_order=7, section_title="Company Assets & IT Policy",
             content="""COMPANY ASSETS & IT POLICY — VERA ENTERPRISES

ISSUED ASSETS:
Assets issued to you (SIM card, laptop, system) are logged in the HRMS.
You are responsible for the safe custody and correct use of all issued assets.

SIM CARD:
• Use only for official business calls and WhatsApp communication
• Data charges for official use covered by the company; personal usage may be charged
• Report loss immediately; SIM to be blocked within 2 hours of loss

LAPTOP / COMPUTER:
• Use exclusively for company work
• Do not install unlicensed software or games
• Set a strong password; lock screen when stepping away
• Do not share login credentials with anyone
• All official work files must be saved on company Google Drive (not only local storage)

DATA SECURITY:
• Do not send customer data or company financial files to personal email addresses
• Do not use personal USB drives on company computers without IT approval
• Report any suspected phishing or cybersecurity incident immediately

ON EXIT:
Return all company assets on the last working day. Assets not returned will be deducted from F&F settlement."""),

        dict(company=VE, section_order=8, section_title="Health, Safety & Wellbeing",
             content="""HEALTH, SAFETY & WELLBEING — VERA ENTERPRISES

OFFICE SAFETY:
• Keep workspaces clean and free of clutter
• Report any electrical hazards, broken furniture, or unsafe conditions to management
• Emergency exits: front door (primary) and warehouse exit (secondary)
• Fire extinguisher: located near the main door

WAREHOUSE SAFETY:
• Safety shoes mandatory for all personnel entering the warehouse
• Proper lifting technique — bend knees, not back; use trolleys for heavy items
• Stacking height limit: 1.5 metres for loose cartons; follow rack specifications for racked goods
• No smoking in the warehouse — fire hazard

FIELD STAFF SAFETY:
• Follow all traffic rules when on customer visits
• Do not use mobile while driving
• Report any road accident to manager immediately

HEALTH:
• Sick leave available — do not come to office if unwell and contagious
• Medical insurance: as per company policy / statutory ESI if applicable

WELLBEING:
• We encourage open conversations about workload, stress, or personal challenges
• Speak to your manager or directly to leadership if you need support"""),

        dict(company=VE, section_order=9, section_title="Grievance & Escalation Process",
             content="""GRIEVANCE & ESCALATION PROCESS — VERA ENTERPRISES

We are committed to a fair and transparent workplace. Any employee with a grievance related to work, colleagues, or management decisions has the right to raise it.

STEP 1 — INFORMAL RESOLUTION:
Raise the concern directly with your immediate manager. Many issues can be resolved through an open conversation.

STEP 2 — FORMAL GRIEVANCE:
If unresolved, submit a written grievance to the Co-founder (owais@veraenterprises.in).
Include: nature of grievance, date of incident, parties involved, resolution sought.

STEP 3 — INVESTIGATION:
The Co-founder or nominated person will investigate within 7 working days.
Both parties will be heard; confidentiality will be maintained where possible.

STEP 4 — RESOLUTION:
A written resolution will be communicated within 14 days of formal grievance submission.

NON-RETALIATION:
No employee will face any negative consequence for raising a genuine grievance in good faith.

HARASSMENT COMPLAINTS:
Complaints of sexual harassment to be addressed as per the POSH Act (Prevention of Sexual Harassment at the Workplace). An ICC (Internal Complaints Committee) will be constituted if applicable."""),
    ]
    for s in sections:
        _ins("VE Employee Handbook", "section_title", s["section_title"] + "|" + s["company"], s)


# ── OPERATIONS MANUAL ─────────────────────────────────────────────────────────

def _seed_ops_manual():
    entries = [
        dict(company=VE, department="Accounts - V", section_title="Monthly Accounts Close Process",
             content="""MONTHLY ACCOUNTS CLOSE — VERA ENTERPRISES

TIMELINE: Close by the 7th of each month for the previous month.

Week 1 (1st–5th):
• Complete all pending voucher entries for the month (day 1)
• Generate bank statements from all bank accounts; begin reconciliation (day 2)
• Complete bank reconciliation; all differences resolved or explained (day 3)
• Compile outstanding debtors and creditors ageing (day 4)
• Verify stock balances match physical count or cycle count (day 5)

Day 6–7:
• Run P&L and Balance Sheet from ERP; review for anomalies
• Cross-check GST output (from ERP sales) vs GST portal data
• CA reviews draft financials; CA makes adjustment entries
• Submit final MIS report to Co-founder: Revenue, COGS, Gross Profit, Key Expenses, Net Profit, Cash/Bank, Debtors, Creditors

APPROVAL: Monthly MIS reviewed and acknowledged by Co-founder by 10th of each month."""),

        dict(company=VE, department="Sales - V", section_title="Sales Operations & Reporting",
             content="""SALES OPERATIONS — VERA ENTERPRISES

DAILY OPERATIONS:
• Sales Representatives submit DSR (Daily Sales Report) by 7:00 PM each day
• DSR includes: customers visited, orders booked (item/qty/value), collections made, issues/feedback
• Sales Coordinator compiles daily order summary for logistics by 6:00 PM

WEEKLY SALES REVIEW (every Monday):
• Each Sales Representative presents: last week targets vs actual, collections status, pipeline for current week
• Co-founder or Sales Head reviews outstanding orders, slow-moving stock, pricing issues
• Action items documented and followed up next Monday

MONTHLY REPORTING (by 5th of each month):
• Sales Coordinator prepares monthly report: territory-wise revenue, YTD performance vs target, new accounts, top 10 customers by revenue, outstanding debtors
• Report shared to Co-founder for review

PRICING POLICY:
• Pricing as per approved price list; deviations above 5% require Co-founder approval
• No credit extension beyond approved credit limit without Co-founder sign-off"""),

        dict(company=SL, department="Projects - SL", section_title="Project Management Operations",
             content="""PROJECT MANAGEMENT OPERATIONS — SCHONES LEBEN

PROJECT REGISTER:
All active projects tracked in the project tracker (Google Sheet / ERP):
• Project code, client name, PM assigned, start date, target completion date, current status
• Updated by PM every Monday

PROJECT REVIEW MEETING (weekly — every Monday):
• All PMs present project status: % completion, challenges, material delays, client issues
• Co-founder / Operations Manager reviews and resolves escalations
• Next week's milestones defined for each project

SITE PROGRESS REPORTING:
• PM submits Daily Site Progress Report (SPR) by 7:00 PM each working day
• SPR covers: work completed, materials used, pending work, issues, next day plan

CHANGE ORDER MANAGEMENT:
• Any scope change (addition or deletion) must be documented as a Change Order
• CO to be priced and approved by client in writing before execution
• Verbal approvals not accepted — all changes must have email/WhatsApp confirmation

PROJECT CLOSURE:
• Project closed in tracker only after: handover certificate signed, punch list closed, final payment received, all project documents archived on Drive"""),

        dict(company=HM, department="Manufacturing - HM", section_title="Factory Operations",
             content="""FACTORY OPERATIONS — HAGAN MODULAR

FACTORY HOURS:
• First shift: 8:00 AM – 5:00 PM (lunch: 1:00 PM – 1:30 PM)
• Overtime when required: with prior approval of Production Manager

ORDER PRIORITY:
• Production prioritised by delivery date — earliest delivery first
• Rush orders (< 3 days) require Co-founder / Production Manager approval; premium charged to client

MACHINE ALLOCATION:
Panel Saw → CNC Machine → Edgebanding → Assembly → QC → Packing → Dispatch
Each job follows this sequence. No stage can be skipped.

MATERIAL MANAGEMENT:
• Raw materials issued from store against production plan; Material Requisition Slip mandatory
• Off-cuts of MDF ≥ 30cm retained for small jobs; smaller pieces disposed as waste
• Daily material consumption logged; monthly reconciliation by Production Manager

DISPATCH:
• Finished goods inspected and packed before loading
• Delivery challan raised in ERP; copy accompanies each delivery
• Driver / transporter signs Dispatch Register before vehicle leaves factory

MAINTENANCE:
• Preventive maintenance schedule posted on factory notice board
• Machine operators responsible for daily cleaning and pre/post-shift checks
• Breakdowns reported to Production Manager immediately; logged in Breakdown Register"""),
    ]
    for e in entries:
        _ins("VE Operations Manual", "section_title", e["section_title"] + "|" + e["company"], e)


# ── PROCESSES ─────────────────────────────────────────────────────────────────

def _seed_processes():
    procs = [
        dict(company=VE, department="Sales - V", process_name="Lead to Order",
             trigger_event="New customer enquiry received",
             steps="1. Receive enquiry (call/email/walk-in) → 2. Log in CRM → 3. Check stock availability → 4. Prepare quotation → 5. Share with customer → 6. Follow up (if no response in 24h) → 7. Negotiate terms if required → 8. Receive confirmation (verbal/written) → 9. Create Sales Order in ERP → 10. Notify logistics for dispatch",
             responsible_roles="Sales Representative, Sales & Collection Coordinator",
             tools_used="ERP, CRM, WhatsApp, Email"),
        dict(company=VE, department="Accounts - V", process_name="Purchase to Pay",
             trigger_event="Purchase Order raised and goods received",
             steps="1. Receive goods at warehouse → 2. GRN created in ERP → 3. Vendor invoice received → 4. 3-way match: PO vs GRN vs Invoice → 5. Accounts Manager verifies and books purchase bill → 6. Payment due date noted → 7. Payment processed as per schedule → 8. Voucher filed with supporting documents",
             responsible_roles="Logistics In-charge, Accounts Manager, Chartered Accountant",
             tools_used="ERP, Bank portal"),
        dict(company=SL, department="Projects - SL", process_name="Design to Delivery",
             trigger_event="Client brief confirmed and advance received",
             steps="1. Design brief signed → 2. Site measurement done → 3. Design concept prepared → 4. Client presentation → 5. Client approval → 6. BOQ finalised → 7. Material procurement → 8. Carpentry fabrication → 9. Site installation → 10. Client walk-through → 11. Snag closure → 12. Handover certificate signed → 13. Final invoice raised",
             responsible_roles="Interior Designer, Project Manager, Carpenter, Operations Manager",
             tools_used="AutoCAD, Project tracker, ERP, Google Drive"),
        dict(company=HM, department="Manufacturing - HM", process_name="Order to Production",
             trigger_event="Customer order confirmed",
             steps="1. Order received → 2. Design Head prepares cutting list + CNC programs → 3. Production Manager checks material availability → 4. Production plan prepared → 5. Panel Saw cuts boards → 6. CNC machines holes/profiles → 7. Edgebanding applied → 8. Assembly of carcass → 9. QC inspection at each stage → 10. Final inspection → 11. Packing → 12. Dispatch",
             responsible_roles="Design Head, Production Manager, Supervisor, all operators",
             tools_used="ERP, CNC software, cutting list, production log"),
        dict(company=HM, department="Manufacturing - HM", process_name="Machine Breakdown Escalation",
             trigger_event="Machine stops unexpectedly or operator notices abnormal behaviour",
             steps="1. Operator stops machine immediately → 2. Notify Production Supervisor → 3. Supervisor logs breakdown in Breakdown Register (machine, time, nature of fault) → 4. Supervisor notifies Production Manager → 5. Production Manager assesses: minor (operator can fix), maintenance required, or external service call → 6. If external: contact machine service company → 7. Meanwhile, reallocate work to other machines if possible → 8. On repair: Supervisor verifies machine before restarting production → 9. Log repair completion time and action taken",
             responsible_roles="Machine Operator, Production Supervisor, Production Manager",
             tools_used="Breakdown register, phone, machine service contacts"),
    ]
    for p in procs:
        _ins("VE Department Process", "process_name", p["process_name"] + "|" + p["company"], p)


# ── FORMS & CHECKLISTS ────────────────────────────────────────────────────────

def _seed_forms():
    forms = [
        dict(company=VE, department="Sales - V", form_title="Daily Sales Report (DSR)",
             form_type="Form", instructions="Complete and submit by 7:00 PM every working day.",
             items="""DATE:
SALES REPRESENTATIVE NAME:
TERRITORY:

CUSTOMERS VISITED:
| # | Customer Name | Contact | Visit Purpose | Outcome |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

ORDERS BOOKED:
| Customer | Items | Qty | Value (₹) | Delivery Date |
|---|---|---|---|---|

COLLECTIONS MADE:
| Customer | Amount (₹) | Mode (Cash/NEFT/Cheque) | Reference |
|---|---|---|---|

NEW PROSPECTS MET:
| Name | Company | Contact | Notes |
|---|---|---|---|

ISSUES / MARKET FEEDBACK:

TOMORROW'S PLAN:

Signature:"""),

        dict(company=SL, department="Projects - SL", form_title="Site Measurement Form",
             form_type="Form", instructions="Complete during site visit. Attach photographs.",
             items="""PROJECT DETAILS:
Client Name:
Project Address:
Date of Measurement:
Designer:

ROOM-WISE MEASUREMENTS:
| Room / Area | Length (mm) | Width (mm) | Height (mm) | Notes / Constraints |
|---|---|---|---|---|
| Living Room | | | | |
| Master Bedroom | | | | |
| Bedroom 2 | | | | |
| Kitchen | | | | |
| Bathroom 1 | | | | |
| Other: | | | | |

DOOR OPENINGS: (note for each room)
| Room | Door Width | Door Height | Swing Direction | Notes |
|---|---|---|---|---|

WINDOW POSITIONS: (note for each room)
| Room | Window Width | Window Height | Distance from corner | Notes |
|---|---|---|---|---|

EXISTING CONDITIONS TO NOTE:
(Uneven walls, columns, beams, electrical points, plumbing locations)

PHOTOGRAPHS TAKEN: Yes / No
Number of photos:

Designer Signature:
Client Signature (Acknowledgement):"""),

        dict(company=SL, department="Projects - SL", form_title="Project Handover Checklist",
             form_type="Checklist", instructions="Complete during client walk-through. Client to sign at end.",
             items="""PROJECT: ________ CLIENT: ________ DATE: ________

CARPENTRY & WOODWORK:
[ ] All wardrobe shutters open, close, and latch correctly
[ ] Drawer channels function smoothly; soft-close working
[ ] Hinge adjustment done; no misaligned shutters
[ ] Laminate/veneer surfaces: no peeling, bubbles, or scratches
[ ] Edge tape: fully adhered, no lifting edges
[ ] All hardware (handles, knobs, locks) fitted and functional

KITCHEN (if applicable):
[ ] All cabinets, drawers, and shutters functional
[ ] Countertop fitted; no gaps or movement
[ ] Sink and plumbing connections checked

FINISHING:
[ ] Walls painted / textured as per scope
[ ] False ceiling (if any): no cracks, sagging, or water marks
[ ] Flooring: no loose tiles, gaps, or damaged sections
[ ] Electrical: all points functional; no exposed wires

GENERAL:
[ ] Site fully cleaned; no debris or offcuts remaining
[ ] All Schones Leben tools and equipment removed from site
[ ] Client briefed on maintenance do's and don'ts

DOCUMENTS HANDED OVER:
[ ] Handover Certificate (signed)
[ ] Warranty Card
[ ] Maintenance Guide
[ ] Vendor contacts (if applicable)

Snag items noted (if any):

Client Signature: ________________ Date: ________
PM Signature: ___________________ Date: ________"""),

        dict(company=HM, department="Manufacturing - HM", form_title="Pre-Shift Machine Safety Checklist",
             form_type="Checklist", instructions="Complete before first operation of each shift. Do not operate if any item is NOT OK.",
             items="""DATE: ________ SHIFT: ________ MACHINE: ________ OPERATOR: ________

GENERAL CHECKS:
[ ] Machine area clear of debris and offcuts
[ ] Dust extraction system connected and switch on: functional
[ ] Emergency stop button tested: stops machine immediately
[ ] All guards and covers in position and secured

PANEL SAW SPECIFIC:
[ ] Scoring blade: no cracks, all teeth present
[ ] Main blade: no cracks, no missing/chipped teeth
[ ] Blade guard: in position, moves freely
[ ] Fence: locks securely at set dimension
[ ] Table surface: clean, no raised bolts or obstructions

CNC MACHINE SPECIFIC:
[ ] Tooling checked: correct tools fitted, no chipped cutters
[ ] Vacuum system: all pods sealing correctly on test piece
[ ] X/Y/Z axis movement: smooth, no unusual noise
[ ] Work zero point verified against reference

EDGEBANDER SPECIFIC:
[ ] Glue pot temperature correct (as per material type)
[ ] Edge tape loaded correctly; sufficient stock
[ ] Trimming blades: sharp, positioned correctly
[ ] Pressure rollers: clean, no glue buildup

PPE CHECK:
[ ] Safety glasses
[ ] Ear protection
[ ] Dust mask
[ ] Safety shoes

ALL ITEMS OK: Yes / No

If NO — Machine NOT to be used. Report to Supervisor:
Issue found:
Supervisor notified (name):
Time:

Operator Signature: ________________"""),

        dict(company=HM, department="Manufacturing - HM", form_title="Daily Production Report",
             form_type="Form", instructions="Production Supervisor to complete by end of shift.",
             items="""DATE: ________ SHIFT: ________ SUPERVISOR: ________

PRODUCTION OUTPUT:
| Job No. | Customer | Product | Planned Qty | Actual Qty | Reject Qty | Remarks |
|---|---|---|---|---|---|---|
| | | | | | | |
| | | | | | | |
| | | | | | | |

TOTAL: Planned: ____ Actual: ____ Rejected: ____ Achievement: ____%

MACHINE STATUS:
| Machine | Running Hours | Downtime (if any) | Reason for Downtime |
|---|---|---|---|
| Panel Saw | | | |
| CNC | | | |
| Edgebander | | | |

MATERIAL CONSUMED:
| Material | Opening Stock | Issued | Closing | Wastage |
|---|---|---|---|---|
| MDF | | | | |
| Laminate | | | | |
| Edge Tape | | | | |

QUALITY / REJECTS:
Rejected items description:
Root cause (if identified):
Corrective action:

SAFETY:
Any incidents or near-misses: Yes / No
If Yes, describe:

TOMORROW'S PLAN (key jobs):

Supervisor Signature: ________________ Production Manager Sign-off: ________________"""),
    ]
    for f in forms:
        _ins("VE Forms Checklist", "form_title", f["form_title"] + "|" + f["company"], f)
