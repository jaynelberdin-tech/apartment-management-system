import { requireRole } from "@/lib/auth";
import ActivityLogsClient, { type ActivityLog } from "./ActivityLogsClient";

export default async function ActivityLogsPage() {
  const { supabase } = await requireRole("admin");

  const { data: logs, error } = await supabase
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        Unable to load activity logs: {error.message}. Make sure you have run
        <code className="mx-1 rounded bg-red-100 px-1.5 py-0.5">supabase/activity_logs.sql</code>
        in your Supabase SQL Editor.
      </div>
    );
  }

  const activityLogs = (logs ?? []) as ActivityLog[];
  return <ActivityLogsClient logs={activityLogs} />;
}
