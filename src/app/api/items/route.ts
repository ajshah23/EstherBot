import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

const createItemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  quantity: z.number().positive().default(1),
  unit: z.string().optional(),
  category: z.string().optional(),
  notes: z.string().optional(),
});

// GET /api/items - Get all items for the current user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const items = await prisma.groceryItem.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        priceSnapshots: {
          orderBy: { lastUpdated: 'desc' },
          distinct: ['platform'],
        },
      },
      orderBy: [
        { category: 'asc' },
        { name: 'asc' },
      ],
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch items' },
      { status: 500 }
    );
  }
}

// POST /api/items - Create a new item
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = createItemSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { name, quantity, unit, category, notes } = validation.data;

    const item = await prisma.groceryItem.create({
      data: {
        userId: session.user.id,
        name,
        quantity,
        unit,
        category,
        notes,
        isActive: true,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('Error creating item:', error);
    return NextResponse.json(
      { error: 'Failed to create item' },
      { status: 500 }
    );
  }
}
