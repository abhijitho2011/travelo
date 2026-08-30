-- Spa, Security and Events — three staff-role domains in one migration.
--
-- Sits beside rooms (0008), reservations (0009) and restaurant (0015). Reads
-- reservations (CHECKED_IN) for the spa ROOM_CHARGE settlement path, exactly as
-- the restaurant does. Everything is PROPERTY-SCOPED; money is integer paise.
--
-- DESIGN NOTES:
--  1. MONEY IS PAISE. spa_services.price_paise, spa_bills.total_paise,
--     events.revenue_paise — never a float.
--  2. A SPA BILL NEVER RE-DERIVES FROM THE LIVE SERVICE. spa_appointments
--     snapshots service_name_snapshot + price_paise_snapshot at booking; the
--     bill is computed from the snapshot. Same rule as order_items.
--  3. Security gives the already-shipped staff gate/visitor/incident screens a
--     real backend (they degraded to empty before), plus the manager's roster
--     and oversight.

-- ============================ SPA ============================

CREATE TABLE IF NOT EXISTS "spa_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"price_paise" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spa_services" ADD CONSTRAINT "spa_services_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spa_services_property_idx" ON "spa_services" USING btree ("property_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "spa_services_property_name_unique" ON "spa_services" USING btree ("property_id","name") WHERE "deleted_at" IS NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "spa_appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"guest_name" varchar(160) NOT NULL,
	"reservation_id" uuid,
	"service_id" uuid,
	"staff_id" uuid,
	"start_at" timestamp with time zone NOT NULL,
	"status" varchar(16) DEFAULT 'BOOKED' NOT NULL,
	"service_name_snapshot" varchar(160) NOT NULL,
	"price_paise_snapshot" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spa_appointments" ADD CONSTRAINT "spa_appointments_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spa_appointments" ADD CONSTRAINT "spa_appointments_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spa_appointments" ADD CONSTRAINT "spa_appointments_service_id_spa_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."spa_services"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spa_appointments" ADD CONSTRAINT "spa_appointments_staff_id_hotel_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."hotel_staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spa_appointments_property_idx" ON "spa_appointments" USING btree ("property_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spa_appointments_staff_idx" ON "spa_appointments" USING btree ("staff_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spa_appointments_status_idx" ON "spa_appointments" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spa_appointments_start_idx" ON "spa_appointments" USING btree ("start_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "spa_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"subtotal_paise" integer DEFAULT 0 NOT NULL,
	"tax_paise" integer DEFAULT 0 NOT NULL,
	"total_paise" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'UNPAID' NOT NULL,
	"payment_method" varchar(16),
	"reservation_id" uuid,
	"settled_by" uuid,
	"refund_reason" text,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spa_bills" ADD CONSTRAINT "spa_bills_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spa_bills" ADD CONSTRAINT "spa_bills_appointment_id_spa_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."spa_appointments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spa_bills" ADD CONSTRAINT "spa_bills_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spa_bills" ADD CONSTRAINT "spa_bills_settled_by_hotel_staff_id_fk" FOREIGN KEY ("settled_by") REFERENCES "public"."hotel_staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spa_bills_property_idx" ON "spa_bills" USING btree ("property_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spa_bills_status_idx" ON "spa_bills" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "spa_bills_appointment_unique" ON "spa_bills" USING btree ("appointment_id");
--> statement-breakpoint

-- ============================ SECURITY ============================

CREATE TABLE IF NOT EXISTS "gate_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"movement" varchar(16) NOT NULL,
	"subject" varchar(200) NOT NULL,
	"detail" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gate_movements" ADD CONSTRAINT "gate_movements_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gate_movements" ADD CONSTRAINT "gate_movements_recorded_by_hotel_staff_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."hotel_staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gate_movements_property_idx" ON "gate_movements" USING btree ("property_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gate_movements_created_idx" ON "gate_movements" USING btree ("created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "visitor_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"visiting" varchar(200),
	"purpose" varchar(200),
	"pass_number" varchar(64),
	"recorded_by" uuid,
	"arrived_at" timestamp with time zone DEFAULT now() NOT NULL,
	"departed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visitor_logs" ADD CONSTRAINT "visitor_logs_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visitor_logs" ADD CONSTRAINT "visitor_logs_recorded_by_hotel_staff_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."hotel_staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visitor_logs_property_idx" ON "visitor_logs" USING btree ("property_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visitor_logs_on_site_idx" ON "visitor_logs" USING btree ("property_id") WHERE "departed_at" IS NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"severity" varchar(16) DEFAULT 'MEDIUM' NOT NULL,
	"status" varchar(16) DEFAULT 'OPEN' NOT NULL,
	"location" varchar(200),
	"reported_by" uuid,
	"assigned_to" uuid,
	"resolution" text,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reported_by_hotel_staff_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."hotel_staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assigned_to_hotel_staff_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."hotel_staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incidents_property_idx" ON "incidents" USING btree ("property_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incidents_status_idx" ON "incidents" USING btree ("status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "lost_found_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"description" text NOT NULL,
	"location" varchar(200),
	"status" varchar(16) DEFAULT 'STORED' NOT NULL,
	"recorded_by" uuid,
	"found_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lost_found_items" ADD CONSTRAINT "lost_found_items_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lost_found_items" ADD CONSTRAINT "lost_found_items_recorded_by_hotel_staff_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."hotel_staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lost_found_items_property_idx" ON "lost_found_items" USING btree ("property_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "security_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"area" varchar(120) NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"status" varchar(16) DEFAULT 'SCHEDULED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "security_shifts" ADD CONSTRAINT "security_shifts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "security_shifts" ADD CONSTRAINT "security_shifts_staff_id_hotel_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."hotel_staff"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_shifts_property_idx" ON "security_shifts" USING btree ("property_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_shifts_staff_idx" ON "security_shifts" USING btree ("staff_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_shifts_status_idx" ON "security_shifts" USING btree ("status");
--> statement-breakpoint

-- ============================ EVENTS ============================

CREATE TABLE IF NOT EXISTS "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"client_name" varchar(200) NOT NULL,
	"type" varchar(80),
	"venue" varchar(160),
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"guest_count" integer DEFAULT 0 NOT NULL,
	"package" varchar(120),
	"status" varchar(16) DEFAULT 'ENQUIRY' NOT NULL,
	"revenue_paise" integer DEFAULT 0 NOT NULL,
	"room_block" integer,
	"notes" text,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_property_idx" ON "events" USING btree ("property_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_status_idx" ON "events" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_start_idx" ON "events" USING btree ("start_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "event_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"assignee_staff_id" uuid,
	"due_at" timestamp with time zone,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_tasks" ADD CONSTRAINT "event_tasks_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_tasks" ADD CONSTRAINT "event_tasks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_tasks" ADD CONSTRAINT "event_tasks_assignee_staff_id_hotel_staff_id_fk" FOREIGN KEY ("assignee_staff_id") REFERENCES "public"."hotel_staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_tasks_property_idx" ON "event_tasks" USING btree ("property_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_tasks_event_idx" ON "event_tasks" USING btree ("event_id");
