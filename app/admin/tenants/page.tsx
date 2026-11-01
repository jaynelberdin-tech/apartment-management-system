"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import StatusBadge from "@/components/StatusBadge";

type Unit = {
  id: number;
  unit_number: string;
  status: string;
};

type Tenant = {
  id: number;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  email: string;
  phone: string | null;
  address?: string | null;
  status: string;
  unit_id: number | null;
  user_id: string | null;
  units?: { unit_number: string } | null;
};

type NameField =
  | "firstName"
  | "middleName"
  | "lastName"
  | "editFirstName"
  | "editMiddleName"
  | "editLastName";

type PhoneField = "phone" | "editPhone";

const ROWS_PER_PAGE = 10;

const DUPLICATE_NAME_MESSAGE = "A tenant with this name already exists.";

const NAME_REGEX =
  /^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[ '-][A-Za-zÀ-ÖØ-öø-ÿ]+)*$/;

function validateName(value: string): string {
  if (!value.trim()) return "This field is required.";

  if (!NAME_REGEX.test(value.trim())) {
    return "Use letters only. Spaces, hyphens, and apostrophes are allowed.";
  }

  return "";
}

// Middle name is optional: empty is fine, but if filled it must be valid.
function validateMiddleName(value: string): string {
  if (!value.trim()) return "";

  if (!NAME_REGEX.test(value.trim())) {
    return "Use letters only. Spaces, hyphens, and apostrophes are allowed.";
  }

  return "";
}

function validatePhone(value: string): string {
  if (!value.trim()) return "";

  if (!/^\d+$/.test(value.trim())) {
    return "Phone number must contain digits only.";
  }

  return "";
}

// Normalize names so "  Juan   Dela Cruz " equals "juan dela cruz"
function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

// Build a display name: "First Middle Last" (middle is skipped if empty)
function fullName(tenant: {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
}): string {
  return [tenant.first_name, tenant.middle_name, tenant.last_name]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

// Check if a tenant with the same first + middle + last name already exists.
// Pass excludeId when editing so a tenant doesn't clash with itself.
function isDuplicateName(
  tenants: Tenant[],
  first: string,
  middle: string,
  last: string,
  excludeId?: number
): boolean {
  const f = normalizeName(first);
  const m = normalizeName(middle);
  const l = normalizeName(last);

  if (!f || !l) return false;

  return tenants.some(
    (tenant) =>
      tenant.id !== excludeId &&
      normalizeName(tenant.first_name ?? "") === f &&
      normalizeName(tenant.middle_name ?? "") === m &&
      normalizeName(tenant.last_name ?? "") === l
  );
}

const inputClass =
  "mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function validationInputClass(hasError: boolean) {
  return `mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal outline-none focus:ring-2 ${
    hasError
      ? "border-rose-500 focus:border-rose-500 focus:ring-rose-100"
      : "border-slate-200 focus:border-blue-500 focus:ring-blue-100"
  }`;
}

function FieldError({ message }: { message: string }) {
  if (!message) return null;

  return (
    <span className="mt-1 block text-xs font-normal text-rose-600" role="alert">
      {message}
    </span>
  );
}

// INLINE ERROR BANNER SHOWN INSIDE A MODAL
function ModalAlert({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700"
    >
      <span>{message}</span>

      <button
        type="button"
        onClick={onDismiss}
        className="font-bold leading-none"
        aria-label="Dismiss error"
      >
        ×
      </button>
    </div>
  );
}

// REUSABLE DETAIL FIELD
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

export default function TenantsPage() {
  const supabase = createClient();

  const [rows, setRows] = useState<Tenant[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);

  // ADD TENANT FORM
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [unitId, setUnitId] = useState("");
  const [password, setPassword] = useState("");

  // EDIT TENANT FORM
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editMiddleName, setEditMiddleName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editUnitId, setEditUnitId] = useState("");
  const [editStatus, setEditStatus] = useState("active");

  // MODALS
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewingTenant, setViewingTenant] = useState<Tenant | null>(null);

  // SEARCH AND PAGINATION
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // NOTIFICATIONS
  // Page-level messages (outside modals)
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Inline messages (inside each modal)
  const [addModalError, setAddModalError] = useState("");
  const [editModalError, setEditModalError] = useState("");

  const [busy, setBusy] = useState(false);

  // VALIDATION
  const [nameErrors, setNameErrors] = useState<Record<NameField, string>>({
    firstName: "",
    middleName: "",
    lastName: "",
    editFirstName: "",
    editMiddleName: "",
    editLastName: "",
  });

  const [phoneErrors, setPhoneErrors] = useState<Record<PhoneField, string>>({
    phone: "",
    editPhone: "",
  });

  // LIVE DUPLICATE NAME CHECKS (derived, always in sync with the inputs)
  const addDuplicateError = useMemo(
    () =>
      isDuplicateName(rows, firstName, middleName, lastName)
        ? DUPLICATE_NAME_MESSAGE
        : "",
    [rows, firstName, middleName, lastName]
  );

  const editDuplicateError = useMemo(
    () =>
      editingTenant &&
      isDuplicateName(
        rows,
        editFirstName,
        editMiddleName,
        editLastName,
        editingTenant.id
      )
        ? DUPLICATE_NAME_MESSAGE
        : "",
    [rows, editFirstName, editMiddleName, editLastName, editingTenant]
  );

  // LOAD TENANTS AND UNITS
  async function load() {
    const [tenantResult, unitResult] = await Promise.all([
      supabase
        .from("tenants")
        .select("*, units(unit_number)")
        .order("created_at", { ascending: false }),

      supabase
        .from("units")
        .select("id,unit_number,status")
        .order("unit_number"),
    ]);

    if (tenantResult.error) {
      setError(tenantResult.error.message);
    } else {
      setRows((tenantResult.data ?? []) as unknown as Tenant[]);
    }

    if (unitResult.error) {
      setError((current) => current || unitResult.error.message);
    } else {
      setUnits((unitResult.data ?? []) as Unit[]);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CLEAR ADD VALIDATION
  function clearAddValidation() {
    setNameErrors((prev) => ({
      ...prev,
      firstName: "",
      middleName: "",
      lastName: "",
    }));

    setPhoneErrors((prev) => ({
      ...prev,
      phone: "",
    }));

    setAddModalError("");
  }

  // CLEAR EDIT VALIDATION
  function clearEditValidation() {
    setNameErrors((prev) => ({
      ...prev,
      editFirstName: "",
      editMiddleName: "",
      editLastName: "",
    }));

    setPhoneErrors((prev) => ({
      ...prev,
      editPhone: "",
    }));

    setEditModalError("");
  }

  // RESET ADD FORM FIELDS
  function resetAddForm() {
    setFirstName("");
    setMiddleName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setAddress("");
    setUnitId("");
    setPassword("");
  }

  // OPEN / CLOSE ADD MODAL
  function openAddModal() {
    setError("");
    setSuccess("");
    resetAddForm();
    clearAddValidation();
    setShowAddModal(true);
  }

  function closeAddModal() {
    setShowAddModal(false);
    clearAddValidation();
  }

  // CLOSE EDIT MODAL
  function closeEditModal() {
    setEditingTenant(null);
    clearEditValidation();
  }

  // HANDLE NAME INPUTS
  function handleNameChange(field: NameField, value: string) {
    if (field === "firstName") setFirstName(value);
    if (field === "middleName") setMiddleName(value);
    if (field === "lastName") setLastName(value);
    if (field === "editFirstName") setEditFirstName(value);
    if (field === "editMiddleName") setEditMiddleName(value);
    if (field === "editLastName") setEditLastName(value);

    const isMiddle = field === "middleName" || field === "editMiddleName";

    setNameErrors((prev) => ({
      ...prev,
      [field]: value.trim()
        ? isMiddle
          ? validateMiddleName(value)
          : validateName(value)
        : "",
    }));

    // Clear any stale server error when the user edits the form
    if (
      field === "firstName" ||
      field === "middleName" ||
      field === "lastName"
    ) {
      setAddModalError("");
    } else {
      setEditModalError("");
    }
  }

  // HANDLE PHONE INPUTS
  function handlePhoneChange(field: PhoneField, value: string) {
    const digitsOnly = value.replace(/\D/g, "");

    if (field === "phone") setPhone(digitsOnly);
    if (field === "editPhone") setEditPhone(digitsOnly);

    setPhoneErrors((prev) => ({
      ...prev,
      [field]: "",
    }));
  }

  // CREATE TENANT
  async function addTenant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddModalError("");
    setError("");
    setSuccess("");

    const firstNameError = validateName(firstName);
    const middleNameError = validateMiddleName(middleName);
    const lastNameError = validateName(lastName);
    const phoneError = validatePhone(phone);

    setNameErrors((prev) => ({
      ...prev,
      firstName: firstNameError,
      middleName: middleNameError,
      lastName: lastNameError,
    }));

    setPhoneErrors((prev) => ({
      ...prev,
      phone: phoneError,
    }));

    if (firstNameError || middleNameError || lastNameError || phoneError) {
      return;
    }

    // DUPLICATE NAME (shown inline under the name fields)
    if (addDuplicateError) return;

    setBusy(true);

    try {
      const response = await fetch("/api/admin/create-tenant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          middleName: middleName.trim() || null,
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          address: address.trim(),
          unitId: unitId || null,
          password,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        // Show the server error inside the modal
        setAddModalError(body.error || "Could not create tenant.");
        return;
      }

      setSuccess("Tenant account and tenant record created.");

      resetAddForm();
      clearAddValidation();

      setShowAddModal(false);
      setCurrentPage(1);
      setSearch("");

      await load();
    } catch {
      setAddModalError(
        "An unexpected error occurred while creating the tenant."
      );
    } finally {
      setBusy(false);
    }
  }

  // OPEN VIEW MODAL
  function openViewModal(tenant: Tenant) {
    setViewingTenant(tenant);
    setError("");
  }

  // OPEN EDIT MODAL
  function openEditModal(tenant: Tenant) {
    setEditingTenant(tenant);

    setEditFirstName(tenant.first_name ?? "");
    setEditMiddleName(tenant.middle_name ?? "");
    setEditLastName(tenant.last_name ?? "");
    setEditEmail(tenant.email ?? "");
    setEditPhone(tenant.phone ?? "");
    setEditAddress(tenant.address ?? "");
    setEditUnitId(
      tenant.unit_id !== null ? String(tenant.unit_id) : ""
    );
    setEditStatus(tenant.status || "active");

    clearEditValidation();
    setError("");
    setSuccess("");
  }

  // EDIT DIRECTLY FROM VIEW MODAL
  function editFromView() {
    if (!viewingTenant) return;

    const tenant = viewingTenant;

    setViewingTenant(null);
    openEditModal(tenant);
  }

  // UPDATE TENANT
  async function updateTenant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!editingTenant) return;

    setEditModalError("");
    setError("");
    setSuccess("");

    const firstNameError = validateName(editFirstName);
    const middleNameError = validateMiddleName(editMiddleName);
    const lastNameError = validateName(editLastName);
    const phoneError = validatePhone(editPhone);

    setNameErrors((prev) => ({
      ...prev,
      editFirstName: firstNameError,
      editMiddleName: middleNameError,
      editLastName: lastNameError,
    }));

    setPhoneErrors((prev) => ({
      ...prev,
      editPhone: phoneError,
    }));

    if (firstNameError || middleNameError || lastNameError || phoneError) {
      return;
    }

    // DUPLICATE NAME (excludes the tenant being edited)
    if (editDuplicateError) return;

    setBusy(true);

    try {
      const { error: updateError } = await supabase
        .from("tenants")
        .update({
          first_name: editFirstName.trim(),
          middle_name: editMiddleName.trim() || null,
          last_name: editLastName.trim(),
          email: editEmail.trim(),
          phone: editPhone.trim() || null,
          address: editAddress.trim() || null,
          unit_id: editUnitId ? Number(editUnitId) : null,
          status: editStatus,
        })
        .eq("id", editingTenant.id);

      if (updateError) {
        // Show the server error inside the modal
        setEditModalError(updateError.message);
        return;
      }

      setSuccess("Tenant information updated successfully.");
      closeEditModal();

      await load();
    } catch {
      setEditModalError(
        "An unexpected error occurred while updating the tenant."
      );
    } finally {
      setBusy(false);
    }
  }

  // SEARCH TENANTS
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return rows;

    return rows.filter((tenant) => {
      const name = fullName(tenant).toLowerCase();

      return (
        name.includes(query) ||
        tenant.email.toLowerCase().includes(query) ||
        (tenant.phone ?? "").toLowerCase().includes(query) ||
        (tenant.units?.unit_number ?? "").toLowerCase().includes(query) ||
        tenant.status.toLowerCase().includes(query)
      );
    });
  }, [rows, search]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRows.length / ROWS_PER_PAGE)
  );

  const paginatedRows = filteredRows.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // KEEP CURRENTLY ASSIGNED UNIT AVAILABLE WHILE EDITING
  const availableEditUnits = units.filter(
    (unit) =>
      unit.status === "vacant" || unit.id === editingTenant?.unit_id
  );

  const statusOptions = Array.from(
    new Set([editStatus, "active", "inactive"])
  ).filter(Boolean);

  // GET UNIT DETAILS FOR VIEW MODAL
  const viewingUnit = viewingTenant?.unit_id
    ? units.find((unit) => unit.id === viewingTenant.unit_id)
    : null;

  // GET INITIALS
  const tenantInitials = viewingTenant
    ? `${viewingTenant.first_name?.charAt(0) ?? ""}${viewingTenant.last_name?.charAt(0) ?? ""}`.toUpperCase()
    : "";

  return (
    <div className="mx-auto max-w-7xl space-y-6">

      {/* PAGE HEADER */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-700">
            ADMIN / TENANTS
          </p>

          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            Tenant information
          </h1>

          <p className="mt-2 text-slate-500">
            Manage tenant records, contact information, and unit assignments.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-800"
        >
          + Add Tenant
        </button>
      </header>

      {/* PAGE ERROR */}
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          <span>{error}</span>

          <button
            type="button"
            onClick={() => setError("")}
            className="font-bold"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* SUCCESS MESSAGE */}
      {success && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
        >
          <span>{success}</span>

          <button
            type="button"
            onClick={() => setSuccess("")}
            className="font-bold"
            aria-label="Dismiss success message"
          >
            ×
          </button>
        </div>
      )}

      {/* SEARCH */}
      <div className="max-w-md">
        <label htmlFor="tenant-search" className="sr-only">
          Search tenants
        </label>

        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
          </span>

          <input
            id="tenant-search"
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search name, email, phone, unit, or status..."
            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      {/* TENANT TABLE */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-2 border-b border-slate-100 p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-bold text-slate-900">Tenant list</h2>

            <p className="mt-1 text-sm text-slate-500">
              {filteredRows.length} tenant
              {filteredRows.length === 1 ? "" : "s"} found
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4 font-semibold">Tenant</th>
                <th className="px-5 py-4 font-semibold">Email</th>
                <th className="px-5 py-4 font-semibold">Phone</th>
                <th className="px-5 py-4 font-semibold">Unit</th>
                <th className="px-5 py-4 font-semibold">Status</th>
                <th className="px-5 py-4 text-right font-semibold">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {paginatedRows.map((tenant) => (
                <tr
                  key={tenant.id}
                  className="transition hover:bg-slate-50/80"
                >
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-900">
                      {fullName(tenant)}
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      Tenant ID: {tenant.id}
                    </p>
                  </td>

                  <td className="px-5 py-4 text-slate-600">
                    {tenant.email}
                  </td>

                  <td className="px-5 py-4 text-slate-600">
                    {tenant.phone || "—"}
                  </td>

                  <td className="px-5 py-4">
                    {tenant.units?.unit_number ? (
                      <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                        {tenant.units.unit_number}
                      </span>
                    ) : (
                      <span className="text-slate-400">Unassigned</span>
                    )}
                  </td>

                  <td className="px-5 py-4">
                    <StatusBadge status={tenant.status} />
                  </td>

                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">

                      <button
                        type="button"
                        onClick={() => openViewModal(tenant)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                        aria-label={`View ${fullName(tenant)}`}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="h-4 w-4"
                          aria-hidden="true"
                        >
                          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        View
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditModal(tenant)}
                        className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-50"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="h-4 w-4"
                          aria-hidden="true"
                        >
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
                        </svg>
                        Edit
                      </button>

                    </div>
                  </td>
                </tr>
              ))}

              {paginatedRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <p className="font-semibold text-slate-700">
                      No tenants found
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      {search
                        ? "Try a different search term."
                        : "Add a tenant to get started."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {filteredRows.length === 0
              ? "Showing 0 tenants"
              : `Showing ${(currentPage - 1) * ROWS_PER_PAGE + 1}–${Math.min(
                  currentPage * ROWS_PER_PAGE,
                  filteredRows.length
                )} of ${filteredRows.length} tenants`}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() =>
                setCurrentPage((page) => Math.max(1, page - 1))
              }
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>

            <span className="px-2 text-sm text-slate-600">
              Page {currentPage} of {totalPages}
            </span>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {/* ================================================== */}
      {/* VIEW TENANT DETAILS MODAL */}
      {/* ================================================== */}

      {viewingTenant && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setViewingTenant(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="view-tenant-title"
            className="my-auto flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >

            {/* MODAL HEADER */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2
                  id="view-tenant-title"
                  className="text-xl font-bold text-slate-900"
                >
                  Tenant Details
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  View complete tenant information
                </p>
              </div>

              <button
                type="button"
                onClick={() => setViewingTenant(null)}
                className="rounded-lg p-2 text-2xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close tenant details"
              >
                ×
              </button>
            </div>

            {/* MODAL BODY */}
            <div className="overflow-y-auto p-6">

              {/* TENANT PROFILE */}
              <div className="flex flex-col gap-4 rounded-xl border border-slate-100 bg-slate-50 p-5 sm:flex-row sm:items-center">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-xl font-bold text-blue-700">
                  {tenantInitials || "T"}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-bold text-slate-900">
                    {fullName(viewingTenant)}
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Tenant ID: #{viewingTenant.id}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge status={viewingTenant.status} />

                    {viewingTenant.units?.unit_number && (
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                        {viewingTenant.units.unit_number}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* PERSONAL INFORMATION */}
              <section className="mt-7">
                <div className="mb-4 flex items-center gap-2">
                  <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-5 w-5"
                    >
                      <circle cx="12" cy="8" r="4" />
                      <path d="M5 21a7 7 0 0 1 14 0" />
                    </svg>
                  </div>

                  <h3 className="font-bold text-slate-900">
                    Personal Information
                  </h3>
                </div>

                <div className="grid grid-cols-1 gap-x-8 gap-y-5 rounded-xl border border-slate-100 p-5 sm:grid-cols-2">
                  <DetailField
                    label="First Name"
                    value={viewingTenant.first_name}
                  />

                  <DetailField
                    label="Middle Name"
                    value={viewingTenant.middle_name}
                  />

                  <DetailField
                    label="Last Name"
                    value={viewingTenant.last_name}
                  />

                  <DetailField
                    label="Email Address"
                    value={viewingTenant.email}
                  />

                  <DetailField
                    label="Phone Number"
                    value={viewingTenant.phone}
                  />

                  <div className="sm:col-span-2">
                    <DetailField
                      label="Residential Address"
                      value={viewingTenant.address}
                    />
                  </div>
                </div>
              </section>

              {/* UNIT INFORMATION */}
              <section className="mt-7">
                <div className="mb-4 flex items-center gap-2">
                  <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-5 w-5"
                    >
                      <path d="M3 21h18" />
                      <path d="M5 21V7l8-4v18" />
                      <path d="M19 21V11l-6-4" />
                      <path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
                    </svg>
                  </div>

                  <h3 className="font-bold text-slate-900">
                    Unit Assignment
                  </h3>
                </div>

                <div className="rounded-xl border border-slate-100 p-5">
                  {viewingTenant.unit_id ? (
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <DetailField
                        label="Assigned Unit"
                        value={
                          viewingTenant.units?.unit_number || "Unit assigned"
                        }
                      />

                      <div>
                        <p className="text-xs font-medium text-slate-400">
                          Unit Status
                        </p>

                        <div className="mt-2">
                          {viewingUnit ? (
                            <StatusBadge status={viewingUnit.status} />
                          ) : (
                            <span className="text-sm text-slate-500">
                              Not available
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-slate-50 px-4 py-5 text-center">
                      <p className="text-sm font-medium text-slate-600">
                        No unit assigned
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        This tenant does not currently have an assigned unit.
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {/* ACCOUNT INFORMATION */}
              <section className="mt-7">
                <div className="mb-4 flex items-center gap-2">
                  <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-5 w-5"
                    >
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="M7 10h.01M11 10h6M7 14h10" />
                    </svg>
                  </div>

                  <h3 className="font-bold text-slate-900">
                    Account Information
                  </h3>
                </div>

                <div className="grid grid-cols-1 gap-5 rounded-xl border border-slate-100 p-5 sm:grid-cols-2">
                  <DetailField
                    label="Tenant Account"
                    value={viewingTenant.user_id ? "Linked account" : "No linked account"}
                  />

                  <DetailField
                    label="Account ID"
                    value={viewingTenant.user_id}
                  />

                  <div>
                    <p className="text-xs font-medium text-slate-400">
                      Tenant Status
                    </p>

                    <div className="mt-2">
                      <StatusBadge status={viewingTenant.status} />
                    </div>
                  </div>
                </div>
              </section>

            </div>

            {/* MODAL FOOTER */}
            <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-100 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-400">
                Tenant record #{viewingTenant.id}
              </p>

              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setViewingTenant(null)}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Close
                </button>

                <button
                  type="button"
                  onClick={editFromView}
                  className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800"
                >
                  Edit Tenant
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* ADD TENANT MODAL */}
      {/* ================================================== */}

      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) {
              closeAddModal();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-tenant-title"
            className="my-8 w-full max-w-3xl rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-100 p-6">
              <div>
                <h2
                  id="add-tenant-title"
                  className="text-xl font-bold text-slate-900"
                >
                  Add tenant
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Create a tenant record and login account.
                </p>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={closeAddModal}
                className="rounded-lg p-2 text-2xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                aria-label="Close add tenant form"
              >
                ×
              </button>
            </div>

            <form onSubmit={addTenant} className="space-y-5 p-6">

              {/* INLINE MODAL ERROR */}
              <ModalAlert
                message={addModalError}
                onDismiss={() => setAddModalError("")}
              />

              <div className="grid gap-4 sm:grid-cols-2">

                {/* NAME ROW: FIRST / MIDDLE / LAST */}
                <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">

                  {/* FIRST NAME */}
                  <label className="text-sm font-semibold text-slate-700">
                    First name

                    <input
                      required
                      value={firstName}
                      onChange={(e) =>
                        handleNameChange("firstName", e.target.value)
                      }
                      onBlur={() =>
                        setNameErrors((prev) => ({
                          ...prev,
                          firstName: validateName(firstName),
                        }))
                      }
                      aria-invalid={!!nameErrors.firstName || !!addDuplicateError}
                      className={validationInputClass(
                        !!nameErrors.firstName || !!addDuplicateError
                      )}
                      placeholder="Enter first name"
                    />

                    <FieldError message={nameErrors.firstName} />
                  </label>

                  {/* MIDDLE NAME */}
                  <label className="text-sm font-semibold text-slate-700">
                    Middle name{" "}
                    <span className="font-normal text-slate-400">
                      (Optional)
                    </span>

                    <input
                      value={middleName}
                      onChange={(e) =>
                        handleNameChange("middleName", e.target.value)
                      }
                      onBlur={() =>
                        setNameErrors((prev) => ({
                          ...prev,
                          middleName: validateMiddleName(middleName),
                        }))
                      }
                      aria-invalid={
                        !!nameErrors.middleName || !!addDuplicateError
                      }
                      className={validationInputClass(
                        !!nameErrors.middleName || !!addDuplicateError
                      )}
                      placeholder="Enter middle name"
                    />

                    <FieldError message={nameErrors.middleName} />
                  </label>

                  {/* LAST NAME */}
                  <label className="text-sm font-semibold text-slate-700">
                    Last name

                    <input
                      required
                      value={lastName}
                      onChange={(e) =>
                        handleNameChange("lastName", e.target.value)
                      }
                      onBlur={() =>
                        setNameErrors((prev) => ({
                          ...prev,
                          lastName: validateName(lastName),
                        }))
                      }
                      aria-invalid={!!nameErrors.lastName || !!addDuplicateError}
                      className={validationInputClass(
                        !!nameErrors.lastName || !!addDuplicateError
                      )}
                      placeholder="Enter last name"
                    />

                    <FieldError message={nameErrors.lastName} />
                  </label>

                  {/* DUPLICATE NAME MESSAGE (full width under the name row) */}
                  {addDuplicateError && (
                    <div className="sm:col-span-3">
                      <FieldError message={addDuplicateError} />
                    </div>
                  )}
                </div>

                {/* EMAIL */}
                <label className="text-sm font-semibold text-slate-700">
                  Email / login

                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setAddModalError("");
                    }}
                    className={inputClass}
                    placeholder="tenant@example.com"
                  />
                </label>

                {/* PASSWORD */}
                <label className="text-sm font-semibold text-slate-700">
                  Temporary password

                  <input
                    required
                    minLength={8}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className={inputClass}
                  />
                </label>

                {/* PHONE */}
                <label className="text-sm font-semibold text-slate-700">
                  Phone

                  <input
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) =>
                      handlePhoneChange("phone", e.target.value)
                    }
                    placeholder="Digits only"
                    aria-invalid={!!phoneErrors.phone}
                    className={validationInputClass(
                      !!phoneErrors.phone
                    )}
                  />

                  <FieldError message={phoneErrors.phone} />
                </label>

                {/* UNIT ASSIGNMENT */}
                <label className="text-sm font-semibold text-slate-700">
                  Assign unit

                  <select
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">No unit assigned</option>

                    {units
                      .filter((unit) => unit.status === "vacant")
                      .map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.unit_number}
                        </option>
                      ))}
                  </select>
                </label>

                {/* ADDRESS */}
                <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                  Address

                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className={inputClass}
                    placeholder="Enter address"
                  />
                </label>

              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={busy}
                  onClick={closeAddModal}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={busy || !!addDuplicateError}
                  className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? "Creating..." : "Create tenant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* EDIT TENANT MODAL */}
      {/* ================================================== */}

      {editingTenant && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) {
              closeEditModal();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-tenant-title"
            className="my-8 w-full max-w-3xl rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-100 p-6">
              <div>
                <h2
                  id="edit-tenant-title"
                  className="text-xl font-bold text-slate-900"
                >
                  Edit tenant
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Update the tenant&apos;s information below.
                </p>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={closeEditModal}
                className="rounded-lg p-2 text-2xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                aria-label="Close edit tenant form"
              >
                ×
              </button>
            </div>

            <form onSubmit={updateTenant} className="space-y-5 p-6">

              {/* INLINE MODAL ERROR */}
              <ModalAlert
                message={editModalError}
                onDismiss={() => setEditModalError("")}
              />

              <div className="grid gap-4 sm:grid-cols-2">

                {/* NAME ROW: FIRST / MIDDLE / LAST */}
                <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">

                  {/* FIRST NAME */}
                  <label className="text-sm font-semibold text-slate-700">
                    First name

                    <input
                      required
                      value={editFirstName}
                      onChange={(e) =>
                        handleNameChange("editFirstName", e.target.value)
                      }
                      onBlur={() =>
                        setNameErrors((prev) => ({
                          ...prev,
                          editFirstName: validateName(editFirstName),
                        }))
                      }
                      aria-invalid={
                        !!nameErrors.editFirstName || !!editDuplicateError
                      }
                      className={validationInputClass(
                        !!nameErrors.editFirstName || !!editDuplicateError
                      )}
                      placeholder="Enter first name"
                    />

                    <FieldError message={nameErrors.editFirstName} />
                  </label>

                  {/* MIDDLE NAME */}
                  <label className="text-sm font-semibold text-slate-700">
                    Middle name{" "}
                    <span className="font-normal text-slate-400">
                      (Optional)
                    </span>

                    <input
                      value={editMiddleName}
                      onChange={(e) =>
                        handleNameChange("editMiddleName", e.target.value)
                      }
                      onBlur={() =>
                        setNameErrors((prev) => ({
                          ...prev,
                          editMiddleName: validateMiddleName(editMiddleName),
                        }))
                      }
                      aria-invalid={
                        !!nameErrors.editMiddleName || !!editDuplicateError
                      }
                      className={validationInputClass(
                        !!nameErrors.editMiddleName || !!editDuplicateError
                      )}
                      placeholder="Enter middle name"
                    />

                    <FieldError message={nameErrors.editMiddleName} />
                  </label>

                  {/* LAST NAME */}
                  <label className="text-sm font-semibold text-slate-700">
                    Last name

                    <input
                      required
                      value={editLastName}
                      onChange={(e) =>
                        handleNameChange("editLastName", e.target.value)
                      }
                      onBlur={() =>
                        setNameErrors((prev) => ({
                          ...prev,
                          editLastName: validateName(editLastName),
                        }))
                      }
                      aria-invalid={
                        !!nameErrors.editLastName || !!editDuplicateError
                      }
                      className={validationInputClass(
                        !!nameErrors.editLastName || !!editDuplicateError
                      )}
                      placeholder="Enter last name"
                    />

                    <FieldError message={nameErrors.editLastName} />
                  </label>

                  {/* DUPLICATE NAME MESSAGE (full width under the name row) */}
                  {editDuplicateError && (
                    <div className="sm:col-span-3">
                      <FieldError message={editDuplicateError} />
                    </div>
                  )}
                </div>

                {/* EMAIL */}
                <label className="text-sm font-semibold text-slate-700">
                  Email

                  <input
                    required
                    type="email"
                    value={editEmail}
                    onChange={(e) => {
                      setEditEmail(e.target.value);
                      setEditModalError("");
                    }}
                    className={inputClass}
                    placeholder="tenant@example.com"
                  />

                  <span className="mt-1 block text-xs font-normal text-slate-400">
                    Updates the tenant record, not the Supabase Auth login
                    email.
                  </span>
                </label>

                {/* PHONE */}
                <label className="text-sm font-semibold text-slate-700">
                  Phone

                  <input
                    type="tel"
                    inputMode="numeric"
                    value={editPhone}
                    onChange={(e) =>
                      handlePhoneChange("editPhone", e.target.value)
                    }
                    placeholder="Digits only"
                    aria-invalid={!!phoneErrors.editPhone}
                    className={validationInputClass(
                      !!phoneErrors.editPhone
                    )}
                  />

                  <FieldError message={phoneErrors.editPhone} />
                </label>

                {/* UNIT ASSIGNMENT */}
                <label className="text-sm font-semibold text-slate-700">
                  Assign unit

                  <select
                    value={editUnitId}
                    onChange={(e) => setEditUnitId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">No unit assigned</option>

                    {availableEditUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.unit_number}
                      </option>
                    ))}
                  </select>
                </label>

                {/* STATUS */}
                <label className="text-sm font-semibold text-slate-700">
                  Status

                  <select
                    required
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>

                {/* ADDRESS */}
                <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                  Address

                  <input
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    className={inputClass}
                    placeholder="Enter address"
                  />
                </label>

              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={busy}
                  onClick={closeEditModal}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={busy || !!editDuplicateError}
                  className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}