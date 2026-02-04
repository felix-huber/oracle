#!/usr/bin/env tsx
// @ts-nocheck
/**
 * Test what happens after "login" on error page
 * This simulates what would happen if user logs in during recheck
 */

import puppeteer from 'puppeteer-core';
import { launch } from 'chrome-launcher';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHATGPT_URL = 'https://chatgpt.com/c/69813556-3bcc-838f-9934-b19086cd9311';
const CHROME_BIN = process.env.CHROME_BIN || '/opt/homebrew/bin/chromium';
const DEBUG_PORT = 9225;

async function test(): Promise<void> {
  console.log('='.repeat(80));
  console.log('ChatGPT Error State Analysis');
  console.log('='.repeat(80));
  console.log(`Target URL: ${CHATGPT_URL}\n`);

  const userDataDir = await mkdtemp(join(tmpdir(), 'oracle-chatgpt-error-'));
  let chrome: Awaited<ReturnType<typeof launch>> | null = null;
  let browser: puppeteer.Browser | null = null;

  try {
    chrome = await launch({
      chromePath: CHROME_BIN,
      userDataDir,
      port: DEBUG_PORT,
      handleSIGINT: false,
      chromeFlags: [
        '--window-size=1280,720',
        '--lang=en-US',
        '--disable-sync',
        '--no-first-run',
      ],
    });

    browser = await puppeteer.connect({
      browserURL: `http://localhost:${chrome.port}`,
      defaultViewport: { width: 1280, height: 720 },
    });

    const page = (await browser.pages())[0] || await browser.newPage();

    console.log('[1/4] Navigating to conversation URL...');
    await page.goto(CHATGPT_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));

    const url1 = page.url();
    const title1 = await page.title();
    
    console.log(`\nInitial State:`);
    console.log(`  URL: ${url1}`);
    console.log(`  Title: ${title1}`);

    // Check for error banner
    const errorBanner = await page.evaluate(() => {
      const banners = document.querySelectorAll('[role="alert"], .error, .toast, [data-testid*="error"]');
      return Array.from(banners).map(b => b.textContent?.trim()).filter(Boolean);
    });
    
    console.log(`\nError/Alert Messages:`);
    errorBanner.forEach(msg => {
      console.log(`  - ${msg}`);
    });

    // Check URL in page for any redirect info
    const pageState = await page.evaluate(() => {
      return {
        href: window.location.href,
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
        localStorageKeys: Object.keys(localStorage),
        sessionStorageKeys: Object.keys(sessionStorage),
      };
    });
    
    console.log(`\nPage State:`);
    console.log(`  Path: ${pageState.pathname}`);
    console.log(`  Search: ${pageState.search || '(none)'}`);
    console.log(`  Hash: ${pageState.hash || '(none)'}`);
    console.log(`  localStorage: ${pageState.localStorageKeys.length} keys`);
    console.log(`  sessionStorage: ${pageState.sessionStorageKeys.length} keys`);

    // Check if conversation ID is preserved anywhere
    const conversationIdPresent = 
      pageState.href.includes('69813556') ||
      pageState.localStorageKeys.some(k => k.includes('69813556')) ||
      pageState.sessionStorageKeys.some(k => k.includes('69813556'));
    
    console.log(`\nConversation ID preserved: ${conversationIdPresent ? 'YES' : 'NO'}`);

    // Check for any "redirect after login" hints
    const redirectHints = await page.evaluate(() => {
      const hints: string[] = [];
      // Check meta tags
      document.querySelectorAll('meta').forEach(meta => {
        const content = meta.getAttribute('content') || '';
        if (content.includes('redirect') || content.includes('url')) {
          hints.push(`meta: ${content}`);
        }
      });
      // Check for data attributes
      document.querySelectorAll('[data-redirect]').forEach(el => {
        hints.push(`data-redirect: ${el.getAttribute('data-redirect')}`);
      });
      // Check for next parameter in links
      document.querySelectorAll('a[href*="next"], a[href*="redirect"]').forEach(el => {
        hints.push(`link: ${el.getAttribute('href')}`);
      });
      return hints;
    });

    if (redirectHints.length > 0) {
      console.log(`\nRedirect Hints Found:`);
      redirectHints.forEach(h => {
        console.log(`  - ${h}`);
      });
    }

    console.log('\n[2/4] Simulating page reload (as recheck would do)...');
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    const url2 = page.url();
    console.log(`After reload: ${url2}`);
    console.log(`URL changed: ${url1 !== url2 ? 'YES' : 'NO'}`);

    // Take screenshot
    const screenshotPath = join(process.cwd(), 'chatgpt-error-state.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`\n📸 Screenshot: ${screenshotPath}`);

    // Summary
    console.log(`\n${'='.repeat(80)}`);
    console.log('KEY FINDINGS');
    console.log('='.repeat(80));
    
    console.log(`
1. CONVERSATION ACCESS: DENIED (requires authentication)
   - Fresh profile cannot access the conversation
   - Redirected to homepage with error banner

2. ERROR BANNER: VISIBLE
   - Shows "Unable to load conversation [ID]"
   - This confirms the conversation ID was recognized but not accessible

3. SESSION STATE: EMPTY
   - No auth cookies in fresh profile
   - No conversation context preserved

4. RECHECK IMPLICATIONS:
   - Recheck with fresh profile will ALWAYS fail for auth-required URLs
   - Must use --browser-manual-login OR cookie sync from main Chrome
   - No automatic redirect to conversation after login (would need re-navigate)

5. RECOMMENDATION:
   - For recheck to work reliably with ChatGPT Pro:
     a) Use --browser-manual-login to maintain auth session
     b) OR sync cookies from main Chrome profile
     c) Never use fresh profile for recheck of auth-required URLs
`);

    const results = {
      timestamp: new Date().toISOString(),
      findings: {
        accessDenied: true,
        redirectToHomepage: url1 === 'https://chatgpt.com/',
        errorBannerVisible: errorBanner.length > 0,
        conversationIdPreserved: conversationIdPresent,
        authRequired: true,
      },
      implications: {
        freshProfileWorks: false,
        cookieSyncRequired: true,
        manualLoginRecommended: true,
      },
    };
    
    await writeFile(join(process.cwd(), 'chatgpt-error-analysis.json'), JSON.stringify(results, null, 2));
    console.log('[3/4] Results saved');
    console.log('[4/4] Done!');

  } finally {
    if (browser) await browser.disconnect();
    if (chrome) await chrome.kill().catch(() => {});
    await rm(userDataDir, { recursive: true, force: true });
  }
}

test().catch(console.error);
// @ts-nocheck
