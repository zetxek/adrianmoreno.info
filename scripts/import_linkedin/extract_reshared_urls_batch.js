#!/usr/bin/env node

/**
 * Extracts reshared LinkedIn post URLs from multiple share pages in a single browser session.
 * 
 * Usage: node extract_reshared_urls_batch.js <shareUrl1> <shareUrl2> ...
 * Or: node extract_reshared_urls_batch.js --urls "url1,url2,url3"
 * Returns: JSON array with { shareURL, resharedPostURL } or { shareURL, error }
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Get persistent user data directory path (in project root, hidden directory)
function getUserDataDir() {
  // Try to get project root from current working directory or script location
  const scriptDir = __dirname;
  const projectRoot = path.resolve(scriptDir, '../..');
  return path.join(projectRoot, '.linkedin-browser-profile');
}

async function extractResharedURLs(shareURLs) {
  let context = null; // launchPersistentContext returns a BrowserContext, not Browser
  const results = [];
  const userDataDir = getUserDataDir();
  let needsLogin = true;
  
  try {
    // Launch browser with persistent user data directory
    // This keeps Chrome's login session across executions
    console.error('Launching browser with persistent profile...');
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      slowMo: 50,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 }
    });
    
    const page = context.pages()[0] || await context.newPage();
    
    // Check if we're already logged in by visiting LinkedIn feed
    console.error('Checking if already logged in to LinkedIn...');
    try {
      await page.goto('https://www.linkedin.com/feed', { waitUntil: 'domcontentloaded', timeout: 10000 });
      
      // Wait for either feed content or login form (faster detection)
      try {
        await Promise.race([
          page.waitForSelector('[class*="feed"], [class*="update-components"]', { timeout: 3000 }).catch(() => null),
          page.waitForSelector('input[type="password"]', { timeout: 3000 }).catch(() => null),
          page.waitForTimeout(1000) // Fallback: just wait 1 second
        ]);
      } catch (error) {
        // Continue
      }
      
      const pageURL = page.url();
      
      // Check if we're logged in (not on login page) - faster check using URL
      if (!pageURL.includes('login') && !pageURL.includes('challenge') && !pageURL.includes('authwall')) {
        // Double-check by looking for feed content
        const hasFeedContent = await page.evaluate(() => {
          return !!document.querySelector('[class*="feed"], [class*="update-components"], [class*="feed-update"]');
        });
        
        if (hasFeedContent) {
          console.error('✓ Already logged in! Using existing session.');
          needsLogin = false;
        } else {
          console.error('Not logged in. Need to log in.');
          needsLogin = true;
        }
      } else {
        console.error('Not logged in. Need to log in.');
        needsLogin = true;
      }
    } catch (error) {
      console.error('Could not verify login status. Will attempt login.');
      needsLogin = true;
    }
    
    // If we need to log in
    if (needsLogin) {
      // Navigate to LinkedIn login page to let user log in
      console.error('========================================');
      console.error('Browser window opened!');
      console.error('Please log in to LinkedIn in the browser window.');
      console.error(`After logging in, the script will process ${shareURLs.length} post(s).`);
      console.error('The script will wait 30 seconds for you to complete login...');
      console.error('(Your login will be saved for future runs)');
      console.error('========================================');
      
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
      
      // Wait for user to log in - check periodically instead of fixed timeout
      console.error('Waiting for login... (checking every 5 seconds)');
      let loginComplete = false;
      for (let i = 0; i < 6; i++) { // Check 6 times (30 seconds total)
        await page.waitForTimeout(5000);
        
        const currentURL = page.url();
        // Check if we've navigated away from login page
        if (!currentURL.includes('login') && !currentURL.includes('challenge')) {
          // Verify we're actually logged in by checking for feed content
          const hasFeedContent = await page.evaluate(() => {
            return !!document.querySelector('[class*="feed"], [class*="update-components"]');
          });
          
          if (hasFeedContent) {
            loginComplete = true;
            console.error(`✓ Login detected after ${(i + 1) * 5} seconds!`);
            break;
          }
        }
        console.error(`  ... still waiting (${(i + 1) * 5}s elapsed)...`);
      }
      
      if (!loginComplete) {
        console.error('⚠ Login timeout - continuing anyway. If login failed, extraction may not work.');
      } else {
        console.error('✓ Login complete! Session will be saved automatically.');
      }
    }
    
    console.error('Starting extraction for all posts...');
    console.error(`Total posts to process: ${shareURLs.length}`);
    console.error('========================================\n');
    
    // Process each URL
    for (let i = 0; i < shareURLs.length; i++) {
      const shareURL = shareURLs[i];
      const progress = `[${i + 1}/${shareURLs.length}]`;
      const remaining = shareURLs.length - i - 1;
      
      console.error(`${progress} Processing post ${i + 1} of ${shareURLs.length} (${remaining} remaining)...`);
      console.error(`  URL: ${shareURL.substring(0, 80)}...`);
      
      try {
        // Navigate to the share URL with faster detection
        console.error(`  → Navigating to post...`);
        try {
          // Use domcontentloaded for faster initial load, then wait for specific elements
          await page.goto(shareURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (error) {
          console.error(`  ⚠ Navigation timeout, continuing anyway...`);
        }
        
        // Wait for page to be interactive (faster than fixed timeout)
        // Check if page loaded by looking for common LinkedIn elements
        try {
          // Wait for either the feed content or login form (whichever appears first)
          await Promise.race([
            page.waitForSelector('[class*="feed-shared"], [class*="update-components"], [class*="feed-update"]', { timeout: 5000 }).catch(() => null),
            page.waitForSelector('input[type="password"], [class*="sign-in"]', { timeout: 5000 }).catch(() => null),
            page.waitForTimeout(2000) // Fallback: just wait 2 seconds
          ]);
        } catch (error) {
          // Continue anyway
        }
        
        // Quick check if we're on a login page
        const pageURL = page.url();
        if (pageURL.includes('login') || pageURL.includes('challenge') || pageURL.includes('authwall')) {
          results.push({
            shareURL: shareURL,
            error: 'Still requires login. Please ensure you are logged in.'
          });
          console.error(`  ✗ Login required - skipping`);
          continue;
        }
        
        // Try multiple selectors to find the reshared post link
        console.error(`  → Extracting reshared post URL...`);
        const resharedURL = await extractResharedURLFromPage(page);
        
        if (resharedURL) {
          results.push({
            shareURL: shareURL,
            resharedPostURL: resharedURL
          });
          console.error(`  ✓ SUCCESS: Found reshared URL`);
          console.error(`     ${resharedURL.substring(0, 80)}...`);
        } else {
          results.push({
            shareURL: shareURL,
            error: 'Could not find reshared post URL'
          });
          console.error(`  ✗ Could not find reshared post URL`);
        }
        
        // Output result immediately for incremental processing
        console.log(JSON.stringify({
          shareURL: shareURL,
          resharedPostURL: resharedURL || '',
          error: resharedURL ? '' : 'Could not find reshared post URL',
          index: i
        }));
        
      } catch (error) {
        results.push({
          shareURL: shareURL,
          error: error.message
        });
        console.error(`  ✗ ERROR: ${error.message}`);
        console.log(JSON.stringify({
          shareURL: shareURL,
          resharedPostURL: '',
          error: error.message,
          index: i
        }));
      }
      
      console.error(''); // Blank line between posts
    }
    
    console.error('\n========================================');
    console.error('Extraction complete!');
    console.error('Browser session saved automatically (persistent profile).');
    console.error('Closing browser...');
    console.error('========================================');
    
    await context.close();
    // Don't return results array - we've already output them line by line
    return [];
    
  } catch (error) {
    if (context) {
      console.error('Error occurred. Closing browser...');
      await context.close();
    }
    // Return error for all URLs
    return shareURLs.map(url => ({
      shareURL: url,
      error: error.message
    }));
  }
}

async function extractResharedURLFromPage(page) {
  // Method 1: Look for links with activity URN in href
  const activityLink = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="urn:li:activity"]'));
    if (links.length > 0) {
      const href = links[0].getAttribute('href');
      if (href && href.includes('urn:li:activity')) {
        if (href.startsWith('/')) {
          return 'https://www.linkedin.com' + href;
        }
        return href;
      }
    }
    return null;
  });
  
  if (activityLink) {
    return activityLink;
  }
  
  // Method 2: Look for feed-shared-update-v2 container
  const nestedLink = await page.evaluate(() => {
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
    return nestedLink;
  }
  
  // Method 3: Look for any link with activity ID pattern
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
  
  return contentLink;
}

// Main execution
let shareURLs = [];

// Check for --urls flag
if (process.argv.includes('--urls')) {
  const urlsIndex = process.argv.indexOf('--urls');
  if (urlsIndex + 1 < process.argv.length) {
    shareURLs = process.argv[urlsIndex + 1].split(',').map(url => url.trim());
  }
} else {
  // Get URLs from command line arguments
  shareURLs = process.argv.slice(2);
}

if (shareURLs.length === 0) {
  console.error('Usage: node extract_reshared_urls_batch.js <shareUrl1> <shareUrl2> ...');
  console.error('   Or: node extract_reshared_urls_batch.js --urls "url1,url2,url3"');
  process.exit(1);
}

extractResharedURLs(shareURLs)
  .then(results => {
    // Results are already output line by line during processing
    // No need to output again
  })
  .catch(error => {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  });

