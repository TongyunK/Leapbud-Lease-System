-- 普通用户可访问的大厦；管理员不写入，视为可访问全部
CREATE TABLE "user_buildings" (
    "user_id" TEXT NOT NULL,
    "building_id" TEXT NOT NULL,

    CONSTRAINT "user_buildings_pkey" PRIMARY KEY ("user_id","building_id")
);

CREATE INDEX "user_buildings_building_id_idx" ON "user_buildings"("building_id");

ALTER TABLE "user_buildings" ADD CONSTRAINT "user_buildings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_buildings" ADD CONSTRAINT "user_buildings_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
