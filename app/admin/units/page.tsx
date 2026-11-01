"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import StatusBadge from "@/components/StatusBadge";

type Unit = {
  id: number;
  unit_number: string;
  monthly_rent: number;
  status: string;
  description: string | null;
};

type UnitField =
  | "unit_number"
  | "monthly_rent"
  | "status"
  | "description"
  | "general";

type FormErrors = Partial<Record<UnitField, string>>;

const DUPLICATE_UNIT_MESSAGE =
  "This unit number already exists. Please use a different number.";

// Ignore case AND all whitespace:
// "room-101", "ROOM-101", "room- 101", "room - 101" all become "room-101".
function normalizeUnitNumber(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

// Pass excludeId when editing so a unit can keep its own number.
function isDuplicateUnitNumber(
  units: Unit[],
  value: string,
  excludeId?: number
): boolean {
  const normalized = normalizeUnitNumber(value);

  if (!normalized) return false;

  return units.some(
    (unit) =>
      unit.id !== excludeId &&
      normalizeUnitNumber(unit.unit_number) === normalized
  );
}

// Shared validation for the Add and Edit forms.
function validateUnitForm(
  values: { unitNumber: string; rent: string; description: string },
  units: Unit[],
  excludeId?: number
): FormErrors {
  const errors: FormErrors = {};
  const trimmedUnitNumber = values.unitNumber.trim();
  const amount = Number(values.rent);

  if (!trimmedUnitNumber) {
    errors.unit_number = "Please enter a unit number.";
  } else if (trimmedUnitNumber.length > 50) {
    errors.unit_number = "Unit number must be 50 characters or fewer.";
  } else if (isDuplicateUnitNumber(units, trimmedUnitNumber, excludeId)) {
    errors.unit_number = DUPLICATE_UNIT_MESSAGE;
  }

  if (values.rent.trim() === "") {
    errors.monthly_rent = "Please enter the monthly rent.";
  } else if (!Number.isFinite(amount) || amount < 0) {
    errors.monthly_rent = "Rent must be a valid amount of zero or more.";
  } else if (!/^\d+(\.\d{1,2})?$/.test(values.rent.trim())) {
    errors.monthly_rent =
      "Enter a valid amount with no more than two decimal places.";
  }

  if (values.description.length > 1000) {
    errors.description = "Description must be 1,000 characters or fewer.";
  }

  return errors;
}

function getDatabaseError(message: string): FormErrors {
  const text = message.toLowerCase();

  if (
    text.includes("duplicate key") ||
    text.includes("unique constraint") ||
    text.includes("units_unit_number_key")
  ) {
    return {
      unit_number:
        "This unit number already exists. Please enter a different unit number.",
    };
  }

  if (
    text.includes("monthly_rent") ||
    text.includes("numeric field overflow") ||
    text.includes("check constraint")
  ) {
    return {
      monthly_rent:
        "The rent amount is invalid. Please check the amount and try again.",
    };
  }

  return { general: message };
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-rose-600">
      <span aria-hidden="true">⚠</span>
      <span>{message}</span>
    </p>
  );
}

const inputClass = (hasError: boolean) =>
  `mt-2 w-full rounded-xl border bg-white px-4 py-3 text-sm font-normal outline-none transition placeholder:text-slate-400 focus:ring-2 ${
    hasError
      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-100"
      : "border-slate-200 focus:border-blue-500 focus:ring-blue-100"
  }`;

