-- AlterTable: add building_id, backfill from building_name, then drop building_name
ALTER TABLE "customers" ADD COLUMN "building_id" TEXT;

UPDATE "customers" AS c
SET "building_id" = b."id"
FROM "buildings" AS b
WHERE b."name" = c."building_name"
  AND c."building_name" IS NOT NULL
  AND c."building_name" <> '';

ALTER TABLE "customers" DROP COLUMN "building_name";

CREATE INDEX "customers_building_id_idx" ON "customers"("building_id");

ALTER TABLE "customers"
ADD CONSTRAINT "customers_building_id_fkey"
FOREIGN KEY ("building_id") REFERENCES "buildings"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
