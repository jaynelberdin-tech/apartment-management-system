import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { money } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import { ArrowRight, CreditCard, Wrench } from "lucide-react";

export default async function TenantDashboard(){
 const {supabase,profile,user}=await requireRole("tenant");
 const {data:tenant}=await supabase.from("tenants").select("id,first_name,last_name,unit_id,units(unit_number,monthly_rent,status)").eq("user_id",user.id).maybeSingle();
 const [bills,requests]=tenant?await Promise.all([
   supabase.from("bills").select("id,bill_no,billing_month,due_date,amount,status").eq("tenant_id",tenant.id).order("billing_month",{ascending:false}).limit(5),
   supabase.from("maintenance_requests").select("id,request_no,title,status,request_date").eq("tenant_id",tenant.id).order("request_date",{ascending:false}).limit(5)
 ]):[{data:[]},{data:[]}];
 const billRows=bills.data??[];
 const unpaid=billRows.filter(b=>b.status==="unpaid"||b.status==="partially_paid");
 const unit=(tenant as any)?.units;
 return <div className="mx-auto max-w-7xl space-y-7"><header><p className="text-sm font-semibold text-blue-700">TENANT PORTAL</p><h1 className="mt-1 text-3xl font-bold">Welcome, {profile.full_name||tenant?.first_name||"Tenant"}</h1><p className="mt-2 text-slate-500">View your rental information, bills, and maintenance requests.</p></header>
 <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Assigned unit</p><p className="mt-2 text-2xl font-bold">{unit?.unit_number||"Not assigned"}</p><p className="mt-1 text-sm text-slate-500">Monthly rent: {money(unit?.monthly_rent)}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Outstanding bills</p><p className="mt-2 text-2xl font-bold">{unpaid.length}</p><p className="mt-1 text-sm text-slate-500">Bills awaiting full payment</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Maintenance requests</p><p className="mt-2 text-2xl font-bold">{requests.data?.length??0}</p><p className="mt-1 text-sm text-slate-500">Recent requests shown</p></div></div>
 <div className="grid gap-5 xl:grid-cols-2"><section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Recent bills</h2><Link href="/tenant/billing" className="flex items-center gap-1 text-sm font-semibold text-blue-700">View all <ArrowRight size={15}/></Link></div><div className="mt-4 space-y-3">{billRows.map(b=><div key={b.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div><p className="text-sm font-bold">{b.bill_no}</p><p className="text-xs text-slate-500">{b.billing_month.slice(0,7)} · Due {b.due_date}</p></div><div className="text-right"><p className="text-sm font-bold">{money(b.amount)}</p><StatusBadge status={b.status}/></div></div>)}{billRows.length===0&&<p className="py-6 text-center text-sm text-slate-500">No bills have been issued yet.</p>}</div></section>
 <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Maintenance requests</h2><Link href="/tenant/maintenance" className="flex items-center gap-1 text-sm font-semibold text-blue-700">View all <ArrowRight size={15}/></Link></div><div className="mt-4 space-y-3">{(requests.data??[]).map(r=><div key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div><p className="text-sm font-bold">{r.title}</p><p className="text-xs text-slate-500">{r.request_no}</p></div><StatusBadge status={r.status}/></div>)}{(requests.data??[]).length===0&&<p className="py-6 text-center text-sm text-slate-500">No maintenance requests yet.</p>}</div></section></div>
 <div className="flex flex-wrap gap-3"><Link href="/tenant/billing" className="flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white"><CreditCard size={17}/> View bills</Link><Link href="/tenant/maintenance" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold"><Wrench size={17}/> Submit maintenance request</Link></div>
 </div>;
}
