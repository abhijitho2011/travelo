import { CreditCard, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MetricRow } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  GATEWAYS,
  useCreateGatewayOrder,
  type Gateway,
  type GatewayOrder,
} from "@/hooks/api/use-billing";
import type { Subscription } from "@/hooks/api/types";
import { errorMessage } from "@/lib/api";
import { inr } from "@/lib/format";

const GATEWAY_LABELS: Record<Gateway, string> = {
  RAZORPAY: "Razorpay",
  CASHFREE: "Cashfree",
};

/**
 * Raises a gateway order for an owner's subscription. The owner completes
 * payment against the returned order; the desk uses this when a gateway is
 * configured, and falls back to Record payment otherwise.
 */
export function GatewayOrderDialog({
  subscription,
}: {
  subscription: Pick<Subscription, "id" | "ownerId" | "owner" | "plan">;
}) {
  const [open, setOpen] = useState(false);
  const [gateway, setGateway] = useState<Gateway>("RAZORPAY");
  const [order, setOrder] = useState<GatewayOrder | null>(null);
  const create = useCreateGatewayOrder();

  const reset = () => {
    setOrder(null);
    setGateway("RAZORPAY");
  };

  const submit = async () => {
    try {
      const result = await create.mutateAsync({
        ownerId: subscription.ownerId,
        subscriptionId: subscription.id,
        gateway,
      });
      setOrder(result);
      toast.success("Gateway order raised", {
        description: `${GATEWAY_LABELS[result.gateway]} · ${result.orderId}`,
      });
    } catch (error) {
      toast.error("Could not raise gateway order", { description: errorMessage(error) });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8">
          <CreditCard aria-hidden className="mr-1.5 size-3.5" /> Raise order
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Raise gateway order</DialogTitle>
          <DialogDescription>
            Creates a pending order the owner pays against. If the gateway has no
            credentials, record the payment manually instead.
          </DialogDescription>
        </DialogHeader>

        <dl className="rounded-md border border-border bg-surface-muted px-3 py-1">
          <MetricRow label="Owner" value={subscription.owner ?? "—"} />
          <MetricRow label="Plan" value={subscription.plan} />
        </dl>

        {order ? (
          <div className="space-y-2 rounded-md border border-success/25 bg-success-soft px-3 py-2">
            <p className="text-sm font-semibold text-success">
              {GATEWAY_LABELS[order.gateway]} order created
            </p>
            <dl className="rounded-md border border-border bg-surface px-3 py-1">
              <MetricRow label="Order ID" value={order.orderId} />
              <MetricRow label="Payment ID" value={order.paymentId} />
              <MetricRow label="Amount" value={inr(order.amount)} />
              {order.paymentSessionId && (
                <MetricRow label="Session" value={order.paymentSessionId} />
              )}
            </dl>
            <p className="text-xs text-muted-foreground">
              The payment stays PENDING until the owner completes checkout and the
              gateway webhook settles it.
            </p>
          </div>
        ) : (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Gateway</legend>
            <RadioGroup
              value={gateway}
              onValueChange={(v) => setGateway(v as Gateway)}
              className="grid grid-cols-2 gap-2"
            >
              {GATEWAYS.map((g) => (
                <div
                  key={g}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                >
                  <RadioGroupItem id={`gw-${g}`} value={g} />
                  <Label htmlFor={`gw-${g}`} className="text-sm font-normal">
                    {GATEWAY_LABELS[g]}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
        )}

        <DialogFooter>
          {order ? (
            <Button variant="outline" onClick={() => setOpen(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
                Cancel
              </Button>
              <Button disabled={create.isPending} onClick={() => void submit()}>
                {create.isPending && <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />}
                Raise order
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
