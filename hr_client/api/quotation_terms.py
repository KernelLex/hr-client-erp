"""Seed the coded Terms & Conditions master (owner spec: "ERP Quotation
Terms & Conditions Master"). Auto-generated from that spec by
_gen (tools/gen_terms). Idempotent — run after bench migrate:
    bench --site vera.local execute hr_client.api.quotation_terms.seed_all
"""

import frappe

CLAUSES = [
 {
  "code": "TC-GEN-001",
  "title": "Basis of Quotation",
  "prefix": "GEN",
  "category": "General",
  "mandatory": 1,
  "customer_text": "This quotation is prepared based on the information, drawings, measurements, specifications and selections available as on the quotation date.\nAny change in these inputs may result in revision of:\n• Scope\n• Quantity\n• Specification\n• Price\n• Delivery schedule"
 },
 {
  "code": "TC-SCP-001",
  "title": "Scope Limitation",
  "prefix": "SCP",
  "category": "Scope of Supply",
  "mandatory": 1,
  "customer_text": "Only the items, quantities, specifications and services expressly mentioned in this quotation are included.\nAny item or service not specifically mentioned shall be considered excluded unless separately agreed in writing."
 },
 {
  "code": "TC-SCP-002",
  "title": "Scope by Section",
  "prefix": "SCP",
  "category": "Scope of Supply",
  "mandatory": 1,
  "customer_text": "The scope shall be considered independently for:\n• Modular\n• Hardware\n• Appliances\n• Countertop\n• Sink & Faucet\n• Installation\n• Transportation\n• Site Services\nAn item appearing in one section shall not automatically imply inclusion under another section."
 },
 {
  "code": "TC-SCP-003",
  "title": "Customer-Supplied Items",
  "prefix": "SCP",
  "category": "Scope of Supply",
  "mandatory": 1,
  "customer_text": "Where any material, appliance, hardware or other product is supplied by the customer, Vera Enterprises shall be responsible only for the specifically agreed coordination or installation scope.\nCompatibility and condition of customer-supplied items shall remain subject to verification."
 },
 {
  "code": "TC-PRC-001",
  "title": "Price Basis",
  "prefix": "PRC",
  "category": "Pricing",
  "mandatory": 1,
  "customer_text": "Prices are based on:\n• Quoted specifications\n• Quoted quantities\n• Selected materials\n• Selected finishes\n• Current commercial inputs\n• Applicable project conditions\nAny change may result in price revision."
 },
 {
  "code": "TC-PRC-002",
  "title": "Quantity Variation",
  "prefix": "PRC",
  "category": "Pricing",
  "mandatory": 1,
  "customer_text": "Final billing may vary where quantities are based on:\n• Actual site measurement\n• Final approved drawings\n• Actual supply quantity\n• Actual installation quantity\n• Actual fabrication quantity\nwhere the quotation specifically provides for measurement-based billing."
 },
 {
  "code": "TC-PRC-003",
  "title": "Lump Sum Items",
  "prefix": "PRC",
  "category": "Pricing",
  "mandatory": 1,
  "customer_text": "Items marked as:\nLS / Lump Sum\nshall be charged at the quoted amount for the stated scope.\nAdditional scope shall be treated separately."
 },
 {
  "code": "TC-PRC-004",
  "title": "Rate-Based Items",
  "prefix": "PRC",
  "category": "Pricing",
  "mandatory": 1,
  "customer_text": "Items quoted on:\n• RFT\n• SFT\n• SQM\n• Nos.\n• Set\n• Unit\n• Man-Day\n• Trip\nshall be calculated on the applicable final quantity."
 },
 {
  "code": "TC-TAX-001",
  "title": "GST",
  "prefix": "TAX",
  "category": "Taxes",
  "mandatory": 1,
  "customer_text": "Applicable GST and other statutory taxes shall be charged as per the tax treatment applicable at the time of invoicing."
 },
 {
  "code": "TC-TAX-002",
  "title": "Change in Statutory Taxes",
  "prefix": "TAX",
  "category": "Taxes",
  "mandatory": 1,
  "customer_text": "Any change in applicable statutory tax or levy after quotation shall be incorporated in the final invoice as applicable."
 },
 {
  "code": "TC-VAL-001",
  "title": "Validity Period",
  "prefix": "VAL",
  "category": "Validity",
  "mandatory": 1,
  "customer_text": "This quotation shall remain valid until the validity date specified in the quotation.\nAfter expiry, Vera Enterprises reserves the right to:\n• Confirm\n• Revise\n• Withdraw\nthe commercial offer."
 },
 {
  "code": "TC-VAL-002",
  "title": "Price Confirmation",
  "prefix": "VAL",
  "category": "Validity",
  "mandatory": 1,
  "customer_text": "Prices are considered confirmed only after:\n1. Customer approval,\n2. Acceptance of commercial terms, and\n3. Receipt of the required advance / order confirmation."
 },
 {
  "code": "TC-PAY-001",
  "title": "Payment Schedule",
  "prefix": "PAY",
  "category": "Payment",
  "mandatory": 1,
  "customer_text": "Payment shall be made according to the stage-wise payment schedule stated in the quotation."
 },
 {
  "code": "TC-PAY-002",
  "title": "Advance Requirement",
  "prefix": "PAY",
  "category": "Payment",
  "mandatory": 1,
  "customer_text": "Order processing, procurement or production shall commence only after receipt of the stipulated advance and required approvals."
 },
 {
  "code": "TC-PAY-003",
  "title": "Payment Before Dispatch",
  "prefix": "PAY",
  "category": "Payment",
  "mandatory": 1,
  "customer_text": "Where applicable, the specified payment shall be received before:\n• Dispatch\n• Delivery\n• Installation\n• Handover\nas defined in the quotation."
 },
 {
  "code": "TC-PAY-004",
  "title": "Payment Allocation",
  "prefix": "PAY",
  "category": "Payment",
  "mandatory": 1,
  "customer_text": "Payments received may be allocated against:\n• Advance\n• Material\n• Manufacturing\n• Dispatch\n• Installation\n• Variation\n• Outstanding invoices\naccording to the agreed commercial schedule."
 },
 {
  "code": "TC-PAY-005",
  "title": "Delay in Payment",
  "prefix": "PAY",
  "category": "Payment",
  "mandatory": 1,
  "customer_text": "If payment is not received as per the agreed schedule, Vera Enterprises may suspend:\n• Procurement\n• Production\n• Dispatch\n• Delivery\n• Installation\n• Site work\nuntil pending dues are cleared.\nAny resulting delay shall correspondingly affect the project schedule."
 },
 {
  "code": "TC-PAY-006",
  "title": "Rescheduling",
  "prefix": "PAY",
  "category": "Payment",
  "mandatory": 1,
  "customer_text": "Where work is suspended due to delayed payment, recommencement shall be subject to:\n• Resource availability\n• Production slot availability\n• Installation team availability\n• Material availability\nThe previous delivery or completion date may therefore no longer remain applicable."
 },
 {
  "code": "TC-PAY-007",
  "title": "Outstanding Payment Before Handover",
  "prefix": "PAY",
  "category": "Payment",
  "mandatory": 1,
  "customer_text": "Final handover, warranty activation or release of applicable completion documents may be subject to settlement of all due amounts."
 },
 {
  "code": "TC-CRD-001",
  "title": "Credit Approval",
  "prefix": "CRD",
  "category": "Credit",
  "mandatory": 0,
  "customer_text": "Any credit facility is subject to prior approval by Vera Enterprises.\nMention of credit terms in previous transactions shall not automatically constitute approval for subsequent transactions."
 },
 {
  "code": "TC-CRD-002",
  "title": "Credit Hold",
  "prefix": "CRD",
  "category": "Credit",
  "mandatory": 0,
  "customer_text": "Vera Enterprises may place further supply or dispatch on hold where:\n• Credit limit is exceeded\n• Payment is overdue\n• Previous invoices remain unresolved"
 },
 {
  "code": "TC-MSR-001",
  "title": "Preliminary Measurement",
  "prefix": "MSR",
  "category": "Measurement",
  "mandatory": 0,
  "customer_text": "Any quotation based on preliminary site dimensions shall remain subject to final measurement."
 },
 {
  "code": "TC-MSR-002",
  "title": "Final Measurement",
  "prefix": "MSR",
  "category": "Measurement",
  "mandatory": 0,
  "customer_text": "Final production dimensions shall be based on measurements recorded after the site reaches the required stage of readiness."
 },
 {
  "code": "TC-MSR-003",
  "title": "Customer / Architect Drawings",
  "prefix": "MSR",
  "category": "Measurement",
  "mandatory": 0,
  "customer_text": "Where dimensions are taken from customer, architect or consultant drawings without physical verification, Vera Enterprises shall prepare the quotation subject to subsequent site verification."
 },
 {
  "code": "TC-MSR-004",
  "title": "Measurement Changes",
  "prefix": "MSR",
  "category": "Measurement",
  "mandatory": 0,
  "customer_text": "Changes arising from:\n• Civil changes\n• Flooring level changes\n• Ceiling changes\n• Wall changes\n• Plumbing changes\n• Electrical changes\n• Appliance changes\nafter measurement may require re-measurement and revision."
 },
 {
  "code": "TC-DWG-001",
  "title": "Approval Before Production",
  "prefix": "DWG",
  "category": "Drawings & Approvals",
  "mandatory": 0,
  "customer_text": "Production shall commence only after approval of applicable:\n• Layout\n• Drawings\n• Dimensions\n• Materials\n• Finishes\n• Hardware\n• Appliance models"
 },
 {
  "code": "TC-DWG-002",
  "title": "Customer Approval Responsibility",
  "prefix": "DWG",
  "category": "Drawings & Approvals",
  "mandatory": 0,
  "customer_text": "Once drawings and specifications are approved, subsequent customer-requested changes shall be treated as variations."
 },
 {
  "code": "TC-DWG-003",
  "title": "Drawing Revision",
  "prefix": "DWG",
  "category": "Drawings & Approvals",
  "mandatory": 0,
  "customer_text": "Only the latest approved drawing revision shall be considered valid for execution.\nSuperseded drawings shall not form part of the active scope."
 },
 {
  "code": "TC-MAT-001",
  "title": "Material Specification",
  "prefix": "MAT",
  "category": "Materials",
  "mandatory": 0,
  "customer_text": "Materials shall be supplied according to the specifications stated in the approved BOQ / quotation."
 },
 {
  "code": "TC-MAT-002",
  "title": "Equivalent Replacement",
  "prefix": "MAT",
  "category": "Materials",
  "mandatory": 0,
  "customer_text": "If a specified material becomes unavailable or discontinued, Vera Enterprises may propose an equivalent alternative subject to customer approval where required."
 },
 {
  "code": "TC-MAT-003",
  "title": "Natural Variation",
  "prefix": "MAT",
  "category": "Materials",
  "mandatory": 0,
  "customer_text": "Natural and manufactured materials may exhibit reasonable variation in:\n• Colour\n• Grain\n• Pattern\n• Texture\n• Shade\nbetween samples, batches and final supplied material."
 },
 {
  "code": "TC-FIN-001",
  "title": "Physical Sample Approval",
  "prefix": "FIN",
  "category": "Finishes",
  "mandatory": 0,
  "customer_text": "Where finish selection is material to appearance, final approval should be based on the physical sample wherever available.\nDigital images, monitors and printed catalogues may not reproduce colours exactly."
 },
 {
  "code": "TC-FIN-002",
  "title": "Batch Variation",
  "prefix": "FIN",
  "category": "Finishes",
  "mandatory": 0,
  "customer_text": "Minor shade or pattern variations between manufacturing batches shall not constitute a defect where within normal industry tolerance."
 },
 {
  "code": "TC-FIN-003",
  "title": "Pending Finish Selection",
  "prefix": "FIN",
  "category": "Finishes",
  "mandatory": 0,
  "customer_text": "Production timelines shall commence only after mandatory finish selections are approved.\nDelay in selection may affect project completion dates."
 },
 {
  "code": "TC-HDW-001",
  "title": "Hardware Specification",
  "prefix": "HDW",
  "category": "Hardware",
  "mandatory": 0,
  "customer_text": "Hardware supplied shall correspond to the:\n• Brand\n• Series\n• Model\n• Functional category\nstated in the approved quotation or BOQ."
 },
 {
  "code": "TC-HDW-002",
  "title": "Manufacturer Changes",
  "prefix": "HDW",
  "category": "Hardware",
  "mandatory": 0,
  "customer_text": "Product design, packaging, model references or technical specifications may be changed by manufacturers from time to time.\nWhere required, an appropriate current equivalent may be proposed."
 },
 {
  "code": "TC-HDW-003",
  "title": "Hardware Warranty",
  "prefix": "HDW",
  "category": "Hardware",
  "mandatory": 0,
  "customer_text": "Hardware warranty shall be governed by the respective manufacturer's applicable warranty terms unless specifically stated otherwise."
 },
 {
  "code": "TC-APP-001",
  "title": "Appliance Model Confirmation",
  "prefix": "APP",
  "category": "Appliances",
  "mandatory": 0,
  "customer_text": "Cabinet design and appliance provisions shall be based on the final approved appliance model."
 },
 {
  "code": "TC-APP-002",
  "title": "Model Change",
  "prefix": "APP",
  "category": "Appliances",
  "mandatory": 0,
  "customer_text": "If the appliance model is changed after design approval, any required modification to:\n• Cabinet\n• Electrical\n• Plumbing\n• Ventilation\n• Countertop\nshall be treated as additional work where applicable."
 },
 {
  "code": "TC-APP-003",
  "title": "Availability",
  "prefix": "APP",
  "category": "Appliances",
  "mandatory": 0,
  "customer_text": "Appliance availability is subject to stock availability at the time of confirmed order."
 },
 {
  "code": "TC-APP-004",
  "title": "Delivery Lead Time",
  "prefix": "APP",
  "category": "Appliances",
  "mandatory": 0,
  "customer_text": "Imported, special-order or non-stock appliances may carry extended lead times."
 },
 {
  "code": "TC-APP-005",
  "title": "Appliance Installation",
  "prefix": "APP",
  "category": "Appliances",
  "mandatory": 0,
  "customer_text": "Appliance installation shall be handled as specified in the quotation and, where applicable, through the manufacturer's authorised installation process."
 },
 {
  "code": "TC-APP-006",
  "title": "Manufacturer Warranty",
  "prefix": "APP",
  "category": "Appliances",
  "mandatory": 0,
  "customer_text": "Appliance warranty shall be governed by the respective manufacturer's warranty policy."
 },
 {
  "code": "TC-STN-001",
  "title": "Final Stone Measurement",
  "prefix": "STN",
  "category": "Countertop / Stone",
  "mandatory": 0,
  "customer_text": "Final countertop dimensions shall normally be taken after the supporting cabinets are installed, levelled and ready for measurement."
 },
 {
  "code": "TC-STN-002",
  "title": "Natural Stone Characteristics",
  "prefix": "STN",
  "category": "Countertop / Stone",
  "mandatory": 0,
  "customer_text": "Natural stone may contain:\n• Veins\n• Shade variations\n• Fissures\n• Natural marks\n• Pattern differences\nwhich are inherent characteristics and shall not automatically be treated as defects."
 },
 {
  "code": "TC-STN-003",
  "title": "Engineered / Porcelain Pattern Variation",
  "prefix": "STN",
  "category": "Countertop / Stone",
  "mandatory": 0,
  "customer_text": "Pattern placement and vein continuity depend on slab layout, available slab dimensions and cutting requirements.\nExact pattern matching cannot be assumed unless specifically agreed."
 },
 {
  "code": "TC-STN-004",
  "title": "Fabrication",
  "prefix": "STN",
  "category": "Countertop / Stone",
  "mandatory": 0,
  "customer_text": "Charges for:\n• Sink cut-out\n• Hob cut-out\n• Tap hole\n• Socket cut-out\n• Edge processing\n• Waterfall\n• Joints\n• Special fabrication\nshall be applied according to the quoted scope."
 },
 {
  "code": "TC-STN-005",
  "title": "Joints",
  "prefix": "STN",
  "category": "Countertop / Stone",
  "mandatory": 0,
  "customer_text": "The location and number of countertop joints shall be determined according to:\n• Slab size\n• Site access\n• Structural requirements\n• Fabrication feasibility"
 },
 {
  "code": "TC-STN-006",
  "title": "Breakage Risk After Customer Modification",
  "prefix": "STN",
  "category": "Countertop / Stone",
  "mandatory": 0,
  "customer_text": "Any cutting, drilling, relocation or modification carried out by third parties after installation shall be outside Vera Enterprises' responsibility."
 },
 {
  "code": "TC-SNK-001",
  "title": "Model Confirmation",
  "prefix": "SNK",
  "category": "Sink & Faucet",
  "mandatory": 0,
  "customer_text": "Sink and faucet cut-outs and related provisions shall be based on the approved model."
 },
 {
  "code": "TC-SNK-002",
  "title": "Plumbing Connection",
  "prefix": "SNK",
  "category": "Sink & Faucet",
  "mandatory": 0,
  "customer_text": "Final plumbing connection shall be included only where specifically mentioned in the quotation."
 },
 {
  "code": "TC-MFG-001",
  "title": "Production Release",
  "prefix": "MFG",
  "category": "Manufacturing",
  "mandatory": 0,
  "customer_text": "Production shall commence only after completion of applicable prerequisites including:\n• Advance\n• Final measurement\n• Approved drawings\n• Approved materials\n• Approved finishes\n• Approved hardware"
 },
 {
  "code": "TC-MFG-002",
  "title": "Manufacturing Tolerances",
  "prefix": "MFG",
  "category": "Manufacturing",
  "mandatory": 0,
  "customer_text": "Reasonable manufacturing and installation tolerances appropriate to the product and site conditions shall apply."
 },
 {
  "code": "TC-DLV-001",
  "title": "Delivery Period",
  "prefix": "DLV",
  "category": "Delivery",
  "mandatory": 0,
  "customer_text": "Quoted delivery periods are calculated from completion of all prerequisites stated in the quotation.\nThey shall not automatically commence from the quotation date."
 },
 {
  "code": "TC-DLV-002",
  "title": "Partial Delivery",
  "prefix": "DLV",
  "category": "Delivery",
  "mandatory": 0,
  "customer_text": "For larger projects, Vera Enterprises may arrange phased or partial deliveries depending on:\n• Production\n• Site readiness\n• Project sequence\n• Storage availability"
 },
 {
  "code": "TC-TRN-001",
  "title": "Transportation Scope",
  "prefix": "TRN",
  "category": "Transportation",
  "mandatory": 0,
  "customer_text": "Transportation shall be included only where expressly mentioned."
 },
 {
  "code": "TC-TRN-002",
  "title": "Standard Access",
  "prefix": "TRN",
  "category": "Transportation",
  "mandatory": 0,
  "customer_text": "Quoted transportation assumes reasonable vehicle access to the delivery location.\nSpecial conditions may attract additional charges."
 },
 {
  "code": "TC-TRN-003",
  "title": "Special Handling",
  "prefix": "TRN",
  "category": "Transportation",
  "mandatory": 0,
  "customer_text": "Additional charges may apply for:\n• Crane\n• Hoist\n• Manual lifting to upper floors\n• Restricted access\n• Long carrying distance\n• Special permissions\n• Repeated delivery attempts"
 },
 {
  "code": "TC-TRN-004",
  "title": "Waiting Charges",
  "prefix": "TRN",
  "category": "Transportation",
  "mandatory": 0,
  "customer_text": "Where delivery vehicles or labour are delayed due to site access restrictions or customer-side readiness, additional waiting or re-delivery charges may apply."
 },
 {
  "code": "TC-STO-001",
  "title": "Site Storage",
  "prefix": "STO",
  "category": "Storage",
  "mandatory": 0,
  "customer_text": "Secure and suitable site storage shall be provided by the customer where materials are delivered before installation."
 },
 {
  "code": "TC-STO-002",
  "title": "Delayed Site Readiness",
  "prefix": "STO",
  "category": "Storage",
  "mandatory": 0,
  "customer_text": "Where completed material cannot be delivered due to site delay, storage beyond the agreed period may attract additional charges."
 },
 {
  "code": "TC-SIT-001",
  "title": "Minimum Site Readiness",
  "prefix": "SIT",
  "category": "Site",
  "mandatory": 0,
  "customer_text": "Before installation, the customer / contractor shall ensure applicable completion of:\n• Civil work\n• Flooring\n• Ceiling\n• Painting in affected areas\n• Electrical points\n• Plumbing points\n• Waterproofing\n• Site cleaning\n• Access\nunless otherwise agreed."
 },
 {
  "code": "TC-SIT-002",
  "title": "Power & Water",
  "prefix": "SIT",
  "category": "Site",
  "mandatory": 0,
  "customer_text": "Suitable power and water, where required for installation, shall be made available at site without charge."
 },
 {
  "code": "TC-SIT-003",
  "title": "Working Access",
  "prefix": "SIT",
  "category": "Site",
  "mandatory": 0,
  "customer_text": "Vera Enterprises shall be provided:\n• Safe access\n• Working space\n• Material movement access\n• Reasonable working hours\n• Required permissions"
 },
 {
  "code": "TC-SIT-004",
  "title": "Other Contractor Interference",
  "prefix": "SIT",
  "category": "Site",
  "mandatory": 0,
  "customer_text": "Delay, damage or rework arising from interference by other contractors may result in additional charges or schedule revision."
 },
 {
  "code": "TC-INS-001",
  "title": "Installation Scope",
  "prefix": "INS",
  "category": "Installation",
  "mandatory": 0,
  "customer_text": "Installation includes only the items expressly listed in the quotation."
 },
 {
  "code": "TC-INS-002",
  "title": "Installation Sequence",
  "prefix": "INS",
  "category": "Installation",
  "mandatory": 0,
  "customer_text": "Installation shall be scheduled based on:\n• Site readiness\n• Material availability\n• Labour availability\n• Project sequencing"
 },
 {
  "code": "TC-INS-003",
  "title": "Existing Site Conditions",
  "prefix": "INS",
  "category": "Installation",
  "mandatory": 0,
  "customer_text": "Vera Enterprises shall not be responsible for hidden or pre-existing defects such as:\n• Weak walls\n• Uneven floors\n• Water leakage\n• Concealed services\n• Structural defects\nunless specifically included in scope."
 },
 {
  "code": "TC-INS-004",
  "title": "Drilling Risk",
  "prefix": "INS",
  "category": "Installation",
  "mandatory": 0,
  "customer_text": "Installation may require drilling into walls, floors or ceilings.\nThe customer / contractor shall disclose concealed:\n• Electrical cables\n• Plumbing\n• Gas lines\n• Other services\nbefore installation."
 },
 {
  "code": "TC-LBR-001",
  "title": "Labour Scope",
  "prefix": "LBR",
  "category": "Labour",
  "mandatory": 0,
  "customer_text": "Labour-only quotations cover only the activities specifically described.\nMaterial, consumables, tools or equipment shall be included only where expressly stated."
 },
 {
  "code": "TC-LBR-002",
  "title": "Additional Labour",
  "prefix": "LBR",
  "category": "Labour",
  "mandatory": 0,
  "customer_text": "Additional labour caused by:\n• Scope changes\n• Rework\n• Site delay\n• Restricted access\n• Customer changes\nmay be charged separately."
 },
 {
  "code": "TC-CHG-001",
  "title": "Post-Approval Changes",
  "prefix": "CHG",
  "category": "Variations",
  "mandatory": 0,
  "customer_text": "Any change after approval of the quotation, BOQ, drawing or specification shall be reviewed as a variation."
 },
 {
  "code": "TC-CHG-002",
  "title": "Variation Approval",
  "prefix": "CHG",
  "category": "Variations",
  "mandatory": 0,
  "customer_text": "No additional or changed work shall be treated as part of the original contract unless approved in writing."
 },
 {
  "code": "TC-CHG-003",
  "title": "Variation Pricing",
  "prefix": "CHG",
  "category": "Variations",
  "mandatory": 0,
  "customer_text": "Variation pricing may include:\n• Additional material\n• Hardware\n• Manufacturing\n• Labour\n• Transportation\n• Site expenses\n• Rework\n• Wastage\n• Project management"
 },
 {
  "code": "TC-CHG-004",
  "title": "Variation Schedule",
  "prefix": "CHG",
  "category": "Variations",
  "mandatory": 0,
  "customer_text": "Approved variations may affect the project delivery or completion date."
 },
 {
  "code": "TC-CHG-005",
  "title": "Reduction in Scope",
  "prefix": "CHG",
  "category": "Variations",
  "mandatory": 0,
  "customer_text": "Deletion of an item after procurement or production has commenced may not result in full reversal of the original value.\nApplicable committed cost shall be considered."
 },
 {
  "code": "TC-DLY-001",
  "title": "Customer-Side Delays",
  "prefix": "DLY",
  "category": "Delays",
  "mandatory": 0,
  "customer_text": "The completion schedule shall be revised where delays arise from:\n• Late payment\n• Late approvals\n• Pending selections\n• Site not ready\n• Design changes\n• Third-party work\n• Restricted access"
 },
 {
  "code": "TC-DLY-002",
  "title": "Third-Party Dependencies",
  "prefix": "DLY",
  "category": "Delays",
  "mandatory": 0,
  "customer_text": "Vera Enterprises shall not be responsible for delays caused by external suppliers, manufacturers, contractors or authorities beyond reasonable control, subject to appropriate communication and mitigation."
 },
 {
  "code": "TC-DMG-001",
  "title": "Material After Delivery",
  "prefix": "DMG",
  "category": "Damage",
  "mandatory": 0,
  "customer_text": "After delivery and acceptance at site, reasonable protection of materials from:\n• Water\n• Dust\n• Impact\n• Other contractors\n• Theft\n• Improper storage\nshall be the responsibility of the site/customer unless Vera Enterprises retains custody."
 },
 {
  "code": "TC-DMG-002",
  "title": "Third-Party Damage",
  "prefix": "DMG",
  "category": "Damage",
  "mandatory": 0,
  "customer_text": "Repair or replacement of work damaged by other agencies after installation shall be charged separately."
 },
 {
  "code": "TC-WAR-001",
  "title": "Warranty Start",
  "prefix": "WAR",
  "category": "Warranty",
  "mandatory": 0,
  "customer_text": "Warranty shall commence from the applicable:\n• Handover date\n• Installation completion\n• Invoice date\naccording to the specific product/service warranty."
 },
 {
  "code": "TC-WAR-002",
  "title": "Modular Workmanship Warranty",
  "prefix": "WAR",
  "category": "Warranty",
  "mandatory": 0,
  "customer_text": "Modular workmanship warranty shall apply only for the stated warranty period and scope."
 },
 {
  "code": "TC-WAR-003",
  "title": "Manufacturer Warranty",
  "prefix": "WAR",
  "category": "Warranty",
  "mandatory": 0,
  "customer_text": "Hardware, appliances and other branded products shall be governed by the respective manufacturer's warranty terms."
 },
 {
  "code": "TC-WAR-004",
  "title": "Warranty Exclusions",
  "prefix": "WAR",
  "category": "Warranty",
  "mandatory": 0,
  "customer_text": "Warranty shall not cover damage caused by:\n• Misuse\n• Improper cleaning\n• Water leakage\n• Excessive moisture\n• Structural movement\n• Pest infestation\n• External impact\n• Modification by third parties\n• Electrical fluctuations\n• Poor site conditions\n• Normal wear and tear\nas applicable."
 },
 {
  "code": "TC-WAR-005",
  "title": "Unauthorised Modification",
  "prefix": "WAR",
  "category": "Warranty",
  "mandatory": 0,
  "customer_text": "Warranty may be affected where the product has been modified, repaired, dismantled or altered by an unauthorised third party."
 },
 {
  "code": "TC-CAN-001",
  "title": "Cancellation Before Procurement",
  "prefix": "CAN",
  "category": "Cancellation",
  "mandatory": 0,
  "customer_text": "Cancellation requests shall be reviewed based on the stage of execution and commitments already made."
 },
 {
  "code": "TC-CAN-002",
  "title": "Cancellation After Procurement",
  "prefix": "CAN",
  "category": "Cancellation",
  "mandatory": 0,
  "customer_text": "Where:\n• Material has been ordered\n• Special material has been procured\n• Manufacturing has commenced\n• Custom fabrication has commenced\nthe related committed cost shall be payable and may not be refundable."
 },
 {
  "code": "TC-CAN-003",
  "title": "Custom Products",
  "prefix": "CAN",
  "category": "Cancellation",
  "mandatory": 0,
  "customer_text": "Made-to-order, customised, cut-to-size and specially procured goods shall generally not be returnable after confirmed order except where accepted by Vera Enterprises in writing."
 },
 {
  "code": "TC-HLD-001",
  "title": "Customer-Requested Hold",
  "prefix": "HLD",
  "category": "Commercial Hold",
  "mandatory": 0,
  "customer_text": "If the customer places the project on hold, Vera Enterprises shall review:\n• Material already procured\n• Completed production\n• Storage\n• Price validity\n• Resource rescheduling\nbefore recommencement."
 },
 {
  "code": "TC-HLD-002",
  "title": "Extended Hold",
  "prefix": "HLD",
  "category": "Commercial Hold",
  "mandatory": 0,
  "customer_text": "For extended project holds, revised:\n• Material prices\n• Labour rates\n• Logistics costs\n• Installation rates\nmay apply where necessary."
 },
 {
  "code": "TC-OWN-001",
  "title": "Commercial Ownership",
  "prefix": "OWN",
  "category": "Ownership",
  "mandatory": 0,
  "customer_text": "Ownership transfer and release of goods shall be subject to the agreed payment and delivery terms.\nThe final wording should be aligned with Vera Enterprises' approved legal policy."
 },
 {
  "code": "TC-FMJ-001",
  "title": "Events Beyond Reasonable Control",
  "prefix": "FMJ",
  "category": "Force Majeure",
  "mandatory": 0,
  "customer_text": "Delivery and execution schedules may be revised for events beyond reasonable control including significant:\n• Natural events\n• Government restrictions\n• Transport disruptions\n• Labour disruptions\n• Supply-chain interruptions\n• Import disruptions\nwhere such events materially affect execution."
 },
 {
  "code": "TC-ACC-001",
  "title": "Acceptance of Quotation",
  "prefix": "ACC",
  "category": "Acceptance",
  "mandatory": 0,
  "customer_text": "Approval of the quotation shall indicate acceptance of:\n• Scope\n• Commercial value\n• Specifications\n• Payment terms\n• Included services\n• Exclusions\n• Applicable Terms & Conditions\nsubject to any specifically recorded exceptions."
 },
 {
  "code": "TC-ACC-002",
  "title": "Latest Revision",
  "prefix": "ACC",
  "category": "Acceptance",
  "mandatory": 0,
  "customer_text": "Where more than one quotation revision exists, only the latest customer-approved revision shall govern the accepted scope.\nPrevious revisions shall be considered superseded."
 }
]

