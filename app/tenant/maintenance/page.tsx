
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import StatusBadge from "@/components/StatusBadge";
import { dateLabel } from "@/lib/format";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  LoaderCircle,
  Plus,
  Search,
  Send,
  Wrench,
  X,
} from "lucide-react";

type Tenant = {
  id: number;
  unit_id: number | null;
};

type RequestRow = {
  id: number;
  request_no: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  request_date: string;
  resolution_notes: string | null;
  completed_at?: string | null;
  unit_id?: number;
};

type RequestFilter = "all" | "pending" | "in_progress" | "completed" | "cancelled";

const PAGE_SIZE = 6;

function prettyLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    low: "bg-slate-100 text-slate-600",
    normal: "bg-blue-50 text-blue-700",
    high: "bg-amber-50 text-amber-800",
    urgent: "bg-rose-50 text-rose-700",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        styles[priority.toLowerCase()] ?? styles.normal
      }`}
    >
      {prettyLabel(priority)}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  description,
  icon,
  iconClass,
}: {
  label: string;
  value: number;
  description: string;
  icon: React.ReactNode;
  iconClass: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {value}
          </p>
          <p className="mt-2 text-xs text-slate-500">{description}</p>
        </div>
        <div className={`rounded-xl p-3 ${iconClass}`}>{icon}</div>
      </div>
    </div>
  );
}

export default function TenantMaintenancePage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantChecked, setTenantChecked] = useState(false);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [priority, setPriority] = useState("normal");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RequestFilter>("all");
  const [page, setPage] = useState(1);
  const [selectedRequest, setSelectedRequest] = useState<RequestRow | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const supabase = useMemo(() => createClient(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        setTenant(null);
        setRows([]);
        setError("Your session could not be verified. Please sign in again.");
        return;
      }

      const { data: tenantData, error: tenantError } = await supabase
        .from("tenants")
        .select("id, unit_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (tenantError) throw tenantError;

      setTenant(tenantData);

      if (!tenantData) {
        setRows([]);
        return;
      }

      const { data, error: requestsError } = await supabase
        .from("maintenance_requests")
        .select(
          "id, request_no, title, description, category, priority, status, request_date, resolution_notes, completed_at, unit_id"
        )
        .eq("tenant_id", tenantData.id)
        .order("request_date", { ascending: false });

      if (requestsError) throw requestsError;

      setRows((data ?? []) as RequestRow[]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load your maintenance requests."
      );
    } finally {
      setLoading(false);
      setTenantChecked(true);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (submitting) return;

    if (!tenant) {
      setError(
        "Your tenant account is not linked to a tenant record. Please contact the administrator."
      );
      return;
    }

    if (!tenant.unit_id) {
      setError(
        "You need an assigned unit before submitting a maintenance request. Please contact the administrator."
      );
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (!trimmedTitle || !trimmedDescription) {
      setError("Please provide an issue title and description.");
      return;
    }

    setSubmitting(true);

    try {
      const { error: insertError } = await supabase
        .from("maintenance_requests")
        .insert({
          tenant_id: tenant.id,
          unit_id: tenant.unit_id,
          title: trimmedTitle,
          description: trimmedDescription,
          category,
          priority,
        });

      if (insertError) throw insertError;

      setSuccess("Your maintenance request was submitted successfully.");
      setTitle("");
      setDescription("");
      setCategory("other");
      setPriority("normal");

      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to submit your maintenance request."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const summary = useMemo(() => {
    const count = (status: string) =>
      rows.filter((row) => row.status.toLowerCase() === status).length;

    return {
      total: rows.length,
      pending: count("pending"),
      inProgress: count("in_progress"),
      completed: count("completed"),
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch =
        !term ||
        row.request_no.toLowerCase().includes(term) ||
        row.title.toLowerCase().includes(term) ||
        row.description.toLowerCase().includes(term) ||
        row.category.toLowerCase().includes(term) ||
        row.priority.toLowerCase().includes(term);

      const matchesFilter =
        filter === "all" || row.status.toLowerCase() === filter;

      return matchesSearch && matchesFilter;
    });
  }, [rows, search, filter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  const paginatedRows = filteredRows.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  useEffect(() => {
    setPage(1);
  }, [search, filter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="mx-auto max-w-7xl space-y-7 pb-10">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">
            Tenant / Maintenance
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            Maintenance requests
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Report issues in your apartment and track the progress of each
            request.
          </p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <Wrench size={25} />
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          <AlertCircle size={20} className="mt-0.5 shrink-0" />
          <p className="flex-1">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="shrink-0 font-semibold underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
          <p className="flex-1">{success}</p>
          <button
            type="button"
            onClick={() => setSuccess("")}
            aria-label="Dismiss success message"
            className="rounded-lg p-0.5 hover:bg-emerald-100"
          >
            <X size={17} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white">
          <LoaderCircle size={30} className="animate-spin text-blue-700" />
          <p className="text-sm text-slate-500">
            Loading your maintenance requests...
          </p>
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Total requests"
              value={summary.total}
              description="All requests submitted"
              icon={<FileText size={22} />}
              iconClass="bg-blue-50 text-blue-700"
            />
            <SummaryCard
              label="Pending"
              value={summary.pending}
              description="Awaiting action"
              icon={<Clock size={22} />}
              iconClass="bg-amber-50 text-amber-700"
            />
            <SummaryCard
              label="In progress"
              value={summary.inProgress}
              description="Currently being addressed"
              icon={<Wrench size={22} />}
              iconClass="bg-violet-50 text-violet-700"
            />
            <SummaryCard
              label="Completed"
              value={summary.completed}
              description="Resolved requests"
              icon={<CheckCircle2 size={22} />}
              iconClass="bg-emerald-50 text-emerald-700"
            />
          </section>

          <section
            id="submit-request"
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex items-start gap-3 border-b border-slate-200 p-5 sm:p-6">
              <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
                <Plus size={22} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Submit a maintenance request
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Tell the administrator what needs attention in your unit.
                </p>
              </div>
            </div>

            {!tenantChecked ? null : !tenant ? (
              <div className="p-6 text-sm text-slate-600">
                Your tenant profile is not linked to a tenant record. Please
                contact the administrator.
              </div>
            ) : !tenant.unit_id ? (
              <div className="flex items-start gap-3 p-6 text-sm text-amber-800">
                <AlertCircle size={20} className="mt-0.5 shrink-0" />
                <p>
                  Your account does not have an assigned apartment unit yet.
                  Contact the administrator before submitting a request.
                </p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Issue title <span className="text-rose-600">*</span>
                    <input
                      required
                      maxLength={150}
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-normal outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="e.g. Leaking kitchen faucet"
                    />
                  </label>

                  <label className="block text-sm font-semibold text-slate-700">
                    Category <span className="text-rose-600">*</span>
                    <div className="relative mt-2">
                      <select
                        required
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                        className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-3 pr-10 text-sm font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="plumbing">Plumbing</option>
                        <option value="electrical">Electrical</option>
                        <option value="structural">Structural</option>
                        <option value="appliance">Appliance</option>
                        <option value="cleaning">Cleaning</option>
                        <option value="other">Other</option>
                      </select>
                      <ChevronDown
                        size={16}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                    </div>
                  </label>

                  <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
                    Priority
                    <div className="relative mt-2">
                      <select
                        value={priority}
                        onChange={(event) => setPriority(event.target.value)}
                        className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-3 pr-10 text-sm font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="low">Low — Minor issue</option>
                        <option value="normal">Normal — Standard request</option>
                        <option value="high">High — Needs prompt attention</option>
                        <option value="urgent">Urgent — Requires immediate attention</option>
                      </select>
                      <ChevronDown
                        size={16}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                    </div>
                  </label>

                  <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
                    Description <span className="text-rose-600">*</span>
                    <textarea
                      required
                      minLength={5}
                      maxLength={3000}
                      rows={5}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-normal leading-6 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="Describe the issue, where it occurs, and any relevant details..."
                    />
                    <span className="mt-1 block text-right text-xs font-normal text-slate-400">
                      {description.length}/3000 characters
                    </span>
                  </label>
                </div>

                <div className="flex flex-col justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
                  <p className="text-xs leading-5 text-slate-500">
                    Your request will be sent to the apartment administrator
                    for review.
                  </p>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? (
                      <LoaderCircle size={17} className="animate-spin" />
                    ) : (
                      <Send size={17} />
                    )}
                    {submitting ? "Submitting..." : "Submit request"}
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    My requests
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Track the status and latest updates for your reported issues.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative sm:min-w-64">
                    <Search
                      size={18}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search requests..."
                      aria-label="Search maintenance requests"
                      className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div className="relative">
                    <select
                      value={filter}
                      onChange={(event) =>
                        setFilter(event.target.value as RequestFilter)
                      }
                      aria-label="Filter maintenance requests"
                      className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-10 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:min-w-40"
                    >
                      <option value="all">All statuses</option>
                      <option value="pending">Pending</option>
                      <option value="in_progress">In progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <ChevronDown
                      size={16}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>
                </div>
              </div>
            </div>

            {paginatedRows.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-14 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                  <Wrench size={27} />
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">
                  {rows.length === 0
                    ? "No requests submitted yet"
                    : "No matching requests found"}
                </h3>
                <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">
                  {rows.length === 0
                    ? "When you submit a maintenance request, its status and updates will appear here."
                    : "Try another search term or select a different status."}
                </p>
                {(search || filter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setFilter("all");
                    }}
                    className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-100">
                  {paginatedRows.map((row) => (
                    <article
                      key={row.id}
                      className="p-5 transition hover:bg-slate-50/60 sm:p-6"
                    >
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wide text-blue-700">
                              {row.request_no}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className="text-xs text-slate-500">
                              {prettyLabel(row.category)}
                            </span>
                          </div>

                          <h3 className="mt-2 break-words text-lg font-bold text-slate-900">
                            {row.title}
                          </h3>
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
                            {row.description}
                          </p>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <PriorityBadge priority={row.priority} />
                            <span className="text-xs text-slate-400">•</span>
                            <span className="text-xs text-slate-500">
                              Submitted{" "}
                              {row.request_date
                                ? dateLabel(row.request_date)
                                : "—"}
                            </span>
                          </div>

                          {row.resolution_notes && (
                            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 p-3.5">
                              <p className="text-xs font-bold uppercase tracking-wide text-blue-800">
                                Administrator update
                              </p>
                              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                                {row.resolution_notes}
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
                          <StatusBadge status={row.status} />
                          <button
                            type="button"
                            onClick={() => setSelectedRequest(row)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                          >
                            View details
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="flex flex-col justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center">
                  <p className="text-sm text-slate-500">
                    Showing{" "}
                    <span className="font-semibold text-slate-800">
                      {(page - 1) * PAGE_SIZE + 1}–
                      {Math.min(page * PAGE_SIZE, filteredRows.length)}
                    </span>{" "}
                    of{" "}
                    <span className="font-semibold text-slate-800">
                      {filteredRows.length}
                    </span>{" "}
                    requests
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((current) => current - 1)}
                      disabled={page <= 1}
                      aria-label="Previous page"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft size={16} />
                      Previous
                    </button>
                    <span className="px-2 text-sm font-medium text-slate-600">
                      {page} / {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((current) => current + 1)}
                      disabled={page >= totalPages}
                      aria-label="Next page"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </>
      )}

      {selectedRequest && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedRequest(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="maintenance-details-title"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-5 sm:p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                  {selectedRequest.request_no}
                </p>
                <h2
                  id="maintenance-details-title"
                  className="mt-1 text-xl font-bold text-slate-900"
                >
                  Request details
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Review your reported issue and its current status.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                aria-label="Close request details"
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={21} />
              </button>
            </div>

            <div className="space-y-6 p-5 sm:p-6">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={selectedRequest.status} />
                  <PriorityBadge priority={selectedRequest.priority} />
                </div>
                <h3 className="mt-3 text-xl font-bold text-slate-900">
                  {selectedRequest.title}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {prettyLabel(selectedRequest.category)}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-700">
                  Description
                </h4>
                <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                  {selectedRequest.description}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-slate-500">Date submitted</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {selectedRequest.request_date
                      ? dateLabel(selectedRequest.request_date)
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Completion date</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {selectedRequest.completed_at
                      ? dateLabel(selectedRequest.completed_at)
                      : "Not completed yet"}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-700">
                  Administrator update
                </h4>
                {selectedRequest.resolution_notes ? (
                  <p className="mt-2 whitespace-pre-wrap break-words rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm leading-6 text-slate-700">
                    {selectedRequest.resolution_notes}
                  </p>
                ) : (
                  <p className="mt-2 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                    No administrator update has been added yet.
                  </p>
                )}
              </div>

              <div className="flex justify-end border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setSelectedRequest(null)}
                  className="w-full rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 sm:w-auto"
                >
                  Close details
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
