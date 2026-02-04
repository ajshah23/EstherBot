'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2,
  ShoppingBag,
  CheckCircle2,
  AlertTriangle,
  TrendingDown,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, PLATFORMS, getPlatformColor } from '@/lib/utils';
import { optimizeCarts, OptimizationItem, OptimizationSettings } from '@/lib/optimize';

interface PriceSnapshot {
  platform: string;
  price: number | null;
  isAvailable: boolean;
}

interface GroceryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  isActive: boolean;
  priceSnapshots: PriceSnapshot[];
}

interface UserPlatform {
  platform: string;
  isActive: boolean;
  deliveryMinimum: number | null;
}

export default function OptimizePage() {
  const { data: items = [], isLoading: itemsLoading } = useQuery<GroceryItem[]>({
    queryKey: ['items'],
    queryFn: async () => {
      const res = await fetch('/api/items');
      if (!res.ok) throw new Error('Failed to fetch items');
      return res.json();
    },
  });

  const { data: platforms = [], isLoading: platformsLoading } = useQuery<UserPlatform[]>({
    queryKey: ['platforms'],
    queryFn: async () => {
      const res = await fetch('/api/user/platforms');
      if (!res.ok) throw new Error('Failed to fetch platforms');
      return res.json();
    },
  });

  const optimizationResult = useMemo(() => {
    const activeItems = items.filter((item) => item.isActive);

    // Convert items to optimization format
    const optimizationItems: OptimizationItem[] = activeItems.map((item) => {
      const prices: Record<string, number | null> = {};
      item.priceSnapshots.forEach((snapshot) => {
        if (snapshot.isAvailable) {
          prices[snapshot.platform] = snapshot.price;
        }
      });
      return {
        id: item.id,
        name: item.name,
        quantity: Number(item.quantity),
        prices,
      };
    });

    // Build settings from user platforms
    const settings: OptimizationSettings = {
      platforms: {},
    };

    platforms.forEach((p) => {
      const platformInfo = PLATFORMS.find((pl) => pl.id === p.platform);
      settings.platforms[p.platform] = {
        isActive: p.isActive,
        deliveryMinimum: Number(p.deliveryMinimum) || platformInfo?.defaultMinimum || 35,
      };
    });

    // If no platforms configured, use defaults
    if (Object.keys(settings.platforms).length === 0) {
      PLATFORMS.forEach((p) => {
        settings.platforms[p.id] = {
          isActive: true,
          deliveryMinimum: p.defaultMinimum,
        };
      });
    }

    return optimizeCarts(optimizationItems, settings);
  }, [items, platforms]);

  const isLoading = itemsLoading || platformsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeItems = items.filter((item) => item.isActive);
  const itemsWithPrices = activeItems.filter((item) =>
    item.priceSnapshots.some((p) => p.price !== null)
  );

  if (activeItems.length === 0) {
    return (
      <div className="container mx-auto px-4 py-6">
        <Card>
          <CardContent className="py-12 text-center">
            <ShoppingBag className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No items to optimize</h2>
            <p className="text-muted-foreground mb-4">
              Add items to your grocery list to get started
            </p>
            <Button asChild>
              <a href="/dashboard">Go to My List</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (itemsWithPrices.length === 0) {
    return (
      <div className="container mx-auto px-4 py-6">
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto text-yellow-600 mb-4" />
            <h2 className="text-xl font-semibold text-yellow-800 mb-2">
              No price data available
            </h2>
            <p className="text-yellow-700 mb-4">
              Add prices to your items in the Compare tab to enable optimization
            </p>
            <Button asChild variant="outline">
              <a href="/dashboard/compare">Go to Compare</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Optimized Carts</h1>
        <p className="text-muted-foreground">
          Items distributed across platforms for lowest cost
        </p>
      </div>

      {/* Summary Card */}
      <Card className="mb-6 border-green-200 bg-green-50">
        <CardContent className="py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div>
              <div className="text-3xl font-bold text-green-700">
                {formatCurrency(optimizationResult.totalCost)}
              </div>
              <div className="text-sm text-green-600">Total Cost</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-green-700">
                {formatCurrency(optimizationResult.estimatedSavings)}
              </div>
              <div className="text-sm text-green-600">Estimated Savings</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-green-700">
                {optimizationResult.carts.length}
              </div>
              <div className="text-sm text-green-600">Platforms</div>
            </div>
            <div>
              <div className="flex items-center justify-center">
                {optimizationResult.allMeetMinimum ? (
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                ) : (
                  <AlertTriangle className="w-8 h-8 text-yellow-600" />
                )}
              </div>
              <div className="text-sm text-green-600">
                {optimizationResult.allMeetMinimum
                  ? 'All meet minimum'
                  : 'Some below minimum'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Optimized Carts */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {optimizationResult.carts.map((cart) => {
          const platform = PLATFORMS.find((p) => p.id === cart.platform);
          return (
            <Card key={cart.platform}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: platform?.color }}
                    >
                      {platform?.name.charAt(0)}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{platform?.name}</CardTitle>
                      <CardDescription>
                        {cart.items.length} items
                      </CardDescription>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">
                      {formatCurrency(cart.subtotal)}
                    </div>
                    {cart.meetsMinimum ? (
                      <Badge variant="default" className="bg-green-600">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Free Delivery
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        ${(cart.deliveryMinimum - cart.subtotal).toFixed(2)} more needed
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Separator className="mb-4" />
                <ul className="space-y-2">
                  {cart.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="flex-1 truncate">
                        {item.name}
                        {item.quantity > 1 && (
                          <span className="text-muted-foreground"> x{item.quantity}</span>
                        )}
                      </span>
                      <span className="font-medium">
                        {formatCurrency(item.price)}
                      </span>
                    </li>
                  ))}
                </ul>
                <Separator className="my-4" />
                <div className="flex items-center justify-between">
                  <span className="font-medium">Subtotal</span>
                  <span className="text-lg font-bold">
                    {formatCurrency(cart.subtotal)}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Comparison to Single Platform */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5" />
            Comparison to Single Platform
          </CardTitle>
          <CardDescription>
            See how much you save vs. ordering everything from one platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(optimizationResult.singlePlatformCosts)
              .filter(([_, cost]) => cost > 0)
              .sort(([, a], [, b]) => a - b)
              .map(([platformId, cost]) => {
                const platform = PLATFORMS.find((p) => p.id === platformId);
                const savings = cost - optimizationResult.totalCost;
                return (
                  <div
                    key={platformId}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                        style={{ backgroundColor: platform?.color }}
                      >
                        {platform?.name.charAt(0)}
                      </div>
                      <span className="font-medium">{platform?.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatCurrency(cost)}</div>
                      {savings > 0 && (
                        <div className="text-sm text-green-600">
                          Save {formatCurrency(savings)} with optimization
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
