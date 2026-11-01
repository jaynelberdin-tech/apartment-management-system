
"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  UserRound,
  Mail,
  ShieldCheck,
  Save,
  LoaderCircle,
} from "lucide-react";

export default function AdminProfilePage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [userId, setUserId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    async function loadProfile() {
      try {
        const { data: authData, error: authError } =
          await supabase.auth.getUser();

        if (authError || !authData.user) {
          throw new Error("Please sign in again to access your profile.");
        }

        const user = authData.user;
        setUserId(user.id);

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("full_name, email, role")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        if (!profile || profile.role !== "admin") {
          throw new Error(
            "This page is only available to administrator accounts."
          );
        }

        setFullName(profile.full_name || "");
        setEmail(profile.email || user.email || "");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load your profile."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadProfile();
  }, [supabase]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!userId) {
      setError("Your account could not be verified.");
      return;
    }

    if (!fullName.trim() || !email.trim()) {
      setError("Full name and email address are required.");
      return;
    }

    setSaving(true);

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError || !authData.user || authData.user.id !== userId) {
        throw new Error("Your session could not be verified.");
      }

      const { data: profile, error: profileCheckError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      if (profileCheckError) throw profileCheckError;

      if (profile?.role !== "admin") {
        throw new Error("Administrator access could not be verified.");
      }

      // Update the authenticated email only when it has changed.
      if (email.trim() !== (authData.user.email || "")) {
        const { error: authUpdateError } =
          await supabase.auth.updateUser({
            email: email.trim(),
          });

        if (authUpdateError) throw authUpdateError;
      }

      // Update the profile information.
      const { error: profileUpdateError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          email: email.trim(),
        })
        .eq("id", userId);

      if (profileUpdateError) throw profileUpdateError;

      setMessage(
        "Profile updated successfully. Email confirmation may be required if you changed your email."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update your profile."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-slate-500">
        <LoaderCircle className="mr-2 animate-spin" size={20} />
        Loading profile...
      </div>
    );
  }

  if (!userId) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        {error || "Unable to load your profile."}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* PAGE HEADER */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your administrator account information.
        </p>
      </div>

      {/* FEEDBACK */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {message && (
        <div
          role="status"
          className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700"
        >
          {message}
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="grid gap-6 lg:grid-cols-[250px_1fr]"
      >
        {/* PROFILE SUMMARY */}
        <section className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-blue-100 text-blue-700">
            <UserRound size={54} strokeWidth={1.5} />
          </div>

          <h2 className="mt-4 break-words font-semibold text-slate-900">
            {fullName || "Administrator"}
          </h2>

          <p className="mt-1 text-sm text-slate-500">Administrator</p>

          <div className="mt-5 flex items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
            <ShieldCheck size={16} />
            Administrator account
          </div>
        </section>

        {/* ACCOUNT INFORMATION */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <UserRound size={19} className="text-blue-700" />
            <h2 className="font-semibold text-slate-900">
              Account Information
            </h2>
          </div>

          <div className="mt-5 space-y-5">
            {/* FULL NAME */}
            <div>
              <label
                htmlFor="admin-name"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Full Name
              </label>

              <input
                id="admin-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                maxLength={120}
                autoComplete="name"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Enter your full name"
              />
            </div>

            {/* EMAIL */}
            <div>
              <label
                htmlFor="admin-email"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Email Address
              </label>

              <div className="relative">
                <Mail
                  size={17}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={254}
                  autoComplete="email"
                  className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Enter your email address"
                />
              </div>

              <p className="mt-1 text-xs text-slate-500">
                Changing your email may require confirmation.
              </p>
            </div>

            {/* ROLE */}
            <div>
              <label
                htmlFor="admin-role"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Account Role
              </label>

              <input
                id="admin-role"
                type="text"
                value="Administrator"
                readOnly
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500"
              />
            </div>
          </div>

          {/* SAVE BUTTON */}
          <div className="mt-7 flex justify-end border-t border-slate-100 pt-5">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {saving ? (
                <LoaderCircle size={18} className="animate-spin" />
              ) : (
                <Save size={18} />
              )}

              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
