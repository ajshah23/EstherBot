import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { addBulkScrapingJobs } from '@/lib/queue';
import { Platform, ScrapingJobData } from '@/lib/scraper/types';
import { isPlatformSupported } from '@/lib/scraper';

const startScrapingSchema = z.object({
  platforms: z.array(z.string()).min(1),
  itemIds: z.array(z.string().uuid()).optional(),
});

// POST /api/scraping/start - Start a scraping job
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = startScrapingSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { platforms, itemIds } = validation.data;

    // Validate platforms
    const validPlatforms = platforms.filter(isPlatformSupported);
    if (validPlatforms.length === 0) {
      return NextResponse.json(
        { error: 'No valid platforms specified' },
        { status: 400 }
      );
    }

    // Get items to scrape
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
      // Get all active items for the user
      items = await prisma.groceryItem.findMany({
        where: {
          userId: session.user.id,
          isActive: true,
        },
      });
    }

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'No items to scrape' },
        { status: 400 }
      );
    }

    // Create scraping job records in database
    const scrapingJobs = await Promise.all(
      validPlatforms.map(async (platform) => {
        return prisma.scrapingJob.create({
          data: {
            userId: session.user.id,
            platform,
            status: 'pending',
            itemsTotal: items.length,
            itemsProcessed: 0,
          },
        });
      })
    );

    // Queue scraping jobs
    const jobsToQueue: Array<{
      data: ScrapingJobData;
      options?: { priority?: number; delay?: number };
    }> = [];

    for (const item of items) {
      for (const platform of validPlatforms as Platform[]) {
        jobsToQueue.push({
          data: {
            userId: session.user.id,
            itemId: item.id,
            itemName: item.name,
            platform,
          },
          options: {
            priority: 5, // Higher priority for user-initiated jobs
          },
        });
      }
    }

    await addBulkScrapingJobs(jobsToQueue);

    // Update job status to running
    await Promise.all(
      scrapingJobs.map((job) =>
        prisma.scrapingJob.update({
          where: { id: job.id },
          data: {
            status: 'running',
            startedAt: new Date(),
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      jobIds: scrapingJobs.map((j) => j.id),
      itemCount: items.length,
      platformCount: validPlatforms.length,
      totalJobs: jobsToQueue.length,
    });
  } catch (error) {
    console.error('Error starting scraping job:', error);
    return NextResponse.json(
      { error: 'Failed to start scraping job' },
      { status: 500 }
    );
  }
}
