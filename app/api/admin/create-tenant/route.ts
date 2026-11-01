import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const sessionClient = await createClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const { data: profile } = await sessionClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const firstName = String(body?.firstName ?? "").trim();
  const lastName = String(body?.lastName ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const phone = String(body?.phone ?? "").trim() || null;
  const address = String(body?.address ?? "").trim() || null;
  const unitId = body?.unitId ? Number(body.unitId) : null;

  if (!firstName || !lastName || !email || password.length < 8) {
    return NextResponse.json({ error: "First name, last name, email, and a password of at least 8 characters are required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `${firstName} ${lastName}` },
  });
  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message ?? "Could not create Auth user." }, { status: 400 });
  }

  // Use the signed-in admin session for tenant/unit writes so database audit triggers
  // can correctly attribute these changes to the administrator.
  const { error: tenantError } = await sessionClient.from("tenants").insert({
    user_id: authData.user.id,
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    address,
    unit_id: unitId,
    move_in_date: new Date().toISOString().slice(0, 10),
    status: "active",
  });

  if (tenantError) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: tenantError.message }, { status: 400 });
  }

  if (unitId) {
    const { error: unitError } = await sessionClient.from("units").update({ status: "occupied" }).eq("id", unitId);
    if (unitError) {
      // Keep the tenant/account creation successful, but surface a clear server log.
      console.error("Tenant was created but the unit status could not be updated:", unitError.message);
    }
  }

  return NextResponse.json({ ok: true, userId: authData.user.id }, { status: 201 });
}
