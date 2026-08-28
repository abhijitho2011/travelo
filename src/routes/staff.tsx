import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/admin/primitives";

export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [
      { title: "Staff · Tavelo Super Admin" },
      { name: "description", content: "Hotel staff monitoring across owner organisations." },
    ],
  }),
  component: StaffPage,
});

function StaffPage() {
  // Hotel staff are managed by owners in the owner app. The platform API does not
  // yet expose a cross-tenant staff directory, so nothing is rendered here rather
  // than showing placeholder records.
  return (
    <div className="space-y-5">
      <PageHeader
        title="Staff"
        description="Monitoring view of hotel staff across every owner organisation."
      />
      <div className="panel">
        <EmptyState
          icon={Users}
          title="Staff directory not available yet"
          description="Owners manage General Managers and Assistant GMs in the owner app. A cross-tenant staff directory is not yet exposed by the platform API, so no records are shown here."
        />
      </div>
    </div>
  );
}
