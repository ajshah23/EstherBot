import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { createScraper, ScrapingJobData, ScrapingJobResult } from '../lib/scraper';
import { QUEUE_NAMES } from '../lib/queue';

// Initialize Prisma
const prisma = new PrismaClient();

// Redis connection
const getRedisConnection = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
  });
};

// Track active scrapers for cleanup
const activeScrapers = new Map<string, ReturnType<typeof createScraper>>();

/**
 * Process a single scraping job
 */
async function processScrapingJob(
  job: Job<ScrapingJobData, ScrapingJobResult>
): Promise<ScrapingJobResult> {
  const { userId, itemId, itemName, platform, productMappingId, credentials } =
    job.data;

  console.log(
    `[Worker] Processing job ${job.id}: ${itemName} on ${platform}`
  );

  // Create scraper for this platform
  const scraper = createScraper(platform);
  const scraperId = `${job.id}-${platform}`;
  activeScrapers.set(scraperId, scraper);

  try {
    // Update job progress
    await job.updateProgress(10);

    // Initialize scraper
    await scraper.initialize();
    await job.updateProgress(20);

    // Fetch price
    const result = await scraper.fetchPrice(
      itemName,
      credentials
        ? {
            username: credentials.username,
            password: credentials.password,
            sessionData: credentials.sessionData,
          }
        : undefined
    );

    await job.updateProgress(80);

    // Save result to database if successful
    if (result.success && result.product) {
      await saveScrapingResult(userId, itemId, platform, result.product, productMappingId);
    }

    await job.updateProgress(100);

    console.log(
      `[Worker] Completed job ${job.id}: ${result.success ? 'success' : 'failed'}`
    );

    return {
      jobId: job.id || '',
      userId,
      itemId,
      platform,
      result,
    };
  } catch (error) {
    console.error(`[Worker] Job ${job.id} failed:`, error);
    throw error;
  } finally {
    // Cleanup scraper
    await scraper.cleanup();
    activeScrapers.delete(scraperId);
  }
}

/**
 * Save scraping result to database
 */
async function saveScrapingResult(
  userId: string,
  itemId: string,
  platform: string,
  product: {
    name: string;
    price: number | null;
    isAvailable: boolean;
    productId?: string;
    productUrl?: string;
    imageUrl?: string;
    brand?: string;
    size?: string;
  },
  productMappingId?: string
): Promise<void> {
  try {
    // Find existing price snapshot or create new one
    const existingSnapshot = await prisma.priceSnapshot.findFirst({
      where: {
        itemId,
        platform,
      },
      orderBy: { lastUpdated: 'desc' },
    });

    if (existingSnapshot) {
      // Update existing snapshot
      await prisma.priceSnapshot.update({
        where: { id: existingSnapshot.id },
        data: {
          price: product.price,
          isAvailable: product.isAvailable,
          source: 'automated',
          lastUpdated: new Date(),
          productMappingId,
        },
      });
    } else {
      // Create new snapshot
      await prisma.priceSnapshot.create({
        data: {
          itemId,
          platform,
          price: product.price,
          isAvailable: product.isAvailable,
          source: 'automated',
          productMappingId,
        },
      });
    }

    // Also record in price history if price exists
    if (product.price !== null) {
      await prisma.priceHistory.create({
        data: {
          itemId,
          platform,
          price: product.price,
        },
      });
    }

    // Update or create product mapping if we have product details
    if (product.productId || product.productUrl) {
      const existingMapping = await prisma.productMapping.findUnique({
        where: {
          itemId_platform: {
            itemId,
            platform,
          },
        },
      });

      if (existingMapping) {
        await prisma.productMapping.update({
          where: { id: existingMapping.id },
          data: {
            platformProductId: product.productId || existingMapping.platformProductId,
            platformProductUrl: product.productUrl || existingMapping.platformProductUrl,
            platformImageUrl: product.imageUrl || existingMapping.platformImageUrl,
            platformProductName: product.name || existingMapping.platformProductName,
            brandName: product.brand || existingMapping.brandName,
            size: product.size || existingMapping.size,
            lastVerified: new Date(),
            needsRematch: false,
          },
        });
      } else {
        // Get the user ID from the item
        const item = await prisma.groceryItem.findUnique({
          where: { id: itemId },
          select: { userId: true },
        });

        if (item) {
          await prisma.productMapping.create({
            data: {
              userId: item.userId,
              itemId,
              platform,
              platformProductId: product.productId,
              platformProductUrl: product.productUrl,
              platformImageUrl: product.imageUrl,
              platformProductName: product.name,
              brandName: product.brand,
              size: product.size,
              matchConfidence: 0.8, // Auto-matched
              userConfirmed: false,
              lastVerified: new Date(),
            },
          });
        }
      }
    }

    console.log(`[Worker] Saved price for ${itemId} on ${platform}: $${product.price}`);
  } catch (error) {
    console.error('[Worker] Error saving scraping result:', error);
  }
}

