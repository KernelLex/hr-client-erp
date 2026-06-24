import { FileText, Download, Image as ImageIcon } from "lucide-react"

function formatBytes(bytes: number) {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface Props {
  file_url: string
  file_name: string | null
  file_type: string | null
  file_size: number | null
  compact?: boolean
}

export function FilePreview({ file_url, file_name, file_type, file_size, compact }: Props) {
  const isImage = file_type?.startsWith("image/") ?? false
  const name = file_name || "Attachment"
  const ext = name.split(".").pop()?.toUpperCase() || "FILE"

  if (isImage) {
    return (
      <a href={file_url} target="_blank" rel="noopener noreferrer" className="block mt-1">
        <img
          src={file_url}
          alt={name}
          className={
            compact
              ? "max-h-32 rounded-lg object-cover border border-gray-200 hover:opacity-90 transition-opacity cursor-zoom-in"
              : "max-w-[280px] max-h-48 rounded-lg object-cover border border-gray-200 hover:opacity-90 transition-opacity cursor-zoom-in"
          }
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.display = "none"
          }}
        />
        {!compact && (
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
            <ImageIcon size={10} />
            {name}
            {file_size ? ` · ${formatBytes(file_size)}` : ""}
          </p>
        )}
      </a>
    )
  }

  return (
    <a
      href={file_url}
      target="_blank"
      rel="noopener noreferrer"
      download={name}
      className={
        compact
          ? "inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800"
          : "mt-1 flex items-center gap-2.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-100 transition-colors max-w-[280px]"
      }
    >
      {compact ? (
        <>
          <FileText size={12} />
          <span className="truncate max-w-[160px]">{name}</span>
        </>
      ) : (
        <>
          <div className="w-8 h-8 rounded-md bg-indigo-100 flex items-center justify-center shrink-0">
            <FileText size={16} className="text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
            <p className="text-xs text-gray-500">
              {ext}
              {file_size ? ` · ${formatBytes(file_size)}` : ""}
            </p>
          </div>
          <Download size={14} className="text-gray-400 shrink-0" />
        </>
      )}
    </a>
  )
}
