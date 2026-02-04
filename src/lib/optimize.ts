import { PLATFORMS } from './utils';

export interface OptimizationItem {
  id: string;
  name: string;
  quantity: number;
  prices: Record<string, number | null>; // platform -> price
}

export interface OptimizationSettings {
  platforms: Record<string, { isActive: boolean; deliveryMinimum: number }>;
}

export interface OptimizedCart {
  platform: string;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    price: number;
  }>;
  subtotal: number;
  meetsMinimum: boolean;
  deliveryMinimum: number;
}

export interface OptimizationResult {
  carts: OptimizedCart[];
  totalCost: number;
  singlePlatformCosts: Record<string, number>;
  estimatedSavings: number;
  allMeetMinimum: boolean;
}

/**
 * Greedy cart optimization algorithm
 *
 * Strategy:
 * 1. For each item, identify the cheapest available platform
 * 2. Assign items to their cheapest platforms
 * 3. Check if each cart meets delivery minimum
 * 4. If a cart doesn't meet minimum, try to shift items from other carts
 * 5. Calculate total savings vs. ordering all from single platforms
 */
export function optimizeCarts(
  items: OptimizationItem[],
  settings: OptimizationSettings
): OptimizationResult {
  const activePlatforms = Object.entries(settings.platforms)
    .filter(([_, s]) => s.isActive)
    .map(([id, s]) => ({ id, deliveryMinimum: s.deliveryMinimum }));

  if (activePlatforms.length === 0) {
    return {
      carts: [],
      totalCost: 0,
      singlePlatformCosts: {},
      estimatedSavings: 0,
      allMeetMinimum: true,
    };
  }

  // Initialize carts
  const carts: Record<string, OptimizedCart> = {};
  activePlatforms.forEach((p) => {
    carts[p.id] = {
      platform: p.id,
      items: [],
      subtotal: 0,
      meetsMinimum: false,
      deliveryMinimum: p.deliveryMinimum,
    };
  });

  // Step 1: Assign each item to the cheapest platform
  const itemAssignments: Array<{
    item: OptimizationItem;
    platform: string;
    price: number;
  }> = [];

  items.forEach((item) => {
    let cheapestPlatform: string | null = null;
    let cheapestPrice = Infinity;

    activePlatforms.forEach((p) => {
      const price = item.prices[p.id];
      if (price !== null && price !== undefined && price < cheapestPrice) {
        cheapestPrice = price;
        cheapestPlatform = p.id;
      }
    });

    if (cheapestPlatform !== null) {
      itemAssignments.push({
        item,
        platform: cheapestPlatform,
        price: cheapestPrice,
      });
    }
  });

  // Add items to carts
  itemAssignments.forEach(({ item, platform, price }) => {
    const totalPrice = price * item.quantity;
    carts[platform].items.push({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      price: totalPrice,
    });
    carts[platform].subtotal += totalPrice;
  });

  // Step 2: Check minimums and update status
  Object.values(carts).forEach((cart) => {
    cart.meetsMinimum = cart.subtotal >= cart.deliveryMinimum || cart.items.length === 0;
  });

  // Step 3: Try to consolidate carts that don't meet minimum
  const cartsNotMeetingMinimum = Object.values(carts).filter(
    (c) => c.items.length > 0 && !c.meetsMinimum
  );

  cartsNotMeetingMinimum.forEach((cart) => {
    const amountNeeded = cart.deliveryMinimum - cart.subtotal;

    // Try to move items from other carts to this one
    const otherCarts = Object.values(carts).filter(
      (c) => c.platform !== cart.platform && c.items.length > 0
    );

    for (const otherCart of otherCarts) {
      if (cart.subtotal >= cart.deliveryMinimum) break;

      // Find items in other cart that could be moved
      for (let i = otherCart.items.length - 1; i >= 0; i--) {
        const item = otherCart.items[i];
        const originalItem = items.find((it) => it.id === item.id);

        if (!originalItem) continue;

        const priceOnThisCart = originalItem.prices[cart.platform];

        // Only move if the item is available on this platform
        if (priceOnThisCart !== null && priceOnThisCart !== undefined) {
          const newPrice = priceOnThisCart * originalItem.quantity;
          const priceDifference = newPrice - item.price;

          // Move item if:
          // 1. It helps meet the minimum AND
          // 2. Price increase is reasonable (less than $5 extra)
          if (priceDifference <= 5) {
            // Remove from other cart
            otherCart.items.splice(i, 1);
            otherCart.subtotal -= item.price;

            // Add to this cart
            cart.items.push({
              ...item,
              price: newPrice,
            });
            cart.subtotal += newPrice;

            // Recalculate minimums
            cart.meetsMinimum = cart.subtotal >= cart.deliveryMinimum;
            otherCart.meetsMinimum =
              otherCart.subtotal >= otherCart.deliveryMinimum ||
              otherCart.items.length === 0;

            if (cart.meetsMinimum) break;
          }
        }
      }
    }
  });

  // Calculate total cost
  const totalCost = Object.values(carts).reduce(
    (sum, cart) => sum + cart.subtotal,
    0
  );

  // Calculate single platform costs for comparison
  const singlePlatformCosts: Record<string, number> = {};
  activePlatforms.forEach((p) => {
    let platformTotal = 0;
    items.forEach((item) => {
      const price = item.prices[p.id];
      if (price !== null && price !== undefined) {
        platformTotal += price * item.quantity;
      }
    });
    singlePlatformCosts[p.id] = platformTotal;
  });

  // Calculate savings (vs cheapest single platform)
  const cheapestSinglePlatform = Math.min(
    ...Object.values(singlePlatformCosts).filter((v) => v > 0)
  );
  const estimatedSavings = Math.max(0, cheapestSinglePlatform - totalCost);

  // Check if all carts meet minimum
  const allMeetMinimum = Object.values(carts)
    .filter((c) => c.items.length > 0)
    .every((c) => c.meetsMinimum);

  // Convert to array and filter empty carts
  const resultCarts = Object.values(carts).filter((c) => c.items.length > 0);

  return {
    carts: resultCarts,
    totalCost,
    singlePlatformCosts,
    estimatedSavings,
    allMeetMinimum,
  };
}
