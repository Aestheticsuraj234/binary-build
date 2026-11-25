CREATE TABLE "room_members" (
	"room_id" uuid,
	"agent_id" uuid,
	"position" integer NOT NULL,
	CONSTRAINT "room_members_pkey" PRIMARY KEY("room_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"mode" text DEFAULT 'mention' NOT NULL,
	"lead_agent_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "room_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "threads_room_id_idx" ON "threads" ("room_id");--> statement-breakpoint
CREATE INDEX "room_members_agent_id_idx" ON "room_members" ("agent_id");--> statement-breakpoint
CREATE INDEX "rooms_user_id_idx" ON "rooms" ("user_id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_agent_id_agents_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_room_id_rooms_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_id_rooms_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_agent_id_agents_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_lead_agent_id_agents_id_fkey" FOREIGN KEY ("lead_agent_id") REFERENCES "agents"("id") ON DELETE CASCADE;