export default function UnitsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [rows, setRows] = useState<Unit[]>([]);

  // ADD FORM
  const [unitNumber, setUnitNumber] = useState("");
  const [rent, setRent] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("vacant");

  // EDIT FORM (all four fields)
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [editUnitNumber, setEditUnitNumber] = useState("");
  const [editRent, setEditRent] = useState("");
  const [editStatus, setEditStatus] = useState("vacant");
  const [editDescription, setEditDescription] = useState("");

  const [pageError, setPageError] = useState("");
  const [addErrors, setAddErrors] = useState<FormErrors>({});
  const [editErrors, setEditErrors] = useState<FormErrors>({});

  const [busy, setBusy] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const rowsPerPage = 10;

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("units")
      .select("*")
      .order("unit_number");

    if (error) {
      setPageError(error.message);
      return false;
    }

    setRows((data ?? []) as Unit[]);
    return true;
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  // LIVE DUPLICATE CHECKS (derived, always in sync with the input)
  const addDuplicate = useMemo(
    () => isDuplicateUnitNumber(rows, unitNumber),
    [rows, unitNumber]
  );

  const editDuplicate = useMemo(
    () =>
      editingUnit
        ? isDuplicateUnitNumber(rows, editUnitNumber, editingUnit.id)
        : false,
    [rows, editUnitNumber, editingUnit]
  );

  const addUnitNumberError =
    addErrors.unit_number || (addDuplicate ? DUPLICATE_UNIT_MESSAGE : "");

  const editUnitNumberError =
    editErrors.unit_number || (editDuplicate ? DUPLICATE_UNIT_MESSAGE : "");

  function resetAddForm() {
    setUnitNumber("");
    setRent("");
    setDescription("");
    setStatus("vacant");
    setAddErrors({});
  }

  function openAddModal() {
    setPageError("");
    resetAddForm();
    setIsAddModalOpen(true);
  }

  function closeAddModal() {
    if (busy) return;
    setIsAddModalOpen(false);
    setAddErrors({});
  }

  function openEditModal(unit: Unit) {
    setPageError("");
    setEditErrors({});
    setEditingUnit(unit);
    setEditUnitNumber(unit.unit_number ?? "");
    setEditRent(String(unit.monthly_rent));
    setEditStatus(unit.status || "vacant");
    setEditDescription(unit.description ?? "");
  }

  function closeEditModal() {
    if (editBusy) return;
    setEditingUnit(null);
    setEditUnitNumber("");
    setEditRent("");
    setEditStatus("vacant");
    setEditDescription("");
    setEditErrors({});
  }

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    const errors = validateUnitForm(
      { unitNumber, rent, description },
      rows
    );

    setAddErrors(errors);

    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    setAddErrors({});
    setPageError("");

    try {
      const { error } = await supabase.from("units").insert({
        unit_number: unitNumber.trim(),
        monthly_rent: Number(rent),
        description: description.trim() || null,
        status,
      });

      if (error) {
        setAddErrors(getDatabaseError(error.message));
        return;
      }

      const loaded = await load();

      if (!loaded) {
        setAddErrors({
          general:
            "The unit was saved, but the unit list could not refresh. Close this dialog and reload the page.",
        });
        return;
      }

      resetAddForm();
      setIsAddModalOpen(false);
      setSearch("");
      setCurrentPage(1);
    } catch {
      setAddErrors({
        general: "Something went wrong while adding the unit. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(id: number, nextStatus: string) {
    setPageError("");
    setStatusBusyId(id);

    try {
      const { error } = await supabase
        .from("units")
        .update({ status: nextStatus })
        .eq("id", id);

      if (error) {
        setPageError(error.message);
        return;
      }

      await load();
    } catch {
      setPageError("Unable to update the unit status. Please try again.");
    } finally {
      setStatusBusyId(null);
    }
  }

  // UPDATE ALL FIELDS TOGETHER
  async function updateUnit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingUnit || editBusy) return;

    const errors = validateUnitForm(
      {
        unitNumber: editUnitNumber,
        rent: editRent,
        description: editDescription,
      },
      rows,
      editingUnit.id
    );

    setEditErrors(errors);

    if (Object.keys(errors).length > 0) return;

    setEditBusy(true);
    setEditErrors({});

    try {
      const { error } = await supabase
        .from("units")
        .update({
          unit_number: editUnitNumber.trim(),
          monthly_rent: Number(editRent),
          status: editStatus,
          description: editDescription.trim() || null,
        })
        .eq("id", editingUnit.id);

      if (error) {
        setEditErrors(getDatabaseError(error.message));
        return;
      }

      const loaded = await load();

      if (!loaded) {
        setEditErrors({
          general:
            "The unit was updated, but the unit list could not refresh. Close this dialog and reload the page.",
        });
        return;
      }

      setEditingUnit(null);
      setEditUnitNumber("");
      setEditRent("");
      setEditStatus("vacant");
      setEditDescription("");
      setEditErrors({});
    } catch {
      setEditErrors({
        general: "Unable to update the unit. Please try again.",
      });
    } finally {
      setEditBusy(false);
    }
  }

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((unit) =>
      unit.unit_number.toLowerCase().includes(query)
    );
  }, [rows, search]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRows.length / rowsPerPage)
  );

  const safePage = Math.min(currentPage, totalPages);

  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, safePage]);

  const startItem =
    filteredRows.length === 0 ? 0 : (safePage - 1) * rowsPerPage + 1;

  const endItem = Math.min(safePage * rowsPerPage, filteredRows.length);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-700">ADMIN / UNITS</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            Apartment units
          </h1>
          <p className="mt-2 text-slate-500">
            Add units and keep their occupancy status updated.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Unit
        </button>
      </header>

      {pageError && !isAddModalOpen && !editingUnit && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          <span>{pageError}</span>
          <button
            type="button"
            onClick={() => setPageError("")}
            aria-label="Dismiss error"
            className="font-bold hover:text-rose-900"
          >
            ✕
          </button>
        </div>
      )}

      <div className="relative w-full sm:max-w-md">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>

        <input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setCurrentPage(1);
          }}
          placeholder="Search by unit number..."
          aria-label="Search apartment units"
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-1 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-bold text-slate-900">
            All units{" "}
            <span className="ml-1 font-medium text-slate-400">
              ({filteredRows.length})
            </span>
          </h2>
          {search.trim() && (
            <p className="text-xs text-slate-500">
              Search results for &quot;{search.trim()}&quot;
            </p>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4 font-semibold">Unit</th>
                <th className="px-5 py-4 font-semibold">Monthly rent</th>
                <th className="px-5 py-4 font-semibold">Status</th>
                <th className="px-5 py-4 font-semibold">Description</th>
                <th className="px-5 py-4 font-semibold">Update status</th>
                <th className="px-5 py-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedRows.map((unit) => (
                <tr key={unit.id} className="transition hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-5 py-4 font-bold text-slate-900">
                    {unit.unit_number}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-700">
                    ₱
                    {Number(unit.monthly_rent).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={unit.status} />
                  </td>
                  <td className="max-w-xs px-5 py-4 text-slate-500">
                    <span className="line-clamp-2">
                      {unit.description || "—"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <select
                      aria-label={`Change status for ${unit.unit_number}`}
                      value={unit.status}
                      disabled={statusBusyId === unit.id}
                      onChange={(event) =>
                        updateStatus(unit.id, event.target.value)
                      }
                      className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
                    >
                      <option value="vacant">Vacant</option>
                      <option value="occupied">Occupied</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                    {statusBusyId === unit.id && (
                      <p className="mt-1 text-xs text-slate-400">Saving...</p>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      onClick={() => openEditModal(unit)}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}

              {paginatedRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <p className="font-semibold text-slate-700">
                      {search.trim() ? "No matching units found" : "No units yet"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {search.trim()
                        ? "Try a different unit number."
                        : "Add your first apartment unit to get started."}
                    </p>
                    {search.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearch("");
                          setCurrentPage(1);
                        }}
                        className="mt-2 text-sm font-semibold text-blue-700 hover:text-blue-900"
                      >
                        Clear search
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Showing{" "}
            <span className="font-semibold text-slate-700">
              {startItem}–{endItem}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-slate-700">
              {filteredRows.length}
            </span>{" "}
            units
          </p>

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() =>
                setCurrentPage((page) => Math.max(1, page - 1))
              }
              disabled={safePage <= 1}
              className="flex h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ‹ Previous
            </button>

            <span className="px-2 text-sm text-slate-600">
              Page {safePage} of {totalPages}
            </span>

            <button
              type="button"
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              disabled={safePage >= totalPages}
              className="flex h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next ›
            </button>
          </div>
        </div>
      </section>

      {/* Add Unit Dialog */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAddModal();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-unit-title"
            className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 sm:px-8">
              <div>
                <h2 id="add-unit-title" className="text-xl font-bold text-slate-900">
                  Add New Unit
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Enter the details of the apartment unit.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAddModal}
                disabled={busy}
                aria-label="Close add unit dialog"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <form onSubmit={add} noValidate>
              <div className="grid gap-5 px-6 py-6 sm:grid-cols-2 sm:px-8">
                {addErrors.general && (
                  <div
                    role="alert"
                    className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700 sm:col-span-2"
                  >
                    <p className="font-semibold">Unable to add unit</p>
                    <p className="mt-1 break-words">{addErrors.general}</p>
                  </div>
                )}

                <label className="block text-sm font-semibold text-slate-700">
                  Unit number <span className="ml-1 text-rose-500">*</span>
                  <input
                    required
                    autoFocus
                    maxLength={50}
                    value={unitNumber}
                    aria-invalid={Boolean(addUnitNumberError)}
                    onChange={(event) => {
                      setUnitNumber(event.target.value);
                      setAddErrors((prev) => ({
                        ...prev,
                        unit_number: undefined,
                        general: undefined,
                      }));
                    }}
                    className={inputClass(Boolean(addUnitNumberError))}
                    placeholder="e.g. A-101"
                  />
                  <FieldError message={addUnitNumberError} />
                </label>

                <label className="block text-sm font-semibold text-slate-700">
                  Monthly rent (PHP) <span className="ml-1 text-rose-500">*</span>
                  <input
                    required
                    min="0"
                    type="number"
                    step="0.01"
                    value={rent}
                    aria-invalid={Boolean(addErrors.monthly_rent)}
                    onChange={(event) => {
                      setRent(event.target.value);
                      setAddErrors((prev) => ({
                        ...prev,
                        monthly_rent: undefined,
                        general: undefined,
                      }));
                    }}
                    className={inputClass(Boolean(addErrors.monthly_rent))}
                    placeholder="5000.00"
                  />
                  <FieldError message={addErrors.monthly_rent} />
                </label>

                <label className="block text-sm font-semibold text-slate-700">
                  Initial status <span className="ml-1 text-rose-500">*</span>
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    className={inputClass(false)}
                  >
                    <option value="vacant">Vacant</option>
                    <option value="occupied">Occupied</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </label>

                <label className="block text-sm font-semibold text-slate-700">
                  Description{" "}
                  <span className="ml-1 font-normal text-slate-400">(Optional)</span>
                  <textarea
                    value={description}
                    maxLength={1000}
                    onChange={(event) => {
                      setDescription(event.target.value);
                      setAddErrors((prev) => ({
                        ...prev,
                        description: undefined,
                        general: undefined,
                      }));
                    }}
                    rows={2}
                    className={inputClass(Boolean(addErrors.description))}
                    placeholder="Optional notes about this unit"
                  />
                  <FieldError message={addErrors.description} />
                  <span className="mt-1 block text-right text-xs font-normal text-slate-400">
                    {description.length}/1000 characters
                  </span>
                </label>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-5 sm:flex-row sm:justify-end sm:px-8">
                <button
                  type="button"
                  onClick={closeAddModal}
                  disabled={busy}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || addDuplicate}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? "Saving..." : "Add unit"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Edit Unit Dialog */}
      {editingUnit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditModal();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-unit-title"
            className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 sm:px-8">
              <div>
                <h2 id="edit-unit-title" className="text-xl font-bold text-slate-900">
                  Edit Unit
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Update the details of unit {editingUnit.unit_number}.
                </p>
              </div>
              <button
                type="button"
                disabled={editBusy}
                onClick={closeEditModal}
                aria-label="Close edit unit dialog"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <form onSubmit={updateUnit} noValidate>
              <div className="grid gap-5 px-6 py-6 sm:grid-cols-2 sm:px-8">
                {editErrors.general && (
                  <div
                    role="alert"
                    className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700 sm:col-span-2"
                  >
                    <p className="font-semibold">Unable to update unit</p>
                    <p className="mt-1 break-words">{editErrors.general}</p>
                  </div>
                )}

                <label className="block text-sm font-semibold text-slate-700">
                  Unit number <span className="ml-1 text-rose-500">*</span>
                  <input
                    required
                    autoFocus
                    maxLength={50}
                    value={editUnitNumber}
                    aria-invalid={Boolean(editUnitNumberError)}
                    onChange={(event) => {
                      setEditUnitNumber(event.target.value);
                      setEditErrors((prev) => ({
                        ...prev,
                        unit_number: undefined,
                        general: undefined,
                      }));
                    }}
                    className={inputClass(Boolean(editUnitNumberError))}
                    placeholder="e.g. A-101"
                  />
                  <FieldError message={editUnitNumberError} />
                </label>

                <label className="block text-sm font-semibold text-slate-700">
                  Monthly rent (PHP) <span className="ml-1 text-rose-500">*</span>
                  <input
                    required
                    min="0"
                    type="number"
                    step="0.01"
                    value={editRent}
                    aria-invalid={Boolean(editErrors.monthly_rent)}
                    onChange={(event) => {
                      setEditRent(event.target.value);
                      setEditErrors((prev) => ({
                        ...prev,
                        monthly_rent: undefined,
                        general: undefined,
                      }));
                    }}
                    className={inputClass(Boolean(editErrors.monthly_rent))}
                    placeholder="5000.00"
                  />
                  <FieldError message={editErrors.monthly_rent} />
                </label>

                <label className="block text-sm font-semibold text-slate-700">
                  Status <span className="ml-1 text-rose-500">*</span>
                  <select
                    value={editStatus}
                    onChange={(event) => setEditStatus(event.target.value)}
                    className={inputClass(false)}
                  >
                    <option value="vacant">Vacant</option>
                    <option value="occupied">Occupied</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </label>

                <label className="block text-sm font-semibold text-slate-700">
                  Description{" "}
                  <span className="ml-1 font-normal text-slate-400">(Optional)</span>
                  <textarea
                    value={editDescription}
                    maxLength={1000}
                    onChange={(event) => {
                      setEditDescription(event.target.value);
                      setEditErrors((prev) => ({
                        ...prev,
                        description: undefined,
                        general: undefined,
                      }));
                    }}
                    rows={2}
                    className={inputClass(Boolean(editErrors.description))}
                    placeholder="Optional notes about this unit"
                  />
                  <FieldError message={editErrors.description} />
                  <span className="mt-1 block text-right text-xs font-normal text-slate-400">
                    {editDescription.length}/1000 characters
                  </span>
                </label>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-5 sm:flex-row sm:justify-end sm:px-8">
                <button
                  type="button"
                  disabled={editBusy}
                  onClick={closeEditModal}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editBusy || editDuplicate}
                  className="rounded-xl bg-blue-700 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {editBusy ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}