import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { addBulkScrapingJobs } from '@/lib/queue';
import { Platform, ScrapingJobData } from '@/lib/scraper/types';
import { getSupportedPlatforms } from '@/lib/scraper';

const refreshPricesSchema = z.object({
  platforms: z.array(z.string()).optional(),
  itemIds: z.array(z.string().uuid()).optional(),
});

// POST /api/prices/refresh - Refresh prices for items
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = refreshPricesSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { platforms, itemIds } = validation.data;

    // Get user's active platforms
    const userPlatforms = await prisma.userPlatform.findMany({
      where: {
        userId: session.user.id,
        isActive: true,
      },
    });

    // Determine which platforms to refresh
    const supportedPlatforms = getSupportedPlatforms();
    let platformsToRefresh: Platform[];

    if (platforms && platforms.length > 0) {
      platformsToRefresh = platforms.filter(
        (p): p is Platform =>
          supportedPlatforms.includes(p as Platform) &&
          userPlatforms.some((up) => up.platform === p)
      );
    } else {
      platformsToRefresh = userPlatforms
        .map((p) => p.platform)
        .filter((p): p is Platform => supportedPlatforms.includes(p as Platform));
    }

    if (platformsToRefresh.length === 0) {
      return NextResponse.json(
        { error: 'No supported platforms to refresh. Enable platforms in settings.' },
        { status: 400 }
      );
    }

    // Get items to refresh
    let items;
    if (itemIds && itemIds.length > 0) {
      items = await prisma.groceryItem.findMany({
        where: {
          id: { in: itemIds },
          userId: session.user.id,
          isActive: true,
        },
      });
    } else {
      items = await prisma.groceryItem.findMany({
        where: {
          userId: session.user.id,
          isActive: true,
        },
      });
    }

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'No active items to refresh' },
        { status: 400 }
      );
    }

    // Create scraping job record
    const scrapingJob = await prisma.scrapingJob.create({
      data: {
        userId: session.user.id,
        platform: platformsToRefresh.join(','),
        status: 'running',
        itemsTotal: items.length * platformsToRefresh.length,
        itemsProcessed: 0,
        startedAt: new Date(),
      },
    });

    // Queue jobs for each item and platform
    const jobsToQueue: Array<{
      data: ScrapingJobData;
      options?: { priority?: number; delay?: number };
    }> = [];

    for (const item of items) {
      for (const platform of platformsToRefresh) {
        jobsToQueue.push({
          data: {
            userId: session.user.id,
            itemId: item.id,
            itemName: item.name,
            platform,
          },
          options: {
            priority: 1, // Highest priority for user-triggered refresh
          },
        });
      }
    }

    await addBulkScrapingJobs(jobsToQueue);

    return NextResponse.json({
      success: true,
      jobId: scrapingJob.id,
      itemCount: items.length,
      platformCount: platformsToRefresh.length,
      totalJobs: jobsToQueue.length,
      message: `Refreshing prices for ${items.length} items across ${platformsToRefresh.length} platforms`,
    });
  } catch (error) {
    console.error('Error refreshing prices:', error);
    return NextResponse.json(
      { error: 'Failed to refresh prices' },
      { status: 500 }
    );
  }
}
