ALTER TABLE "notes" ADD COLUMN "owner_id" uuid;
ALTER TABLE "notes" ADD CONSTRAINT "notes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "notes_owner_id_created_at_id_idx" ON "notes" USING btree ("owner_id","created_at","id");