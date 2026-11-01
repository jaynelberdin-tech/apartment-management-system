import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const sessionClient = await createClient();
  const { data: { user }, error: authError } = await sessionClient.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (action !== "Login" && action !== "Logout") {
    return NextResponse.json({ error: "Unsupported activity event." }, { status: 400 });
  }

  const { data: profile } = await sessionClient
    .from("profiles")
    .select("full_name, email, role")
    .eq("id", user.id)
    .maybeSingle();

  const admin = createAdminClient();
  const { error } = await admin.from("activity_logs").insert({
    user_id: user.id,
    actor_name: profile?.full_name || profile?.email || user.email || "Unknown user",
    actor_role: profile?.role || null,
    module: "Authentication",
    action,
    description: `${action} · ${profile?.email || user.email || "Account"}`,
    entity_type: "auth.users",
    entity_id: user.id,
    old_values: null,
    new_values: { event: action.toLowerCase() },
  });

  if (error) return NextResponse.json({ error: "The activity event could not be recorded." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
