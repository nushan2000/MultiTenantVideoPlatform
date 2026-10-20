-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "seo" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "seo" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "seo" JSONB NOT NULL DEFAULT '{}';
