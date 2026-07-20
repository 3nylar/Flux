import NextAuth from "next-auth";
import Email from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

/// Auth for the Flux reference app is deliberately simple: email magic
/// link only. Unlike Bitpool/Auctra, there's no wallet to connect here --
/// Flux pays *out* to a receiver's Lightning node from the platform's own
/// wallet; the signed-in user is just an account holder starting and
/// stopping metered sessions, the same as a customer of any ordinary SaaS
/// product. A NextAuth `User.id` becomes the `external_user_id` sent to
/// the Flux API on every session, which is how "my history" filtering
/// works (see app/api/flux/*).
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    Email({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT || 587),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM || "Flux <no-reply@example.com>",
      maxAge: 15 * 60,
    }),
  ],
  pages: {
    signIn: "/login",
    verifyRequest: "/login/check-email",
    error: "/login",
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        (session.user as { id?: string }).id = user.id;
      }
      return session;
    },
  },
  secret: process.env.AUTH_SECRET,
});
