-- Convert the shared household ledger into fully independent per-user
-- spaces. Existing rows are backfilled: records/transfers go to whoever
-- created them, everything else to the oldest (admin) user. On a fresh
-- database all tables are empty and the backfills are no-ops.

-- DropForeignKey
ALTER TABLE "Record" DROP CONSTRAINT "Record_createdById_fkey";
ALTER TABLE "Transfer" DROP CONSTRAINT "Transfer_createdById_fkey";

-- DropIndex
DROP INDEX "Category_name_type_key";
DROP INDEX "Record_date_idx";
DROP INDEX "Transfer_date_idx";

-- Account: add owner, backfill to oldest user
ALTER TABLE "Account" ADD COLUMN "userId" TEXT;
UPDATE "Account" SET "userId" = (SELECT "id" FROM "User" ORDER BY "createdAt" LIMIT 1);
ALTER TABLE "Account" ALTER COLUMN "userId" SET NOT NULL;

-- Category: add owner, backfill to oldest user
ALTER TABLE "Category" ADD COLUMN "userId" TEXT;
UPDATE "Category" SET "userId" = (SELECT "id" FROM "User" ORDER BY "createdAt" LIMIT 1);
ALTER TABLE "Category" ALTER COLUMN "userId" SET NOT NULL;

-- Record: owner = creator when known, else oldest user
ALTER TABLE "Record" ADD COLUMN "userId" TEXT;
UPDATE "Record" SET "userId" = COALESCE("createdById", (SELECT "id" FROM "User" ORDER BY "createdAt" LIMIT 1));
ALTER TABLE "Record" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Record" DROP COLUMN "createdById";

-- Transfer: owner = creator when known, else oldest user
ALTER TABLE "Transfer" ADD COLUMN "userId" TEXT;
UPDATE "Transfer" SET "userId" = COALESCE("createdById", (SELECT "id" FROM "User" ORDER BY "createdAt" LIMIT 1));
ALTER TABLE "Transfer" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Transfer" DROP COLUMN "createdById";

-- Settings: singleton row becomes the oldest user's preferences
ALTER TABLE "Settings" ADD COLUMN "userId" TEXT;
UPDATE "Settings" SET "userId" = (SELECT "id" FROM "User" ORDER BY "createdAt" LIMIT 1);
DELETE FROM "Settings" WHERE "userId" IS NULL;
ALTER TABLE "Settings" DROP CONSTRAINT "Settings_pkey";
ALTER TABLE "Settings" DROP COLUMN "id";
ALTER TABLE "Settings" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_pkey" PRIMARY KEY ("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE UNIQUE INDEX "Category_userId_name_type_key" ON "Category"("userId", "name", "type");
CREATE INDEX "Record_userId_date_idx" ON "Record"("userId", "date");
CREATE INDEX "Transfer_userId_date_idx" ON "Transfer"("userId", "date");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Record" ADD CONSTRAINT "Record_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
