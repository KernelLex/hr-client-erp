"""
Quotation Studio — costing & commercial math regression checks.

Pure-function verification of the cost-sheet line compute (§2.2/§60, the 13-cost-
component breakdown → total_cost / suggested selling price / per-line GP) and the
quotation totals cascade + negotiated-total back-computation (§66). No DB writes —
safe to run anytime.

Run: bench --site vera.local execute hr_client.tests.verify_quotation_math.run
"""
import frappe  # frappe.utils.flt only — no connect/writes needed
from hr_client.api import cost_sheet as CS, quotation as Q


class _Row(dict):
    """A stand-in for a Frappe child row: supports both .get(k) and attr access."""
    def get(self, k, d=0):
        return dict.get(self, k, d)

    def __getattr__(self, k):
        return dict.get(self, k, 0)

    def __setattr__(self, k, v):
        self[k] = v


def run():
    passed, failed = [], []

    def ok(cond, msg):
        (passed if cond else failed).append(msg)
        print(("✅ PASS " if cond else "❌ FAIL ") + msg)

    # ── cost_sheet._line_maths ────────────────────────────────────────────────
    ln = _Row(material_cost=6000, hardware_cost=3000, labour_cost=2000,
              installation_cost=1000, calc_qty=1)
    CS._line_maths(ln, 35)
    ok(ln.total_cost == 12000, f"line total_cost = Σ components = {ln.total_cost} (expect 12000)")
    ok(abs(ln.suggested_selling_price - 12000 / 0.65) < 1,
       f"suggested SP from 35% target GP = {ln.suggested_selling_price:.2f}")

    lnf = _Row(cost_rate=500, calc_qty=4)   # no components → fallback rate × qty
    CS._line_maths(lnf, 30)
    ok(lnf.total_cost == 2000, f"fallback total_cost = rate × qty = {lnf.total_cost} (expect 2000)")

    lnp = _Row(material_cost=10000, calc_qty=1, proposed_selling_price=20000, discount_percent=10)
    CS._line_maths(lnp, 35)
    ok(lnp.final_selling_price == 18000, f"final SP after 10% discount = {lnp.final_selling_price} (expect 18000)")
    ok(abs(lnp.gp_percent - (8000 / 18000 * 100)) < 0.1, f"realised per-line GP% = {lnp.gp_percent}")

    # ── cost_sheet._apply_maths ───────────────────────────────────────────────
    cd = _Row(target_gp_percent=35, overhead_percent=10, selling_total=25000,
              lines=[_Row(material_cost=6000, hardware_cost=3000, labour_cost=2000,
                          installation_cost=1000, calc_qty=1)])
    CS._apply_maths(cd)
    ok(cd.base_cost == 12000, f"base_cost = Σ line totals = {cd.base_cost} (expect 12000)")
    ok(cd.total_cost == 13200, f"total_cost with 10% overhead = {cd.total_cost} (expect 13200)")

    # ── quotation._apply_maths cascade + negotiated back-computation (§66) ─────
    qd = _Row(discount_percent=8, adjustment=0, gst_percent=18, cost_basis=12000,
              lines=[_Row(quantity=1, rate=20000)])
    Q._apply_maths(qd)
    expect_grand = (20000 - 20000 * 0.08) * 1.18
    ok(abs(qd.grand_total - expect_grand) < 0.5,
       f"grand-total cascade = {qd.grand_total:.2f} (expect {expect_grand:.2f})")

    target_final = expect_grand - 1000
    qd.adjustment = round(target_final / 1.18 - (qd.gross_total - qd.discount_amount), 2)
    Q._apply_maths(qd)
    ok(abs(qd.grand_total - target_final) < 1,
       f"negotiated grand-total hits target = {qd.grand_total:.2f} (target {target_final:.2f})")

    print(f"\nRESULT: {len(passed)} passed, {len(failed)} failed")
    return {"passed": len(passed), "failed": len(failed), "failures": failed}
