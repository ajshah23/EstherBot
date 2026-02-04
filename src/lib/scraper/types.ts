// Types for the scraping infrastructure

export type Platform = 'amazon' | 'doordash' | 'instacart' | 'walmart';

export interface ScrapedProduct {
  name: string;
  price: number | null;
  unit?: string;
  isAvailable: boolean;
  productId?: string;
  productUrl?: string;
  imageUrl?: string;
  brand?: string;
  size?: string;
}

export interface ScrapingResult {
  success: boolean;
  product?: ScrapedProduct;
  error?: string;
  timestamp: Date;
}

export interface ScrapingJobData {
  userId: string;
  itemId: string;
  itemName: string;
  platform: Platform;
  productMappingId?: string;
  credentials?: PlatformCredentials;
}

export interface PlatformCredentials {
  username: string;
  password: string;
  sessionData?: string;
}

export interface ScrapingJobResult {
  jobId: string;
  userId: string;
  itemId: string;
  platform: Platform;
  result: ScrapingResult;
}

export interface BulkScrapingJobData {
  userId: string;
  platforms: Platform[];
  itemIds?: string[]; // If not provided, scrape all active items
}

export interface ScrapingJobStatus {
  id: string;
  userId: string;
  platform: Platform;
  status: 'pending' | 'running' | 'completed' | 'failed';
  itemsProcessed: number;
  itemsTotal: number;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface SearchResult {
  products: ScrapedProduct[];
  query: string;
  platform: Platform;
}
