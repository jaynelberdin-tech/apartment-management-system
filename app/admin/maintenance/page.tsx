
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import StatusBadge from "@/components/StatusBadge";
import { dateLabel } from "@/lib/format";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  LoaderCircle,
  Search,
  X,
  Wrench,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  RefreshCw,
  Save,
} from "lucide-react";

type RequestRow = {
  id: number;
  request_no: string;
  tenant_id: number;
  unit_id: number;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  request_date: string;
  completed_at: string | null;
  resolution_notes: string | null;
  tenants?: {
    first_name: string;
    last_name: string;
  } | null;
  units?: {
    unit_number: string;
  } | null;
};

type MaintenanceUpdate = {
  id: number;
  request_id: number;
  old_status: string | null;
  new_status: string;
  remarks: string | null;
  created_at: string;
  updated_by: string | null;
};

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}

function formatDateTime(value: string) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function priorityClass(priority: string) {
  switch (priority.toLowerCase()) {
    case "urgent":
      return "border-red-200 bg-red-100 text-red-800";
    case "high":
      return "border-orange-200 bg-orange-100 text-orange-800";
    case "normal":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "low":
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

export default function AdminMaintenancePage() {
  const supabase = createClient();

  const [rows, setRows] = useState<RequestRow[]>([]);
  const [history, setHistory] = useState<MaintenanceUpdate[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [selectedRequest, setSelectedRequest] =
    useState<RequestRow | null>(null);
  const [editStatus, setEditStatus] = useState("pending");
  const [remarks, setRemarks] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const { data, error: loadError } = await supabase
      .from("maintenance_requests")
      .select(
        "*, tenants(first_name,last_name), units(unit_number)"
      )
      .order("request_date", { ascending: false });

    if (loadError) {
      setError(loadError.message);
    } else {
      setRows((data ?? []) as unknown as RequestRow[]);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = rows.filter(
    (request) => request.status === "pending"
  ).length;

  const inProgressCount = rows.filter(
    (request) => request.status === "in_progress"
  ).length;

  const completedCount = rows.filter(
    (request) => request.status === "completed"
  ).length;

  const highPriorityCount = rows.filter(
    (request) =>
      request.priority === "high" || request.priority === "urgent"
  ).length;

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((request) => {
      const tenantName =
        `${request.tenants?.first_name ?? ""} ${
          request.tenants?.last_name ?? ""
        }`.trim();

      const matchesSearch =
        !query ||
        request.request_no.toLowerCase().includes(query) ||
        request.title.toLowerCase().includes(query) ||
        request.description.toLowerCase().includes(query) ||
        tenantName.toLowerCase().includes(query) ||
        (request.units?.unit_number ?? "")
          .toLowerCase()
          .includes(query) ||
        request.category.toLowerCase().includes(query) ||
        request.priority.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "all" || request.status === statusFilter;

      const matchesPriority =
        priorityFilter === "all" ||
        request.priority === priorityFilter;

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [rows, search, statusFilter, priorityFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRows.length / PAGE_SIZE)
  );

  const visibleRows = filteredRows.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  function openDetails(request: RequestRow) {
    setSelectedRequest(request);
    setEditStatus(request.status);
    setRemarks(request.resolution_notes ?? "");
    setHistory([]);
    setError("");
    setSuccess("");
    void loadHistory(request.id);
  }

  function closeDetails() {
    if (saving) return;

    setSelectedRequest(null);
    setHistory([]);
  }

  async function loadHistory(requestId: number) {
    setHistoryLoading(true);

    const { data, error: historyError } = await supabase
      .from("maintenance_updates")
      .select(
        "id,request_id,old_status,new_status,remarks,created_at,updated_by"
      )
      .eq("request_id", requestId)
      .order("created_at", { ascending: false });

    if (historyError) {
      setError(
        `Request details loaded, but status history could not be loaded: ${historyError.message}`
      );
    } else {
      setHistory((data ?? []) as MaintenanceUpdate[]);
    }

    setHistoryLoading(false);
  }

  async function saveUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedRequest) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setError("Your session could not be verified. Please sign in again.");
        return;
      }

      const request = selectedRequest;
      const newRemarks = remarks.trim() || null;
      const statusChanged = request.status !== editStatus;
      const notesChanged =
        (request.resolution_notes ?? "") !== (newRemarks ?? "");

      if (!statusChanged && !notesChanged) {
        setError("There are no changes to save.");
        return;
      }

      const { error: updateError } = await supabase
        .from("maintenance_requests")
        .update({
          status: editStatus,
          completed_at:
            editStatus === "completed"
              ? request.completed_at ?? new Date().toISOString()
              : null,
          resolution_notes: newRemarks,
        })
        .eq("id", request.id);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      const { error: logError } = await supabase
        .from("maintenance_updates")
        .insert({
          request_id: request.id,
          updated_by: user.id,
          old_status: request.status,
          new_status: editStatus,
          remarks: newRemarks,
        });

      // Reload the request even if history logging failed.
      await load();

      if (logError) {
        setError(
          `The request was updated, but its history could not be saved: ${logError.message}. Please check the maintenance_updates table and permissions.`
        );
        return;
      }

      setSuccess("Maintenance request updated successfully.");

      const updatedRequest: RequestRow = {
        ...request,
        status: editStatus,
        completed_at:
          editStatus === "completed"
            ? request.completed_at ?? new Date().toISOString()
            : null,
        resolution_notes: newRemarks,
      };

      setSelectedRequest(updatedRequest);
      await loadHistory(request.id);
    } catch {
      setError("An unexpected error occurred while saving the update.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* PAGE HEADER */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-700">
            ADMIN / MAINTENANCE
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            Maintenance requests
          </h1>
          <p className="mt-2 text-slate-500">
            Review reported issues, prioritize repairs, and track progress.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            size={17}
            className={loading ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </header>

      {/* ALERTS */}
      {error && !selectedRequest && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {success && !selectedRequest && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
        >
          <span>{success}</span>
          <button
            type="button"
            onClick={() => setSuccess("")}
            aria-label="Dismiss success"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Pending</p>
            <Clock3 size={21} className="text-amber-600" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900">
            {pendingCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Awaiting action
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">
              In progress
            </p>
            <Wrench size={21} className="text-blue-700" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900">
            {inProgressCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Currently being addressed
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">
              Completed
            </p>
            <CheckCircle2 size={21} className="text-emerald-700" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900">
            {completedCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Resolved requests
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">
              High priority
            </p>
            <AlertTriangle size={21} className="text-rose-600" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900">
            {highPriorityCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            High or urgent requests
          </p>
        </div>
      </div>

      {/* SEARCH AND FILTERS */}
      <section className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_190px]">
          <div className="relative">
            <Search
              size={19}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search request, tenant, unit, or category..."
              aria-label="Search maintenance requests"
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
            className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by priority"
            className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="all">All priorities</option>
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} priority
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            {filteredRows.length} request
            {filteredRows.length === 1 ? "" : "s"} found
          </p>

          {(search || statusFilter !== "all" || priorityFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setPriorityFilter("all");
                setPage(1);
              }}
              className="text-sm font-semibold text-blue-700 hover:text-blue-900"
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      {/* REQUEST TABLE */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 p-5">
          <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
            <ClipboardList size={21} />
          </div>
          <div>
            <h2 className="font-bold text-slate-900">
              Request list
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              View requests and update their progress.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4">Request</th>
                <th className="px-5 py-4">Tenant / Unit</th>
                <th className="px-5 py-4">Category</th>
                <th className="px-5 py-4">Priority</th>
                <th className="px-5 py-4">Date reported</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <span className="inline-flex items-center gap-2 text-slate-500">
                      <LoaderCircle size={18} className="animate-spin" />
                      Loading maintenance requests...
                    </span>
                  </td>
                </tr>
              ) : (
                <>
                  {visibleRows.map((request) => (
                    <tr
                      key={request.id}
                      className="transition hover:bg-slate-50/80"
                    >
                      <td className="max-w-[280px] px-5 py-4">
                        <p className="font-bold text-blue-700">
                          {request.request_no}
                        </p>
                        <p className="mt-1 truncate font-semibold text-slate-900">
                          {request.title}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                          {request.description}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-800">
                          {request.tenants?.first_name ?? "Unknown"}{" "}
                          {request.tenants?.last_name ?? ""}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Unit {request.units?.unit_number ?? "—"}
                        </p>
                      </td>

                      <td className="px-5 py-4 capitalize text-slate-600">
                        {formatStatus(request.category)}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${priorityClass(
                            request.priority
                          )}`}
                        >
                          {formatStatus(request.priority)}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                        {dateLabel(request.request_date)}
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge status={request.status} />
                      </td>

                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openDetails(request)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800"
                        >
                          <Eye size={16} />
                          View details
                        </button>
                      </td>
                    </tr>
                  ))}

                  {visibleRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-14 text-center">
                        <div className="mx-auto flex max-w-sm flex-col items-center">
                          <div className="rounded-full bg-slate-100 p-4 text-slate-400">
                            <ClipboardList size={28} />
                          </div>
                          <p className="mt-4 font-semibold text-slate-800">
                            No maintenance requests found
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {search ||
                            statusFilter !== "all" ||
                            priorityFilter !== "all"
                              ? "Try changing your search or filters."
                              : "Tenant maintenance requests will appear here."}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {filteredRows.length === 0
              ? "Showing 0 requests"
              : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(
                  page * PAGE_SIZE,
                  filteredRows.length
                )} of ${filteredRows.length} requests`}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() =>
                setPage((current) => Math.max(1, current - 1))
              }
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} />
              Previous
            </button>

            <span className="min-w-[90px] text-center text-sm text-slate-600">
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* REQUEST DETAILS / UPDATE DIALOG */}
      {selectedRequest && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-3 sm:items-center sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) {
              closeDetails();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="maintenance-dialog-title"
            className="my-auto w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            {/* DIALOG HEADER */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 sm:p-6">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                  {selectedRequest.request_no}
                </p>
                <h2
                  id="maintenance-dialog-title"
                  className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl"
                >
                  Maintenance details
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Review the issue and save the latest status and remarks.
                </p>
              </div>

              <button
                type="button"
                onClick={closeDetails}
                disabled={saving}
                aria-label="Close dialog"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            <div className="max-h-[calc(100vh-170px)] overflow-y-auto p-5 sm:p-6">
              {/* DIALOG ALERTS */}
              {error && (
                <div
                  role="alert"
                  className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
                >
                  <span>{error}</span>
                  <button
                    type="button"
                    onClick={() => setError("")}
                    aria-label="Dismiss error"
                  >
                    <X size={17} />
                  </button>
                </div>
              )}

              {success && (
                <div
                  role="status"
                  className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
                >
                  {success}
                </div>
              )}

              {/* READ-ONLY REQUEST INFORMATION */}
              <div className="space-y-5">
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-bold text-slate-900">
                        {selectedRequest.title}
                      </h3>
                      <p className="mt-1 text-sm capitalize text-slate-500">
                        {formatStatus(selectedRequest.category)} · Reported{" "}
                        {dateLabel(selectedRequest.request_date)}
                      </p>
                    </div>

                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize ${priorityClass(
                        selectedRequest.priority
                      )}`}
                    >
                      {formatStatus(selectedRequest.priority)} priority
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Tenant
                    </p>
                    <p className="mt-2 font-semibold text-slate-900">
                      {selectedRequest.tenants?.first_name ?? "Unknown"}{" "}
                      {selectedRequest.tenants?.last_name ?? ""}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Apartment unit
                    </p>
                    <p className="mt-2 font-semibold text-slate-900">
                      {selectedRequest.units?.unit_number ?? "—"}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-700">
                    Issue description
                  </p>
                  <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                    {selectedRequest.description}
                  </div>
                </div>

                {selectedRequest.completed_at && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                      Completion date
                    </p>
                    <p className="mt-1 text-sm text-emerald-900">
                      {formatDateTime(selectedRequest.completed_at)}
                    </p>
                  </div>
                )}
              </div>

              {/* EDIT FORM */}
              <form onSubmit={saveUpdate} className="mt-6 space-y-4">
                <div className="border-t border-slate-100 pt-5">
                  <h3 className="font-bold text-slate-900">
                    Update request
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Changes will be saved to the maintenance request record.
                  </p>
                </div>

                <label className="block text-sm font-semibold text-slate-700">
                  Request status
                  <select
                    required
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-semibold text-slate-700">
                  Resolution notes / update remarks
                  <textarea
                    rows={4}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Describe the work performed, progress, or final resolution..."
                    className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <span className="mt-1 block text-xs font-normal text-slate-500">
                    These remarks will also be included in the update history.
                  </span>
                </label>

                <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeDetails}
                    disabled={saving}
                    className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    Close
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? (
                      <>
                        <LoaderCircle size={17} className="animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={17} />
                        Save update
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* STATUS HISTORY */}
              <section className="mt-7 border-t border-slate-100 pt-5">
                <h3 className="font-bold text-slate-900">
                  Update history
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Previously recorded status changes and remarks.
                </p>

                {historyLoading ? (
                  <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                    <LoaderCircle size={17} className="animate-spin" />
                    Loading update history...
                  </div>
                ) : history.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-slate-200 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="capitalize text-slate-500">
                              {item.old_status
                                ? formatStatus(item.old_status)
                                : "Initial"}
                            </span>
                            <ChevronRight
                              size={15}
                              className="text-slate-400"
                            />
                            <span className="font-semibold capitalize text-slate-900">
                              {formatStatus(item.new_status)}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500">
                            {formatDateTime(item.created_at)}
                          </span>
                        </div>

                        {item.remarks && (
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-5 text-slate-600">
                            {item.remarks}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">
                    No update history is available for this request yet.
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
