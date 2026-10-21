import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { platformDb } from "@/lib/db/client";
import { rateLimit } from "@/lib/rate-limit";

let dummy: string | undefined;
const dummyHash = () => (dummy ??= bcrypt.hashSync("not-a-real-password", 12));

const credsSchema = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1).max(200) });

// Cookies are host-scoped by default (no Domain attribute), and the dashboard only lives on the platform host,
// so a session never reaches tenant storefronts or custom domains.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        // Throttle brute force per account (and a per-IP limit is applied in the login action).
        await rateLimit(`login:${email}`, 10, 15 * 60);
        const user = await platformDb.user.findUnique({ where: { email } });
        // Compare against a dummy hash when the user doesn't exist so timing doesn't reveal accounts.
        const hash = user?.passwordHash ?? dummyHash();
        const ok = await bcrypt.compare(password, hash);
        if (!user || !ok || user.suspendedAt) return null;
        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid) (session.user as { id?: string }).id = token.uid as string;
      return session;
    },
  },
});
