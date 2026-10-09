import type { Grn } from "@/api/logistics"

// Opens a clean, printable Goods Receipt Note in a new window and triggers the
// browser print dialog. The document has a tick box per line (to physically
// mark what actually arrived) plus empty Signature and Seal fields that the
// logistics person fills in by hand after printing.
export function printGrnReceipt(grn: Grn) {
  const esc = (s: unknown) =>
    String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string))
  const date = grn.receipt_date || new Date().toISOString().slice(0, 10)

  const rows = (grn.lines || [])
    .map((l, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${esc(l.item_description || l.item_code || "Item")}${l.spec ? `<div class="sub">${esc(l.spec)}</div>` : ""}</td>
        <td class="c">${esc(l.uom || "")}</td>
        <td class="c">${esc(l.ordered_qty ?? "")}</td>
        <td class="c rcv">&nbsp;</td>
        <td class="c"><span class="box"></span></td>
      </tr>`)
    .join("")

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Goods Receipt Note — ${esc(grn.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 32px; font-size: 13px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 12px; }
  .company { font-size: 20px; font-weight: 700; }
  .title { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; text-align: right; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin: 16px 0 20px; }
  .meta div { padding: 2px 0; }
  .meta .k { color: #555; display: inline-block; min-width: 110px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #999; padding: 7px 8px; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; font-size: 11px; text-transform: uppercase; letter-spacing: .3px; }
  td.c, th.c { text-align: center; }
  td.rcv { min-width: 70px; }
  .sub { color: #666; font-size: 11px; margin-top: 2px; }
  .box { display: inline-block; width: 15px; height: 15px; border: 1.5px solid #333; }
  .note { margin-top: 10px; font-size: 11px; color: #555; }
  .sign { display: flex; gap: 40px; margin-top: 56px; }
  .sign > div { flex: 1; }
  .sign .field { height: 64px; border: 1px solid #999; border-radius: 4px; }
  .sign .lbl { font-size: 11px; color: #555; margin-top: 6px; text-transform: uppercase; letter-spacing: .3px; }
  .foot { margin-top: 28px; font-size: 10px; color: #999; text-align: center; }
  @media print { body { margin: 14mm; } .noprint { display: none; } }
</style></head>
<body>
  <div class="top">
    <div class="company">${esc(grn.company || "Vera Enterprises")}</div>
    <div class="title">Goods Receipt Note</div>
  </div>
  <div class="meta">
    <div><span class="k">GRN No.</span> ${esc(grn.name)}</div>
    <div><span class="k">Date</span> ${esc(date)}</div>
    <div><span class="k">Vendor</span> ${esc(grn.vendor || "—")}</div>
    <div><span class="k">Purchase Order</span> ${esc(grn.purchase_order || "—")}</div>
    ${grn.project ? `<div><span class="k">Project</span> ${esc(grn.project)}</div>` : ""}
    <div><span class="k">Status</span> ${esc(grn.status || "")}</div>
  </div>
  <table>
    <thead><tr>
      <th class="c" style="width:36px">#</th>
      <th>Item</th>
      <th class="c" style="width:70px">UOM</th>
      <th class="c" style="width:90px">Ordered</th>
      <th class="c" style="width:90px">Received</th>
      <th class="c" style="width:90px">Received ✓</th>
    </tr></thead>
    <tbody>${rows || `<tr><td colspan="6" class="c" style="color:#999;padding:24px">No line items</td></tr>`}</tbody>
  </table>
  <div class="note">Tick the box for each line that was physically received, and write the received quantity. Note any shortages or damage below.</div>
  <div class="sign">
    <div><div class="field"></div><div class="lbl">Received by — Signature</div></div>
    <div><div class="field"></div><div class="lbl">Company Seal</div></div>
  </div>
  <div class="foot">Generated from Vera ERP · This document is valid only when signed and sealed.</div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 150); };</script>
</body></html>`

  const w = window.open("", "_blank", "width=900,height=1000")
  if (!w) return
  w.document.open()
  w.document.write(html)
  w.document.close()
}
