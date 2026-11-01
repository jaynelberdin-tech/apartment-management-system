"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, Users, CalendarDays, ShieldCheck, Search, RefreshCw,
  ChevronLeft, ChevronRight, History, X, Clock3, UserRound,
  FileText, ArrowRight, Eye, SlidersHorizontal,
} from "lucide-react";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type ActivityLog = {
  id: number;
  user_id: string | null;
  actor_name: string;
  actor_role: string | null;
  module: string;
  action: string;
  description: string;
  entity_type: string | null;
  entity_id: string | null;
  old_values: Record<string, JsonValue> | null;
  new_values: Record<string, JsonValue> | null;
  created_at: string;
};

type Props = { logs: ActivityLog[] };
const PAGE_SIZE = 8;

const moduleColors: Record<string, string> = {
  Tenants: "bg-emerald-50 text-emerald-700",
  Units: "bg-orange-50 text-orange-700",
  Billing: "bg-indigo-50 text-indigo-700",
  Payments: "bg-green-50 text-green-700",
  Maintenance: "bg-blue-50 text-blue-700",
  Accounts: "bg-purple-50 text-purple-700",
  System: "bg-slate-100 text-slate-700",
  Authentication: "bg-cyan-50 text-cyan-700",
};

const actionColors: Record<string, string> = {
  Created: "bg-emerald-50 text-emerald-700",
  Recorded: "bg-green-50 text-green-700",
  Updated: "bg-blue-50 text-blue-700",
  "Status Changed": "bg-amber-50 text-amber-700",
  Completed: "bg-teal-50 text-teal-700",
  Deleted: "bg-rose-50 text-rose-700",
  Login: "bg-cyan-50 text-cyan-700",
  Logout: "bg-slate-100 text-slate-700",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    month: "short", day: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function prettyKey(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function prettyValue(value: JsonValue | undefined) {
  if (value === undefined) return "—";
  if (value === null || value === "") return "Empty";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function Snapshot({ title, values, tone }: {
  title: string;
  values: Record<string, JsonValue> | null;
  tone: "before" | "after";
}) {
  const entries = Object.entries(values ?? {}).filter(([key]) =>
    !["id", "created_at", "updated_at"].includes(key)
  );
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className={`border-b px-4 py-3 text-xs font-bold uppercase tracking-wide ${tone === "before" ? "border-amber-100 bg-amber-50 text-amber-800" : "border-emerald-100 bg-emerald-50 text-emerald-800"}`}>
        {title}
      </div>
      {entries.length ? (
        <dl className="divide-y divide-slate-100">
          {entries.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[minmax(110px,0.8fr)_minmax(0,1.2fr)] gap-3 px-4 py-3 text-sm">
              <dt className="font-medium text-slate-500">{prettyKey(key)}</dt>
              <dd className="min-w-0 break-words whitespace-pre-wrap text-slate-800">{prettyValue(value)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="px-4 py-5 text-sm text-slate-500">No previous values.</p>
      )}
    </div>
  );
}

export default function ActivityLogsClient({ logs }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("All Modules");
  const [actionFilter, setActionFilter] = useState("All Actions");
  const [dateFilter, setDateFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  const today = new Date();
  const filteredLogs = useMemo(() => logs.filter((log) => {
    const searchText = [log.actor_name, log.module, log.action, log.description, log.entity_id]
      .filter(Boolean).join(" ").toLowerCase();
    const query = search.trim().toLowerCase();
    const date = new Date(log.created_at);
    const matchesDate = dateFilter === "all" ||
      (dateFilter === "today" && date.toDateString() === today.toDateString()) ||
      (dateFilter === "month" && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear());
    return (!query || searchText.includes(query)) &&
      (moduleFilter === "All Modules" || log.module.toLowerCase() === moduleFilter.toLowerCase()) &&
      (actionFilter === "All Actions" || log.action.toLowerCase() === actionFilter.toLowerCase()) && matchesDate;
  }), [logs, search, moduleFilter, actionFilter, dateFilter, today]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleLogs = filteredLogs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const todayCount = logs.filter((log) => new Date(log.created_at).toDateString() === today.toDateString()).length;
  const monthCount = logs.filter((log) => {
    const date = new Date(log.created_at);
    return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  }).length;
  const adminCount = logs.filter((log) => log.actor_role === "admin").length;

  const cards = [
    { label: "Recent Activities", value: logs.length, icon: Activity, color: "bg-blue-50 text-blue-700" },
    { label: "This Month", value: monthCount, icon: Users, color: "bg-emerald-50 text-emerald-700" },
    { label: "Today", value: todayCount, icon: CalendarDays, color: "bg-indigo-50 text-indigo-700" },
    { label: "Admin Actions", value: adminCount, icon: ShieldCheck, color: "bg-orange-50 text-orange-700" },
  ];

  function resetPage() { setPage(1); }

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-700">SYSTEM MONITORING</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Activity Logs</h1>
          <p className="mt-2 text-slate-500">Track important activities performed across your apartment management system.</p>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 sm:self-auto">
          <History size={18} className="text-blue-700" /> Audit history
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-100/60">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-500">{label}</span>
              <span className={`rounded-xl p-3 ${color}`}><Icon size={21} /></span>
            </div>
            <p className="mt-4 text-3xl font-bold text-slate-900">{value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100/60">
        <div className="grid gap-3 xl:grid-cols-[minmax(260px,1.6fr)_repeat(3,minmax(150px,1fr))_auto]">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="field pl-10" placeholder="Search activities, users, records..." value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} />
          </div>
          <select className="field" value={moduleFilter} onChange={(e) => { setModuleFilter(e.target.value); resetPage(); }}>
            <option>All Modules</option>
            { ["Tenants", "Units", "Billing", "Payments", "Maintenance", "Accounts", "System", "Authentication"].map((item) => <option key={item}>{item}</option>) }
          </select>
          <select className="field" value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); resetPage(); }}>
            <option>All Actions</option>
            {["Created", "Updated", "Deleted", "Recorded", "Completed", "Status Changed", "Login", "Logout"].map((item) => <option key={item}>{item}</option>)}
          </select>
          <select className="field" value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); resetPage(); }}>
            <option value="all">All Dates</option><option value="today">Today</option><option value="month">This Month</option>
          </select>
          <button type="button" onClick={() => router.refresh()} className="flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-800">
            <RefreshCw size={17} /> Refresh
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-400"><SlidersHorizontal size={14} /> Showing the latest 500 records. Use filters to narrow the list.</div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-100/60">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div className="flex items-center gap-2"><History size={20} className="text-blue-700" /><h2 className="font-bold text-slate-900">Activity History</h2></div>
          <span className="text-xs text-slate-500">Newest first</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4 font-semibold">Date &amp; Time</th>
                <th className="px-5 py-4 font-semibold">User</th>
                <th className="px-5 py-4 font-semibold">Module</th>
                <th className="px-5 py-4 font-semibold">Action</th>
                <th className="px-5 py-4 font-semibold">Description</th>
                <th className="px-5 py-4 text-right font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleLogs.map((log) => (
                <tr key={log.id} className="transition hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-5 py-4 text-slate-600">{formatDate(log.created_at)}</td>
                  <td className="px-5 py-4"><div className="flex items-center gap-2.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{(log.actor_name || "?").charAt(0).toUpperCase()}</span><span className="font-medium text-slate-800">{log.actor_name || "Unknown user"}</span></div></td>
                  <td className="px-5 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${moduleColors[log.module] ?? "bg-slate-100 text-slate-700"}`}>{log.module}</span></td>
                  <td className="px-5 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${actionColors[log.action] ?? "bg-slate-100 text-slate-700"}`}>{log.action}</span></td>
                  <td className="max-w-xl px-5 py-4 text-slate-600"><p className="line-clamp-2">{log.description}</p></td>
                  <td className="px-5 py-4 text-right"><button type="button" onClick={() => setSelectedLog(log)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"><Eye size={14} /> View</button></td>
                </tr>
              ))}
              {visibleLogs.length === 0 && <tr><td colSpan={6} className="px-5 py-16 text-center"><History size={32} className="mx-auto mb-3 text-slate-300" /><p className="font-semibold text-slate-700">No activity found</p><p className="mt-1 text-sm text-slate-500">Try changing your search or filters.</p></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">Showing {filteredLogs.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredLogs.length)} of {filteredLogs.length} activities</p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={currentPage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40" aria-label="Previous page"><ChevronLeft size={18} /></button>
            <span className="px-2 text-sm font-medium text-slate-700">Page {currentPage} of {totalPages}</span>
            <button type="button" disabled={currentPage === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40" aria-label="Next page"><ChevronRight size={18} /></button>
          </div>
        </div>
      </section>

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedLog(null); }}>
          <aside role="dialog" aria-modal="true" aria-labelledby="activity-detail-title" className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-6">
              <div><p className="text-xs font-bold uppercase tracking-wide text-blue-700">Activity record #{selectedLog.id}</p><h2 id="activity-detail-title" className="mt-1 text-xl font-bold text-slate-900">Activity Details</h2><p className="mt-1 text-sm text-slate-500">Full record and captured changes</p></div>
              <button type="button" onClick={() => setSelectedLog(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close details"><X size={20} /></button>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              <div className="rounded-xl bg-slate-50 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><FileText size={17} className="text-blue-700" />{selectedLog.description}</div><div className="mt-3 grid gap-4 sm:grid-cols-2"><div><p className="text-xs font-semibold uppercase text-slate-400">Performed by</p><p className="mt-1 text-sm font-medium text-slate-800">{selectedLog.actor_name || "Unknown user"}</p></div><div><p className="text-xs font-semibold uppercase text-slate-400">Role</p><p className="mt-1 text-sm font-medium capitalize text-slate-800">{selectedLog.actor_role || "Unknown"}</p></div><div><p className="text-xs font-semibold uppercase text-slate-400">Module / Action</p><p className="mt-1 text-sm font-medium text-slate-800">{selectedLog.module} · {selectedLog.action}</p></div><div><p className="text-xs font-semibold uppercase text-slate-400">Date &amp; Time</p><p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-slate-800"><Clock3 size={14} />{formatDate(selectedLog.created_at)}</p></div><div><p className="text-xs font-semibold uppercase text-slate-400">Affected record</p><p className="mt-1 text-sm font-medium text-slate-800">{selectedLog.entity_type || "—"}{selectedLog.entity_id ? ` #${selectedLog.entity_id}` : ""}</p></div><div><p className="text-xs font-semibold uppercase text-slate-400">Actor ID</p><p className="mt-1 break-all text-xs text-slate-600">{selectedLog.user_id || "Deleted / system actor"}</p></div></div></div>
              <div className="flex items-center gap-2"><UserRound size={17} className="text-slate-500" /><h3 className="font-bold text-slate-900">Before-and-after values</h3></div>
              <Snapshot title="Previous values" values={selectedLog.old_values} tone="before" />
              <div className="flex justify-center text-slate-400"><ArrowRight size={18} /></div>
              <Snapshot title="New values" values={selectedLog.new_values} tone="after" />
              <p className="text-xs leading-5 text-slate-400">Activity records are read-only. Sensitive authentication credentials are not included in these snapshots.</p>
            </div>
            <div className="border-t border-slate-200 p-4"><button type="button" onClick={() => setSelectedLog(null)} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Close details</button></div>
          </aside>
        </div>
      )}
    </div>
  );
}
