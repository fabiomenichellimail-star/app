import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const MAP = {
  VERIFICATO: {
    label: "Verificato",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Icon: CheckCircle2,
  },
  NON_QUADRATO: {
    label: "Non quadrato",
    cls: "bg-red-50 text-red-700 border-red-200",
    Icon: XCircle,
  },
  DA_CONTROLLARE: {
    label: "Da controllare",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
    Icon: AlertTriangle,
  },
};

export function StatusBadge({ status, className = "" }) {
  const cfg = MAP[status] || MAP.DA_CONTROLLARE;
  const { Icon } = cfg;
  return (
    <span
      data-testid={`status-badge-${status}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cfg.cls} ${className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  );
}
