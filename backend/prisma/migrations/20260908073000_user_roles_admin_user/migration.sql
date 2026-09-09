-- Rename role enum: staff → user (admin unchanged)

ALTER TYPE "UserRole" RENAME TO "UserRole_old";

CREATE TYPE "UserRole" AS ENUM ('admin', 'user');

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "UserRole"
  USING (
    CASE
      WHEN "role"::text = 'staff' THEN 'user'::"UserRole"
      WHEN "role"::text = 'admin' THEN 'admin'::"UserRole"
      ELSE 'user'::"UserRole"
    END
  );

ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user'::"UserRole";

DROP TYPE "UserRole_old";