/**
 * Update scraping job status in database
 */
async function updateJobStatus(
  jobDbId: string,
  status: string,
  progress?: { processed: number; total: number },
  error?: string
): Promise<void> {
  try {
    await prisma.scrapingJob.update({
      where: { id: jobDbId },
      data: {
        status,
        itemsProcessed: progress?.processed,
        itemsTotal: progress?.total,
        errorMessage: error,
        ...(status === 'running' && !progress
          ? { startedAt: new Date() }
          : {}),
        ...(status === 'completed' || status === 'failed'
          ? { completedAt: new Date() }
          : {}),
      },
    });
  } catch (err) {
    console.error('[Worker] Error updating job status:', err);
  }
}

/**
 * Scheduled task: Update prices for all users
 */
async function scheduledPriceUpdate(): Promise<void> {
  console.log('[Scheduler] Starting scheduled price update...');

  try {
    // Get all users with active platforms
    const users = await prisma.user.findMany({
      include: {
        platforms: {
          where: { isActive: true },
        },
        items: {
          where: { isActive: true },
        },
      },
    });

    const { addBulkScrapingJobs } = await import('../lib/queue');

    for (const user of users) {
      if (user.items.length === 0 || user.platforms.length === 0) continue;

      const jobs: Array<{
        data: ScrapingJobData;
        options?: { priority?: number; delay?: number };
      }> = [];

      for (const item of user.items) {
        for (const platform of user.platforms) {
          jobs.push({
            data: {
              userId: user.id,
              itemId: item.id,
              itemName: item.name,
              platform: platform.platform as any,
            },
            options: {
              priority: 10, // Lower priority for scheduled jobs
            },
          });
        }
      }

      if (jobs.length > 0) {
        await addBulkScrapingJobs(jobs);
        console.log(
          `[Scheduler] Queued ${jobs.length} jobs for user ${user.id}`
        );
      }
    }

    console.log('[Scheduler] Scheduled price update complete');
  } catch (error) {
    console.error('[Scheduler] Error in scheduled price update:', error);
  }
}

/**
 * Create and start the worker
 */
function createWorker(): Worker<ScrapingJobData, ScrapingJobResult> {
  const worker = new Worker<ScrapingJobData, ScrapingJobResult>(
    QUEUE_NAMES.SCRAPING,
    processScrapingJob,
    {
      connection: getRedisConnection(),
      concurrency: 3, // Process up to 3 jobs concurrently
      limiter: {
        max: 10, // Max 10 jobs
        duration: 60000, // Per minute
      },
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[Worker] Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[Worker] Job ${job?.id} failed:`, error.message);
  });

  worker.on('error', (error) => {
    console.error('[Worker] Worker error:', error);
  });

  return worker;
}

/**
 * Main entry point for the worker
 */
async function main(): Promise<void> {
  console.log('[Worker] Starting scraping worker...');

  // Create worker
  const worker = createWorker();
  console.log('[Worker] Worker created and listening for jobs');

  // Schedule price updates (every 6 hours)
  cron.schedule('0 */6 * * *', () => {
    scheduledPriceUpdate();
  });
  console.log('[Scheduler] Scheduled price updates every 6 hours');

  // Schedule queue cleanup (daily at 3 AM)
  cron.schedule('0 3 * * *', async () => {
    const { cleanQueue } = await import('../lib/queue');
    await cleanQueue();
    console.log('[Scheduler] Queue cleanup completed');
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[Worker] Received ${signal}, shutting down...`);

    // Close worker
    await worker.close();

    // Cleanup any active scrapers
    for (const [id, scraper] of activeScrapers) {
      await scraper.cleanup();
      activeScrapers.delete(id);
    }

    // Close queue connections
    const { closeQueues } = await import('../lib/queue');
    await closeQueues();

    // Close database connection
    await prisma.$disconnect();

    console.log('[Worker] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Run the worker
main().catch((error) => {
  console.error('[Worker] Fatal error:', error);
  process.exit(1);
});
