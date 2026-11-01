"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import StatusBadge from "@/components/StatusBadge";
import { money, dateLabel } from "@/lib/format";
import {
  CreditCard,
  Plus,
  Search,
  X,
  ReceiptText,
  Printer,
  Eye,
} from "lucide-react";

type Bill = {
  id: number;
  bill_no: string;
  tenant_id: number;
  amount: number;
  status: string;
  billing_month: string;
  tenants?: {
    first_name: string;
    last_name: string;
  } | null;
  payments?: {
    amount: number;
  }[];
};

type Payment = {
  id: number;
  receipt_no: string;
  bill_id: number;
  amount: number;
  payment_date: string;
  payment_method: string;
  bills?: {
    bill_no: string;
    tenant_id: number;
    amount: number;
    status: string;
    billing_month: string;
    tenants?: {
      first_name: string;
      last_name: string;
    } | null;
  } | null;
};

const PAGE_SIZE = 10;

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "e_wallet", label: "E-wallet" },
  { value: "other", label: "Other" },
];

function localDateString() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Escape database values before placing them in printable HTML.
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// REUSABLE DETAIL FIELD (USED IN VIEW MODAL)
function DetailField({
  label,
  value,
  capitalize = false,
}: {
  label: string;
  value: string | number | null | undefined;
  capitalize?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p
        className={`mt-1 break-words text-sm font-semibold text-slate-800 ${
          capitalize ? "capitalize" : ""
        }`}
      >
        {value || "—"}
      </p>
    </div>
  );
}

