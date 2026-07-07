import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface DrillDownModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: React.ReactNode
  summary?: React.ReactNode
}

export function DrillDownModal({ open, onOpenChange, title, children, summary }: DrillDownModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay style={{ background: "rgba(30,58,47,0.55)" }} />
        <DialogPrimitive.Popup
          className={cn(
            "fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-2xl p-6 outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          )}
          style={{ background: "#fff", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
        >
          <div className="flex items-center justify-between pb-3.5 mb-4" style={{ borderBottom: "var(--border-card)" }}>
            <h3 className="font-heading text-xl" style={{ color: "var(--brand-primary)" }}>{title}</h3>
            <DialogPrimitive.Close
              className="no-print flex size-8 items-center justify-center rounded-md transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              <XIcon className="size-4" />
            </DialogPrimitive.Close>
          </div>
          {children}
          {summary && (
            <div
              className="flex gap-5 flex-wrap px-4 py-3.5 rounded-lg mt-4 text-xs"
              style={{ background: "var(--cream)" }}
            >
              {summary}
            </div>
          )}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  )
}

export function SummaryStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span style={{ color: "var(--text-muted)" }}>{label}: </span>
      <strong className="font-heading" style={{ color: "var(--brand-primary)", fontSize: "15px" }}>{value}</strong>
    </div>
  )
}
