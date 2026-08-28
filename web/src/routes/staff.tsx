import { createFileRoute } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { DataTable, type Column } from "@/components/admin/data-table";
import { KpiCard, PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { staff } from "@/lib/travelo-data";

export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [
      { title: "Hotel Staff Accounts · Travelo Super Admin" },
      { name: "description", content: "Read-only oversight of every hotel staff account created by owners and general managers." },
      { property: "og:title", content: "Hotel Staff Accounts · Travelo Super Admin" },
      { property: "og:description", content: "Staff account visibility across all Travelo properties." },
    ],
  }),
  component: StaffPage,
});

type Staff = (typeof staff)[number];

function StaffPage() {
  const [dept, setDept] = useState("all");
  const departments = Array.from(new Set(staff.map((s) => s.department)));
  const rows = staff.filter((s) => dept === "all" || s.department === dept);

  const columns: Column<Staff>[] = [
    { key: "name", header: "Staff member", sortValue: (s) => s.name, cell: (s) => <span className="font-semibold">{s.name}</span> },
    { key: "role", header: "Role", cell: (s) => s.role },
    { key: "dept", header: "Department", cell: (s) => <span className="text-muted-foreground">{s.department}</span> },
    { key: "hotel", header: "Property", sortValue: (s) => s.hotel, cell: (s) => s.hotel },
    { key: "owner", header: "Owner", optional: true, cell: (s) => <span className="text-muted-foreground">{s.owner}</span> },
    { key: "login", header: "Last login", cell: (s) => <span className="text-muted-foreground">{s.lastLogin}</span> },
    { key: "created", header: "Created", optional: true, cell: (s) => <span className="tnum text-muted-foreground">{s.created}</span> },
    { key: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Customers"
        title="Hotel Staff Accounts"
        description="Platform-wide visibility. Staff are created by owners and GMs — Travelo can only view or block."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Staff" }]}
      />
      <div className="space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Staff accounts" value="4,182" delta="+164" hint="across 612 properties" />
          <KpiCard label="Active (24h)" value="9,684" delta="+3.2%" hint="sessions" />
          <KpiCard label="General Managers" value="612" hint="one per property" />
          <KpiCard label="Blocked / inactive" value="87" trend="down" delta="2.1% of base" />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(s) => `${s.name}-${s.hotel}`}
          searchKeys={(s) => `${s.name} ${s.role} ${s.hotel} ${s.owner}`}
          searchPlaceholder="Search staff, role or property…"
          exportName="Staff"
          filters={
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="h-8 w-[180px] text-sm" aria-label="Filter by department">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          rowActions={(s) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${s.name}`}>
                  <MoreHorizontal aria-hidden className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => toast.info(`${s.name} · ${s.role}`, { description: `${s.hotel} · last login ${s.lastLogin}` })}>
                  View profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.success(`Password reset link sent to ${s.name}`)}>
                  Send password reset
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          toolbarExtra={
            <ConfirmDialog
              trigger={<Button variant="outline" size="sm" className="h-8 text-destructive">Block account</Button>}
              title="Block a staff account?"
              description="Blocking immediately terminates active sessions for the selected staff member."
              impact={["Sessions revoked", "Owner and GM notified", "Recorded in audit log"]}
              confirmLabel="Block account"
            />
          }
          emptyTitle="No staff match"
          emptyDescription="Try another department or search term."
        />
      </div>
    </>
  );
}
