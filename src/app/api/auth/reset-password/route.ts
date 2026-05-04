import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth'; // your existing hash util
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { email, otp, newPassword } = result.data;

    const record = await prisma.passwordResetOTP.findFirst({
      where: {
        email,
        otp,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!record) {
      return NextResponse.json(
        { error: 'Invalid or expired code.' },
        { status: 400 }
      );
    }

    const hashed = await hashPassword(newPassword);

    // Update password and mark OTP used in a transaction
    await prisma.$transaction([
      prisma.user.update({
        where: { email },
        data: { password: hashed },
      }),
      prisma.passwordResetOTP.update({
        where: { id: record.id },
        data: { used: true },
      }),
    ]);

    return NextResponse.json({ message: 'Password reset successfully.' });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}