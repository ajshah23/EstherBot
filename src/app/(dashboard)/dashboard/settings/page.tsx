'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { PLATFORMS, getPlatformColor } from '@/lib/utils';

interface UserPlatform {
  id: string;
  platform: string;
  isActive: boolean;
  deliveryMinimum: number | null;
  storeId: string | null;
  storeName: string | null;
}

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  platforms: UserPlatform[];
}

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [platformSettings, setPlatformSettings] = useState<Record<string, { isActive: boolean; deliveryMinimum: number }>>({});

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await fetch('/api/user/profile');
      if (!res.ok) throw new Error('Failed to fetch profile');
      return res.json();
    },
  });

  useEffect(() => {
    if (profile?.platforms) {
      const settings: Record<string, { isActive: boolean; deliveryMinimum: number }> = {};
      profile.platforms.forEach((p) => {
        settings[p.platform] = {
          isActive: p.isActive,
          deliveryMinimum: Number(p.deliveryMinimum) || PLATFORMS.find((pl) => pl.id === p.platform)?.defaultMinimum || 35,
        };
      });
      setPlatformSettings(settings);
    }
  }, [profile]);

  const updatePlatformMutation = useMutation({
    mutationFn: async (data: { platforms: Array<{ platform: string; isActive: boolean; deliveryMinimum: number }> }) => {
      const res = await fetch('/api/user/platforms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update platforms');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast({ title: 'Settings saved', description: 'Your platform settings have been updated' });
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to save settings' });
    },
  });

  const handleSave = () => {
    const platforms = Object.entries(platformSettings).map(([platform, settings]) => ({
      platform,
      isActive: settings.isActive,
      deliveryMinimum: settings.deliveryMinimum,
    }));
    updatePlatformMutation.mutate({ platforms });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure your delivery platforms and preferences
        </p>
      </div>

      {/* Account Info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={profile?.email || ''} disabled />
          </div>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={profile?.name || ''} disabled />
          </div>
        </CardContent>
      </Card>

      {/* Platform Settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Delivery Platforms</CardTitle>
          <CardDescription>
            Enable platforms and set delivery minimums for free delivery
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {PLATFORMS.map((platform, index) => {
            const settings = platformSettings[platform.id] || {
              isActive: true,
              deliveryMinimum: platform.defaultMinimum,
            };
            return (
              <div key={platform.id}>
                {index > 0 && <Separator className="mb-6" />}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: platform.color }}
                    >
                      {platform.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-medium">{platform.name}</div>
                      <div className="text-sm text-muted-foreground">
                        Default minimum: ${platform.defaultMinimum}
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={settings.isActive}
                    onCheckedChange={(checked) =>
                      setPlatformSettings({
                        ...platformSettings,
                        [platform.id]: { ...settings, isActive: checked },
                      })
                    }
                  />
                </div>
                {settings.isActive && (
                  <div className="mt-4 ml-13 space-y-2">
                    <Label htmlFor={`minimum-${platform.id}`}>
                      Free Delivery Minimum ($)
                    </Label>
                    <Input
                      id={`minimum-${platform.id}`}
                      type="number"
                      min={0}
                      step={1}
                      value={settings.deliveryMinimum}
                      onChange={(e) =>
                        setPlatformSettings({
                          ...platformSettings,
                          [platform.id]: {
                            ...settings,
                            deliveryMinimum: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="max-w-[150px]"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={updatePlatformMutation.isPending}
        >
          {updatePlatformMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Settings
        </Button>
      </div>

      {/* Info Banner */}
      <Card className="mt-6 border-blue-200 bg-blue-50">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-800">
                Automated Price Fetching
              </p>
              <p className="text-sm text-blue-700 mt-1">
                Automatic price fetching from platforms will be available in a future update.
                For now, you can manually enter prices in the Compare tab.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
