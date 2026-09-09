-- CreateEnum
CREATE TYPE "RoomConfigType" AS ENUM ('size', 'window', 'ac');

-- CreateTable
CREATE TABLE "room_config_options" (
    "id" TEXT NOT NULL,
    "type" "RoomConfigType" NOT NULL,
    "label" TEXT NOT NULL,
    "min_sqft" DECIMAL(12,2),
    "max_sqft" DECIMAL(12,2),
    "brand" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_config_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_config_options_type_active_idx" ON "room_config_options"("type", "active");

-- CreateIndex
CREATE INDEX "room_config_options_type_sort_order_idx" ON "room_config_options"("type", "sort_order");
