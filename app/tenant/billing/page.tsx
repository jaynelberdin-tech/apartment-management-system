
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money, dateLabel } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  LoaderCircle,
  ReceiptText,
  Search,
  Wallet,
  X,
} from "lucide-react";

type Payment = {
  amount: number;
  payment_date: string;
  receipt_no: string;
  payment_method: string;
  reference_no?: string | null;
  notes?: string | null;
};

type Bill = {
  id: number;
  bill_no: string;
  billing_month: string;
  issue_date: string;
  due_date: string;
  amount: number;
  description: string;
  status: string;
  created_at: string;
  payments: Payment[];
};

type BillFilter =
  | "all"
  | "unpaid"
  | "partially_paid"
  | "paid"
  | "overdue";

const PAGE_SIZE = 6;

function getPaidAmount(bill: Bill) {
  return (bill.payments ?? []).reduce(
    (total, payment) => total + Number(payment.amount || 0),
    0
  );
}

function getBalance(bill: Bill) {
  return Math.max(0, Number(bill.amount) - getPaidAmount(bill));
}

function getBillingState(bill: Bill) {
  const balance = getBalance(bill);
  const paid = getPaidAmount(bill);
  const status = bill.status.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = bill.due_date ? new Date(`${bill.due_date}T00:00:00`) : null;
  const isOverdue =
    balance > 0 &&
    dueDate !== null &&
    !Number.isNaN(dueDate.getTime()) &&
    dueDate < today &&
    !["cancelled", "void"].includes(status);

  if (["cancelled", "void"].includes(status)) {
    return { key: status, label: status.replaceAll("_", " ") };
  }

  if (balance <= 0 || status === "paid") {
    return { key: "paid", label: "Paid" };
  }

  if (isOverdue) {
    return { key: "overdue", label: "Overdue" };
  }

  if (paid > 0) {
    return { key: "partially_paid", label: "Partially paid" };
  }

  return { key: "unpaid", label: "Unpaid" };
}

function formatMonth(value: string) {
  if (!value) return "—";

  const date = new Date(`${value.slice(0, 7)}-01T00:00:00`);

  if (Number.isNaN(date.getTime())) return value.slice(0, 7);

  return date.toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
  });
}

function paymentMethodLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) =>
    letter.toUpperCase()
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
  value: string;
  description: string;
  icon: React.ReactNode;
  iconClass: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 break-words text-2xl font-bold tracking-tight text-slate-900">
            {value}
          </p>
          <p className="mt-2 text-xs text-slate-500">{description}</p>
        </div>
        <div className={`rounded-xl p-3 ${iconClass}`}>{icon}</div>
      </div>
    </section>
  );
}

