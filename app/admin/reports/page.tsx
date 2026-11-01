
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import StatusBadge from "@/components/StatusBadge";
import { money, dateLabel } from "@/lib/format";
import {
  Printer,
  X,
  Mail,
  Phone,
  Home,
  CalendarDays,
  FileText,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type Tenant = {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  move_in_date: string | null;
  move_out_date: string | null;
  units?: {
    unit_number: string;
    monthly_rent: number;
  } | null;
};

type Payment = {
  id: number;
  receipt_no: string;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  reference_no: string | null;
};

type BillWithPayments = {
  id: number;
  bill_no: string;
  billing_month: string;
  due_date: string;
  amount: number;
  status: string;
  payments: Payment[] | null;
};

type PaymentRow = Payment & {
  bill_no: string;
  billing_month: string;
};

const PAGE_SIZE = 10;

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60";

function fullName(tenant: Tenant) {
  return [tenant.first_name, tenant.middle_name, tenant.last_name]
    .filter(Boolean)
    .join(" ");
}

function initials(tenant: Tenant) {
  return `${tenant.first_name?.[0] ?? ""}${
    tenant.last_name?.[0] ?? ""
  }`.toUpperCase();
}

function methodLabel(method: string | null) {
  if (!method) return "—";
  const text = method.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function localDateString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function InfoField({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | null | undefined;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      {icon && (
        <div className="mt-0.5 shrink-0 text-slate-500">{icon}</div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <p className="mt-1 break-words text-sm font-semibold text-slate-800">
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  description,
  icon,
  color,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  color: "blue" | "green" | "rose" | "indigo";
}) {
  const styles = {
    blue: {
      card: "border-blue-100 bg-blue-50/70",
      icon: "bg-blue-100 text-blue-600",
      title: "text-blue-700",
      value: "text-slate-900",
    },
    green: {
      card: "border-emerald-100 bg-emerald-50/70",
      icon: "bg-emerald-100 text-emerald-600",
      title: "text-emerald-800",
      value: "text-slate-900",
    },
    rose: {
      card: "border-rose-100 bg-rose-50/70",
      icon: "bg-rose-100 text-rose-600",
      title: "text-rose-800",
      value: "text-slate-900",
    },
    indigo: {
      card: "border-indigo-100 bg-indigo-50/70",
      icon: "bg-indigo-100 text-indigo-600",
      title: "text-indigo-800",
      value: "text-slate-900",
    },
  };

  const style = styles[color];

  return (
    <div
      className={`rounded-2xl border p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${style.card}`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${style.icon}`}
        >
          {icon}
        </div>

        <div className="min-w-0">
          <p className={`text-sm font-semibold ${style.title}`}>{title}</p>
          <p className={`mt-1.5 break-words text-2xl font-bold ${style.value}`}>
            {value}
          </p>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
      </div>
    </div>
  );
}

export default function TenantPaymentHistoryPage() {
  const supabase = createClient();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [bills, setBills] = useState<BillWithPayments[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");

  // FILTERS
  const [tenantId, setTenantId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [method, setMethod] = useState("all");
  const [page, setPage] = useState(1);

  // PRINT DATE
  const [printedOn, setPrintedOn] = useState("");

  useEffect(() => {
    setPrintedOn(dateLabel(localDateString()));
  }, []);

  // LOAD ALL TENANTS, INCLUDING MOVED-OUT TENANTS
  useEffect(() => {
    async function loadTenants() {
      const { data, error: tenantError } = await supabase
        .from("tenants")
        .select(
          "id,first_name,middle_name,last_name,email,phone,status,move_in_date,move_out_date,units(unit_number,monthly_rent)"
        )
        .order("last_name");

      if (tenantError) {
        setError(
          "Unable to load tenants. Please refresh the page and try again."
        );
      } else {
        setTenants((data ?? []) as unknown as Tenant[]);
      }

      setLoadingTenants(false);
    }

    void loadTenants();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // LOAD BILLS AND PAYMENTS FOR SELECTED TENANT
  useEffect(() => {
    if (!tenantId) {
      setBills([]);
      setLoadingHistory(false);
      return;
    }

    let cancelled = false;

    async function loadHistory() {
      setLoadingHistory(true);
      setError("");

      const { data, error: historyError } = await supabase
        .from("bills")
        .select(
          "id,bill_no,billing_month,due_date,amount,status,payments(id,receipt_no,amount,payment_date,payment_method,reference_no)"
        )
        .eq("tenant_id", Number(tenantId))
        .order("billing_month", { ascending: false });

      if (cancelled) return;

      if (historyError) {
        setError("Unable to load payment history. Please try again.");
        setBills([]);
      } else {
        setBills((data ?? []) as unknown as BillWithPayments[]);
      }

      setLoadingHistory(false);
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const tenant =
    tenants.find((item) => item.id === Number(tenantId)) ?? null;

  // FLATTEN PAYMENTS AND SORT NEWEST FIRST
  const allPayments = useMemo<PaymentRow[]>(() => {
    const rows: PaymentRow[] = [];

    for (const bill of bills) {
      for (const payment of bill.payments ?? []) {
        rows.push({
          ...payment,
          bill_no: bill.bill_no,
          billing_month: bill.billing_month,
        });
      }
    }

    return rows.sort((a, b) => {
      if (a.payment_date !== b.payment_date) {
        return a.payment_date < b.payment_date ? 1 : -1;
      }

      return b.id - a.id;
    });
  }, [bills]);

  // PAYMENT METHOD OPTIONS
  const methodOptions = useMemo(() => {
    const options = new Set<string>();

    for (const payment of allPayments) {
      if (payment.payment_method) {
        options.add(payment.payment_method);
      }
    }

    return Array.from(options).sort();
  }, [allPayments]);

  const rangeInvalid =
    fromDate !== "" && toDate !== "" && fromDate > toDate;

  // FILTER PAYMENTS
  const filteredPayments = useMemo(() => {
    if (rangeInvalid) return [];

    return allPayments.filter((payment) => {
      if (fromDate && payment.payment_date < fromDate) return false;
      if (toDate && payment.payment_date > toDate) return false;
      if (method !== "all" && payment.payment_method !== method) {
        return false;
      }

      return true;
    });
  }, [allPayments, fromDate, toDate, method, rangeInvalid]);

  // ALL-TIME SUMMARY
  const summary = useMemo(() => {
    let billed = 0;
    let paid = 0;
    let outstanding = 0;

    for (const bill of bills) {
      const billPaid = (bill.payments ?? []).reduce(
        (sum, payment) => sum + Number(payment.amount),
        0
      );

      billed += Number(bill.amount);
      paid += billPaid;
      outstanding += Math.max(0, Number(bill.amount) - billPaid);
    }

    const lastPayment =
      allPayments.length > 0 ? allPayments[0].payment_date : null;

    return { billed, paid, outstanding, lastPayment };
  }, [bills, allPayments]);

  // FILTERED TOTAL
  const filteredTotal = filteredPayments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0
  );

  // PAGINATION
  const totalPages = Math.max(
    1,
    Math.ceil(filteredPayments.length / PAGE_SIZE)
  );

  const currentPage = Math.min(page, totalPages);

  const visiblePayments = filteredPayments.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const hasFilters =
    fromDate !== "" || toDate !== "" || method !== "all";

  const periodLabel =
    fromDate && toDate
      ? `${dateLabel(fromDate)} to ${dateLabel(toDate)}`
      : fromDate
        ? `From ${dateLabel(fromDate)}`
        : toDate
          ? `Up to ${dateLabel(toDate)}`
          : "All dates";

  function handleTenantChange(value: string) {
    setTenantId(value);
    setBills([]);
    setFromDate("");
    setToDate("");
    setMethod("all");
    setPage(1);
    setError("");
  }

  function clearFilters() {
    setFromDate("");
    setToDate("");
    setMethod("all");
    setPage(1);
  }

  function handlePrint() {
    window.print();
  }

  const ready = tenant !== null && !loadingHistory;

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-6 print:max-w-none">
      <style>{`
        @page {
          margin: 14mm;
        }

        @media print {
          aside {
            display: none !important;
          }

          main {
            padding: 0 !important;
            margin: 0 !important;
          }

          body {
            background: #ffffff !important;
          }

          body * {
            visibility: hidden;
          }

          .tenant-print,
          .tenant-print * {
            visibility: visible;
          }

          .tenant-print {
            position: absolute;
            inset: 0;
            width: 100%;
            background: white !important;
          }

          table {
            page-break-inside: auto;
          }

          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }

          thead {
            display: table-header-group;
          }

          tfoot {
            display: table-row-group;
          }
        }
      `}</style>

      {/* SCREEN VIEW */}
      <div className="space-y-6 print:hidden">
        {/* PAGE HEADER */}
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-bold tracking-wide text-blue-700">
              ADMIN / REPORTS
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              Tenant payment history
            </h1>

            <p className="mt-2 text-sm text-slate-500 sm:text-base">
              View and print the payments made by one tenant.
            </p>
          </div>

          <button
  type="button"
  onClick={handlePrint}
  disabled={!ready}
  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:hover:bg-slate-200"
>
  <Printer size={18} />
  Print
</button>
        </header>

        {/* ERROR MESSAGE */}
        {error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          >
            <span>{error}</span>

            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
              className="shrink-0 rounded-lg p-1 hover:bg-rose-100"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* FILTERS */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1.5fr]">
            {/* TENANT */}
            <div>
              <label
                htmlFor="report-tenant"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Tenant
              </label>

              <select
                id="report-tenant"
                value={tenantId}
                disabled={loadingTenants}
                onChange={(e) => handleTenantChange(e.target.value)}
                className={inputClass}
              >
                <option value="">
                  {loadingTenants
                    ? "Loading tenants..."
                    : "Select a tenant"}
                </option>

                {tenants.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.last_name}, {item.first_name}
                    {item.units?.unit_number
                      ? ` — Unit ${item.units.unit_number}`
                      : ""}
                    {item.status !== "active"
                      ? ` (${item.status})`
                      : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* FROM DATE */}
            <div>
              <label
                htmlFor="report-from"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                From
              </label>

              <input
                id="report-from"
                type="date"
                value={fromDate}
                disabled={!tenant}
                max={toDate || undefined}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
                className={inputClass}
              />
            </div>

            {/* TO DATE */}
            <div>
              <label
                htmlFor="report-to"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                To
              </label>

              <input
                id="report-to"
                type="date"
                value={toDate}
                disabled={!tenant}
                min={fromDate || undefined}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(1);
                }}
                className={inputClass}
              />
            </div>

            {/* PAYMENT METHOD */}
            <div>
              <label
                htmlFor="report-method"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Payment method
              </label>

              <select
                id="report-method"
                value={method}
                disabled={!tenant}
                onChange={(e) => {
                  setMethod(e.target.value);
                  setPage(1);
                }}
                className={inputClass}
              >
                <option value="all">All methods</option>

                {methodOptions.map((option) => (
                  <option key={option} value={option}>
                    {methodLabel(option)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {hasFilters && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm font-semibold text-blue-700 transition hover:text-blue-900"
              >
                Clear filters
              </button>
            </div>
          )}
        </section>

        {/* DATE RANGE VALIDATION */}
        {rangeInvalid && (
          <p
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700"
          >
            The From date can&apos;t be after the To date.
          </p>
        )}

        {/* NO TENANT SELECTED */}
        {!tenant && (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <FileText size={26} />
            </div>

            <h2 className="mt-4 font-bold text-slate-800">
              Select a tenant to see their payment history
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Moved-out tenants are included in the list.
            </p>
          </section>
        )}

        {tenant && (
          <>
            {/* TENANT INFORMATION CARD */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-center">
                {/* AVATAR AND NAME */}
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white shadow-sm">
                    {initials(tenant)}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold text-slate-900">
                        {fullName(tenant)}
                      </h2>

                      <StatusBadge status={tenant.status} />
                    </div>

                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                      <Home size={15} />
                      {tenant.units?.unit_number
                        ? `Unit ${tenant.units.unit_number}`
                        : "No unit assigned"}
                    </p>
                  </div>
                </div>

                {/* CONTACT INFORMATION */}
                <div className="grid flex-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                  <InfoField
                    label="Email"
                    value={tenant.email}
                    icon={<Mail size={19} />}
                  />

                  <InfoField
                    label="Phone"
                    value={tenant.phone}
                    icon={<Phone size={19} />}
                  />
                </div>

                {/* MOVE-IN / MOVE-OUT */}
                <div className="grid flex-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                  <InfoField
                    label="Move-in date"
                    value={
                      tenant.move_in_date
                        ? dateLabel(tenant.move_in_date)
                        : null
                    }
                    icon={<CalendarDays size={19} />}
                  />

                  <InfoField
                    label="Move-out date"
                    value={
                      tenant.move_out_date
                        ? dateLabel(tenant.move_out_date)
                        : null
                    }
                    icon={<CalendarDays size={19} />}
                  />
                </div>

                {/* MONTHLY RENT */}
                {tenant.units?.monthly_rent != null && (
                  <div className="border-t border-slate-100 pt-4 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                    <p className="text-xs font-semibold text-slate-400">
                      Monthly rent
                    </p>

                    <p className="mt-1 whitespace-nowrap text-2xl font-bold text-slate-900">
                      {money(Number(tenant.units.monthly_rent))}
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* SUMMARY CARDS */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                title="Total billed"
                value={money(summary.billed)}
                description={`${bills.length} bill${bills.length === 1 ? "" : "s"}, all time`}
                icon={<FileText size={23} />}
                color="blue"
              />

              <SummaryCard
                title="Total paid"
                value={money(summary.paid)}
                description={`${allPayments.length} payment${allPayments.length === 1 ? "" : "s"}, all time`}
                icon={<CheckCircle2 size={24} />}
                color="green"
              />

              <SummaryCard
                title="Outstanding balance"
                value={money(summary.outstanding)}
                description="Across all bills"
                icon={<AlertCircle size={24} />}
                color="rose"
              />

              <SummaryCard
                title="Last payment"
                value={
                  summary.lastPayment
                    ? dateLabel(summary.lastPayment)
                    : "—"
                }
                description="Most recent payment date"
                icon={<CalendarDays size={23} />}
                color="indigo"
              />
            </div>

            {/* PAYMENT TABLE */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {/* TABLE HEADER */}
              <div className="flex flex-col justify-between gap-2 border-b border-slate-100 p-5 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <CreditCard size={21} />
                  </div>

                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Payments
                    </h2>

                    <p className="mt-0.5 text-sm text-slate-500">
                      {filteredPayments.length} payment
                      {filteredPayments.length === 1 ? "" : "s"} found
                      {hasFilters ? " for the selected filters" : ""}
                    </p>
                  </div>
                </div>
              </div>

              {/* TABLE */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[950px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-5 py-4">Receipt no.</th>
                      <th className="px-5 py-4">Payment date</th>
                      <th className="px-5 py-4">Bill no.</th>
                      <th className="px-5 py-4">Billing month</th>
                      <th className="px-5 py-4">Method</th>
                      <th className="px-5 py-4">Reference no.</th>
                      <th className="px-5 py-4 text-right">Amount</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {loadingHistory ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-5 py-14 text-center text-slate-500"
                        >
                          <div className="flex flex-col items-center gap-3">
                            <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                            <span>Loading payment history...</span>
                          </div>
                        </td>
                      </tr>
                    ) : visiblePayments.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-5 py-14 text-center">
                          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                            <FileText size={23} />
                          </div>

                          <p className="mt-3 font-semibold text-slate-700">
                            No payments found
                          </p>

                          <p className="mt-1 text-sm text-slate-500">
                            {hasFilters
                              ? "Try a different date range or payment method."
                              : "This tenant hasn't made any payments yet."}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      visiblePayments.map((payment) => (
                        <tr
                          key={payment.id}
                          className="transition hover:bg-blue-50/40"
                        >
                          <td className="whitespace-nowrap px-5 py-4 font-bold text-slate-900">
                            {payment.receipt_no}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                            {dateLabel(payment.payment_date)}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                            {payment.bill_no}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                            {payment.billing_month.slice(0, 7)}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                            {methodLabel(payment.payment_method)}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                            {payment.reference_no || "—"}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-right font-bold text-slate-900">
                            {money(Number(payment.amount))}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* TABLE FOOTER */}
              <div className="flex flex-col gap-4 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-slate-500">
                    {filteredPayments.length === 0
                      ? "Showing 0 payments"
                      : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(
                          currentPage * PAGE_SIZE,
                          filteredPayments.length
                        )} of ${filteredPayments.length} payments`}
                  </p>

                  <p className="mt-1 text-sm font-bold text-slate-900">
                    Total paid{hasFilters ? " (filtered)" : ""}:{" "}
                    {money(filteredTotal)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() =>
                      setPage(Math.max(1, currentPage - 1))
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                    Previous
                  </button>

                  <span className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-bold text-white">
                    {currentPage}
                  </span>

                  <span className="text-sm text-slate-500">
                    of {totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() =>
                      setPage(Math.min(totalPages, currentPage + 1))
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      {/* PRINT VIEW */}
      {tenant && (
        <section className="tenant-print hidden bg-white text-black print:block">
          {/* LETTERHEAD */}
          <div className="border-b-2 border-slate-400 pb-4 text-center">
            <h1 className="text-2xl font-bold">ECM Apartment</h1>

            <p className="mt-1 text-xs text-slate-600">
              Apartment management
            </p>

            <h2 className="mt-4 text-lg font-bold">
              Tenant payment history
            </h2>
          </div>

          {/* TENANT DETAILS */}
          <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
            <p>
              <span className="text-slate-600">Tenant: </span>
              <strong>{fullName(tenant)}</strong>
            </p>

            <p>
              <span className="text-slate-600">Unit: </span>
              {tenant.units?.unit_number ?? "—"}
            </p>

            <p>
              <span className="text-slate-600">Contact: </span>
              {[tenant.email, tenant.phone].filter(Boolean).join(" / ") || "—"}
            </p>

            <p>
              <span className="text-slate-600">Monthly rent: </span>
              {tenant.units?.monthly_rent != null
                ? money(Number(tenant.units.monthly_rent))
                : "—"}
            </p>

            <p>
              <span className="text-slate-600">Period: </span>
              {periodLabel}
            </p>

            <p>
              <span className="text-slate-600">Payment method: </span>
              {method === "all" ? "All methods" : methodLabel(method)}
            </p>
          </div>

          {/* ALL FILTERED PAYMENTS, WITHOUT PAGINATION */}
          <table className="mt-5 w-full text-left text-[11px]">
            <thead>
              <tr className="border-y border-slate-400">
                <th className="py-2 pr-2">Date</th>
                <th className="py-2 pr-2">Receipt no.</th>
                <th className="py-2 pr-2">Bill no.</th>
                <th className="py-2 pr-2">Month</th>
                <th className="py-2 pr-2">Method</th>
                <th className="py-2 pr-2">Reference</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>

            <tbody>
              {filteredPayments.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-5 text-center text-slate-600"
                  >
                    No payments for the selected filters.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((payment) => (
                  <tr
                    key={payment.id}
                    className="border-b border-slate-200"
                  >
                    <td className="py-2 pr-2">
                      {dateLabel(payment.payment_date)}
                    </td>

                    <td className="py-2 pr-2">{payment.receipt_no}</td>
                    <td className="py-2 pr-2">{payment.bill_no}</td>

                    <td className="py-2 pr-2">
                      {payment.billing_month.slice(0, 7)}
                    </td>

                    <td className="py-2 pr-2">
                      {methodLabel(payment.payment_method)}
                    </td>

                    <td className="py-2 pr-2">
                      {payment.reference_no || "—"}
                    </td>

                    <td className="py-2 text-right">
                      {money(Number(payment.amount))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            <tfoot>
              <tr className="border-t-2 border-slate-400">
                <td colSpan={6} className="py-2 pr-2 text-right font-bold">
                  Total paid
                </td>

                <td className="py-2 text-right font-bold">
                  {money(filteredTotal)}
                </td>
              </tr>

              <tr>
                <td colSpan={6} className="py-1 pr-2 text-right text-slate-600">
                  Outstanding balance (all bills)
                </td>

                <td className="py-1 text-right">
                  {money(summary.outstanding)}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* SIGNATURES */}
          <div className="mt-16 flex justify-between text-xs text-slate-600">
            <p className="w-5/12 border-t border-slate-400 pt-2">
              Prepared by
            </p>

            <p className="w-5/12 border-t border-slate-400 pt-2">
              Received by (tenant)
            </p>
          </div>

          <p className="mt-8 text-center text-[10px] text-slate-500">
            Printed on {printedOn}
          </p>
        </section>
      )}
    </div>
  );
}
