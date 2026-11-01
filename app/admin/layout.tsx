import AppShell from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("admin");
  return <AppShell role="admin" name={profile.full_name}>{children}</AppShell>;
}
