import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";

export default async function HomePage() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login");
  if (profile?.role === "admin") redirect("/admin");
  redirect("/tenant");
}
