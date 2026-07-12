import { getSupabase } from "./supabase";
import type { DashboardStats } from "../types";

/**
 * Product analytics payload from the admin_dashboard_stats RPC
 * (supabase/migrations/0007). Aggregate-only by design — the function never
 * returns conversation content, and raises "admin only" for non-admins.
 */
export async function fetchDashboardStats(daysWindow: number): Promise<DashboardStats> {
  const { data, error } = await getSupabase().rpc("admin_dashboard_stats", {
    days_window: daysWindow,
  });
  if (error) throw new Error(`Failed to load dashboard stats: ${error.message}`);
  if (!data) throw new Error("Dashboard stats RPC returned no data");
  return data as DashboardStats;
}
