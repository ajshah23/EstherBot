import { chromium, Browser, Page, BrowserContext } from 'playwright';
import {
  Platform,
  ScrapedProduct,
  ScrapingResult,
  PlatformCredentials,
  SearchResult,
} from './types';

export abstract class BaseScraper {
  protected platform: Platform;
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected isInitialized = false;

  // Rate limiting
  protected lastRequestTime = 0;
  protected minRequestInterval = 2000; // 2 seconds between requests

  constructor(platform: Platform) {
    this.platform = platform;
  }

  /**
   * Initialize the browser with stealth settings
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
    });

    this.context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });

    // Add stealth scripts to avoid detection
    await this.context.addInitScript(() => {
      // Override webdriver detection
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });

    this.page = await this.context.newPage();
    this.isInitialized = true;
  }

  /**
   * Clean up browser resources
   */
  async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
    this.isInitialized = false;
  }

  /**
   * Rate-limited navigation
   */
  protected async rateLimitedGoto(url: string): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      await this.delay(this.minRequestInterval - timeSinceLastRequest);
    }

    this.lastRequestTime = Date.now();

    if (!this.page) throw new Error('Browser not initialized');
    await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  }

  /**
   * Helper to add random delay to avoid detection
   */
  protected async delay(ms: number): Promise<void> {
    const randomDelay = ms + Math.random() * 1000; // Add 0-1s random delay
    await new Promise((resolve) => setTimeout(resolve, randomDelay));
  }

  /**
   * Safe text extraction from element
   */
  protected async safeGetText(
    selector: string,
    defaultValue = ''
  ): Promise<string> {
    try {
      if (!this.page) return defaultValue;
      const element = await this.page.$(selector);
      if (!element) return defaultValue;
      return (await element.textContent()) || defaultValue;
    } catch {
      return defaultValue;
    }
  }

  /**
   * Safe attribute extraction from element
   */
  protected async safeGetAttribute(
    selector: string,
    attribute: string,
    defaultValue = ''
  ): Promise<string> {
    try {
      if (!this.page) return defaultValue;
      const element = await this.page.$(selector);
      if (!element) return defaultValue;
      return (await element.getAttribute(attribute)) || defaultValue;
    } catch {
      return defaultValue;
    }
  }

  /**
   * Parse price from string (handles various formats)
   */
  protected parsePrice(priceStr: string): number | null {
    if (!priceStr) return null;

    // Remove currency symbols and whitespace
    const cleaned = priceStr.replace(/[^0-9.,]/g, '').trim();

    // Handle comma as decimal separator (European format)
    // or comma as thousands separator (US format)
    let normalized = cleaned;
    if (cleaned.includes(',') && cleaned.includes('.')) {
      // Has both - assume last one is decimal
      if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
        normalized = cleaned.replace(/\./g, '').replace(',', '.');
      } else {
        normalized = cleaned.replace(/,/g, '');
      }
    } else if (cleaned.includes(',')) {
      // Only comma - could be decimal or thousands
      const parts = cleaned.split(',');
      if (parts.length === 2 && parts[1].length === 2) {
        // Likely decimal
        normalized = cleaned.replace(',', '.');
      } else {
        // Likely thousands separator
        normalized = cleaned.replace(/,/g, '');
      }
    }

    const price = parseFloat(normalized);
    return isNaN(price) ? null : price;
  }

  /**
   * Calculate string similarity (Levenshtein distance normalized)
   */
  protected calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    // Check if one contains the other
    if (s2.includes(s1) || s1.includes(s2)) {
      return 0.9;
    }

    // Levenshtein distance
    const matrix: number[][] = [];

    for (let i = 0; i <= s2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= s1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= s2.length; i++) {
      for (let j = 1; j <= s1.length; j++) {
        if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const distance = matrix[s2.length][s1.length];
    const maxLength = Math.max(s1.length, s2.length);
    return 1 - distance / maxLength;
  }

  /**
   * Abstract method to login to the platform
   */
  abstract login(credentials: PlatformCredentials): Promise<boolean>;

  /**
   * Abstract method to search for a product
   */
  abstract searchProduct(query: string): Promise<SearchResult>;

  /**
   * Abstract method to get price for a specific product
   */
  abstract getProductPrice(productUrl: string): Promise<ScrapingResult>;

  /**
   * Fetch price for an item (main entry point)
   */
  async fetchPrice(
    itemName: string,
    credentials?: PlatformCredentials
  ): Promise<ScrapingResult> {
    try {
      await this.initialize();

      // Login if credentials provided
      if (credentials) {
        const loginSuccess = await this.login(credentials);
        if (!loginSuccess) {
          return {
            success: false,
            error: 'Failed to login to platform',
            timestamp: new Date(),
          };
        }
      }

      // Search for the product
      const searchResults = await this.searchProduct(itemName);

      if (searchResults.products.length === 0) {
        return {
          success: false,
          error: 'No products found',
          timestamp: new Date(),
        };
      }

      // Return the best match (first result, typically highest relevance)
      const bestMatch = searchResults.products[0];

      return {
        success: true,
        product: bestMatch,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error(`[${this.platform}] Error fetching price:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Verify if credentials are valid
   */
  async testCredentials(credentials: PlatformCredentials): Promise<boolean> {
    try {
      await this.initialize();
      return await this.login(credentials);
    } catch (error) {
      console.error(`[${this.platform}] Credential test failed:`, error);
      return false;
    } finally {
      await this.cleanup();
    }
  }
}
