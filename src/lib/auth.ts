import NextAuth, { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcrypt';
import prisma from './prisma';

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: 'Drona AI',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) return null;
                const user = await prisma.user.findUnique({ where: { email: credentials.email } });
                if (!user) return null;
                const isValid = await bcrypt.compare(credentials.password, user.password);
                if (!isValid) return null;
                return { id: user.id, name: user.name, email: user.email, role: user.role };
            },
        }),
    ],
    session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 },
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.role = (user as any).role;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                (session.user as { id: string; role: string }).id = token.id as string;
                (session.user as { id: string; role: string }).role = token.role as string;
            }
            return session;
        },
    },
    pages: { signIn: '/login' },
    secret: process.env.NEXTAUTH_SECRET,
};
