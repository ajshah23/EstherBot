import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getQueueStats } from '@/lib/queue';

// GET /api/scraping/jobs - Get recent scraping jobs for the user
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status');

    // Get recent jobs from database
    const jobs = await prisma.scrapingJob.findMany({
      where: {
        userId: session.user.id,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 50),
    });

    // Get queue stats
    let queueStats = null;
    try {
      queueStats = await getQueueStats();
    } catch {
      // Redis might not be available
      console.log('Could not fetch queue stats (Redis may be unavailable)');
    }

    return NextResponse.json({
      jobs,
      queueStats,
    });
  } catch (error) {
    console.error('Error fetching scraping jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scraping jobs' },
      { status: 500 }
    );
  }
}
