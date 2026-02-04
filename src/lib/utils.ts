import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return '$0.00';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  return formatDate(d);
}

export const GROCERY_CATEGORIES = [
  'Produce',
  'Dairy',
  'Meat',
  'Pantry',
  'Snacks',
  'Beverages',
  'Frozen',
  'Bakery',
  'Deli',
  'Household',
  'Personal Care',
  'Baby',
  'Pet',
  'Other',
] as const;

export type GroceryCategory = (typeof GROCERY_CATEGORIES)[number];

export const PLATFORMS = [
  { id: 'amazon', name: 'Amazon Fresh', color: '#FF9900', defaultMinimum: 35 },
  { id: 'doordash', name: 'DoorDash', color: '#FF3008', defaultMinimum: 20 },
  { id: 'instacart', name: 'Instacart', color: '#43B02A', defaultMinimum: 35 },
  { id: 'walmart', name: 'Walmart+', color: '#0071CE', defaultMinimum: 35 },
] as const;

export type PlatformId = (typeof PLATFORMS)[number]['id'];

export function getPlatformById(id: string) {
  return PLATFORMS.find((p) => p.id === id);
}

export function getPlatformColor(id: string): string {
  return getPlatformById(id)?.color ?? '#6B7280';
}
