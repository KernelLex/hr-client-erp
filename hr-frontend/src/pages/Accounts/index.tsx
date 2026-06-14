import { useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import { BookOpen } from "lucide-react"
import { DriveDocumentsTab } from "./DriveDocumentsTab"
import { UploadStatusTab } from "./UploadStatusTab"
import { FolderViewTab } from "./FolderViewTab"

type Tab = "documents" | "folder-view" | "upload-status"

const TABS: { id: Tab; label: string }[] = [
  { id: "documents", label: "Drive Documents" },
  { id: "folder-view", label: "Folder View" },
  { id: "upload-status", label: "Upload Status" },
]

export default function AccountsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const activeTab = useMemo<Tab>(() => {
    const t = searchParams.get("tab")
    if (t === "upload") return "upload-status"
    if (t === "folder") return "folder-view"
    return "documents"
  }, [searchParams])

  function setActiveTab(tab: Tab) {
    if (tab === "upload-status") setSearchParams({ tab: "upload" }, { replace: true })
    else if (tab === "folder-view") setSearchParams({ tab: "folder" }, { replace: true })
    else setSearchParams({}, { replace: true })
  }

  return (
    <div className="p-6" style={{ backgroundColor: "var(--bg-app)", minHeight: "100%" }}>
      <div className="max-w-[1400px] mx-auto">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: "#1D9E75" }}
          >
            <BookOpen size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
              Accounts
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Vera Enterprises — Document Management
            </p>
          </div>
        </div>

        {/* Sub-tabs */}
        <div
          className="flex gap-1 p-1 rounded-xl mb-6 w-fit"
          style={{ backgroundColor: "#f1f5f9" }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150"
              style={
                activeTab === tab.id
                  ? {
                      backgroundColor: "#fff",
                      color: "var(--text-primary)",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                    }
                  : { color: "#64748b" }
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "documents" && <DriveDocumentsTab />}
        {activeTab === "folder-view" && <FolderViewTab />}
        {activeTab === "upload-status" && <UploadStatusTab />}
      </div>
    </div>
  )
}
