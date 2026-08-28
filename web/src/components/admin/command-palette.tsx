import { useNavigate } from "@tanstack/react-router";
import { Building2, FileText, LifeBuoy, ScrollText, Users, Plus, CreditCard, Repeat } from "lucide-react";
import { useEffect, useState } from "react";

import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
  CommandSeparator, CommandShortcut,
} from "@/components/ui/command";
import { invoices, owners, properties, tickets } from "@/lib/travelo-data";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const go = (to: string) => {
    onOpenChange(false);
    navigate({ to });
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search owners, hotels, subscriptions, invoices, tickets…" />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>No matching records.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => go("/owners/new")}>
            <Plus className="mr-2 size-4" /> Create owner
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/subscriptions")}>
            <Repeat className="mr-2 size-4" /> Create subscription
          </CommandItem>
          <CommandItem onSelect={() => go("/audit")}>
            <ScrollText className="mr-2 size-4" /> Open audit logs
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Owners">
          {owners.slice(0, 4).map((o) => (
            <CommandItem key={o.id} value={`${o.company} ${o.name} ${o.id}`} onSelect={() => go(`/owners/${o.id}`)}>
              <Users className="mr-2 size-4" />
              {o.company}
              <CommandShortcut>{o.id}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Hotels">
          {properties.slice(0, 4).map((p) => (
            <CommandItem key={p.id} value={`${p.name} ${p.location}`} onSelect={() => go(`/properties/${p.id}`)}>
              <Building2 className="mr-2 size-4" />
              {p.name}
              <CommandShortcut>{p.location}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Support tickets">
          {tickets.slice(0, 3).map((t) => (
            <CommandItem key={t.id} value={`${t.id} ${t.subject}`} onSelect={() => go(`/support/${t.id}`)}>
              <LifeBuoy className="mr-2 size-4" />
              {t.subject}
              <CommandShortcut>{t.id}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Invoices & payments">
          {invoices.slice(0, 3).map((i) => (
            <CommandItem key={i.id} value={`${i.id} ${i.owner}`} onSelect={() => go("/invoices")}>
              <FileText className="mr-2 size-4" />
              {i.id} · {i.owner}
            </CommandItem>
          ))}
          <CommandItem onSelect={() => go("/payments")}>
            <CreditCard className="mr-2 size-4" /> All payments
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}
