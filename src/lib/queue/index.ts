import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { ScrapingJobData, ScrapingJobResult, Platform } from '../scraper/types';

// Redis connection configuration
const getRedisConnection = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
  });
};

// Queue names
export const QUEUE_NAMES = {
  SCRAPING: 'price-scraping',
  BULK_SCRAPING: 'bulk-price-scraping',
} as const;

// Create queues
let scrapingQueue: Queue<ScrapingJobData, ScrapingJobResult> | null = null;

export function getScrapingQueue(): Queue<ScrapingJobData, ScrapingJobResult> {
  if (!scrapingQueue) {
    scrapingQueue = new Queue<ScrapingJobData, ScrapingJobResult>(
      QUEUE_NAMES.SCRAPING,
      {
        connection: getRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000, // Start with 5 seconds
          },
          removeOnComplete: {
            count: 1000, // Keep last 1000 completed jobs
            age: 24 * 60 * 60, // Keep for 24 hours
          },
          removeOnFail: {
            count: 500, // Keep last 500 failed jobs
            age: 7 * 24 * 60 * 60, // Keep for 7 days
          },
        },
      }
    );
  }
  return scrapingQueue;
}

// Queue events for monitoring
let queueEvents: QueueEvents | null = null;

export function getQueueEvents(): QueueEvents {
  if (!queueEvents) {
    queueEvents = new QueueEvents(QUEUE_NAMES.SCRAPING, {
      connection: getRedisConnection(),
    });
  }
  return queueEvents;
}

/**
 * Add a single scraping job to the queue
 */
export async function addScrapingJob(
  data: ScrapingJobData,
  options?: {
    priority?: number;
    delay?: number;
    jobId?: string;
  }
): Promise<Job<ScrapingJobData, ScrapingJobResult>> {
  const queue = getScrapingQueue();
  return queue.add(`scrape-${data.platform}-${data.itemId}`, data, {
    priority: options?.priority,
    delay: options?.delay,
    jobId: options?.jobId,
  });
}

/**
 * Add multiple scraping jobs in bulk
 */
export async function addBulkScrapingJobs(
  jobs: Array<{
    data: ScrapingJobData;
    options?: { priority?: number; delay?: number };
  }>
): Promise<Job<ScrapingJobData, ScrapingJobResult>[]> {
  const queue = getScrapingQueue();
  const bulkJobs = jobs.map((job, index) => ({
    name: `scrape-${job.data.platform}-${job.data.itemId}`,
    data: job.data,
    opts: {
      priority: job.options?.priority,
      // Stagger jobs to avoid rate limiting
      delay: (job.options?.delay || 0) + index * 1000,
    },
  }));
  return queue.addBulk(bulkJobs);
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string): Promise<{
  id: string;
  state: string;
  progress: number;
  data: ScrapingJobData;
  result?: ScrapingJobResult;
  failedReason?: string;
} | null> {
  const queue = getScrapingQueue();
  const job = await queue.getJob(jobId);

  if (!job) return null;

  const state = await job.getState();

  return {
    id: job.id || jobId,
    state,
    progress: job.progress as number,
    data: job.data,
    result: job.returnvalue,
    failedReason: job.failedReason,
  };
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = getScrapingQueue();
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Get recent jobs
 */
export async function getRecentJobs(
  status: 'completed' | 'failed' | 'active' | 'waiting' | 'delayed',
  start = 0,
  end = 20
): Promise<Job<ScrapingJobData, ScrapingJobResult>[]> {
  const queue = getScrapingQueue();

  switch (status) {
    case 'completed':
      return queue.getCompleted(start, end);
    case 'failed':
      return queue.getFailed(start, end);
    case 'active':
      return queue.getActive(start, end);
    case 'waiting':
      return queue.getWaiting(start, end);
    case 'delayed':
      return queue.getDelayed(start, end);
    default:
      return [];
  }
}

/**
 * Cancel a job
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  const queue = getScrapingQueue();
  const job = await queue.getJob(jobId);

  if (!job) return false;

  const state = await job.getState();
  if (state === 'waiting' || state === 'delayed') {
    await job.remove();
    return true;
  }

  return false;
}

/**
 * Clean up old jobs
 */
export async function cleanQueue(
  grace: number = 24 * 60 * 60 * 1000 // 24 hours
): Promise<void> {
  const queue = getScrapingQueue();
  await queue.clean(grace, 1000, 'completed');
  await queue.clean(grace * 7, 500, 'failed');
}

/**
 * Close queue connections (for graceful shutdown)
 */
export async function closeQueues(): Promise<void> {
  if (scrapingQueue) {
    await scrapingQueue.close();
    scrapingQueue = null;
  }
  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
  }
}
