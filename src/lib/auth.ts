// lib/auth.ts
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

  await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  return token;
}

export async function getSession(token: string) {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session;
}

// Add this new function
export async function verifySession(token: string): Promise<string | null> {
  const session = await prisma.session.findUnique({
    where: { token },
    select: {
      userId: true,
      expiresAt: true,
    },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session.userId;
}

export async function deleteSession(token: string) {
  await prisma.session.delete({
    where: { token },
  });
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;

  if (!token) {
    return null;
  }

  const session = await getSession(token);
  return session?.user || null;
}
// Add this function to your existing lib/auth.ts
export async function requireAdminPassword() {
  const cookieStore = await cookies();
  const adminToken = cookieStore.get('admin_session')?.value;
  
  if (!adminToken) {
    throw new Error('Admin authentication required');
  }
  
  return true;
}
export async function requireAuth() {
  const user = await getCurrentUser();
  
  if (!user) {
    throw new Error('Unauthorized');
  }

  if (!user.emailVerified) {
    throw new Error('Email not verified');
  }

  return user;
}