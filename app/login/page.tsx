"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, LockKeyhole } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
      setBusy(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    // Best-effort audit event after authentication succeeds.
    await fetch("/api/activity-logs/auth-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "Login" }),
    }).catch(() => undefined);
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user?.id ?? "").maybeSingle();
    router.replace(profile?.role === "admin" ? "/admin" : "/tenant");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3"><span className="rounded-xl bg-blue-700 p-3 text-white"><Building2 /></span><div><h1 className="text-xl font-bold">Apartment Manager</h1><p className="text-sm text-slate-500">Sign in to your account</p></div></div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-semibold">Email address<input required type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal outline-none focus:border-blue-600" placeholder="you@example.com" /></label>
          <label className="block text-sm font-semibold">Password<input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal outline-none focus:border-blue-600" placeholder="Enter password" /></label>
          {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 font-bold text-white hover:bg-blue-800 disabled:opacity-60"><LockKeyhole size={17} />{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="mt-5 text-xs leading-5 text-slate-500">Accounts are created by the apartment administrator. If you cannot sign in, contact your administrator.</p>
      </div>
    </main>
  );
}
