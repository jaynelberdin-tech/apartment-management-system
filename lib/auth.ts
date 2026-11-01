import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "admin" | "tenant";

export async function getUserAndProfile() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase, user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", user.id)
    .maybeSingle();

  return { supabase, user, profile };
}

export async function requireRole(role?: AppRole) {
  const result = await getUserAndProfile();
  if (!result.user || !result.profile) redirect("/login");
  if (role && result.profile.role !== role) {
    redirect(result.profile.role === "admin" ? "/admin" : "/tenant");
  }
  return { ...result, profile: result.profile };
}
