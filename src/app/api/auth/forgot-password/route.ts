import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendOTPEmail } from '@/lib/email';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
});

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    const { email } = result.data;

    // Always return success to avoid user enumeration
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ message: 'If that email exists, a code was sent.' });
    }

    // Invalidate any previous OTPs
    await prisma.passwordResetOTP.updateMany({
      where: { email, used: false },
      data: { used: true },
    });

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await prisma.passwordResetOTP.create({
      data: { email, otp, expiresAt },
    });

    await sendOTPEmail(email, otp, user.name ?? undefined);

    return NextResponse.json({ message: 'If that email exists, a code was sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}