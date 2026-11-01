export default function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-800",
    completed: "bg-emerald-100 text-emerald-800",
    occupied: "bg-blue-100 text-blue-800",
    vacant: "bg-slate-100 text-slate-700",
    unpaid: "bg-rose-100 text-rose-800",
    partially_paid: "bg-amber-100 text-amber-800",
    pending: "bg-amber-100 text-amber-800",
    in_progress: "bg-blue-100 text-blue-800",
    maintenance: "bg-orange-100 text-orange-800",
    active: "bg-emerald-100 text-emerald-800",
    inactive: "bg-slate-100 text-slate-600",
    cancelled: "bg-slate-100 text-slate-600",
    void: "bg-slate-100 text-slate-600",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${styles[status] ?? "bg-slate-100 text-slate-700"}`}>{status.replaceAll("_", " ")}</span>;
}