TEMPLATES = [
 {
  "code": "TMPL-TRD",
  "name": "Trading Standard",
  "category": "Trading and Supply",
  "clauses": [
   "TC-GEN-001",
   "TC-SCP-001",
   "TC-SCP-002",
   "TC-SCP-003",
   "TC-PRC-001",
   "TC-PRC-002",
   "TC-PRC-003",
   "TC-PRC-004",
   "TC-TAX-001",
   "TC-TAX-002",
   "TC-VAL-001",
   "TC-VAL-002",
   "TC-PAY-001",
   "TC-PAY-002",
   "TC-PAY-003",
   "TC-PAY-004",
   "TC-PAY-005",
   "TC-PAY-006",
   "TC-PAY-007",
   "TC-CRD-001",
   "TC-CRD-002",
   "TC-HDW-001",
   "TC-HDW-002",
   "TC-HDW-003",
   "TC-APP-001",
   "TC-APP-002",
   "TC-APP-003",
   "TC-APP-004",
   "TC-APP-005",
   "TC-APP-006",
   "TC-STN-001",
   "TC-STN-002",
   "TC-STN-003",
   "TC-STN-004",
   "TC-STN-005",
   "TC-STN-006",
   "TC-SNK-001",
   "TC-SNK-002",
   "TC-DLV-001",
   "TC-DLV-002",
   "TC-TRN-001",
   "TC-TRN-002",
   "TC-TRN-003",
   "TC-TRN-004",
   "TC-STO-001",
   "TC-STO-002",
   "TC-DLY-001",
   "TC-DLY-002",
   "TC-DMG-001",
   "TC-DMG-002",
   "TC-WAR-001",
   "TC-WAR-002",
   "TC-WAR-003",
   "TC-WAR-004",
   "TC-WAR-005",
   "TC-CAN-001",
   "TC-CAN-002",
   "TC-CAN-003"
  ]
 },
 {
  "code": "TMPL-PRJ",
  "name": "Project / Modular Standard",
  "category": "Complete Interior Project",
  "clauses": [
   "TC-GEN-001",
   "TC-SCP-001",
   "TC-SCP-002",
   "TC-SCP-003",
   "TC-PRC-001",
   "TC-PRC-002",
   "TC-PRC-003",
   "TC-PRC-004",
   "TC-TAX-001",
   "TC-TAX-002",
   "TC-VAL-001",
   "TC-VAL-002",
   "TC-PAY-001",
   "TC-PAY-002",
   "TC-PAY-003",
   "TC-PAY-004",
   "TC-PAY-005",
   "TC-PAY-006",
   "TC-PAY-007",
   "TC-CRD-001",
   "TC-CRD-002",
   "TC-MSR-001",
   "TC-MSR-002",
   "TC-MSR-003",
   "TC-MSR-004",
   "TC-DWG-001",
   "TC-DWG-002",
   "TC-DWG-003",
   "TC-MAT-001",
   "TC-MAT-002",
   "TC-MAT-003",
   "TC-FIN-001",
   "TC-FIN-002",
   "TC-FIN-003",
   "TC-HDW-001",
   "TC-HDW-002",
   "TC-HDW-003",
   "TC-APP-001",
   "TC-APP-002",
   "TC-APP-003",
   "TC-APP-004",
   "TC-APP-005",
   "TC-APP-006",
   "TC-STN-001",
   "TC-STN-002",
   "TC-STN-003",
   "TC-STN-004",
   "TC-STN-005",
   "TC-STN-006",
   "TC-SNK-001",
   "TC-SNK-002",
   "TC-MFG-001",
   "TC-MFG-002",
   "TC-DLV-001",
   "TC-DLV-002",
   "TC-TRN-001",
   "TC-TRN-002",
   "TC-TRN-003",
   "TC-TRN-004",
   "TC-STO-001",
   "TC-STO-002",
   "TC-SIT-001",
   "TC-SIT-002",
   "TC-SIT-003",
   "TC-SIT-004",
   "TC-INS-001",
   "TC-INS-002",
   "TC-INS-003",
   "TC-INS-004",
   "TC-LBR-001",
   "TC-LBR-002",
   "TC-CHG-001",
   "TC-CHG-002",
   "TC-CHG-003",
   "TC-CHG-004",
   "TC-CHG-005",
   "TC-DLY-001",
   "TC-DLY-002",
   "TC-DMG-001",
   "TC-DMG-002",
   "TC-WAR-001",
   "TC-WAR-002",
   "TC-WAR-003",
   "TC-WAR-004",
   "TC-WAR-005",
   "TC-CAN-001",
   "TC-CAN-002",
   "TC-CAN-003",
   "TC-HLD-001",
   "TC-HLD-002",
   "TC-OWN-001",
   "TC-FMJ-001",
   "TC-ACC-001",
   "TC-ACC-002"
  ]
 }
]


