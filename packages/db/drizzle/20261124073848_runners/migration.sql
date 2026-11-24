CREATE TABLE "runners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"pairing_code_hash" text,
	"pairing_expires_at" timestamp with time zone,
	"token_hash" text,
	"paused_at" timestamp with time zone,
	"os" text,
	"version" text,
	"folders" text[] DEFAULT '{}'::text[] NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "sandboxes_running_thread_idx";--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "engine" text DEFAULT 'api' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "runner_id" uuid;--> statement-breakpoint
ALTER TABLE "sandboxes" ADD COLUMN "kind" text DEFAULT 'sandbox' NOT NULL;--> statement-breakpoint
ALTER TABLE "sandboxes" ADD COLUMN "live_url" text;--> statement-breakpoint
CREATE INDEX "runners_user_id_idx" ON "runners" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runners_token_hash_idx" ON "runners" ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "runners_pairing_code_hash_idx" ON "runners" ("pairing_code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "sandboxes_running_thread_kind_idx" ON "sandboxes" ("thread_id","kind") WHERE "status" = 'running';--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_runner_id_runners_id_fkey" FOREIGN KEY ("runner_id") REFERENCES "runners"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "runners" ADD CONSTRAINT "runners_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;