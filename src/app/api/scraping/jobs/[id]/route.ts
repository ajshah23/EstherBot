import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/scraping/jobs/[id] - Get a specific scraping job
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const job = await prisma.scrapingJob.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(job);
  } catch (error) {
    console.error('Error fetching scraping job:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scraping job' },
      { status: 500 }
    );
  }
}

// DELETE /api/scraping/jobs/[id] - Cancel a scraping job
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const job = await prisma.scrapingJob.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Only allow canceling pending or running jobs
    if (job.status !== 'pending' && job.status !== 'running') {
      return NextResponse.json(
        { error: 'Job cannot be cancelled' },
        { status: 400 }
      );
    }

    // Update job status
    await prisma.scrapingJob.update({
      where: { id },
      data: {
        status: 'failed',
        errorMessage: 'Cancelled by user',
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ message: 'Job cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling scraping job:', error);
    return NextResponse.json(
      { error: 'Failed to cancel scraping job' },
      { status: 500 }
    );
  }
}
