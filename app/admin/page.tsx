import Link from "next/link";
import { Building2, CreditCard, Users, Wrench, ArrowRight } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { money } from "@/lib/format";

export default async function AdminDashboard() {
  const { supabase, profile } = await requireRole("admin");
  const [units, tenants, bills, requests, payments] = await Promise.all([
    supabase.from("units").select("id,status"),
    supabase.from("tenants").select("id,status"),
    supabase.from("bills").select("id,status,amount"),
    supabase.from("maintenance_requests").select("id,status"),
    supabase.from("payments").select("amount"),
  ]);
  const unitRows = units.data ?? [];
  const tenantRows = tenants.data ?? [];
  const billRows = bills.data ?? [];
  const requestRows = requests.data ?? [];
  const totalPaid = (payments.data ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const cards = [
    { label: "Total units", value: unitRows.length, note: `${unitRows.filter(u => u.status === "vacant").length} vacant`, icon: Building2 },
    { label: "Active tenants", value: tenantRows.filter(t => t.status === "active").length, note: "Registered tenant records", icon: Users },
    { label: "Unpaid bills", value: billRows.filter(b => b.status === "unpaid" || b.status === "partially_paid").length, note: "Bills requiring follow-up", icon: CreditCard },
    { label: "Open maintenance", value: requestRows.filter(r => r.status === "pending" || r.status === "in_progress").length, note: "Pending or in progress", icon: Wrench },
  ];
  return <div className="mx-auto max-w-7xl space-y-7">
    <div><p className="text-sm font-semibold text-blue-700">ADMIN OVERVIEW</p><h1 className="mt-1 text-3xl font-bold">Good day, {profile.full_name || "Admin"}</h1><p className="mt-2 text-slate-500">Here is a summary of your apartment operations.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({label,value,note,icon:Icon})=><div key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-500">{label}</span><span className="rounded-xl bg-blue-50 p-2 text-blue-700"><Icon size={20}/></span></div><p className="mt-4 text-3xl font-bold">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></div>)}</div>
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold">Quick actions</h2><div className="mt-4 space-y-2">{[
        ["/admin/units","Manage apartment units","Add and update units"],
        ["/admin/tenants","Manage tenants","Register tenants and create accounts"],
        ["/admin/billing","Billing and payments","Generate monthly rent bills"],
        ["/admin/maintenance","Maintenance monitoring","Review requests and update status"],
      ].map(([href,title,desc])=><Link key={href} href={href} className="flex items-center justify-between rounded-xl border border-slate-100 p-4 hover:bg-slate-50"><span><b className="block text-sm">{title}</b><span className="text-xs text-slate-500">{desc}</span></span><ArrowRight size={18}/></Link>)}</div></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold">Payment summary</h2><p className="mt-5 text-sm text-slate-500">Total payments recorded</p><p className="mt-1 text-3xl font-bold text-emerald-700">{money(totalPaid)}</p>
      <p className="mt-3 text-sm text-slate-500">This is the sum of recorded payments, not necessarily the total amount billed.
        </p>
        </section>
    </div>
  </div>;
}
