ALTER TABLE "agent_templates" ADD COLUMN "computers" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "computers" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
-- Keep each character's computer: "cloud_sandbox" becomes ["cloud_sandbox"].
UPDATE "agent_templates" SET "computers" = ARRAY["computer"] WHERE "computer" <> 'none';--> statement-breakpoint
UPDATE "agents" SET "computers" = ARRAY["computer"] WHERE "computer" <> 'none';--> statement-breakpoint
ALTER TABLE "agent_templates" DROP COLUMN "computer";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "computer";
