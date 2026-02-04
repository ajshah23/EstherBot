import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

const updatePlatformsSchema = z.object({
  platforms: z.array(
    z.object({
      platform: z.string(),
      isActive: z.boolean(),
      deliveryMinimum: z.number().nonnegative(),
    })
  ),
});

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = updatePlatformsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { platforms } = validation.data;

    // Update each platform setting
    const updatePromises = platforms.map((platform) =>
      prisma.userPlatform.upsert({
        where: {
          userId_platform: {
            userId: session.user.id,
            platform: platform.platform,
          },
        },
        update: {
          isActive: platform.isActive,
          deliveryMinimum: platform.deliveryMinimum,
        },
        create: {
          userId: session.user.id,
          platform: platform.platform,
          isActive: platform.isActive,
          deliveryMinimum: platform.deliveryMinimum,
        },
      })
    );

    await Promise.all(updatePromises);

    return NextResponse.json({ message: 'Platforms updated successfully' });
  } catch (error) {
    console.error('Error updating platforms:', error);
    return NextResponse.json(
      { error: 'Failed to update platforms' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const platforms = await prisma.userPlatform.findMany({
      where: { userId: session.user.id },
    });

    return NextResponse.json(platforms);
  } catch (error) {
    console.error('Error fetching platforms:', error);
    return NextResponse.json(
      { error: 'Failed to fetch platforms' },
      { status: 500 }
    );
  }
}
