/** Export rows as a downloaded CSV file. Values are stringified and quoted if they contain a comma/quote/newline. */
export function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  function esc(v: string | number): string {
    const s = String(v ?? "")
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const body = [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))].join("\n")
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
