-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('available', 'occupied', 'maintenance', 'reserved');

-- CreateTable
CREATE TABLE "buildings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "address_en" TEXT NOT NULL DEFAULT '',
    "manager" TEXT NOT NULL DEFAULT '',
    "manager_phone" TEXT NOT NULL DEFAULT '',
    "agreement_template" TEXT,
    "agreement_logo" TEXT,
    "api_template_suffix" TEXT,
    "logo2" TEXT,
    "email" TEXT NOT NULL DEFAULT '',
    "working_hours" TEXT NOT NULL DEFAULT '',
    "invoice_template" TEXT,
    "invoice_logo" TEXT,
    "fps_id" TEXT,
    "bank_account_holder" TEXT,
    "bank_account" TEXT,
    "cheque_payment_by" TEXT,
    "payment_advice" TEXT,
    "receipt_template" TEXT,
    "receipt_top_logo" TEXT,
    "receipt_left_logo" TEXT,
    "receipt_right_logo" TEXT,
    "building_config" TEXT,
    "use_wba_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "room_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "room_type" TEXT NOT NULL DEFAULT '',
    "building_id" TEXT NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'available',
    "serial_no" TEXT NOT NULL DEFAULT '',
    "monthly_rent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "daily_rent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "hourly_rent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "size_sqft" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "image1" TEXT,
    "image2" TEXT,
    "image3" TEXT,
    "description" TEXT,
    "remark" TEXT,
    "room_size_config" TEXT,
    "window_config" TEXT,
    "ac_config" TEXT,
    "latest_contract" TEXT,
    "contract_records" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by" TEXT NOT NULL DEFAULT '',
    "sublease_mark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rooms_room_code_key" ON "rooms"("room_code");

-- CreateIndex
CREATE INDEX "rooms_building_id_idx" ON "rooms"("building_id");

-- CreateIndex
CREATE INDEX "rooms_status_idx" ON "rooms"("status");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
