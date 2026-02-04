'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  Zap,
  AlertTriangle,
  Play,
  Pause,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { PLATFORMS } from '@/lib/utils';

interface ScrapingJob {
  id: string;
  platform: string;
  status: string;
  itemsProcessed: number;
  itemsTotal: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

interface JobsResponse {
  jobs: ScrapingJob[];
  queueStats: QueueStats | null;
}

export default function AutomationPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading } = useQuery<JobsResponse>({
    queryKey: ['scraping-jobs'],
    queryFn: async () => {
      const res = await fetch('/api/scraping/jobs?limit=20');
      if (!res.ok) throw new Error('Failed to fetch jobs');
      return res.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const refreshMutation = useMutation({
    mutationFn: async (platforms?: string[]) => {
      const res = await fetch('/api/prices/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platforms }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to refresh prices');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Price refresh started',
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['scraping-jobs'] });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to start refresh',
        variant: 'destructive',
      });
    },
  });

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    await refreshMutation.mutateAsync(undefined);
    setIsRefreshing(false);
  };

  const handleRefreshPlatform = async (platform: string) => {
    await refreshMutation.mutateAsync([platform]);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      default:
        return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      completed: 'default',
      running: 'secondary',
      pending: 'outline',
      failed: 'destructive',
    };
    return (
      <Badge variant={variants[status] || 'outline'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getTimeAgo = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const jobs = data?.jobs || [];
  const queueStats = data?.queueStats;

  // Get last sync time
  const lastCompletedJob = jobs.find((j) => j.status === 'completed');
  const lastSyncTime = lastCompletedJob?.completedAt;

  // Active jobs
  const activeJobs = jobs.filter(
    (j) => j.status === 'running' || j.status === 'pending'
  );

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Automation Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor and control price scraping
          </p>
        </div>
        <Button
          onClick={handleRefreshAll}
          disabled={isRefreshing || refreshMutation.isPending}
        >
          {isRefreshing || refreshMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Refresh All Prices
        </Button>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {lastSyncTime ? getTimeAgo(lastSyncTime) : 'Never'}
                </div>
                <div className="text-sm text-muted-foreground">Last Sync</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Activity className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{activeJobs.length}</div>
                <div className="text-sm text-muted-foreground">Active Jobs</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {queueStats && (
          <>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <Clock className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">
                      {queueStats.waiting + queueStats.delayed}
                    </div>
                    <div className="text-sm text-muted-foreground">Queued</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Zap className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">
                      {queueStats.completed}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Completed (24h)
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Platform Quick Actions */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Quick Refresh by Platform</CardTitle>
          <CardDescription>
            Refresh prices for a specific platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {PLATFORMS.map((platform) => (
              <Button
                key={platform.id}
                variant="outline"
                size="sm"
                onClick={() => handleRefreshPlatform(platform.id)}
                disabled={refreshMutation.isPending}
                className="flex items-center gap-2"
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: platform.color }}
                />
                {platform.name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700">
              <Activity className="w-5 h-5" />
              Active Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activeJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 bg-white rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(job.status)}
                    <div>
                      <div className="font-medium capitalize">
                        {job.platform.split(',').join(', ')}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Started {formatTimestamp(job.startedAt)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">
                      {job.itemsProcessed} / {job.itemsTotal || '?'}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      items processed
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Jobs */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Jobs</CardTitle>
          <CardDescription>History of scraping jobs</CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No scraping jobs yet</p>
              <p className="text-sm">
                Click &quot;Refresh All Prices&quot; to start
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.slice(0, 10).map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(job.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">
                          {job.platform.split(',').join(', ')}
                        </span>
                        {getStatusBadge(job.status)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatTimestamp(job.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {job.status === 'completed' && (
                      <div className="text-sm text-green-600">
                        {job.itemsProcessed} items
                      </div>
                    )}
                    {job.status === 'failed' && job.errorMessage && (
                      <div className="text-sm text-red-600 max-w-[200px] truncate">
                        {job.errorMessage}
                      </div>
                    )}
                    {job.status === 'running' && (
                      <div className="text-sm text-blue-600">
                        {job.itemsProcessed} / {job.itemsTotal || '?'}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="mt-6">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">
                About Automated Price Fetching
              </p>
              <p className="mb-2">
                Prices are automatically fetched every 6 hours when the worker
                service is running. For development, you can manually trigger
                price refreshes using the buttons above.
              </p>
              <p>
                Note: Some platforms may require login credentials to be
                configured in Settings for accurate pricing.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
