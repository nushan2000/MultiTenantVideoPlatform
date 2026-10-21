-- The GIN index on Video.tags is now declared in schema.prisma; the previous migration dropped the hand-made one.
CREATE INDEX IF NOT EXISTS "Video_tags_idx" ON "Video" USING GIN ("tags");
