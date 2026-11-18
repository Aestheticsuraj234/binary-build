CREATE TABLE "enabled_toolkits" (
	"user_id" text,
	"slug" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enabled_toolkits_pkey" PRIMARY KEY("user_id","slug")
);
--> statement-breakpoint
ALTER TABLE "enabled_toolkits" ADD CONSTRAINT "enabled_toolkits_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;