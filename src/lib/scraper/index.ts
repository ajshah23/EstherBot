import { BaseScraper } from './base-scraper';
import { AmazonFreshScraper } from './amazon-scraper';
import { DoorDashScraper } from './doordash-scraper';
import { Platform } from './types';

export * from './types';
export * from './base-scraper';
export * from './amazon-scraper';
export * from './doordash-scraper';

/**
 * Factory function to create a scraper for a given platform
 */
export function createScraper(
  platform: Platform,
  options?: { storeId?: string; storeName?: string }
): BaseScraper {
  switch (platform) {
    case 'amazon':
      return new AmazonFreshScraper();
    case 'doordash':
      return new DoorDashScraper(options?.storeId, options?.storeName);
    case 'instacart':
      // TODO: Implement Instacart scraper
      throw new Error('Instacart scraper not yet implemented');
    case 'walmart':
      // TODO: Implement Walmart scraper
      throw new Error('Walmart scraper not yet implemented');
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

/**
 * Get list of supported platforms
 */
export function getSupportedPlatforms(): Platform[] {
  return ['amazon', 'doordash'];
}

/**
 * Check if a platform is supported for scraping
 */
export function isPlatformSupported(platform: string): platform is Platform {
  return ['amazon', 'doordash'].includes(platform);
}
