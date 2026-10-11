"use client";

import CapabilityGate from "@/components/CapabilityGate";
import MainApp from "@/components/MainApp";
import PlantsPanel from "@/components/PlantsPanel";

export default function AuthenticatedApp({ catalogueOnly = false }: { catalogueOnly?: boolean }) {
  return (
    <CapabilityGate>
      {(capabilities) => catalogueOnly ? (
        capabilities.can_manage_catalogue || capabilities.can_operate_trips ? (
          <PlantsPanel canManage={capabilities.can_manage_catalogue} />
        ) : <p role="alert" className="p-6">You do not have access to the plant catalogue.</p>
      ) : <MainApp capabilities={capabilities} />}
    </CapabilityGate>
  );
}
