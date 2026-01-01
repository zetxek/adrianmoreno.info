#!/usr/bin/env node

/**
 * Extracts the reshared LinkedIn post URL from a share page.
 * 
 * Usage: node extract_reshared_url.js <shareUrl>
 * Returns: JSON with { resharedPostURL: "..." } or { error: "..." }
 */

const { chromium } = require('playwright');

async function extractResharedURL(shareURL) {
  let browser = null;
  try {
    // Launch browser in non-headless mode so user can interact
    browser = await chromium.launch({ 
      headless: false,
      slowMo: 50 // Slow down operations for visibility
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    
    // First, navigate to LinkedIn login page to let user log in
    console.error('========================================');
    console.error('Browser window opened!');
    console.error('Please log in to LinkedIn in the browser window.');
    console.error('After logging in, navigate to the post if needed.');
    console.error('The script will wait 30 seconds for you to complete login...');
    console.error('========================================');
    
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for user to log in (30 seconds)
    await page.waitForTimeout(30000);
    
    console.error('Navigating to share URL...');
    
    // Now navigate to the share URL
    try {
      await page.goto(shareURL, { waitUntil: 'networkidle', timeout: 60000 });
    } catch (error) {
      // If navigation fails, try with domcontentloaded
      await page.goto(shareURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    
    // Wait a bit for dynamic content to load
    console.error('Waiting for page to load...');
    await page.waitForTimeout(5000);
    
    // Check if we're still on a login page
    const pageTitle = await page.title();
    const pageURL = page.url();
    
    if (pageTitle.includes('Sign In') || pageTitle.includes('Login') || pageURL.includes('challenge') || pageURL.includes('authwall')) {
      console.error('Still on login page. Waiting additional 20 seconds...');
      await page.waitForTimeout(20000);
      
      const newPageTitle = await page.title();
      const newPageURL = page.url();
      if (newPageTitle.includes('Sign In') || newPageTitle.includes('Login') || newPageURL.includes('challenge') || newPageURL.includes('authwall')) {
        console.error('Still on login page. Closing browser...');
        await browser.close();
        return { 
          error: 'Still on login page. Please ensure you are logged in and can access the post.',
          requiresAuth: true
        };
      }
    }
    
    console.error('Page loaded. Extracting reshared post URL...');
    
    // Try multiple selectors to find the reshared post link
    // LinkedIn's structure varies, so we try several approaches
    
    // Method 1: Look for links with activity URN in href
    const activityLink = await page.evaluate(() => {
      // Find links containing urn:li:activity
      const links = Array.from(document.querySelectorAll('a[href*="urn:li:activity"]'));
      if (links.length > 0) {
        const href = links[0].getAttribute('href');
        if (href && href.includes('urn:li:activity')) {
          // Convert relative to absolute if needed
          if (href.startsWith('/')) {
            return 'https://www.linkedin.com' + href;
          }
          return href;
        }
      }
      return null;
    });
    
    if (activityLink) {
      await browser.close();
      return { resharedPostURL: activityLink };
    }
    
    // Method 2: Look for feed-shared-update-v2 container and find nested activity links
    const nestedLink = await page.evaluate(() => {
      // Find the shared update container
      const sharedContainer = document.querySelector('[class*="feed-shared-update-v2"], [class*="update-components-mini-update"]');
      if (sharedContainer) {
        const link = sharedContainer.querySelector('a[href*="/feed/update/"], a[href*="urn:li:activity"]');
        if (link) {
          const href = link.getAttribute('href');
          if (href && (href.includes('/feed/update/') || href.includes('urn:li:activity'))) {
            if (href.startsWith('/')) {
              return 'https://www.linkedin.com' + href;
            }
            return href;
          }
        }
      }
      return null;
    });
    
    if (nestedLink) {
      await browser.close();
      return { resharedPostURL: nestedLink };
    }
    
    // Method 3: Look for any link with activity ID pattern in the update content area
    const contentLink = await page.evaluate(() => {
      const updateContent = document.querySelector('[class*="update-components"], [class*="feed-shared"]');
      if (updateContent) {
        const links = Array.from(updateContent.querySelectorAll('a'));
        for (const link of links) {
          const href = link.getAttribute('href');
          if (href && (href.includes('urn:li:activity:') || (href.includes('/feed/update/') && href.includes('urn:li:activity')))) {
            if (href.startsWith('/')) {
              return 'https://www.linkedin.com' + href;
            }
            return href;
          }
        }
      }
      return null;
    });
    
    await browser.close();
    
    if (contentLink) {
      return { resharedPostURL: contentLink };
    }
    
    return { error: 'Could not find reshared post URL. Make sure you are viewing the reshared post page and the original post is visible.' };
    
  } catch (error) {
    if (browser) {
      console.error('Error occurred. Browser will close in 5 seconds...');
      await page.waitForTimeout(5000);
      await browser.close();
    }
    return { error: error.message };
  }
}

// Main execution
const shareURL = process.argv[2];
if (!shareURL) {
  console.error('Usage: node extract_reshared_url.js <shareUrl>');
  process.exit(1);
}

extractResharedURL(shareURL)
  .then(result => {
    console.log(JSON.stringify(result));
  })
  .catch(error => {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  });

