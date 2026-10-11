import type { CurrentUserCapabilities } from "@/types/route";

export type AppTab = "businesses" | "dispatch" | "trip" | "trips" | "plants";

export function availableTabs(capabilities: CurrentUserCapabilities): AppTab[] {
  const tabs: AppTab[] = [];
  if (capabilities.can_manage_businesses) tabs.push("businesses");
  if (capabilities.can_operate_trips) tabs.push("dispatch", "trip", "trips");
  if (capabilities.can_manage_catalogue || capabilities.can_operate_trips) tabs.push("plants");
  return tabs;
}
