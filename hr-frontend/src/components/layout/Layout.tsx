import { Outlet } from "react-router-dom"
import { Sidebar } from "./Sidebar"
import { TopBar } from "./TopBar"
import { useState, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { checkAIStatus, getBusinessSnapshot, getDashboardInsights } from "@/api/ai"

function useBackgroundAIWarmup() {
  const qc = useQueryClient()
  useEffect(() => {
    // Prefetch AI status and business snapshot immediately on app open.
    // getDashboardInsights (LLM call) fires 8 seconds later so the page
    // and faster queries render first.
    qc.prefetchQuery({ queryKey: ["ai-status"], queryFn: checkAIStatus, staleTime: 60_000 })
    qc.prefetchQuery({ queryKey: ["business-snapshot"], queryFn: getBusinessSnapshot, staleTime: 5 * 60_000 })
    const timer = setTimeout(() => {
      qc.prefetchQuery({ queryKey: ["dashboard-insights"], queryFn: getDashboardInsights, staleTime: 5 * 60_000 })
    }, 8_000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  useBackgroundAIWarmup()

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "var(--bg-app)" }}>
      {/* Mobile backdrop — closes sidebar on tap outside */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar onToggleSidebar={() => setSidebarOpen((v) => !v)} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