export default function PaymentsPage() {
  const supabase = createClient();

  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [showDialog, setShowDialog] = useState(false);

  // VIEW PAYMENT MODAL
  const [viewingPayment, setViewingPayment] = useState<Payment | null>(
    null
  );

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [billId, setBillId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [paymentDate, setPaymentDate] = useState(localDateString());

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);

    try {
      const [billResult, paymentResult] = await Promise.all([
        supabase
          .from("bills")
          .select("*,tenants(first_name,last_name),payments(amount)")
          .order("billing_month", { ascending: false })
          .order("id", { ascending: false }),

        supabase
          .from("payments")
          .select(
            "id,receipt_no,bill_id,amount,payment_date,payment_method,bills(bill_no,tenant_id,amount,status,billing_month,tenants(first_name,last_name))"
          )
          .order("payment_date", { ascending: false })
          .order("id", { ascending: false }),
      ]);

      if (billResult.error) {
        setError(
          "Unable to load bills. Please refresh and try again."
        );
      } else {
        setBills((billResult.data ?? []) as unknown as Bill[]);
      }

      if (paymentResult.error) {
        setError(
          "Unable to load payment history. Please refresh and try again."
        );
      } else {
        setPayments(
          (paymentResult.data ?? []) as unknown as Payment[]
        );
      }
    } catch {
      setError("Unable to load payment information.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function totalPaidForBill(bill: Bill) {
    return (bill.payments ?? []).reduce(
      (sum, payment) => sum + Number(payment.amount),
      0
    );
  }

  function remainingBalance(bill: Bill) {
    return Math.max(
      0,
      Number(bill.amount) - totalPaidForBill(bill)
    );
  }

  const totalCollected = payments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0
  );

  const filteredPayments = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return payments;

    return payments.filter((payment) => {
      const tenantName =
        `${payment.bills?.tenants?.first_name ?? ""} ${
          payment.bills?.tenants?.last_name ?? ""
        }`
          .trim()
          .toLowerCase();

      const methodLabel = (payment.payment_method ?? "")
        .replaceAll("_", " ")
        .toLowerCase();

      return (
        (payment.receipt_no ?? "").toLowerCase().includes(query) ||
        (payment.bills?.bill_no ?? "").toLowerCase().includes(query) ||
        tenantName.includes(query) ||
        methodLabel.includes(query) ||
        (payment.payment_date ?? "").toLowerCase().includes(query)
      );
    });
  }, [payments, search]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredPayments.length / PAGE_SIZE)
  );

  const visiblePayments = filteredPayments.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const selectedBill = bills.find(
    (bill) => bill.id === Number(billId)
  );

  const selectedBillBalance = selectedBill
    ? remainingBalance(selectedBill)
    : 0;

  // VIEW MODAL VALUES
  const viewingBill = viewingPayment
    ? bills.find((bill) => bill.id === viewingPayment.bill_id)
    : undefined;

  const viewingTenantName = viewingPayment
    ? `${viewingPayment.bills?.tenants?.first_name ?? ""} ${
        viewingPayment.bills?.tenants?.last_name ?? ""
      }`.trim()
    : "";

  const viewingBillTotalPaid = viewingBill
    ? totalPaidForBill(viewingBill)
    : null;

  const viewingBillBalance = viewingBill
    ? remainingBalance(viewingBill)
    : null;

  async function recalculateBillStatus(targetBillId: number) {
    const { data: bill, error: billError } = await supabase
      .from("bills")
      .select("id,amount,status")
      .eq("id", targetBillId)
      .single();

    if (billError) {
      throw new Error(
        "Payment was saved, but the bill status could not be checked."
      );
    }

    if (bill.status === "void") return;

    const { data: billPayments, error: paymentsError } =
      await supabase
        .from("payments")
        .select("amount")
        .eq("bill_id", targetBillId);

    if (paymentsError) {
      throw new Error(
        "Payment was saved, but the bill balance could not be recalculated."
      );
    }

    const paid = (billPayments ?? []).reduce(
      (sum, payment) => sum + Number(payment.amount),
      0
    );

    const total = Number(bill.amount);

    let nextStatus: string;

    if (paid <= 0) {
      nextStatus = "unpaid";
    } else if (paid >= total - 0.000001) {
      nextStatus = "paid";
    } else {
      nextStatus = "partially_paid";
    }

    if (bill.status !== nextStatus) {
      const { error: statusError } = await supabase
        .from("bills")
        .update({ status: nextStatus })
        .eq("id", targetBillId);

      if (statusError) {
        throw new Error(
          "Payment was saved, but the bill status could not be updated."
        );
      }
    }
  }

  function openDialog() {
    setError("");
    setSuccess("");
    setBillId("");
    setPayAmount("");
    setMethod("cash");
    setPaymentDate(localDateString());
    setShowDialog(true);
  }

  function closeDialog() {
    if (!busy) {
      setShowDialog(false);
    }
  }

  async function recordPayment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!billId || !payAmount || !paymentDate) {
      setError(
        "Choose a bill, enter a payment amount, and select the payment date."
      );
      return;
    }

    const numericAmount = Number(payAmount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("The payment amount must be greater than zero.");
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      setError("Please select a valid payment date.");
      return;
    }

    if (paymentDate > localDateString()) {
      setError("The payment date cannot be in the future.");
      return;
    }

    const bill = bills.find(
      (item) => item.id === Number(billId)
    );

    if (!bill) {
      setError(
        "The selected bill could not be found. Refresh and try again."
      );
      return;
    }

    if (bill.status === "void") {
      setError("Payments cannot be recorded against a void bill.");
      return;
    }

    const balance = remainingBalance(bill);

    if (bill.status === "paid" || balance <= 0) {
      setError("This bill is already paid.");
      return;
    }

    if (numericAmount > balance + 0.000001) {
      setError(
        `The payment exceeds the remaining balance of ${money(balance)}.`
      );
      return;
    }

    setBusy(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setError(
          "Your session could not be verified. Please sign in again."
        );
        return;
      }

      const { error: insertError } = await supabase
        .from("payments")
        .insert({
          bill_id: bill.id,
          amount: numericAmount,
          payment_method: method,
          payment_date: paymentDate,
          recorded_by: user.id,
        });

      if (insertError) {
        setError(
          "Unable to record the payment. Please check the information and try again."
        );
        return;
      }

      setShowDialog(false);
      setBillId("");
      setPayAmount("");
      setMethod("cash");
      setPaymentDate(localDateString());
      setSearch("");
      setPage(1);

      let statusWarning = "";

      try {
        await recalculateBillStatus(bill.id);
      } catch (statusError) {
        statusWarning =
          statusError instanceof Error
            ? statusError.message
            : "Payment saved, but bill status recalculation failed.";
      }

      await load();

      if (statusWarning) {
        setError(statusWarning);
      } else {
        setSuccess("Payment recorded successfully.");
      }
    } catch {
      setError(
        "An unexpected error occurred while recording the payment."
      );
    } finally {
      setBusy(false);
    }
  }

  // Open a separate window containing ONLY one receipt.
  // This avoids printing the dashboard and avoids a React print effect.
  function printPayment(payment: Payment) {
    const printWindow = window.open(
      "",
      "_blank",
      "width=800,height=900"
    );

    if (!printWindow) {
      setError(
        "The receipt window was blocked. Allow pop-ups for this site and try again."
      );
      return;
    }

    const receiptNo =
      payment.receipt_no || `Payment #${payment.id}`;

    const billNo =
      payment.bills?.bill_no || `Bill #${payment.bill_id}`;

    const tenantName =
      `${payment.bills?.tenants?.first_name ?? "Unknown"} ${
        payment.bills?.tenants?.last_name ?? ""
      }`.trim();

    const billingMonth =
      payment.bills?.billing_month?.slice(0, 7) || "—";

    const paymentDateLabel = dateLabel(payment.payment_date);

    const paymentMethod = (
      payment.payment_method || "other"
    ).replaceAll("_", " ");

    const amount = money(Number(payment.amount));

    const receiptHtml = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1"
          />
          <title>Receipt - ${escapeHtml(receiptNo)}</title>

          <style>
            @page {
              size: A4 portrait;
              margin: 12mm;
            }

            * {
              box-sizing: border-box;
            }

            html,
            body {
              margin: 0;
              padding: 0;
              width: 100%;
              font-family: Arial, Helvetica, sans-serif;
              color: #111827;
              background: #ffffff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            body {
              font-size: 12px;
              line-height: 1.5;
            }

            .receipt {
              width: 100%;
              max-width: 700px;
              margin: 0 auto;
              padding: 12px;
              page-break-inside: avoid;
              break-inside: avoid-page;
            }

            .header {
              border-bottom: 2px solid #1d4ed8;
              padding-bottom: 14px;
            }

            .title {
              margin: 0;
              font-size: 25px;
              font-weight: 700;
              letter-spacing: 0.5px;
              color: #1d4ed8;
            }

            .subtitle {
              margin: 5px 0 0;
              color: #64748b;
              font-size: 12px;
            }

            .details {
              margin-top: 22px;
            }

            .detail-row {
              display: flex;
              justify-content: space-between;
              gap: 20px;
              padding: 9px 0;
              border-bottom: 1px solid #e5e7eb;
              page-break-inside: avoid;
              break-inside: avoid;
            }

            .detail-label {
              color: #64748b;
              flex-shrink: 0;
            }

            .detail-value {
              text-align: right;
              font-weight: 600;
              overflow-wrap: anywhere;
            }

            .amount-section {
              margin-top: 24px;
              border-top: 1px solid #d1d5db;
              padding-top: 16px;
              page-break-inside: avoid;
              break-inside: avoid;
            }

            .amount-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 16px;
              padding: 8px 0;
            }

            .total {
              margin-top: 10px;
              padding: 14px;
              background: #f1f5f9;
              font-size: 17px;
              font-weight: 700;
            }

            .footer {
              margin-top: 26px;
              padding-top: 12px;
              border-top: 1px solid #e5e7eb;
              font-size: 10px;
              color: #64748b;
              text-align: center;
            }

            @media screen {
              body {
                padding: 24px;
                background: #f1f5f9;
              }

              .receipt {
                padding: 32px;
                background: white;
                box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
              }

              .print-button {
                display: block;
                margin: 0 auto 20px;
                padding: 10px 20px;
                border: none;
                border-radius: 8px;
                background: #047857;
                color: white;
                font-size: 14px;
                font-weight: 700;
                cursor: pointer;
              }
            }

            @media print {
              html,
              body {
                width: 100%;
                height: auto;
                margin: 0;
                padding: 0;
              }

              .receipt {
                max-width: none;
                margin: 0;
                padding: 0;
                box-shadow: none;
              }

              .print-button {
                display: none !important;
              }

              .header,
              .details,
              .amount-section,
              .footer {
                break-inside: avoid;
                page-break-inside: avoid;
              }
            }
          </style>
        </head>

        <body>
          <button
            class="print-button"
            onclick="window.print()"
          >
            Print Receipt
          </button>

          <main class="receipt">
            <header class="header">
              <h1 class="title">PAYMENT RECEIPT</h1>
              <p class="subtitle">Apartment Management System</p>
            </header>

            <section class="details">
              <div class="detail-row">
                <span class="detail-label">Receipt No.</span>
                <span class="detail-value">${escapeHtml(receiptNo)}</span>
              </div>

              <div class="detail-row">
                <span class="detail-label">Bill No.</span>
                <span class="detail-value">${escapeHtml(billNo)}</span>
              </div>

              <div class="detail-row">
                <span class="detail-label">Tenant</span>
                <span class="detail-value">${escapeHtml(tenantName)}</span>
              </div>

              <div class="detail-row">
                <span class="detail-label">Billing Month</span>
                <span class="detail-value">${escapeHtml(billingMonth)}</span>
              </div>

              <div class="detail-row">
                <span class="detail-label">Payment Date</span>
                <span class="detail-value">${escapeHtml(paymentDateLabel)}</span>
              </div>

              <div class="detail-row">
                <span class="detail-label">Payment Method</span>
                <span class="detail-value">${escapeHtml(paymentMethod)}</span>
              </div>
            </section>

            <section class="amount-section">
              <div class="amount-row">
                <span>Amount Paid</span>
                <strong>${escapeHtml(amount)}</strong>
              </div>

              <div class="amount-row total">
                <span>TOTAL PAID</span>
                <span>${escapeHtml(amount)}</span>
              </div>
            </section>

            <footer class="footer">
              <p>Apartment Management System</p>
            </footer>
          </main>

          <script>
            // Automatically open the print dialog only once.
            // The user can also print again using the button if needed.
            window.addEventListener("load", function () {
              if (window.__receiptAutoPrintStarted) return;

              window.__receiptAutoPrintStarted = true;

              setTimeout(function () {
                window.print();
              }, 250);
            });

            window.addEventListener("afterprint", function () {
              // Do not automatically reopen the print dialog.
            });
          </script>
        </body>
      </html>
    `;

    // Register the load handler before writing the document.
    printWindow.document.open();
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
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
            Payments
          </h1>

          <p className="mt-2 text-slate-500">
            Record tenant payments and review payment history.
          </p>
        </div>

        <button
          type="button"
          onClick={openDialog}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
        >
          <Plus size={18} />
          Record payment
        </button>
      </header>

      {/* ALERTS */}
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">
              Payments recorded
            </p>
            <ReceiptText className="text-emerald-700" size={20} />
          </div>

          <p className="mt-3 text-2xl font-bold text-slate-900">
            {payments.length}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            All recorded payment transactions
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">
              Total collected
            </p>
            <CreditCard className="text-blue-700" size={20} />
          </div>

          <p className="mt-3 text-2xl font-bold text-slate-900">
            {money(totalCollected)}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Across all recorded payments
          </p>
        </div>
      </div>

      {/* SEARCH */}
      <div className="max-w-md">
        <label htmlFor="payment-search" className="sr-only">
          Search payments
        </label>

        <div className="relative">
          <Search
            size={19}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />

          <input
            id="payment-search"
            type="search"
            placeholder="Search receipt, bill, tenant, or method..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      {/* PAYMENT HISTORY */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="font-bold text-slate-900">
            Payment history
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            {filteredPayments.length} payment
            {filteredPayments.length === 1 ? "" : "s"} found
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4">Receipt no.</th>
                <th className="px-5 py-4">Bill no.</th>
                <th className="px-5 py-4">Tenant</th>
                <th className="px-5 py-4">Payment date</th>
                <th className="px-5 py-4">Method</th>
                <th className="px-5 py-4">Amount</th>
                <th className="px-5 py-4 text-center">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    Loading payments...
                  </td>
                </tr>
              ) : (
                <>
                  {visiblePayments.map((payment) => (
                    <tr
                      key={payment.id}
                      className="hover:bg-slate-50/80"
                    >
                      <td className="px-5 py-4 font-bold text-slate-900">
                        {payment.receipt_no ||
                          `Payment #${payment.id}`}
                      </td>

                      <td className="px-5 py-4 text-slate-700">
                        {payment.bills?.bill_no ||
                          `Bill #${payment.bill_id}`}
                      </td>

                      <td className="px-5 py-4 text-slate-700">
                        {payment.bills?.tenants?.first_name ?? "Unknown"}{" "}
                        {payment.bills?.tenants?.last_name ?? ""}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {dateLabel(payment.payment_date)}
                      </td>

                      <td className="px-5 py-4 capitalize text-slate-600">
                        {(payment.payment_method ?? "other").replaceAll(
                          "_",
                          " "
                        )}
                      </td>

                      <td className="px-5 py-4 font-semibold text-slate-900">
                        {money(payment.amount)}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => setViewingPayment(payment)}
                            title="View payment"
                            aria-label={`View payment ${
                              payment.receipt_no || payment.id
                            }`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                          >
                            <Eye size={14} />
                            View
                          </button>

                          <button
                            type="button"
                            onClick={() => printPayment(payment)}
                            aria-label={`Print payment ${
                              payment.receipt_no || payment.id
                            }`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            <Printer size={14} />
                            Print
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {visiblePayments.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-12 text-center"
                      >
                        <p className="font-semibold text-slate-700">
                          No payments found
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          {search
                            ? "Try another search term."
                            : "Record a payment to get started."}
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
            {filteredPayments.length === 0
              ? "Showing 0 payments"
              : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(
                  page * PAGE_SIZE,
                  filteredPayments.length
                )} of ${filteredPayments.length} payments`}
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
      {/* VIEW PAYMENT MODAL */}
      {/* ================================================== */}

      {viewingPayment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setViewingPayment(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="view-payment-title"
            className="my-auto flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            {/* HEADER */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2
                  id="view-payment-title"
                  className="text-xl font-bold text-slate-900"
                >
                  Payment Details
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  View complete payment information
                </p>
              </div>

              <button
                type="button"
                onClick={() => setViewingPayment(null)}
                aria-label="Close payment details"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            {/* BODY */}
            <div className="overflow-y-auto p-6">

              {/* SUMMARY */}
              <div className="flex flex-col gap-4 rounded-xl border border-slate-100 bg-slate-50 p-5 sm:flex-row sm:items-center">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <CreditCard size={28} />
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-bold text-slate-900">
                    {viewingPayment.receipt_no ||
                      `Payment #${viewingPayment.id}`}
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    {viewingTenantName || "Unknown tenant"}
                  </p>

                  <p className="mt-2 text-xl font-bold text-emerald-700">
                    {money(Number(viewingPayment.amount))}
                  </p>
                </div>
              </div>

              {/* PAYMENT INFORMATION */}
              <section className="mt-7">
                <h3 className="mb-4 font-bold text-slate-900">
                  Payment Information
                </h3>

                <div className="grid grid-cols-1 gap-x-8 gap-y-5 rounded-xl border border-slate-100 p-5 sm:grid-cols-2">
                  <DetailField
                    label="Receipt No."
                    value={
                      viewingPayment.receipt_no ||
                      `Payment #${viewingPayment.id}`
                    }
                  />

                  <DetailField
                    label="Payment Date"
                    value={
                      viewingPayment.payment_date
                        ? dateLabel(viewingPayment.payment_date)
                        : null
                    }
                  />

                  <DetailField
                    label="Payment Method"
                    value={(
                      viewingPayment.payment_method || "other"
                    ).replaceAll("_", " ")}
                    capitalize
                  />

                  <DetailField
                    label="Amount Paid"
                    value={money(Number(viewingPayment.amount))}
                  />
                </div>
              </section>

              {/* BILL INFORMATION */}
              <section className="mt-7">
                <h3 className="mb-4 font-bold text-slate-900">
                  Bill Information
                </h3>

                <div className="grid grid-cols-1 gap-x-8 gap-y-5 rounded-xl border border-slate-100 p-5 sm:grid-cols-2">
                  <DetailField
                    label="Bill No."
                    value={
                      viewingPayment.bills?.bill_no ||
                      `Bill #${viewingPayment.bill_id}`
                    }
                  />

                  <DetailField
                    label="Tenant"
                    value={viewingTenantName}
                  />

                  <DetailField
                    label="Billing Month"
                    value={viewingPayment.bills?.billing_month?.slice(
                      0,
                      7
                    )}
                  />

                  <div>
                    <p className="text-xs font-medium text-slate-400">
                      Bill Status
                    </p>

                    <div className="mt-2">
                      {viewingPayment.bills?.status ? (
                        <StatusBadge
                          status={viewingPayment.bills.status}
                        />
                      ) : (
                        <span className="text-sm text-slate-500">—</span>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* BILL BALANCE */}
              <section className="mt-7">
                <h3 className="mb-4 font-bold text-slate-900">
                  Bill Balance
                </h3>

                <div className="rounded-xl border border-slate-100 p-5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 text-sm">
                    <span className="text-slate-500">Bill amount</span>
                    <span className="font-semibold text-slate-800">
                      {viewingPayment.bills
                        ? money(Number(viewingPayment.bills.amount))
                        : "—"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-100 py-3 text-sm">
                    <span className="text-slate-500">
                      Total paid on this bill
                    </span>
                    <span className="font-semibold text-emerald-700">
                      {viewingBillTotalPaid !== null
                        ? money(viewingBillTotalPaid)
                        : "—"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-3">
                    <span className="text-sm font-medium text-slate-700">
                      Remaining balance
                    </span>
                    <span
                      className={`text-lg font-bold ${
                        viewingBillBalance && viewingBillBalance > 0
                          ? "text-rose-600"
                          : "text-emerald-700"
                      }`}
                    >
                      {viewingBillBalance !== null
                        ? money(viewingBillBalance)
                        : "—"}
                    </span>
                  </div>
                </div>
              </section>

            </div>

            {/* FOOTER */}
            <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-100 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-400">
                Payment record #{viewingPayment.id}
              </p>

              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setViewingPayment(null)}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Close
                </button>

                <button
                  type="button"
                  onClick={() => printPayment(viewingPayment)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800"
                >
                  <Printer size={16} />
                  Print receipt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RECORD PAYMENT DIALOG */}
      {showDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) {
              closeDialog();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-payment-title"
            className="my-8 w-full max-w-xl rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-100 p-6">
              <div>
                <h2
                  id="record-payment-title"
                  className="text-xl font-bold text-slate-900"
                >
                  Record payment
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Record a payment against an outstanding bill.
                </p>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={closeDialog}
                aria-label="Close dialog"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={recordPayment} className="space-y-4 p-6">
              <label className="block text-sm font-semibold text-slate-700">
                Bill

                <select
                  required
                  value={billId}
                  onChange={(e) => {
                    setBillId(e.target.value);
                    setPayAmount("");
                    setError("");
                  }}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Select bill</option>

                  {bills
                    .filter(
                      (bill) =>
                        bill.status !== "paid" &&
                        bill.status !== "void" &&
                        remainingBalance(bill) > 0
                    )
                    .map((bill) => (
                      <option key={bill.id} value={bill.id}>
                        {bill.bill_no} — {bill.tenants?.first_name}{" "}
                        {bill.tenants?.last_name} — Remaining{" "}
                        {money(remainingBalance(bill))}
                      </option>
                    ))}
                </select>
              </label>

              {selectedBill && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-slate-600">
                      Bill amount
                    </span>
                    <span className="font-semibold text-slate-900">
                      {money(selectedBill.amount)}
                    </span>
                  </div>

                  <div className="mt-2 flex justify-between gap-3 text-sm">
                    <span className="text-slate-600">
                      Already paid
                    </span>
                    <span className="font-semibold text-slate-900">
                      {money(totalPaidForBill(selectedBill))}
                    </span>
                  </div>

                  <div className="mt-2 flex justify-between gap-3 border-t border-blue-100 pt-2 text-sm">
                    <span className="font-semibold text-slate-700">
                      Remaining balance
                    </span>
                    <span className="font-bold text-blue-800">
                      {money(selectedBillBalance)}
                    </span>
                  </div>
                </div>
              )}

              <label className="block text-sm font-semibold text-slate-700">
                Payment amount (PHP)

                <input
                  required
                  min="0.01"
                  max={
                    selectedBill
                      ? selectedBillBalance
                      : undefined
                  }
                  step="0.01"
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                Payment date

                <input
                  required
                  type="date"
                  max={localDateString()}
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                Payment method

                <select
                  required
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  {PAYMENT_METHODS.map((paymentMethod) => (
                    <option
                      key={paymentMethod.value}
                      value={paymentMethod.value}
                    >
                      {paymentMethod.label}
                    </option>
                  ))}
                </select>
              </label>

              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
                >
                  {error}
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
                    !selectedBill ||
                    selectedBillBalance <= 0 ||
                    !payAmount ||
                    !Number.isFinite(Number(payAmount)) ||
                    Number(payAmount) <= 0 ||
                    Number(payAmount) >
                      selectedBillBalance + 0.000001
                  }
                  className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? "Saving..." : "Save payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}