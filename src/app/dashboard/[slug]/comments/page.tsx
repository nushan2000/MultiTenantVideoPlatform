import type { Metadata } from "next";
import Link from "next/link";
import { requireTenant } from "@/lib/access";
import { Card } from "@/components/ui";
import { parseFeatures } from "@/lib/theme";
import Moderation, { type CommentRow } from "./Moderation";

export const metadata: Metadata = { title: "Comments" };

export default async function CommentsTab({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await requireTenant(slug);
  const features = parseFeatures(a.tenant.features);
  const rows = await a.db.comment.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    include: { video: { select: { id: true, title: true } } },
  });
  const dto: CommentRow[] = rows.map((c) => ({ id: c.id, author: c.authorName, body: c.body, status: c.status, createdAt: c.createdAt.toISOString(), videoTitle: c.video.title }));
  return (
    <>
      {!features.comments && (
        <Card>
          <p className="text-sm text-amber-900">
            Comments are turned off, so visitors can&apos;t post. Turn them on in <Link className="underline" href={`/dashboard/${slug}/settings`}>Settings → Features</Link>. Existing comments are kept.
          </p>
        </Card>
      )}
      <Card title="Moderation">
        <p className="mb-3 text-sm text-neutral-600">
          {features.commentsAutoApprove ? "New comments are published immediately. Hide or delete anything that does not belong." : "New comments wait here until you approve them."}
          {" "}Visitors are anonymous; we only keep a one-way hash of their address to limit spam.
        </p>
        <Moderation initial={dto} canModerate />
      </Card>
    </>
  );
}
