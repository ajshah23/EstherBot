import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

const manualPriceSchema = z.object({
  itemId: z.string().uuid(),
  platform: z.string(),
  price: z.number().nonnegative(),
  isAvailable: z.boolean().default(true),
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = manualPriceSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { itemId, platform, price, isAvailable } = validation.data;

    // Verify the item belongs to the user
    const item = await prisma.groceryItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (item.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check if there's an existing price snapshot for this item/platform
    const existingSnapshot = await prisma.priceSnapshot.findFirst({
      where: {
        itemId,
        platform,
      },
      orderBy: { lastUpdated: 'desc' },
    });

    let snapshot;

    if (existingSnapshot) {
      // Update existing snapshot
      snapshot = await prisma.priceSnapshot.update({
        where: { id: existingSnapshot.id },
        data: {
          price,
          isAvailable,
          source: 'manual',
          lastUpdated: new Date(),
        },
      });
    } else {
      // Create new snapshot
      snapshot = await prisma.priceSnapshot.create({
        data: {
          itemId,
          platform,
          price,
          isAvailable,
          source: 'manual',
        },
      });
    }

    // Also record in price history
    await prisma.priceHistory.create({
      data: {
        itemId,
        platform,
        price,
      },
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('Error updating price:', error);
    return NextResponse.json(
      { error: 'Failed to update price' },
      { status: 500 }
    );
  }
}
