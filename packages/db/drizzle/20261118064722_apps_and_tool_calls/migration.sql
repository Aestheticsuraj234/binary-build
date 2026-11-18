CREATE TABLE "apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"encrypted_authorization" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "tool_calls" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "apps_user_id_name_idx" ON "apps" ("user_id","name");--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;