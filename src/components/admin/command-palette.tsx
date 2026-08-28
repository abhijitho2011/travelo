import { useNavigate } from "@tanstack/react-router";
import {
  Building2,
  CreditCard,
  FileText,
  LifeBuoy,
  Plus,
  Repeat,
  ScrollText,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useGlobalSearch } from "@/hooks/api/use-analytics";
import { inr } from "@/lib/format";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const { data, isFetching } = useGlobalSearch(term);

  const go = (to: string) => {
    onOpenChange(false);
    setTerm("");
    navigate({ to });
  };

  const hasResults = !!(
    data?.owners?.length ||
    data?.properties?.length ||
    data?.invoices?.length ||
    data?.tickets?.length
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        value={term}
        onValueChange={setTerm}
        placeholder="Search owners, hotels, invoices, tickets…"
      />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>
          {term.trim().length < 2
            ? "Type at least two characters to search the platform."
            : isFetching
              ? "Searching…"
              : "No matching records."}
        </CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem value="create new owner" onSelect={() => go("/owners/new")}>
            <Plus className="mr-2 size-4" /> Create owner
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
          <CommandItem value="manage subscriptions" onSelect={() => go("/subscriptions")}>
            <Repeat className="mr-2 size-4" /> Manage subscriptions
          </CommandItem>
          <CommandItem value="open audit logs" onSelect={() => go("/audit")}>
            <ScrollText className="mr-2 size-4" /> Open audit logs
          </CommandItem>
          <CommandItem value="all payments billing" onSelect={() => go("/payments")}>
            <CreditCard className="mr-2 size-4" /> All payments
          </CommandItem>
        </CommandGroup>

        {hasResults ? <CommandSeparator /> : null}

        {data?.owners?.length ? (
          <CommandGroup heading="Owners">
            {data.owners.map((o) => (
              <CommandItem
                key={o.id}
                value={`${o.company ?? ""} ${o.name} ${o.email}`}
                onSelect={() => go(`/owners/${o.id}`)}
              >
                <Users className="mr-2 size-4" />
                {o.company ?? o.name}
                <CommandShortcut>{o.email}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {data?.properties?.length ? (
          <CommandGroup heading="Hotels">
            {data.properties.map((p) => (
              <CommandItem
                key={p.id}
                value={`${p.name} ${p.city ?? ""}`}
                onSelect={() => go(`/properties/${p.id}`)}
              >
                <Building2 className="mr-2 size-4" />
                {p.name}
                <CommandShortcut>{p.city ?? ""}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {data?.tickets?.length ? (
          <CommandGroup heading="Support tickets">
            {data.tickets.map((t) => (
              <CommandItem
                key={t.id}
                value={t.subject}
                onSelect={() => go(`/support/${t.id}`)}
              >
                <LifeBuoy className="mr-2 size-4" />
                {t.subject}
                <CommandShortcut>{t.status}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {data?.invoices?.length ? (
          <CommandGroup heading="Invoices">
            {data.invoices.map((i) => (
              <CommandItem key={i.id} value={i.invoiceNumber} onSelect={() => go("/invoices")}>
                <FileText className="mr-2 size-4" />
                {i.invoiceNumber}
                <CommandShortcut>{inr(i.total)}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
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
