import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, X } from "lucide-react";

import {
  AsyncSection,
  DetailGrid,
  ErrorState,
  PageHeader,
  ScoreBar,
  Section,
  StatusBadge,
} from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { usePropertyOverview } from "@/hooks/api/use-properties";
import { errorMessage } from "@/lib/api";
import { formatDate, num, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/properties/$propertyId")({
  head: () => ({
    meta: [
      { title: "Property · Tavelo Super Admin" },
      { name: "description", content: "Property profile, integrations and listing completeness." },
    ],
  }),
  component: PropertyDetailPage,
});

function PropertyDetailPage() {
  const { propertyId } = Route.useParams();
  const overview = usePropertyOverview(propertyId);
  const property = overview.data?.property;
  const integrations = overview.data?.integrations ?? [];
  const score = overview.data?.listingScore;

  if (overview.isError) {
    return (
      <>
        <PageHeader
          eyebrow="Customers"
          title="Property"
          breadcrumbs={[{ label: "Properties", to: "/properties" }]}
        />
        <div className="p-5 lg:p-6">
          <div className="panel">
            <ErrorState
              title="Property could not be loaded"
              description={errorMessage(overview.error)}
              onRetry={() => overview.refetch()}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Customers"
        title={overview.isLoading ? "Loading property…" : (property?.name ?? "Property")}
        description={
          property ? [property.city, property.state, property.country].filter(Boolean).join(", ") : undefined
        }
        breadcrumbs={[
          { label: "Properties", to: "/properties" },
          { label: property?.name ?? "Property" },
        ]}
        actions={
          property?.ownerId ? (
            <Button asChild variant="outline" size="sm" className="h-8">
              <Link to="/owners/$ownerId" params={{ ownerId: property.ownerId }}>
                Open owner
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-4 p-5 lg:p-6">
        <Section title="Property details">
          <AsyncSection
            loading={overview.isLoading}
            error={overview.error}
            onRetry={() => overview.refetch()}
          >
            <DetailGrid
              items={[
                { label: "Status", value: property ? <StatusBadge status={property.status} /> : "—" },
                { label: "Owner", value: property?.owner ?? "—" },
                { label: "Category", value: property?.category ?? "—" },
                { label: "Star rating", value: property?.starRating ? `${property.starRating}★` : "—" },
                { label: "Rooms", value: num(property?.roomCount) },
                { label: "Timezone", value: property?.timezone ?? "—" },
                { label: "Slug", value: property?.slug ?? "—" },
                { label: "Onboarded", value: formatDate(property?.createdAt) },
                { label: "Last updated", value: relativeTime(property?.updatedAt) },
              ]}
            />
          </AsyncSection>
        </Section>

        <div className="grid gap-4 xl:grid-cols-2">
          <Section
            title="Listing completeness"
            description="How ready this listing is for guests"
          >
            <div className="p-4">
              <AsyncSection
                loading={overview.isLoading}
                error={overview.error}
                onRetry={() => overview.refetch()}
                isEmpty={!score}
                emptyTitle="No score available"
                emptyDescription="Listing scoring appears once the property has content."
              >
                {score && (
                  <>
                    <ScoreBar value={score.overall} label="Overall completeness" />
                    <ul className="mt-4 divide-y divide-border">
                      {score.detail.map((d) => (
                        <li key={d.label} className="flex items-center justify-between py-2 text-sm">
                          <span className="flex items-center gap-2">
                            {d.ok ? (
                              <Check aria-hidden className="size-4 text-success" />
                            ) : (
                              <X aria-hidden className="size-4 text-destructive" />
                            )}
                            {d.label}
                          </span>
                          <span className="tnum text-xs text-muted-foreground">
                            weight {d.weight}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </AsyncSection>
            </div>
          </Section>

          <Section title="Integrations" description="Channel and PMS connections">
            <div className="px-4 py-2">
              <AsyncSection
                loading={overview.isLoading}
                error={overview.error}
                onRetry={() => overview.refetch()}
                isEmpty={integrations.length === 0}
                emptyTitle="No integrations"
                emptyDescription="This property has no connected channel or PMS."
              >
                <ul className="divide-y divide-border">
                  {integrations.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{i.provider}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          Last sync {relativeTime(i.lastSyncAt)} · {num(i.errorCount ?? 0)} errors
                        </p>
                      </div>
                      <StatusBadge status={i.status} />
                    </li>
                  ))}
                </ul>
              </AsyncSection>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
