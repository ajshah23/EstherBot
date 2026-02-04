'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { PLATFORMS, formatCurrency, formatRelativeTime, getPlatformColor } from '@/lib/utils';

interface PriceSnapshot {
  id: string;
  platform: string;
  price: number | null;
  isAvailable: boolean;
  lastUpdated: string;
}

interface GroceryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: string | null;
  isActive: boolean;
  priceSnapshots: PriceSnapshot[];
}

export default function ComparePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedItem, setSelectedItem] = useState<GroceryItem | null>(null);
  const [manualPrice, setManualPrice] = useState({ platform: '', price: '' });

  const { data: items = [], isLoading } = useQuery<GroceryItem[]>({
    queryKey: ['items'],
    queryFn: async () => {
      const res = await fetch('/api/items');
      if (!res.ok) throw new Error('Failed to fetch items');
      return res.json();
    },
  });

  const updatePriceMutation = useMutation({
    mutationFn: async ({
      itemId,
      platform,
      price,
    }: {
      itemId: string;
      platform: string;
      price: number;
    }) => {
      const res = await fetch('/api/prices/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, platform, price }),
      });
      if (!res.ok) throw new Error('Failed to update price');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      setSelectedItem(null);
      setManualPrice({ platform: '', price: '' });
      toast({ title: 'Price updated', description: 'The price has been saved' });
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update price' });
    },
  });

  const activeItems = items.filter((item) => item.isActive);

  const getLowestPrice = (item: GroceryItem) => {
    const validPrices = item.priceSnapshots.filter(
      (p) => p.isAvailable && p.price !== null
    );
    if (validPrices.length === 0) return null;
    return validPrices.reduce((min, p) =>
      Number(p.price) < Number(min.price) ? p : min
    );
  };

  const getTotalByPlatform = () => {
    const totals: Record<string, number> = {};
    PLATFORMS.forEach((p) => (totals[p.id] = 0));

    activeItems.forEach((item) => {
      item.priceSnapshots.forEach((snapshot) => {
        if (snapshot.isAvailable && snapshot.price !== null) {
          totals[snapshot.platform] += Number(snapshot.price) * Number(item.quantity);
        }
      });
    });

    return totals;
  };

  const platformTotals = getTotalByPlatform();
  const itemsWithPrices = activeItems.filter(
    (item) => item.priceSnapshots.some((p) => p.price !== null)
  ).length;
  const itemsNeedingPrices = activeItems.length - itemsWithPrices;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Price Comparison</h1>
          <p className="text-muted-foreground">
            Compare prices across platforms
          </p>
        </div>
        <Button variant="outline" disabled>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh Prices
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {PLATFORMS.map((platform) => (
          <Card key={platform.id}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: platform.color }}
                />
                <span className="text-sm font-medium">{platform.name}</span>
              </div>
              <div className="text-2xl font-bold">
                {formatCurrency(platformTotals[platform.id])}
              </div>
              <p className="text-xs text-muted-foreground">
                Min ${platform.defaultMinimum} for free delivery
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Status Banner */}
      {itemsNeedingPrices > 0 && (
        <Card className="mb-6 border-yellow-200 bg-yellow-50">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800">
                {itemsNeedingPrices} items need price information
              </p>
              <p className="text-sm text-yellow-700">
                Click on an item to manually enter prices or wait for automatic sync
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items Price Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Item Prices</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-4 font-medium">Item</th>
                  {PLATFORMS.map((platform) => (
                    <th
                      key={platform.id}
                      className="text-center p-4 font-medium min-w-[100px]"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: platform.color }}
                        />
                        {platform.name.split(' ')[0]}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeItems.map((item) => {
                  const lowestPrice = getLowestPrice(item);
                  return (
                    <tr
                      key={item.id}
                      className="border-b hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedItem(item)}
                    >
                      <td className="p-4">
                        <div className="font-medium">{item.name}</div>
                        {item.quantity > 1 && (
                          <div className="text-sm text-muted-foreground">
                            x{item.quantity} {item.unit || ''}
                          </div>
                        )}
                      </td>
                      {PLATFORMS.map((platform) => {
                        const snapshot = item.priceSnapshots.find(
                          (p) => p.platform === platform.id
                        );
                        const isLowest =
                          lowestPrice &&
                          snapshot?.platform === lowestPrice.platform;
                        return (
                          <td key={platform.id} className="text-center p-4">
                            {snapshot && snapshot.price !== null ? (
                              <div className="flex flex-col items-center">
                                <span
                                  className={
                                    isLowest
                                      ? 'font-bold text-green-600'
                                      : ''
                                  }
                                >
                                  {formatCurrency(snapshot.price)}
                                </span>
                                {isLowest && (
                                  <Badge variant="default" className="mt-1 text-xs">
                                    Best
                                  </Badge>
                                )}
                              </div>
                            ) : snapshot && !snapshot.isAvailable ? (
                              <span className="text-muted-foreground text-sm">
                                N/A
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-sm">
                                -
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {activeItems.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Add items to your grocery list to compare prices
            </p>
          </CardContent>
        </Card>
      )}

      {/* Manual Price Entry Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Price - {selectedItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select
                value={manualPrice.platform}
                onValueChange={(value) =>
                  setManualPrice({ ...manualPrice, platform: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((platform) => (
                    <SelectItem key={platform.id} value={platform.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: platform.color }}
                        />
                        {platform.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Price</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="pl-7"
                  value={manualPrice.price}
                  onChange={(e) =>
                    setManualPrice({ ...manualPrice, price: e.target.value })
                  }
                />
              </div>
            </div>

            {/* Current Prices */}
            {selectedItem && selectedItem.priceSnapshots.length > 0 && (
              <div className="pt-4 border-t">
                <Label className="mb-2 block">Current Prices</Label>
                <div className="space-y-2">
                  {selectedItem.priceSnapshots
                    .filter((p) => p.price !== null)
                    .map((snapshot) => {
                      const platform = PLATFORMS.find(
                        (p) => p.id === snapshot.platform
                      );
                      return (
                        <div
                          key={snapshot.id}
                          className="flex items-center justify-between text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{
                                backgroundColor: getPlatformColor(snapshot.platform),
                              }}
                            />
                            {platform?.name}
                          </div>
                          <div className="flex items-center gap-2">
                            <span>{formatCurrency(snapshot.price)}</span>
                            <span className="text-muted-foreground text-xs">
                              {formatRelativeTime(snapshot.lastUpdated)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedItem(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedItem && manualPrice.platform && manualPrice.price) {
                  updatePriceMutation.mutate({
                    itemId: selectedItem.id,
                    platform: manualPrice.platform,
                    price: parseFloat(manualPrice.price),
                  });
                }
              }}
              disabled={
                !manualPrice.platform ||
                !manualPrice.price ||
                updatePriceMutation.isPending
              }
            >
              {updatePriceMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Save Price
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