def seed_all(company=None):
    if not company:
        company = (frappe.db.get_value("Company", {"company_name": "Vera Enterprises"}, "name")
                   or frappe.db.get_value("Company", {}, "name"))
    made = {"clauses": 0, "templates": 0, "company": company}
    for c in CLAUSES:
        if frappe.db.exists("Vera Terms Clause", c["code"]):
            continue
        doc = frappe.new_doc("Vera Terms Clause")
        doc.update({"code": c["code"], "title": c["title"][:140], "category": c["category"],
                    "applies_to_scope": "All", "mandatory": c["mandatory"],
                    "status": "Active", "customer_text": c["customer_text"], "company": company})
        doc.insert(ignore_permissions=True)
        made["clauses"] += 1
    by_code = {c["code"]: c for c in CLAUSES}
    for t in TEMPLATES:
        if frappe.db.exists("Vera Terms Template", t["code"]):
            continue
        doc = frappe.new_doc("Vera Terms Template")
        doc.update({"code": t["code"], "template_name": t["name"], "category": t["category"],
                    "version": "1", "status": "Active", "company": company})
        for code in t["clauses"]:
            c = by_code.get(code)
            if not c:
                continue
            doc.append("clauses", {"clause": code, "title": c["title"][:140],
                                   "mandatory": c["mandatory"], "customer_text": c["customer_text"]})
        doc.insert(ignore_permissions=True)
        made["templates"] += 1
    frappe.db.commit()
    return made
