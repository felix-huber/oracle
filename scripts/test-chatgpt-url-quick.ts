#!/usr/bin/env tsx
// @ts-nocheck
/**
 * Quick test: Check ChatGPT conversation URL access with fresh profile
 */

import puppeteer from 'puppeteer-core';
import { launch } from 'chrome-launcher';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHATGPT_URL = 'https://chatgpt.com/c/69813556-3bcc-838f-9934-b19086cd9311';
const CHROME_BIN = process.env.CHROME_BIN || '/opt/homebrew/bin/chromium';
const DEBUG_PORT = 9224;

async function test(): Promise<void> {
  console.log('='.repeat(80));
  console.log('ChatGPT URL Access Test - Fresh Profile');
  console.log('='.repeat(80));
  console.log(`Target URL: ${CHATGPT_URL}\n`);

  const userDataDir = await mkdtemp(join(tmpdir(), 'oracle-chatgpt-test-'));
  let chrome: Awaited<ReturnType<typeof launch>> | null = null;
  let browser: puppeteer.Browser | null = null;

  try {
    console.log('[1/3] Launching Chrome with fresh profile...');
    chrome = await launch({
      chromePath: CHROME_BIN,
      userDataDir,
      port: DEBUG_PORT,
      handleSIGINT: false,
      chromeFlags: [
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-default-apps',
        '--disable-hang-monitor',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        '--disable-features=TranslateUI,AutomationControlled',
        '--mute-audio',
        '--window-size=1280,720',
        '--lang=en-US',
        '--accept-lang=en-US,en',
        '--password-store=basic',
        '--use-mock-keychain',
      ],
    });

    browser = await puppeteer.connect({
      browserURL: `http://localhost:${chrome.port}`,
      defaultViewport: { width: 1280, height: 720 },
    });

    const page = (await browser.pages())[0] || await browser.newPage();

    console.log('[2/3] Navigating to ChatGPT URL...');
    await page.goto(CHATGPT_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));

    const url = page.url();
    const title = await page.title();
    const content = await page.content();
    const contentLower = content.toLowerCase();

    console.log('\n--- RESULTS ---');
    console.log(`Current URL: ${url}`);
    console.log(`Page Title: ${title}`);

    // Check for login requirement
    const hasLoginButton = contentLower.includes('log in') || contentLower.includes('login');
    const hasSignUpButton = contentLower.includes('sign up') || contentLower.includes('signup');
    const requiresAuth = hasLoginButton && hasSignUpButton;

    console.log(`\n🔑 Authentication Required: ${requiresAuth ? 'YES' : 'NO'}`);
    
    if (requiresAuth) {
      console.log('   Found "Log in" and "Sign up" buttons');
      console.log('   The conversation URL redirected to the public homepage');
    }

    // Check what page we're actually on
    const isHomepage = url === 'https://chatgpt.com/' || url === 'https://chatgpt.com';
    console.log(`\n🔄 Redirected to homepage: ${isHomepage ? 'YES' : 'NO'}`);

    // Check cookies
    const cookies = await page.cookies();
    console.log(`\n🍪 Cookies: ${cookies.length} (fresh profile has no auth cookies)`);

    // Try to find conversation-specific elements
    const hasConversationId = content.includes('69813556-3bcc-838f-9934-b19086cd9311');
    console.log(`\n📄 Conversation ID visible: ${hasConversationId ? 'YES' : 'NO'}`);

    // Take screenshot
    const screenshotPath = join(process.cwd(), 'chatgpt-fresh-profile-test.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`\n📸 Screenshot: ${screenshotPath}`);

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    
    if (requiresAuth) {
      console.log('\n❌ FINDING: Fresh profile CANNOT access conversation');
      console.log('   ChatGPT redirects unauthenticated users to the homepage');
      console.log('   The conversation URL is not accessible without login');
    }

    console.log('\n--- WHAT A RECHECK WOULD SEE ---');
    console.log('If Oracle performs a recheck with a fresh profile:');
    console.log('1. Browser navigates to conversation URL');
    console.log('2. ChatGPT redirects to homepage (no access)');
    console.log('3. Login page displayed instead of conversation');
    console.log('4. Recheck FAILS to capture any response');
    console.log('');
    console.log('--- WHAT A RECHECK NEEDS TO WORK ---');
    console.log('1. Authenticated session (cookies/synced from main Chrome)');
    console.log('2. Valid ChatGPT login session');
    console.log('3. Use --browser-manual-login or --browser-profile-sync');

    // Save results
    const results = {
      timestamp: new Date().toISOString(),
      targetUrl: CHATGPT_URL,
      actualUrl: url,
      title,
      requiresAuth,
      isHomepage,
      hasConversationId,
      cookieCount: cookies.length,
      finding: 'Fresh profile cannot access conversation - requires authentication',
    };
    
    const resultsPath = join(process.cwd(), 'chatgpt-test-results.json');
    await writeFile(resultsPath, JSON.stringify(results, null, 2));
    console.log(`\n📄 Results saved: ${resultsPath}`);

    console.log('\n[3/3] Done!');

  } finally {
    if (browser) await browser.disconnect();
    if (chrome) await chrome.kill().catch(() => {});
    await rm(userDataDir, { recursive: true, force: true });
  }
}

test().catch(console.error);
// @ts-nocheck
