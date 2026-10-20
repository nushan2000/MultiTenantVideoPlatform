import { z } from "zod";
import { getUser } from "@/lib/access";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/ingest/types";
import { renderMarkdown } from "@/lib/pages/markdown";

// POST /api/pages/preview: exactly what the storefront will render (same sanitiser), for the editor's live preview
export const POST = route(async (req) => {
  if (!(await getUser())) throw new HttpError(401, "Please sign in", "unauthenticated");
  const { content } = z.object({ content: z.string().max(60_000) }).parse(await req.json());
  return { html: renderMarkdown(content) };
});