export default function TenantBillingPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<BillFilter>("all");
  const [page, setPage] = useState(1);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const loadBills = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        setBills([]);
        setError("Your session could not be verified. Please sign in again.");
        return;
      }

      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (tenantError) throw tenantError;

      if (!tenant) {
        setBills([]);
        return;
      }

      const { data, error: billsError } = await supabase
        .from("bills")
        .select(
          "id, bill_no, billing_month, issue_date, due_date, amount, description, status, created_at, payments(amount, payment_date, receipt_no, payment_method, reference_no, notes)"
        )
        .eq("tenant_id", tenant.id)
        .order("billing_month", { ascending: false });

      if (billsError) throw billsError;

      const loadedBills = ((data ?? []) as unknown as Bill[]).map((bill) => ({
        ...bill,
        payments: bill.payments ?? [],
      }));

      setBills(loadedBills);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load your billing records."
      );
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadBills();
  }, [loadBills]);

  const summary = useMemo(() => {
    const totalBilled = bills.reduce(
      (total, bill) => total + Number(bill.amount || 0),
      0
    );

    const totalPaid = bills.reduce(
      (total, bill) => total + getPaidAmount(bill),
      0
    );

    const outstanding = bills.reduce(
      (total, bill) => total + getBalance(bill),
      0
    );

    const unpaidCount = bills.filter((bill) =>
      ["unpaid", "overdue", "partially_paid"].includes(
        getBillingState(bill).key
      )
    ).length;

    return {
      totalBilled,
      totalPaid,
      outstanding,
      totalBills: bills.length,
      unpaidCount,
    };
  }, [bills]);

  const filteredBills = useMemo(() => {
    const term = search.trim().toLowerCase();

    return bills.filter((bill) => {
      const state = getBillingState(bill);

      const matchesSearch =
        !term ||
        bill.bill_no.toLowerCase().includes(term) ||
        (bill.description ?? "").toLowerCase().includes(term) ||
        formatMonth(bill.billing_month).toLowerCase().includes(term);

      const matchesFilter =
        filter === "all" ||
        (filter === "unpaid" && state.key === "unpaid") ||
        (filter === "partially_paid" && state.key === "partially_paid") ||
        (filter === "paid" && state.key === "paid") ||
        (filter === "overdue" && state.key === "overdue");

      return matchesSearch && matchesFilter;
    });
  }, [bills, search, filter]);

  const totalPages = Math.max(1, Math.ceil(filteredBills.length / PAGE_SIZE));

  const paginatedBills = filteredBills.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  useEffect(() => {
    setPage(1);
  }, [search, filter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const openDetails = (bill: Bill) => {
    setSelectedBill(bill);
  };

  const closeDetails = () => {
    setSelectedBill(null);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-7 pb-10">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">
            Tenant / Billing
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            My Bills &amp; Payments
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Review your rent bills, monitor your remaining balance, and view
            your payment history.
          </p>
        </div>

        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <ReceiptText size={25} />
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          <AlertCircle size={20} className="mt-0.5 shrink-0" />
          <div className="flex-1">{error}</div>
          <button
            type="button"
            onClick={() => void loadBills()}
            className="shrink-0 font-semibold underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white">
          <LoaderCircle className="animate-spin text-blue-700" size={32} />
          <p className="text-sm text-slate-500">Loading your billing records...</p>
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Outstanding balance"
              value={money(summary.outstanding)}
              description="Remaining amount across bills"
              icon={<Wallet size={22} />}
              iconClass="bg-blue-50 text-blue-700"
            />

            <SummaryCard
              label="Total payments"
              value={money(summary.totalPaid)}
              description="Payments recorded so far"
              icon={<CheckCircle2 size={22} />}
              iconClass="bg-emerald-50 text-emerald-700"
            />

            <SummaryCard
              label="Total bills"
              value={String(summary.totalBills)}
              description="All your billing records"
              icon={<FileText size={22} />}
              iconClass="bg-violet-50 text-violet-700"
            />

            <SummaryCard
              label="Unsettled bills"
              value={String(summary.unpaidCount)}
              description="Bills with a remaining balance"
              icon={<Clock size={22} />}
              iconClass="bg-amber-50 text-amber-700"
            />
          </section>

          {summary.outstanding > 0 && (
            <section className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
              <div className="rounded-xl bg-white p-2 text-amber-700">
                <AlertCircle size={21} />
              </div>
              <div>
                <h2 className="font-semibold text-amber-950">
                  You have an outstanding balance
                </h2>
                <p className="mt-1 text-sm leading-6 text-amber-900">
                  Your current remaining balance is{" "}
                  <strong>{money(summary.outstanding)}</strong>. Review your
                  billing records below for due dates and payment details.
                </p>
              </div>
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Billing records
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Search and review your bills and recorded payments.
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
                      placeholder="Search bill number or month..."
                      aria-label="Search billing records"
                      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div className="relative">
                    <select
                      value={filter}
                      onChange={(event) =>
                        setFilter(event.target.value as BillFilter)
                      }
                      aria-label="Filter billing records"
                      className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-10 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:min-w-44"
                    >
                      <option value="all">All bills</option>
                      <option value="unpaid">Unpaid</option>
                      <option value="partially_paid">Partially paid</option>
                      <option value="paid">Paid</option>
                      <option value="overdue">Overdue</option>
                    </select>
                    <ChevronDown
                      size={16}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>
                </div>
              </div>
            </div>

            {paginatedBills.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-14 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                  <ReceiptText size={26} />
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">
                  {bills.length === 0
                    ? "No bills available yet"
                    : "No matching bills found"}
                </h3>
                <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">
                  {bills.length === 0
                    ? "Your billing records will appear here when the administrator creates a bill for your account."
                    : "Try another search term or choose a different billing status."}
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
                  {paginatedBills.map((bill) => {
                    const paid = getPaidAmount(bill);
                    const balance = getBalance(bill);
                    const amount = Number(bill.amount || 0);
                    const progress =
                      amount > 0
                        ? Math.min(100, Math.max(0, (paid / amount) * 100))
                        : 0;
                    const state = getBillingState(bill);

                    return (
                      <article
                        key={bill.id}
                        className="p-5 transition hover:bg-slate-50/60 sm:p-6"
                      >
                        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold uppercase tracking-wide text-blue-700">
                                {bill.bill_no}
                              </span>
                              <span className="text-slate-300">•</span>
                              <span className="text-xs text-slate-500">
                                {formatMonth(bill.billing_month)}
                              </span>
                            </div>

                            <h3 className="mt-2 break-words text-lg font-bold text-slate-900">
                              {bill.description || "Rental bill"}
                            </h3>

                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                              <span>
                                Due:{" "}
                                {bill.due_date
                                  ? dateLabel(bill.due_date)
                                  : "Not specified"}
                              </span>
                              <span>
                                Issued:{" "}
                                {bill.issue_date
                                  ? dateLabel(bill.issue_date)
                                  : "—"}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3 md:justify-end">
                            <div className="text-left md:text-right">
                              <p className="text-xs text-slate-500">
                                Bill amount
                              </p>
                              <p className="mt-1 text-xl font-bold text-slate-900">
                                {money(amount)}
                              </p>
                            </div>
                            <StatusBadge status={state.key} />
                          </div>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-xl bg-slate-50 p-3.5">
                            <p className="text-xs font-medium text-slate-500">
                              Bill amount
                            </p>
                            <p className="mt-1 font-bold text-slate-900">
                              {money(amount)}
                            </p>
                          </div>

                          <div className="rounded-xl bg-emerald-50/70 p-3.5">
                            <p className="text-xs font-medium text-slate-600">
                              Paid so far
                            </p>
                            <p className="mt-1 font-bold text-emerald-700">
                              {money(paid)}
                            </p>
                          </div>

                          <div className="rounded-xl bg-amber-50/70 p-3.5">
                            <p className="text-xs font-medium text-slate-600">
                              Remaining balance
                            </p>
                            <p className="mt-1 font-bold text-amber-800">
                              {money(balance)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 rounded-xl border border-slate-100 p-3.5">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-slate-700">
                              Payment progress
                            </p>
                            <p className="text-sm font-bold text-slate-900">
                              {Math.round(progress)}%
                            </p>
                          </div>
                          <div
                            className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
                            role="progressbar"
                            aria-label={`Payment progress for ${bill.bill_no}`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(progress)}
                          >
                            <div
                              className="h-full rounded-full bg-emerald-500 transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>

                        <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                          <p className="text-sm text-slate-500">
                            {bill.payments.length}{" "}
                            {bill.payments.length === 1
                              ? "payment"
                              : "payments"}{" "}
                            recorded
                          </p>

                          <button
                            type="button"
                            onClick={() => openDetails(bill)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                          >
                            <ReceiptText size={16} />
                            View payment details
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="flex flex-col justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center">
                  <p className="text-sm text-slate-500">
                    Showing{" "}
                    <span className="font-semibold text-slate-800">
                      {(page - 1) * PAGE_SIZE + 1}–
                      {Math.min(page * PAGE_SIZE, filteredBills.length)}
                    </span>{" "}
                    of{" "}
                    <span className="font-semibold text-slate-800">
                      {filteredBills.length}
                    </span>{" "}
                    bills
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

      {selectedBill && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDetails();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="bill-details-title"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-5 sm:p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                  {selectedBill.bill_no}
                </p>
                <h2
                  id="bill-details-title"
                  className="mt-1 text-xl font-bold text-slate-900"
                >
                  Bill and payment details
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedBill.description || "Rental bill"} ·{" "}
                  {formatMonth(selectedBill.billing_month)}
                </p>
              </div>

              <button
                type="button"
                onClick={closeDetails}
                aria-label="Close payment details"
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={21} />
              </button>
            </div>

            <div className="space-y-6 p-5 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Total bill</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">
                    {money(Number(selectedBill.amount))}
                  </p>
                </div>
                <div className="rounded-xl bg-amber-50 p-4">
                  <p className="text-sm text-amber-800">Remaining balance</p>
                  <p className="mt-1 text-xl font-bold text-amber-900">
                    {money(getBalance(selectedBill))}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-slate-500">Billing month</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {formatMonth(selectedBill.billing_month)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Due date</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {selectedBill.due_date
                      ? dateLabel(selectedBill.due_date)
                      : "Not specified"}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Issue date</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {selectedBill.issue_date
                      ? dateLabel(selectedBill.issue_date)
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Bill status</p>
                  <div className="mt-1">
                    <StatusBadge status={getBillingState(selectedBill).key} />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold text-slate-900">Payment history</h3>
                  <span className="text-sm text-slate-500">
                    {selectedBill.payments.length}{" "}
                    {selectedBill.payments.length === 1
                      ? "record"
                      : "records"}
                  </span>
                </div>

                {selectedBill.payments.length === 0 ? (
                  <div className="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
                    <CreditCard
                      size={26}
                      className="mx-auto text-slate-400"
                    />
                    <p className="mt-2 font-medium text-slate-700">
                      No payments recorded
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Payment records will appear here when the administrator
                      records a payment for this bill.
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {selectedBill.payments
                      .slice()
                      .sort(
                        (a, b) =>
                          new Date(b.payment_date).getTime() -
                          new Date(a.payment_date).getTime()
                      )
                      .map((payment) => (
                        <div
                          key={payment.receipt_no}
                          className="rounded-xl border border-slate-200 p-4"
                        >
                          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                            <div className="flex min-w-0 gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                                <CreditCard size={19} />
                              </div>
                              <div className="min-w-0">
                                <p className="break-all font-semibold text-slate-900">
                                  {payment.receipt_no}
                                </p>
                                <p className="mt-1 text-sm text-slate-500">
                                  {payment.payment_date
                                    ? dateLabel(payment.payment_date)
                                    : "Date not specified"}
                                </p>
                                <p className="mt-1 text-sm text-slate-600">
                                  {paymentMethodLabel(payment.payment_method)}
                                </p>
                              </div>
                            </div>
                            <p className="text-lg font-bold text-emerald-700">
                              {money(Number(payment.amount))}
                            </p>
                          </div>

                          {payment.reference_no && (
                            <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
                              <span className="text-slate-500">
                                Reference number:{" "}
                              </span>
                              <span className="break-all font-medium text-slate-800">
                                {payment.reference_no}
                              </span>
                            </div>
                          )}

                          {payment.notes && (
                            <div className="mt-2 text-sm">
                              <span className="text-slate-500">Notes: </span>
                              <span className="text-slate-700">
                                {payment.notes}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={closeDetails}
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
