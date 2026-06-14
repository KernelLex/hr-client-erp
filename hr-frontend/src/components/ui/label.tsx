import { cn } from "@/lib/utils"

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children?: React.ReactNode
}

export function Label({ className, children, ...props }: LabelProps) {
  return (
    <label
      className={cn(
        "text-sm font-medium text-gray-700 block mb-1",
        className
      )}
      {...props}
    >
      {children}
    </label>
  )
}
