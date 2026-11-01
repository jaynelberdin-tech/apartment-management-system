import AppShell from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("tenant");
  return <AppShell role="tenant" name={profile.full_name}>{children}</AppShell>;
}
