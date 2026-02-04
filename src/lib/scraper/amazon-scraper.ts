import { BaseScraper } from './base-scraper';
import {
  PlatformCredentials,
  ScrapedProduct,
  ScrapingResult,
  SearchResult,
} from './types';

export class AmazonFreshScraper extends BaseScraper {
  private readonly baseUrl = 'https://www.amazon.com';
  private readonly freshUrl =
    'https://www.amazon.com/alm/storefront?almBrandId=QW1hem9uIEZyZXNo';

  constructor() {
    super('amazon');
    this.minRequestInterval = 3000; // Amazon is sensitive to scraping
  }

  /**
   * Login to Amazon account
   */
  async login(credentials: PlatformCredentials): Promise<boolean> {
    try {
      if (!this.page) throw new Error('Browser not initialized');

      // Navigate to Amazon sign-in page
      await this.rateLimitedGoto(`${this.baseUrl}/ap/signin`);

      // Enter email
      await this.page.waitForSelector('#ap_email', { timeout: 10000 });
      await this.page.fill('#ap_email', credentials.username);
      await this.page.click('#continue');

      await this.delay(1000);

      // Enter password
      await this.page.waitForSelector('#ap_password', { timeout: 10000 });
      await this.page.fill('#ap_password', credentials.password);
      await this.page.click('#signInSubmit');

      await this.delay(2000);

      // Check if login was successful by looking for account element
      const accountElement = await this.page.$('#nav-link-accountList');
      if (accountElement) {
        console.log('[Amazon] Login successful');
        return true;
      }

      // Check for 2FA or CAPTCHA
      const captcha = await this.page.$('#auth-captcha-image');
      if (captcha) {
        console.log('[Amazon] CAPTCHA detected - manual intervention required');
        return false;
      }

      const twoFactor = await this.page.$('#auth-mfa-otpcode');
      if (twoFactor) {
        console.log('[Amazon] 2FA detected - manual intervention required');
        return false;
      }

      console.log('[Amazon] Login failed - unknown state');
      return false;
    } catch (error) {
      console.error('[Amazon] Login error:', error);
      return false;
    }
  }

  /**
   * Search for products on Amazon Fresh
   */
  async searchProduct(query: string): Promise<SearchResult> {
    const products: ScrapedProduct[] = [];

    try {
      if (!this.page) throw new Error('Browser not initialized');

      // Navigate to Amazon Fresh
      await this.rateLimitedGoto(this.freshUrl);
      await this.delay(2000);

      // Find and use the search box
      const searchBox = await this.page.$(
        'input[type="text"][name="field-keywords"], #twotabsearchtextbox'
      );
      if (!searchBox) {
        // Try alternative search approach
        await this.rateLimitedGoto(
          `${this.baseUrl}/s?k=${encodeURIComponent(query)}&i=amazonfresh`
        );
      } else {
        await searchBox.fill(query);
        await this.page.keyboard.press('Enter');
      }

      await this.page.waitForLoadState('networkidle', { timeout: 15000 });
      await this.delay(2000);

      // Extract product information from search results
      const productElements = await this.page.$$(
        '[data-component-type="s-search-result"]'
      );

      for (const element of productElements.slice(0, 5)) {
        // Get top 5 results
        try {
          // Extract product name
          const titleElement = await element.$('h2 a span, h2 span');
          const name = titleElement
            ? ((await titleElement.textContent()) || '').trim()
            : '';

          if (!name) continue;

          // Extract price
          const priceWhole = await element.$('.a-price-whole');
          const priceFraction = await element.$('.a-price-fraction');

          let price: number | null = null;
          if (priceWhole) {
            const wholeText =
              (await priceWhole.textContent())?.replace(/[^0-9]/g, '') || '0';
            const fractionText = priceFraction
              ? (await priceFraction.textContent())?.replace(/[^0-9]/g, '') ||
                '00'
              : '00';
            price = parseFloat(`${wholeText}.${fractionText}`);
          }

          // Extract product URL
          const linkElement = await element.$('h2 a');
          const href = linkElement
            ? await linkElement.getAttribute('href')
            : null;
          const productUrl = href ? `${this.baseUrl}${href}` : undefined;

          // Extract image URL
          const imageElement = await element.$('img.s-image');
          const imageUrl = imageElement
            ? (await imageElement.getAttribute('src')) || undefined
            : undefined;

          // Extract ASIN (product ID)
          const asin = await element.getAttribute('data-asin');

          // Check availability
          const outOfStock = await element.$('.a-color-price');
          const outOfStockText = outOfStock
            ? await outOfStock.textContent()
            : '';
          const isAvailable = !outOfStockText
            ?.toLowerCase()
            .includes('out of stock');

          products.push({
            name,
            price,
            isAvailable,
            productId: asin || undefined,
            productUrl,
            imageUrl,
          });
        } catch (err) {
          console.error('[Amazon] Error parsing product element:', err);
          continue;
        }
      }

      // Sort by relevance (similarity to search query)
      products.sort((a, b) => {
        const simA = this.calculateSimilarity(query, a.name);
        const simB = this.calculateSimilarity(query, b.name);
        return simB - simA;
      });

      return {
        products,
        query,
        platform: 'amazon',
      };
    } catch (error) {
      console.error('[Amazon] Search error:', error);
      return {
        products: [],
        query,
        platform: 'amazon',
      };
    }
  }

  /**
   * Get price for a specific product by URL
   */
  async getProductPrice(productUrl: string): Promise<ScrapingResult> {
    try {
      if (!this.page) throw new Error('Browser not initialized');

      await this.rateLimitedGoto(productUrl);
      await this.delay(1500);

      // Extract product name
      const titleElement = await this.page.$('#productTitle');
      const name = titleElement
        ? ((await titleElement.textContent()) || '').trim()
        : '';

      // Extract price - try multiple selectors
      let price: number | null = null;
      const priceSelectors = [
        '.a-price .a-offscreen',
        '#priceblock_ourprice',
        '#priceblock_dealprice',
        '.a-price-whole',
        '#corePrice_feature_div .a-offscreen',
      ];

      for (const selector of priceSelectors) {
        const priceElement = await this.page.$(selector);
        if (priceElement) {
          const priceText = await priceElement.textContent();
          price = this.parsePrice(priceText || '');
          if (price !== null) break;
        }
      }

      // Check availability
      const availabilityElement = await this.page.$('#availability');
      const availabilityText = availabilityElement
        ? await availabilityElement.textContent()
        : '';
      const isAvailable =
        !availabilityText?.toLowerCase().includes('out of stock') &&
        !availabilityText?.toLowerCase().includes('currently unavailable');

      // Extract image
      const imageElement = await this.page.$('#landingImage, #imgBlkFront');
      const imageUrl = imageElement
        ? (await imageElement.getAttribute('src')) || undefined
        : undefined;

      // Extract ASIN from URL
      const asinMatch = productUrl.match(/\/dp\/([A-Z0-9]+)/i);
      const productId = asinMatch ? asinMatch[1] : undefined;

      return {
        success: true,
        product: {
          name,
          price,
          isAvailable,
          productId,
          productUrl,
          imageUrl,
        },
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('[Amazon] Get product price error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }
}
