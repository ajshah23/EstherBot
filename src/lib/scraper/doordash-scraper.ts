import { BaseScraper } from './base-scraper';
import {
  PlatformCredentials,
  ScrapedProduct,
  ScrapingResult,
  SearchResult,
} from './types';

export class DoorDashScraper extends BaseScraper {
  private readonly baseUrl = 'https://www.doordash.com';
  private storeId?: string;
  private storeName?: string;

  constructor(storeId?: string, storeName?: string) {
    super('doordash');
    this.storeId = storeId;
    this.storeName = storeName;
    this.minRequestInterval = 2500;
  }

  /**
   * Set the store to scrape from
   */
  setStore(storeId: string, storeName: string): void {
    this.storeId = storeId;
    this.storeName = storeName;
  }

  /**
   * Login to DoorDash account
   */
  async login(credentials: PlatformCredentials): Promise<boolean> {
    try {
      if (!this.page) throw new Error('Browser not initialized');

      // Navigate to DoorDash sign-in page
      await this.rateLimitedGoto(`${this.baseUrl}/identity/login`);
      await this.delay(2000);

      // Look for email input
      const emailInput = await this.page.$(
        'input[type="email"], input[name="email"]'
      );
      if (!emailInput) {
        console.log('[DoorDash] Could not find email input');
        return false;
      }

      await emailInput.fill(credentials.username);
      await this.delay(500);

      // Click continue or next button
      const continueBtn = await this.page.$(
        'button[type="submit"], button:has-text("Continue"), button:has-text("Next")'
      );
      if (continueBtn) {
        await continueBtn.click();
        await this.delay(2000);
      }

      // Look for password input
      const passwordInput = await this.page.$(
        'input[type="password"], input[name="password"]'
      );
      if (passwordInput) {
        await passwordInput.fill(credentials.password);
        await this.delay(500);

        // Click sign in button
        const signInBtn = await this.page.$(
          'button[type="submit"], button:has-text("Sign In"), button:has-text("Log In")'
        );
        if (signInBtn) {
          await signInBtn.click();
          await this.delay(3000);
        }
      }

      // Check if login was successful by looking for account elements
      const accountIndicators = [
        '[data-testid="account-button"]',
        '[aria-label="Account"]',
        '.AccountDropdown',
      ];

      for (const selector of accountIndicators) {
        const element = await this.page.$(selector);
        if (element) {
          console.log('[DoorDash] Login successful');
          return true;
        }
      }

      // Check for error messages
      const errorElement = await this.page.$('[data-testid="error-message"]');
      if (errorElement) {
        const errorText = await errorElement.textContent();
        console.log('[DoorDash] Login error:', errorText);
        return false;
      }

      console.log('[DoorDash] Login status unclear');
      return false;
    } catch (error) {
      console.error('[DoorDash] Login error:', error);
      return false;
    }
  }

