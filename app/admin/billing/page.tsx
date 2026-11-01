"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import StatusBadge from "@/components/StatusBadge";
import { money, dateLabel } from "@/lib/format";
import {
  Plus,
  Search,
  X,
  ReceiptText,
  Eye,
} from "lucide-react";

type Tenant = {
  id: number;
  first_name: string;
  last_name: string;
  unit_id: number | null;
  units?: {
    monthly_rent: number;
    unit_number: string;
  } | null;
};

type Bill = {
  id: number;
  bill_no: string;
  tenant_id: number;
  billing_month: string;
  issue_date: string;
  due_date: string;
  amount: number;
  description: string;
  status: string;
  tenants?: {
    first_name: string;
    last_name: string;
    units?: {
      unit_number: string;
    } | null;
  } | null;
  payments?: {
    amount: number;
  }[];
};

const PAGE_SIZE = 10;

// STATUS FILTER OPTIONS (the default selected option is "unpaid")
const STATUS_FILTERS = [
  { value: "unpaid", label: "Unpaid" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "paid", label: "Paid" },
  { value: "all", label: "All statuses" },
];
const DEFAULT_STATUS_FILTER = "unpaid";

function localDateString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function currentMonth() {
  const date = new Date();

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}`;
}

// TOTAL PAID FOR A BILL
function paidTotal(bill: Bill) {
  return (bill.payments ?? []).reduce(
    (sum, payment) => sum + Number(payment.amount),
    0
  );
}

// REUSABLE DETAIL FIELD (USED IN VIEW MODAL)
function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-800">
        {value || "—"}
      </p>
    </div>
  );
}

export default function BillingPage() {
  const supabase = createClient();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [showDialog, setShowDialog] = useState(false);

  // VIEW BILL MODAL
  const [viewingBill, setViewingBill] = useState<Bill | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(DEFAULT_STATUS_FILTER);
  const [page, setPage] = useState(1);

  const [tenantId, setTenantId] = useState("");
  const [month, setMonth] = useState(currentMonth());
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");

  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);

    try {
      const [tenantResult, billResult] = await Promise.all([
        supabase
          .from("tenants")
          .select(
            "id,first_name,last_name,unit_id,units(monthly_rent,unit_number)"
          )
          .eq("status", "active")
          .order("last_name"),

        supabase
          .from("bills")
          .select(
            "*,tenants(first_name,last_name,units(unit_number)),payments(amount)"
          )
          .order("billing_month", { ascending: false })
          .order("id", { ascending: false }),
      ]);

      if (tenantResult.error) {
        setError((current) => current || "Unable to load tenant information. Please refresh the page and try again.");
      } else {
        setTenants((tenantResult.data ?? []) as unknown as Tenant[]);
      }

      if (billResult.error) {
        setError((current) => current || "Unable to load bills. Please refresh the page and try again.");
      } else {
        setBills((billResult.data ?? []) as unknown as Bill[]);
      }
    } catch {
      setError("Unable to load billing information.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Initial data load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalBilled = bills.reduce(
    (sum, bill) => sum + Number(bill.amount),
    0
  );

  const totalCollected = bills.reduce(
    (sum, bill) => sum + paidTotal(bill),
    0
  );

  const unpaidBills = bills.filter(
    (bill) => bill.status !== "paid" && bill.status !== "void"
  );

  const outstanding = unpaidBills.reduce((sum, bill) => {
    return sum + Math.max(0, Number(bill.amount) - paidTotal(bill));
  }, 0);

  // SEARCH + STATUS FILTER (both apply together)
  const filteredBills = useMemo(() => {
    const query = search.trim().toLowerCase();

    return bills.filter((bill) => {
      const matchesStatus =
        statusFilter === "all" || bill.status === statusFilter;

      if (!matchesStatus) return false;

      if (!query) return true;

      const tenantName =
        `${bill.tenants?.first_name ?? ""} ${
          bill.tenants?.last_name ?? ""
        }`
          .trim()
          .toLowerCase();

      return (
        (bill.bill_no ?? "").toLowerCase().includes(query) ||
        tenantName.includes(query) ||
        (bill.billing_month ?? "").slice(0, 7).includes(query) ||
        (bill.due_date ?? "").toLowerCase().includes(query) ||
        (bill.status ?? "").toLowerCase().includes(query)
      );
    });
  }, [bills, search, statusFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredBills.length / PAGE_SIZE)
  );

  const visibleBills = filteredBills.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const isFiltering =
    search.trim() !== "" || statusFilter !== "all";

  // VIEW MODAL VALUES
  const viewingPaid = viewingBill ? paidTotal(viewingBill) : 0;
  const viewingBalance = viewingBill
    ? Math.max(0, Number(viewingBill.amount) - viewingPaid)
    : 0;
  const viewingTenantName = viewingBill
    ? `${viewingBill.tenants?.first_name ?? ""} ${
        viewingBill.tenants?.last_name ?? ""
      }`.trim()
    : "";

  // GENERATE BILL DIALOG

  function openDialog() {
    setError("");
    setSuccess("");
    setTenantId("");
    setAmount("");
    setMonth(currentMonth());
    setDueDate("");
    setFormError("");
    setShowDialog(true);
  }

  function closeDialog() {
    if (busy) return;

    setShowDialog(false);
    setFormError("");
  }

  function handleTenantChange(selectedId: string) {
    setTenantId(selectedId);

    const tenant = tenants.find(
      (item) => item.id === Number(selectedId)
    );

    // The rent is taken from the tenant's assigned unit.
    // It is never typed manually in the Generate Bill dialog.
    if (tenant?.units?.monthly_rent != null) {
      setAmount(String(tenant.units.monthly_rent));
    } else {
      setAmount("");
    }
  }

  async function generateBill(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
    setError("");
    setSuccess("");

    if (!tenantId || !month || !dueDate) {
      setFormError("Complete all required fields and select a tenant.");
      return;
    }
    if (dueDate < localDateString()) {
      setFormError("The due date cannot be in the past.");
      return;
    }

    const tenant = tenants.find((item) => item.id === Number(tenantId));
    if (!tenant || tenant.units?.monthly_rent == null) {
      setFormError("This tenant has no assigned unit with a rent amount. Assign a unit before generating a bill.");
      return;
    }
    const rentAmount = Number(tenant.units.monthly_rent);
    if (!Number.isFinite(rentAmount) || rentAmount <= 0) {
      setFormError("The assigned unit's monthly rent must be greater than zero.");
      return;
    }

    const billingMonth = `${month}-01`;
    setBusy(true);
    try {
      const { data: existingBill, error: duplicateCheckError } = await supabase
        .from("bills")
        .select("id")
        .eq("tenant_id", Number(tenantId))
        .eq("billing_month", billingMonth)
        .limit(1)
        .maybeSingle();

      if (duplicateCheckError) {
        setFormError("We couldn't verify whether this tenant already has a bill for that month. Please try again.");
        return;
      }
      if (existingBill) {
        setFormError(`A bill already exists for ${tenant.first_name} ${tenant.last_name} for ${month}. Choose a different billing month.`);
        return;
      }

      const { error: insertError } = await supabase.from("bills").insert({
        tenant_id: Number(tenantId),
        billing_month: billingMonth,
        issue_date: localDateString(),
        due_date: dueDate,
        amount: rentAmount,
        description: "Monthly rent",
      });

      if (insertError) {
        if (insertError.code === "23505" || /duplicate key|unique constraint/i.test(insertError.message)) {
          setFormError(`A bill already exists for this tenant for ${month}. Choose a different billing month.`);
        } else {
          setFormError("The bill could not be generated. Please check the information and try again.");
        }
        return;
      }

      setShowDialog(false);
      setFormError("");
      setSearch("");
      // New bills start as unpaid, so show the unpaid list
      setStatusFilter(DEFAULT_STATUS_FILTER);
      setPage(1);
      setSuccess("Bill generated successfully.");
      await load();
    } catch {
      setFormError("An unexpected problem occurred while generating the bill. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* PAGE HEADER */}

      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-700">
            ADMIN / FINANCE
          </p>

          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            Billing
          </h1>

          <p className="mt-2 text-slate-500">
            Generate and manage monthly rent bills.
          </p>
        </div>

        <button
          type="button"
          onClick={openDialog}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-800"
        >
          <Plus size={18} />
          Generate bill
        </button>
      </header>

      {/* ALERTS */}

      {error && !showDialog && (
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

      {success && (
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">
              Total bills
            </p>
            <ReceiptText className="text-blue-700" size={20} />
          </div>

          <p className="mt-3 text-2xl font-bold text-slate-900">
            {bills.length}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Total billed: {money(totalBilled)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">
            Unpaid bills
          </p>

          <p className="mt-3 text-2xl font-bold text-amber-600">
            {unpaidBills.length}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Bills not marked paid or void
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">
            Outstanding balance
          </p>

          <p className="mt-3 text-2xl font-bold text-rose-600">
            {money(outstanding)}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Collected: {money(totalCollected)}
          </p>
        </div>
      </div>

      {/* SEARCH + STATUS FILTER */}

<div className="flex flex-col gap-3 sm:flex-row sm:items-start">
  {/* SEARCH */}
  <div className="w-full sm:max-w-md">
    <label
      htmlFor="bill-search"
      className="mb-1.5 block text-xs font-semibold text-slate-600"
    >
      Search
    </label>

    <div className="relative">
      <Search
        size={19}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
      />

      <input
        id="bill-search"
        type="search"
        value={search}
        placeholder="Search by bill no., tenant, month, or due date"
        aria-describedby="bill-search-hint"
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </div>

    <p id="bill-search-hint" className="mt-1.5 text-xs text-slate-500">
      Examples: a tenant name, a bill number, or a month like 2026-11.
    </p>
  </div>

  {/* STATUS FILTER */}
  <div className="w-full sm:w-52">
    <label
      htmlFor="bill-status-filter"
      className="mb-1.5 block text-xs font-semibold text-slate-600"
    >
      Status
    </label>

    <select
      id="bill-status-filter"
      value={statusFilter}
      onChange={(e) => {
        setStatusFilter(e.target.value);
        setPage(1);
      }}
      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
    >
      {STATUS_FILTERS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
</div>

      {/* BILL TABLE */}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="font-bold text-slate-900">Bills</h2>

          <p className="mt-1 text-sm text-slate-500">
            {filteredBills.length} bill
            {filteredBills.length === 1 ? "" : "s"} found
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4">Bill no.</th>
                <th className="px-5 py-4">Tenant</th>
                <th className="px-5 py-4">Billing month</th>
                <th className="px-5 py-4">Due date</th>
                <th className="px-5 py-4">Amount</th>
                <th className="px-5 py-4">Paid</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-center">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    Loading bills...
                  </td>
                </tr>
              ) : (
                <>
                  {visibleBills.map((bill) => {
                    const paid = paidTotal(bill);

                    return (
                      <tr
                        key={bill.id}
                        className="hover:bg-slate-50/80"
                      >
                        <td className="px-5 py-4 font-bold text-slate-900">
                          {bill.bill_no}
                        </td>

                        <td className="px-5 py-4 text-slate-700">
                          {bill.tenants?.first_name}{" "}
                          {bill.tenants?.last_name}
                        </td>

                        <td className="px-5 py-4 text-slate-600">
                          {bill.billing_month.slice(0, 7)}
                        </td>

                        <td className="px-5 py-4 text-slate-600">
                          {dateLabel(bill.due_date)}
                        </td>

                        <td className="px-5 py-4 font-medium">
                          {money(bill.amount)}
                        </td>

                        <td className="px-5 py-4 text-slate-600">
                          {money(paid)}
                        </td>

                        <td className="px-5 py-4">
                          <StatusBadge status={bill.status} />
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center justify-center">
                            <button
                              type="button"
                              onClick={() => setViewingBill(bill)}
                              title="View bill"
                              aria-label={`View bill ${bill.bill_no}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                            >
                              <Eye size={14} />
                              View
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {visibleBills.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-5 py-12 text-center"
                      >
                        <p className="font-semibold text-slate-700">
                          No bills found
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          {isFiltering
                            ? "Try another search term or status filter."
                            : "Generate a bill to get started."}
                        </p>
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
            {filteredBills.length === 0
              ? "Showing 0 bills"
              : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(
                  page * PAGE_SIZE,
                  filteredBills.length
                )} of ${filteredBills.length} bills`}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page === 1}
              onClick={() =>
                setPage((current) => Math.max(1, current - 1))
              }
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>

            <span className="px-2 text-sm text-slate-600">
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() =>
                setPage((current) =>
                  Math.min(totalPages, current + 1)
                )
              }
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {/* ================================================== */}
      {/* VIEW BILL MODAL */}
      {/* ================================================== */}

      {viewingBill && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setViewingBill(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="view-bill-title"
            className="my-auto flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            {/* HEADER */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2
                  id="view-bill-title"
                  className="text-xl font-bold text-slate-900"
                >
                  Bill Details
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  View complete bill information
                </p>
              </div>

              <button
                type="button"
                onClick={() => setViewingBill(null)}
                aria-label="Close bill details"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            {/* BODY */}
            <div className="overflow-y-auto p-6">

              {/* SUMMARY */}
              <div className="flex flex-col gap-4 rounded-xl border border-slate-100 bg-slate-50 p-5 sm:flex-row sm:items-center">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <ReceiptText size={28} />
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-bold text-slate-900">
                    {viewingBill.bill_no}
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    {viewingTenantName || "Tenant"}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge status={viewingBill.status} />

                    {viewingBill.tenants?.units?.unit_number && (
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                        {viewingBill.tenants.units.unit_number}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* BILL INFORMATION */}
              <section className="mt-7">
                <h3 className="mb-4 font-bold text-slate-900">
                  Bill Information
                </h3>

                <div className="grid grid-cols-1 gap-x-8 gap-y-5 rounded-xl border border-slate-100 p-5 sm:grid-cols-2">
                  <DetailField
                    label="Tenant"
                    value={viewingTenantName}
                  />

                  <DetailField
                    label="Unit"
                    value={viewingBill.tenants?.units?.unit_number}
                  />

                  <DetailField
                    label="Billing Month"
                    value={(viewingBill.billing_month ?? "").slice(0, 7)}
                  />

                  <DetailField
                    label="Issue Date"
                    value={
                      viewingBill.issue_date
                        ? dateLabel(viewingBill.issue_date)
                        : null
                    }
                  />

                  <DetailField
                    label="Due Date"
                    value={
                      viewingBill.due_date
                        ? dateLabel(viewingBill.due_date)
                        : null
                    }
                  />

                  <DetailField
                    label="Description"
                    value={viewingBill.description}
                  />
                </div>
              </section>

              {/* PAYMENT SUMMARY */}
              <section className="mt-7">
                <h3 className="mb-4 font-bold text-slate-900">
                  Payment Summary
                </h3>

                <div className="rounded-xl border border-slate-100 p-5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 text-sm">
                    <span className="text-slate-500">Bill amount</span>
                    <span className="font-semibold text-slate-800">
                      {money(Number(viewingBill.amount))}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-100 py-3 text-sm">
                    <span className="text-slate-500">Amount paid</span>
                    <span className="font-semibold text-emerald-700">
                      {money(viewingPaid)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-3">
                    <span className="text-sm font-medium text-slate-700">
                      Remaining balance
                    </span>
                    <span
                      className={`text-lg font-bold ${
                        viewingBalance > 0
                          ? "text-rose-600"
                          : "text-emerald-700"
                      }`}
                    >
                      {money(viewingBalance)}
                    </span>
                  </div>
                </div>
              </section>

            </div>

            {/* FOOTER */}
            <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-100 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-400">
                Bill record #{viewingBill.id}
              </p>

              <button
                type="button"
                onClick={() => setViewingBill(null)}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GENERATE BILL DIALOG */}

      {showDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4"
          onMouseDown={(e) => {
            if (
              e.target === e.currentTarget &&
              !busy
            ) {
              closeDialog();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="generate-bill-title"
            className="my-8 w-full max-w-xl rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-100 p-6">
              <div>
                <h2
                  id="generate-bill-title"
                  className="text-xl font-bold text-slate-900"
                >
                  Generate rent bill
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  The monthly rent is automatically based on the
                  tenant&apos;s assigned unit.
                </p>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={closeDialog}
                aria-label="Close dialog"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={generateBill}
              className="space-y-4 p-6"
            >
              {formError && (
                <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {formError}
                </div>
              )}
              <label className="block text-sm font-semibold text-slate-700">
                Tenant

                <select
                  required
                  value={tenantId}
                  onChange={(e) =>
                    handleTenantChange(e.target.value)
                  }
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Select tenant</option>

                  {tenants.map((tenant) => (
                    <option
                      key={tenant.id}
                      value={tenant.id}
                    >
                      {tenant.first_name} {tenant.last_name}
                      {tenant.units?.unit_number
                        ? ` — ${tenant.units.unit_number}`
                        : " — No unit assigned"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                Billing month

                <input
                  required
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                Due date

                <input
                  required
                  type="date"
                  min={localDateString()}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                Amount (PHP)

                <input
                  required
                  type="number"
                  value={amount}
                  readOnly
                  aria-readonly="true"
                  placeholder="Select a tenant first"
                  className="mt-1.5 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-slate-600 outline-none"
                />

                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Automatically set using the assigned unit&apos;s
                  monthly rent. This field cannot be edited.
                </span>
              </label>

              {tenantId &&
                !tenants.find(
                  (tenant) => tenant.id === Number(tenantId)
                )?.units && (
                  <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                    This tenant has no assigned unit. Assign a unit
                    before generating a rent bill.
                  </p>
                )}

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={busy}
                  onClick={closeDialog}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    busy ||
                    tenants.length === 0 ||
                    !tenantId ||
                    !amount
                  }
                  className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? "Generating..." : "Generate bill"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}