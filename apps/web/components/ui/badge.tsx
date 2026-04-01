import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors",
  {
    variants: {
      variant: {
        default:  "bg-white/10 border-white/20 text-slate-300",
        success:  "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
        warning:  "bg-amber-500/15 border-amber-500/30 text-amber-400",
        error:    "bg-red-500/15 border-red-500/30 text-red-400",
        info:     "bg-brand-500/15 border-brand-500/30 text-brand-400",
        purple:   "bg-purple-500/15 border-purple-500/30 text-purple-400",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function DomainStatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: any; label: string }> = {
    PENDING_VERIFICATION: { variant: "warning", label: "Pending" },
    VERIFIED:  { variant: "info",    label: "Verified" },
    WARMING:   { variant: "purple",  label: "Warming" },
    WARMED:    { variant: "success", label: "Warmed" },
    PAUSED:    { variant: "default", label: "Paused" },
    ERROR:     { variant: "error",   label: "Error" },
  };
  const { variant, label } = map[status] ?? { variant: "default", label: status };
  return <Badge variant={variant}>{label}</Badge>;
}

export function WarmingStatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: any; label: string; dot?: string }> = {
    ACTIVE:    { variant: "success", label: "Active", dot: "bg-emerald-400" },
    PAUSED:    { variant: "warning", label: "Paused" },
    SCHEDULED: { variant: "info",    label: "Scheduled" },
    COMPLETED: { variant: "default", label: "Completed" },
    FAILED:    { variant: "error",   label: "Failed" },
  };
  const { variant, label, dot } = map[status] ?? { variant: "default", label: status };
  return (
    <Badge variant={variant}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot} animate-pulse`} />}
      {label}
    </Badge>
  );
}