  /**
   * Search for products on DoorDash
   */
  async searchProduct(query: string): Promise<SearchResult> {
    const products: ScrapedProduct[] = [];

    try {
      if (!this.page) throw new Error('Browser not initialized');

      // If no store is set, try to find a grocery store
      if (!this.storeId) {
        await this.findGroceryStore();
      }

      let searchUrl: string;
      if (this.storeId) {
        // Search within specific store
        searchUrl = `${this.baseUrl}/store/${this.storeId}?query=${encodeURIComponent(query)}`;
      } else {
        // General search - DoorDash will show multiple stores
        searchUrl = `${this.baseUrl}/search/store/${encodeURIComponent(query)}`;
      }

      await this.rateLimitedGoto(searchUrl);
      await this.page.waitForLoadState('networkidle', { timeout: 20000 });
      await this.delay(2000);

      // Try to find product items
      const itemSelectors = [
        '[data-testid="StoreMenuItem"]',
        '[data-testid="item-card"]',
        '.ItemCard',
        '[class*="MenuItem"]',
      ];

      let productElements: any[] = [];
      for (const selector of itemSelectors) {
        productElements = await this.page.$$(selector);
        if (productElements.length > 0) break;
      }

      for (const element of productElements.slice(0, 5)) {
        try {
          // Extract product name
          const nameSelectors = [
            '[data-testid="item-name"]',
            '[class*="ItemName"]',
            'span[class*="Text"]',
            'h3',
            'h4',
          ];

          let name = '';
          for (const selector of nameSelectors) {
            const nameElement = await element.$(selector);
            if (nameElement) {
              name = ((await nameElement.textContent()) || '').trim();
              if (name) break;
            }
          }

          if (!name) continue;

          // Extract price
          const priceSelectors = [
            '[data-testid="item-price"]',
            '[class*="Price"]',
            'span:has-text("$")',
          ];

          let price: number | null = null;
          for (const selector of priceSelectors) {
            const priceElement = await element.$(selector);
            if (priceElement) {
              const priceText = await priceElement.textContent();
              price = this.parsePrice(priceText || '');
              if (price !== null) break;
            }
          }

          // Extract image URL
          const imageElement = await element.$('img');
          const imageUrl = imageElement
            ? (await imageElement.getAttribute('src')) || undefined
            : undefined;

          // Try to get product URL
          const linkElement = await element.$('a');
          const href = linkElement
            ? await linkElement.getAttribute('href')
            : null;
          const productUrl = href
            ? href.startsWith('http')
              ? href
              : `${this.baseUrl}${href}`
            : undefined;

          products.push({
            name,
            price,
            isAvailable: true, // DoorDash typically only shows available items
            productUrl,
            imageUrl,
          });
        } catch (err) {
          console.error('[DoorDash] Error parsing product element:', err);
          continue;
        }
      }

      // Sort by relevance
      products.sort((a, b) => {
        const simA = this.calculateSimilarity(query, a.name);
        const simB = this.calculateSimilarity(query, b.name);
        return simB - simA;
      });

      return {
        products,
        query,
        platform: 'doordash',
      };
    } catch (error) {
      console.error('[DoorDash] Search error:', error);
      return {
        products: [],
        query,
        platform: 'doordash',
      };
    }
  }

  /**
   * Find a grocery store on DoorDash
   */
  private async findGroceryStore(): Promise<void> {
    try {
      if (!this.page) return;

      // Navigate to convenience/grocery category
      await this.rateLimitedGoto(`${this.baseUrl}/convenience`);
      await this.delay(2000);

      // Look for store cards
      const storeCards = await this.page.$$('[data-testid="store-card"]');

      if (storeCards.length > 0) {
        // Get the first store's information
        const firstStore = storeCards[0];
        const linkElement = await firstStore.$('a');

        if (linkElement) {
          const href = await linkElement.getAttribute('href');
          if (href) {
            // Extract store ID from URL (format: /store/store-name-123456)
            const match = href.match(/\/store\/([^/]+)/);
            if (match) {
              this.storeId = match[1];
              const nameElement = await firstStore.$('span, h3');
              this.storeName = nameElement
                ? ((await nameElement.textContent()) || '').trim()
                : 'Unknown Store';
              console.log(
                `[DoorDash] Using store: ${this.storeName} (${this.storeId})`
              );
            }
          }
        }
      }
    } catch (error) {
      console.error('[DoorDash] Error finding grocery store:', error);
    }
  }

  /**
   * Get price for a specific product by URL
   */
  async getProductPrice(productUrl: string): Promise<ScrapingResult> {
    try {
      if (!this.page) throw new Error('Browser not initialized');

      await this.rateLimitedGoto(productUrl);
      await this.delay(2000);

      // Extract product name
      const nameSelectors = [
        '[data-testid="item-name"]',
        '[class*="ItemName"]',
        'h1',
        'h2',
      ];

      let name = '';
      for (const selector of nameSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          name = ((await element.textContent()) || '').trim();
          if (name) break;
        }
      }

      // Extract price
      const priceSelectors = [
        '[data-testid="item-price"]',
        '[class*="Price"]',
        'span:has-text("$")',
      ];

      let price: number | null = null;
      for (const selector of priceSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          const priceText = await element.textContent();
          price = this.parsePrice(priceText || '');
          if (price !== null) break;
        }
      }

      // Extract image
      const imageElement = await this.page.$('img[data-testid="item-image"]');
      const imageUrl = imageElement
        ? (await imageElement.getAttribute('src')) || undefined
        : undefined;

      return {
        success: true,
        product: {
          name,
          price,
          isAvailable: true,
          productUrl,
          imageUrl,
        },
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('[DoorDash] Get product price error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }
}
