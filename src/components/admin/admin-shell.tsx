import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell, ChevronsLeft, ChevronsRight, LogOut, Menu, Search, ShieldCheck, UserCircle2, X,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { CommandPalette, useCommandPalette } from "@/components/admin/command-palette";
import { navSections } from "@/components/admin/nav-config";
import { StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { notifications } from "@/lib/travelo-data";
import { cn } from "@/lib/utils";

function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-[13px] font-black text-sidebar-primary-foreground">
        T
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-sm font-extrabold tracking-tight text-sidebar-accent-foreground">
            TRAVELO
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/70">
            Super Admin
          </span>
        </span>
      )}
    </Link>
  );
}

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <ScrollArea className="h-full">
      <nav aria-label="Main" className="px-2 pb-8 pt-2">
        {navSections.map((section) => (
          <div key={section.title} className="mb-3">
            {!collapsed && (
              <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/50">
                {section.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      <item.icon aria-hidden className={cn("size-4 shrink-0", active && "text-sidebar-primary")} />
                      {!collapsed && (
                        <>
                          <span className="truncate">{item.label}</span>
                          {item.badge && (
                            <span className="tnum ml-auto rounded bg-sidebar-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-sidebar-primary">
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </ScrollArea>
  );
}

function NotificationCenter() {
  const [items, setItems] = useState(notifications.map((n) => ({ ...n, read: false })));
  const unread = items.filter((n) => !n.read).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-8" aria-label={`Notifications, ${unread} unread`}>
          <Bell aria-hidden className="size-4" />
          {unread > 0 && (
            <span className="tnum absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-bold">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setItems((prev) => prev.map((n) => ({ ...n, read: true })))}
          >
            Mark all read
          </Button>
        </div>
        <ul className="max-h-[340px] divide-y divide-border overflow-auto">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                to={n.to}
                className="flex gap-2.5 px-3 py-2.5 hover:bg-surface-muted"
                onClick={() =>
                  setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
                }
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    n.tone === "danger" && "bg-destructive",
                    n.tone === "warning" && "bg-warning",
                    n.tone === "info" && "bg-info",
                    n.tone === "success" && "bg-success",
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {n.category}
                  </span>
                  <span className={cn("block text-sm", n.read ? "text-muted-foreground" : "font-medium text-foreground")}>
                    {n.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">{n.time}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="border-t border-border p-2">
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to="/notifications">Open alert center</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ImpersonationBanner({
  owner,
  role,
  onExit,
}: {
  owner: string;
  role: string;
  onExit: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-warning px-4 py-2 text-sm font-semibold text-warning-foreground"
    >
      <span>⚠ SUPPORT IMPERSONATION MODE</span>
      <span className="font-normal">
        Acting as: <strong>{owner}</strong> ({role}) · Admin: John Mathew · all actions recorded
      </span>
      <Button
        size="sm"
        variant="secondary"
        className="ml-auto h-7"
        onClick={onExit}
      >
        <X aria-hidden className="mr-1 size-3.5" /> Exit
      </Button>
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { open, setOpen } = useCommandPalette();
  const impersonating = useRouterState({
    select: (s) => s.location.search as { impersonate?: string },
  });

  return (
    <div className="flex min-h-screen bg-background">
      <CommandPalette open={open} onOpenChange={setOpen} />

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex",
          collapsed ? "w-[68px]" : "w-[248px]",
        )}
      >
        <div className={cn("flex h-14 items-center border-b border-sidebar-border px-3", collapsed && "justify-center px-0")}>
          <Wordmark compact={collapsed} />
        </div>
        <div className="min-h-0 flex-1">
          <SidebarNav collapsed={collapsed} />
        </div>
        <div className="border-t border-sidebar-border p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="w-full justify-center text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {collapsed ? <ChevronsRight aria-hidden className="size-4" /> : (
              <>
                <ChevronsLeft aria-hidden className="mr-1.5 size-4" /> Collapse
              </>
            )}
          </Button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[264px] flex-col bg-sidebar">
            <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-3">
              <Wordmark />
              <Button variant="ghost" size="icon" className="size-8 text-sidebar-foreground" aria-label="Close navigation" onClick={() => setMobileOpen(false)}>
                <X aria-hidden className="size-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-3 lg:px-5">
            <Button variant="ghost" size="icon" className="size-8 lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
              <Menu aria-hidden className="size-4" />
            </Button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-surface-muted px-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-border-strong sm:max-w-md"
            >
              <Search aria-hidden className="size-3.5" />
              <span className="truncate">Search owners, hotels, subscriptions…</span>
              <kbd className="ml-auto hidden rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] font-semibold sm:block">
                ⌘K
              </kbd>
            </button>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="hidden lg:block">
                <StatusBadge status="Healthy" />
              </span>
              <NotificationCenter />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 gap-2 px-1.5">
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold text-accent-foreground">
                      JM
                    </span>
                    <span className="hidden text-left leading-tight sm:block">
                      <span className="block text-xs font-semibold">John Mathew</span>
                      <span className="block text-[10px] text-muted-foreground">Super Admin</span>
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>john@travelo.io</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/admin-users">
                      <UserCircle2 aria-hidden className="mr-2 size-4" /> Profile &amp; sessions
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/roles">
                      <ShieldCheck aria-hidden className="mr-2 size-4" /> Roles &amp; permissions
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/login">
                      <LogOut aria-hidden className="mr-2 size-4" /> Sign out
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {impersonating?.impersonate && (
            <ImpersonationBanner
              owner={impersonating.impersonate}
              role="Owner"
              onExit={() => window.history.back()}
            />
          )}
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
