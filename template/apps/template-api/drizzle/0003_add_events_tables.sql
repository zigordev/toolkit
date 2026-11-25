CREATE TABLE "events_outbox" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_outbox_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"topic" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "events_handled" (
	"consumer" text NOT NULL,
	"event_id" uuid NOT NULL,
	"handled_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_handled_consumer_event_id_pk" PRIMARY KEY("consumer","event_id")
);

CREATE INDEX "events_outbox_created_at_idx" ON "events_outbox" USING btree ("created_at");
CREATE INDEX "events_handled_handled_at_idx" ON "events_handled" USING btree ("handled_at");