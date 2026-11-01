"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CreditCard,
  FileText,
  LayoutDashboard,
  ReceiptText,
  Users,
  Wrench,
  UserRound,
  LogOut,
  History,
} from "lucide-react";
import LogoutButton from "@/components/LogoutButton";

const adminLinks = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/units", label: "Apartment units", icon: Building2 },
  { href: "/admin/tenants", label: "Tenants", icon: Users },
  { href: "/admin/billing", label: "Billing", icon: ReceiptText },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/reports", label: "Reports", icon: FileText },
  { href: "/admin/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/admin/activity-logs", label: "Activity Logs", icon: History },
  { href: "/admin/profile", label: "Profile", icon: UserRound },
];

const tenantLinks = [
  { href: "/tenant", label: "My dashboard", icon: LayoutDashboard },
  { href: "/tenant/billing", label: "My bills", icon: CreditCard },
  {
    href: "/tenant/maintenance",
    label: "Maintenance requests",
    icon: Wrench,
  },
  { href: "/tenant/profile", label: "Profile", icon: UserRound },
];

type AppShellProps = {
  children: React.ReactNode;
  role: "admin" | "tenant";
  name: string;
};

export default function AppShell({
  children,
  role,
  name,
}: AppShellProps) {
  const pathname = usePathname();
  const links = role === "admin" ? adminLinks : tenantLinks;

  function isActive(href: string) {
    if (href === "/admin" || href === "/tenant") {
      return pathname === href;
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      {/* print:hidden keeps the sidebar out of printed pages */}
      <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white p-4 md:sticky md:top-0 md:h-screen md:w-64 md:border-b-0 md:border-r md:p-5 print:hidden">
        <div className="min-w-0 flex-1">
          {/* BRAND */}
          <Link
            href={role === "admin" ? "/admin" : "/tenant"}
            className="flex items-center gap-3"
          >
            <span className="rounded-xl bg-blue-700 p-2.5 text-white">
              <Building2 size={22} />
            </span>

            <span>
              <strong className="block text-sm text-slate-900">
                ECM Apartment
              </strong>
              <span className="text-xs text-slate-500">
                Management portal
              </span>
            </span>
          </Link>

          {/* ACCOUNT */}
          <div className="mt-6 rounded-xl bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {role} account
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-800">
              {name || "User"}
            </p>
          </div>

          {/* NAVIGATION */}
          <nav
            aria-label="Main navigation"
            className="mt-5 flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible"
          >
            {links.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);

              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                    active
                      ? "bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-100"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-blue-700"
                    />
                  )}

                  <Icon
                    size={19}
                    className={
                      active ? "text-blue-700" : "text-slate-500"
                    }
                  />

                  <span>{label}</span>

                  {active && (
                    <span className="ml-auto h-2 w-2 rounded-full bg-blue-700" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* LOGOUT - BOTTOM OF SIDEBAR ON DESKTOP */}
        <div className="mt-5 shrink-0 border-t border-slate-100 pt-4">
          <div className="[&_button]:flex [&_button]:w-full [&_button]:items-center [&_button]:justify-center [&_button]:gap-3 [&_button]:rounded-xl [&_button]:px-3 [&_button]:py-3 [&_button]:text-sm [&_button]:font-medium [&_button]:transition [&_button]:hover:bg-red-50 [&_button]:hover:text-red-700">
            <LogoutButton />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8 print:p-0">
        {children}
      </main>
    </div>
  );
}