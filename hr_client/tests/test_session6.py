"""
Session 6 Tests — Verification Page Overhaul

Run: bench --site hrms.localhost execute hr_client.tests.test_session6.run_all
"""
import frappe
import json


VE_DOCTYPES = [
    "VE Sales Invoice", "VE Purchase Invoice", "VE Purchase Order", "VE Quotation",
    "VE Credit Note", "VE Debit Note", "VE Financial Report", "VE Salary Record",
    "VE Stock Record", "VE Sales Order", "VE GRN", "VE Payment Record",
]

_PASS = "✅ PASS"
_FAIL = "❌ FAIL"


def _check(cond, name, detail=""):
    status = _PASS if cond else _FAIL
    msg = f"{status}: {name}"
    if detail:
        msg += f" — {detail}"
    print(msg)
    return cond


def test_custom_fields_exist():
    """TEST 1: All 4 new custom fields exist on all 12 VE DocTypes"""
    required = ["extraction_attempts", "extraction_history", "manual_review_required", "last_extraction_at"]
    missing = []
    for dt in VE_DOCTYPES:
        for field in required:
            cf_name = f"{dt}-{field}"
            if not frappe.db.exists("Custom Field", cf_name):
                missing.append(cf_name)
    return _check(len(missing) == 0, "TEST 1: New custom fields exist on all VE DocTypes",
                  f"Missing: {missing}" if missing else "All 48 fields present")


def test_no_auto_verified_records():
    """TEST 2: No records remain with verified_by = 'Vera AI (auto)'"""
    total_ai_verified = 0
    for dt in VE_DOCTYPES:
        count = frappe.db.count(dt, {"verified_by": "Vera AI (auto)"})
        total_ai_verified += count
    return _check(total_ai_verified == 0, "TEST 2: No AI-auto-verified records remain",
                  f"Found {total_ai_verified} AI-verified records")


def test_extraction_attempts_initialized():
    """TEST 3: extraction_attempts >= 1 for records that have been extracted"""
    results = []
    for dt in VE_DOCTYPES:
        records = frappe.db.get_all(dt,
            filters={"original_extracted": ["!=", ""]},
            fields=["name", "extraction_attempts"])
        for r in records:
            attempts = int(r.get("extraction_attempts") or 0)
            if attempts == 0:
                results.append(f"{dt}:{r['name']}")
    return _check(len(results) == 0, "TEST 3: extraction_attempts initialized for extracted records",
                  f"Zero-attempts records: {results[:5]}" if results else "All initialized")


def test_reset_auto_verified_endpoint():
    """TEST 4: reset_auto_verified endpoint works correctly"""
    # First mark a test record as AI-verified
    test_dt = "VE Financial Report"
    records = frappe.db.get_all(test_dt, limit=1, fields=["name"])
    if not records:
        print(f"⚠ TEST 4: SKIP — no {test_dt} records")
        return True
    test_name = records[0]["name"]
    frappe.db.set_value(test_dt, test_name, {
        "verified_by": "Vera AI (auto)",
        "verification_status": "Verified",
    })
    frappe.db.commit()

    # Call endpoint
    frappe.set_user("Administrator")
    from hr_client.api.ai import reset_auto_verified
    result = reset_auto_verified()

    # Check reset happened
    vs = frappe.db.get_value(test_dt, test_name, "verification_status")
    vb = frappe.db.get_value(test_dt, test_name, "verified_by")

    passed = result.get("success") and vs == "Unverified" and not vb
    return _check(passed, "TEST 4: reset_auto_verified endpoint resets AI-verified records",
                  f"status={vs}, by={vb}, result={result}")


def test_get_all_extracted_records():
    """TEST 5: get_all_extracted_records returns all records with normalized fields"""
    frappe.set_user("Administrator")
    from hr_client.api.ai import get_all_extracted_records
    result = get_all_extracted_records()
    passed = (
        result.get("success")
        and result.get("total", 0) > 0
        and isinstance(result.get("records"), list)
        and isinstance(result.get("stats"), dict)
    )
    if passed:
        # Check normalized fields present
        rec = result["records"][0]
        has_fields = all(k in rec for k in ["party", "amount", "date", "priority", "manual_review_required"])
        passed = has_fields
    return _check(passed, "TEST 5: get_all_extracted_records returns normalized records",
                  f"total={result.get('total')}, has_fields={passed}")


def test_get_all_extracted_records_with_status_filter():
    """TEST 6: get_all_extracted_records filters by status"""
    frappe.set_user("Administrator")
    from hr_client.api.ai import get_all_extracted_records
    result = get_all_extracted_records(status="Unverified")
    all_unverified = all(r["verification_status"] == "Unverified" for r in result.get("records", []))
    return _check(all_unverified, "TEST 6: Status filter works on get_all_extracted_records",
                  f"total unverified={result.get('total')}")


def test_pipeline_attempt_tracking():
    """TEST 7: pipeline.py MAX_EXTRACTION_ATTEMPTS constant exists"""
    from vera_drive.pipeline import MAX_EXTRACTION_ATTEMPTS, LOW_CONFIDENCE_THRESHOLD
    passed = MAX_EXTRACTION_ATTEMPTS == 3 and LOW_CONFIDENCE_THRESHOLD == 50
    return _check(passed, "TEST 7: Pipeline constants MAX_EXTRACTION_ATTEMPTS=3, LOW_CONFIDENCE_THRESHOLD=50",
                  f"MAX={MAX_EXTRACTION_ATTEMPTS}, LOW={LOW_CONFIDENCE_THRESHOLD}")


def test_quick_action_approve():
    """TEST 8: quick_action approve marks record as Verified"""
    frappe.set_user("Administrator")
    test_dt = "VE Purchase Order"
    records = frappe.db.get_all(test_dt, limit=1, fields=["name"])
    if not records:
        print(f"⚠ TEST 8: SKIP — no {test_dt} records")
        return True

    test_name = records[0]["name"]
    # Reset to Unverified first
    frappe.db.set_value(test_dt, test_name, {"verification_status": "Unverified", "verified_by": None})
    frappe.db.commit()

    from hr_client.api.ai import quick_action
    result = quick_action(test_dt, test_name, "approve")

    vs = frappe.db.get_value(test_dt, test_name, "verification_status")
    passed = result.get("success") and vs == "Verified"
    return _check(passed, "TEST 8: quick_action approve marks record as Verified",
                  f"status={vs}, result={result}")


def run_all():
    print("\n" + "=" * 60)
    print("SESSION 6 TESTS — Verification Page Overhaul")
    print("=" * 60)

    # Pre-cleanup: reset any lingering AI-verified records so tests have clean state
    frappe.set_user("Administrator")
    from hr_client.api.ai import reset_auto_verified as _reset
    _reset()

    tests = [
        test_custom_fields_exist,
        test_no_auto_verified_records,
        test_extraction_attempts_initialized,
        test_reset_auto_verified_endpoint,
        test_get_all_extracted_records,
        test_get_all_extracted_records_with_status_filter,
        test_pipeline_attempt_tracking,
        test_quick_action_approve,
    ]

    passed = 0
    failed = 0
    for test_fn in tests:
        try:
            result = test_fn()
            if result:
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"❌ {test_fn.__name__}: EXCEPTION — {e}")
            failed += 1

    print("\n" + "=" * 60)
    print(f"RESULTS: {passed}/{len(tests)} PASS | {failed} FAIL")
    print("=" * 60)
