import { useMemo, useState } from "react"
import { ArrowUpDown, Search, Download, Printer } from "lucide-react"
import { cn } from "@/lib/utils"

export interface DataTableColumn<T> {
  key: string
  header: string
  align?: "left" | "right"
  sortable?: boolean
  render?: (row: T) => React.ReactNode
  sortValue?: (row: T) => string | number
  className?: string
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  searchable?: boolean
  searchPlaceholder?: string
  searchText?: (row: T) => string
  onExport?: () => void
  onPrint?: () => void
  emptyMessage?: string
  defaultSortKey?: string
  defaultSortDir?: "asc" | "desc"
  className?: string
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  searchable = true,
  searchPlaceholder = "Search...",
  searchText,
  onExport,
  onPrint,
  emptyMessage = "No records found.",
  defaultSortKey,
  defaultSortDir = "desc",
  className,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("")
  const [sortKey, setSortKey] = useState<string | undefined>(defaultSortKey)
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir)

  const filtered = useMemo(() => {
    if (!query || !searchText) return rows
    const q = query.toLowerCase()
    return rows.filter((r) => searchText(r).toLowerCase().includes(q))
  }, [rows, query, searchText])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    const col = columns.find((c) => c.key === sortKey)
    if (!col) return filtered
    const getVal = col.sortValue ?? ((r: T) => (r as Record<string, unknown>)[col.key] as string | number)
    const copy = [...filtered]
    copy.sort((a, b) => {
      const av = getVal(a)
      const bv = getVal(b)
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av
      const as = String(av).toLowerCase()
      const bs = String(bv).toLowerCase()
      return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as)
    })
    return copy
  }, [filtered, sortKey, sortDir, columns])

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
  }

  return (
    <div className={cn("w-full", className)}>
      {(searchable || onExport || onPrint) && (
        <div className="no-print flex flex-wrap items-center gap-2 mb-3">
          {searchable && (
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md outline-none"
                style={{ border: "var(--border-card)", background: "#fff", color: "var(--text-primary)" }}
              />
            </div>
          )}
          {onExport && (
            <button
              onClick={onExport}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md text-white"
              style={{ background: "var(--brand-primary)" }}
            >
              <Download size={12} /> Export
            </button>
          )}
          {onPrint && (
            <button
              onClick={onPrint}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md"
              style={{ background: "var(--gold)", color: "var(--brand-primary)" }}
            >
              <Printer size={12} /> Print
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg" style={{ border: "var(--border-card)" }}>
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                  className={cn(
                    "px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap",
                    col.align === "right" ? "text-right" : "text-left",
                    col.sortable && "cursor-pointer select-none",
                    col.className
                  )}
                  style={{ background: "var(--cream)", color: "var(--brand-primary)", borderBottom: "1px solid var(--border-card)" }}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && <ArrowUpDown size={10} style={{ color: "var(--text-muted)" }} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="transition-colors"
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#faf6ed")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-3 py-2.5",
                        col.align === "right" && "text-right tabular-nums font-medium",
                        col.className
                      )}
                      style={{ borderBottom: "0.5px solid var(--border-card)", color: "var(--text-primary)" }}
                    >
                      {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
