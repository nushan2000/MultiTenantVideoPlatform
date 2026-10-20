-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "profile" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "captions" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "chapters" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "transcript" TEXT;

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "systemKey" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "inFooter" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "seo" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Page_tenantId_published_idx" ON "Page"("tenantId", "published");

-- CreateIndex
CREATE UNIQUE INDEX "Page_tenantId_slug_key" ON "Page"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Page_tenantId_systemKey_key" ON "Page"("tenantId", "systemKey");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security for the new tenant table (same policy as every other tenant table).
ALTER TABLE "Page" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Page" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Page"
  USING (app_tenant_matches("tenantId")) WITH CHECK (app_tenant_matches("tenantId"));

-- Tag lookups (/tag/<tag>)
CREATE INDEX "Video_tags_idx" ON "Video" USING GIN ("tags");
