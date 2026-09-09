-- 房间状态改为仅四种：闲置中 / 签约中 / 租赁中 / 退租中
CREATE TYPE "RoomStatus_new" AS ENUM ('idle', 'signing', 'leased', 'terminating');

ALTER TABLE "rooms" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "rooms"
  ALTER COLUMN "status" TYPE "RoomStatus_new"
  USING (
    CASE "status"::text
      WHEN 'available' THEN 'idle'::"RoomStatus_new"
      WHEN 'reserved' THEN 'signing'::"RoomStatus_new"
      WHEN 'occupied' THEN 'leased'::"RoomStatus_new"
      WHEN 'maintenance' THEN 'idle'::"RoomStatus_new"
      ELSE 'idle'::"RoomStatus_new"
    END
  );

DROP TYPE "RoomStatus";
ALTER TYPE "RoomStatus_new" RENAME TO "RoomStatus";

ALTER TABLE "rooms" ALTER COLUMN "status" SET DEFAULT 'idle'::"RoomStatus";

COMMENT ON TYPE "RoomStatus" IS '房间状态：idle=闲置中，signing=签约中，leased=租赁中，terminating=退租中';
COMMENT ON COLUMN "rooms"."status" IS '房间状态：idle=闲置中，signing=签约中，leased=租赁中，terminating=退租中';
