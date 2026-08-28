import { createFileRoute } from "@tanstack/react-router";
import { MoreHorizontal, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { DataTable, type Column } from "@/components/admin/data-table";
import { KpiCard, PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminUsers, roles } from "@/lib/travelo-data";

export const Route = createFileRoute("/admin-users")({
  head: () => ({
    meta: [
      { title: "Admin Users · Travelo Super Admin" },
      { name: "description", content: "Manage Travelo internal administrators, roles, MFA enforcement and session security." },
      { property: "og:title", content: "Admin Users · Travelo Super Admin" },
      { property: "og:description", content: "Internal administrator account management." },
    ],
  }),
  component: AdminUsersPage,
});

type Admin = (typeof adminUsers)[number];

function AdminUsersPage() {
  const columns: Column<Admin>[] = [
    {
      key: "name", header: "Administrator", sortValue: (a) => a.name,
      cell: (a) => (
        <span>
          <span className="block font-semibold">{a.name}</span>
          <span className="block text-xs text-muted-foreground">{a.email}</span>
        </span>
      ),
    },
    { key: "role", header: "Role", sortValue: (a) => a.role, cell: (a) => a.role },
    { key: "mfa", header: "MFA", cell: (a) => <StatusBadge status={a.mfa === "Enabled" ? "Active" : "Warning"} /> },
    { key: "login", header: "Last login", cell: (a) => <span className="tnum text-muted-foreground">{a.lastLogin}</span> },
    { key: "status", header: "Status", cell: (a) => <StatusBadge status={a.status} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Security"
        title="Admin Users"
        description="Travelo internal staff with control-plane access. MFA is mandatory for all privileged roles."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Admin Users" }]}
        actions={<InviteAdminDialog />}
      />
      <div className="space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Administrators" value="6" hint="4 active" />
          <KpiCard label="MFA enforced" value="83%" trend="down" delta="1 without MFA" />
          <KpiCard label="Active sessions" value="4" hint="all from India" />
          <KpiCard label="Blocked accounts" value="1" trend="down" delta="offboarded" />
        </div>
        <DataTable
          rows={adminUsers}
          columns={columns}
          rowKey={(a) => a.email}
          searchKeys={(a) => `${a.name} ${a.email} ${a.role}`}
          searchPlaceholder="Search administrator…"
          exportName="AdminUsers"
          rowActions={(a) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${a.name}`}>
                  <MoreHorizontal aria-hidden className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => toast.info(`Editing ${a.name}`)}>Edit role</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.success(`Password reset sent to ${a.email}`)}>Send password reset</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.success(`MFA reset for ${a.name}`)}>Reset MFA device</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.success(`Sessions revoked for ${a.name}`)}>Revoke sessions</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          toolbarExtra={
            <ConfirmDialog
              trigger={<Button variant="outline" size="sm" className="h-8 text-destructive">Block admin</Button>}
              title="Block an administrator?"
              description="The account loses control-plane access immediately and all sessions end."
              impact={["Sessions revoked", "API tokens invalidated", "Security team notified"]}
              confirmLabel="Block administrator"
            />
          }
          emptyTitle="No administrators"
          emptyDescription="Invite your first internal administrator."
        />
      </div>
    </>
  );
}

function InviteAdminDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8">
          <UserPlus aria-hidden className="mr-1.5 size-3.5" /> Invite admin
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite administrator</DialogTitle>
          <DialogDescription>The invite expires in 48 hours and requires MFA enrolment.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="admin-name">Full name</Label>
            <Input id="admin-name" placeholder="Ananya Rao" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-email">Work email</Label>
            <Input id="admin-email" type="email" placeholder="ananya@travelo.io" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-role">Role</Label>
            <Select defaultValue="Support Admin">
              <SelectTrigger id="admin-role" className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => { setOpen(false); toast.success("Invitation sent"); }}>Send invite</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
