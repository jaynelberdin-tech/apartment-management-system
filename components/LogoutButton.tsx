"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    const supabase = createClient();
    // Record logout while the current authenticated session is still available.
    await fetch("/api/activity-logs/auth-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "Logout" }),
    }).catch(() => undefined);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  return <button onClick={logout} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">Log out</button>;
}
