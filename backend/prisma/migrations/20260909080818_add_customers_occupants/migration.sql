-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "customer_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT '',
    "account_manager" TEXT NOT NULL DEFAULT '',
    "company_name_zh" TEXT NOT NULL DEFAULT '',
    "company_name_en" TEXT NOT NULL DEFAULT '',
    "business_reg_no" TEXT NOT NULL DEFAULT '',
    "business_nature" TEXT NOT NULL DEFAULT '',
    "user_name" TEXT NOT NULL DEFAULT '',
    "primary_contact" TEXT NOT NULL DEFAULT '',
    "whatsapp" TEXT NOT NULL DEFAULT '',
    "mobile_phone" TEXT NOT NULL DEFAULT '',
    "contact_phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "fax" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "id_card_no" TEXT NOT NULL DEFAULT '',
    "id_card_image" TEXT NOT NULL DEFAULT '',
    "business_reg_copy" TEXT NOT NULL DEFAULT '',
    "address_proof_copy" TEXT NOT NULL DEFAULT '',
    "remark" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "related_customer" TEXT NOT NULL DEFAULT '',
    "rented_rooms" TEXT NOT NULL DEFAULT '',
    "building_name" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT NOT NULL DEFAULT '',
    "updated_by" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occupants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customer_id" TEXT,
    "customer_code" TEXT NOT NULL DEFAULT '',
    "related_customer_name" TEXT NOT NULL DEFAULT '',
    "whatsapp" TEXT NOT NULL DEFAULT '',
    "mobile_phone" TEXT NOT NULL DEFAULT '',
    "contact_phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "fax" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "id_card_no" TEXT NOT NULL DEFAULT '',
    "id_card_image" TEXT NOT NULL DEFAULT '',
    "address_proof_copy" TEXT NOT NULL DEFAULT '',
    "remark" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT NOT NULL DEFAULT '',
    "updated_by" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "occupants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_customer_code_key" ON "customers"("customer_code");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE INDEX "customers_account_manager_idx" ON "customers"("account_manager");

-- CreateIndex
CREATE INDEX "occupants_customer_id_idx" ON "occupants"("customer_id");

-- CreateIndex
CREATE INDEX "occupants_customer_code_idx" ON "occupants"("customer_code");

-- CreateIndex
CREATE INDEX "occupants_name_idx" ON "occupants"("name");

-- AddForeignKey
ALTER TABLE "occupants" ADD CONSTRAINT "occupants_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
