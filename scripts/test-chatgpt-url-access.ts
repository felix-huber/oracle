#!/usr/bin/env tsx
// @ts-nocheck
/**
 * Test script: Access ChatGPT conversation URL with fresh browser profile
 * 
 * This simulates what happens during recheck delay - browser sits idle then
 * revisits the URL. We need to understand:
 * 1. Can we see the conversation without login?
 * 2. If login is required, what's the login state?
 * 3. Can we see if there's a response in progress?
 * 4. What does a "recheck" actually see when it reopens this URL?
 */

import puppeteer from 'puppeteer-core';
import { launch } from 'chrome-launcher';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHATGPT_URL = 'https://chatgpt.com/c/69813556-3bcc-838f-9934-b19086cd9311';
const CHROME_BIN = process.env.CHROME_BIN || '/opt/homebrew/bin/chromium';
const DEBUG_PORT = 9223;

interface TestResults {
  timestamp: string;
  url: string;
  freshProfile: boolean;
  initialNavigation: {
    url: string;
    title: string;
    pageContent: string;
    requiresLogin: boolean;
    hasConversationContent: boolean;
    visibleElements: string[];
  };
  afterWait: {
    url: string;
    title: string;
    pageContent: string;
    responseInProgress: boolean;
    changesFromInitial: string[];
  } | null;
  sessionPersistence: {
    cookiesPresent: boolean;
    localStorageKeys: string[];
    sessionStorageKeys: string[];
  };
  recommendations: string[];
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testChatGPTUrlAccess(): Promise<void> {
  console.log('='.repeat(80));
  console.log('ChatGPT URL Access Test - Fresh Profile Simulation');
  console.log('='.repeat(80));
  console.log(`Target URL: ${CHATGPT_URL}`);
  console.log(`Chrome Binary: ${CHROME_BIN}`);
  console.log('');

  const results: TestResults = {
    timestamp: new Date().toISOString(),
    url: CHATGPT_URL,
    freshProfile: true,
    initialNavigation: {
      url: '',
      title: '',
      pageContent: '',
      requiresLogin: false,
      hasConversationContent: false,
      visibleElements: [],
    },
    afterWait: null,
    sessionPersistence: {
      cookiesPresent: false,
      localStorageKeys: [],
      sessionStorageKeys: [],
    },
    recommendations: [],
  };

  // Create temporary user data directory for fresh profile
  const userDataDir = await mkdtemp(join(tmpdir(), 'oracle-chatgpt-test-'));
  console.log(`Created fresh profile at: ${userDataDir}`);

  let chrome: Awaited<ReturnType<typeof launch>> | null = null;
  let browser: puppeteer.Browser | null = null;

  try {
    // Launch Chrome with fresh profile
    console.log('\n[1/5] Launching Chrome with fresh profile...');
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
        // Don't use headless - we want to see what a real user sees
      ],
    });

    console.log(`Chrome launched on port ${chrome.port}, PID: ${chrome.pid}`);

    // Connect with puppeteer
    console.log('\n[2/5] Connecting to Chrome with Puppeteer...');
    browser = await puppeteer.connect({
      browserURL: `http://localhost:${chrome.port}`,
      defaultViewport: { width: 1280, height: 720 },
    });

    const page = (await browser.pages())[0] || await browser.newPage();

    // Navigate to the ChatGPT URL
    console.log('\n[3/5] Navigating to ChatGPT conversation URL...');
    console.log(`URL: ${CHATGPT_URL}`);
    
    await page.goto(CHATGPT_URL, { 
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Wait a bit for any redirects or content to load
    await delay(5000);

    // Capture initial state
    const initialUrl = page.url();
    const initialTitle = await page.title();
    
    console.log('\n--- INITIAL NAVIGATION RESULTS ---');
    console.log(`Current URL: ${initialUrl}`);
    console.log(`Page Title: ${initialTitle}`);

    results.initialNavigation.url = initialUrl;
    results.initialNavigation.title = initialTitle;

    // Check if we're on a login page
    const pageContent = await page.content();
    results.initialNavigation.pageContent = pageContent.substring(0, 2000);

    // Detect login requirements
    const loginIndicators = [
      'log in',
      'login',
      'sign in',
      'signin',
      'auth0',
      'authentication',
      'continue with',
      'welcome back',
    ];

    const contentLower = pageContent.toLowerCase();
    const requiresLogin = loginIndicators.some(indicator => 
      contentLower.includes(indicator.toLowerCase())
    );
    results.initialNavigation.requiresLogin = requiresLogin;

    console.log(`\nLogin Required: ${requiresLogin ? 'YES ⚠️' : 'NO ✓'}`);
    if (requiresLogin) {
      console.log('  -> This URL requires authentication to access');
      results.recommendations.push('URL requires authentication - fresh profile cannot access conversation');
    }

    // Check for conversation content indicators
    const conversationIndicators = [
      'chatgpt',
      'conversation',
      'message',
      'assistant',
      'user',
      'model:',
      'gpt-',
    ];
    
    const hasConversationContent = conversationIndicators.some(indicator =>
      contentLower.includes(indicator.toLowerCase())
    );
    results.initialNavigation.hasConversationContent = hasConversationContent;

    console.log(`\nConversation Content Visible: ${hasConversationContent ? 'YES ✓' : 'NO ⚠️'}`);

    // Extract visible elements
    const visibleElements = await page.evaluate(() => {
      const elements: string[] = [];
      // Look for main content areas
      document.querySelectorAll('main, [role="main"], article, .conversation, [data-testid]').forEach(el => {
        const text = el.textContent?.trim().substring(0, 200);
        if (text) {
          const idSuffix = el.id ? `#${el.id}` : '';
          const classSuffix = el.className ? `.${el.className.split(' ')[0]}` : '';
          elements.push(`${el.tagName}${idSuffix}${classSuffix}: ${text}`);
        }
      });
      // Look for buttons and forms
      document.querySelectorAll('button, input, form, [role="button"]').forEach(el => {
        const text = (el as HTMLElement).textContent?.trim() || (el as HTMLInputElement).placeholder || (el as HTMLInputElement).name;
        if (text) elements.push(`[${el.tagName}]: ${text.substring(0, 100)}`);
      });
      return elements.slice(0, 20); // Limit to first 20
    });
    results.initialNavigation.visibleElements = visibleElements;

    console.log('\nVisible Elements:');
    visibleElements.forEach(el => {
      console.log(`  - ${el.substring(0, 100)}`);
    });

    // Check session storage
    console.log('\n[4/5] Checking session persistence state...');
    
    const cookies = await page.cookies();
    results.sessionPersistence.cookiesPresent = cookies.length > 0;
    console.log(`Cookies present: ${cookies.length > 0 ? 'YES' : 'NO'} (${cookies.length} cookies)`);
    if (cookies.length > 0) {
      console.log('  Cookie domains:', [...new Set(cookies.map(c => c.domain))].join(', '));
    }

    const storage = await page.evaluate(() => {
      return {
        localStorage: Object.keys(localStorage),
        sessionStorage: Object.keys(sessionStorage),
      };
    });
    results.sessionPersistence.localStorageKeys = storage.localStorage;
    results.sessionPersistence.sessionStorageKeys = storage.sessionStorage;
    
    console.log(`LocalStorage keys: ${storage.localStorage.length}`);
    console.log(`SessionStorage keys: ${storage.sessionStorage.length}`);

    // Simulate the "recheck" - wait and reload
    console.log('\n[5/5] Simulating recheck (waiting 30s then reloading)...');
    console.log('(This simulates the browser sitting idle during recheck delay)');
    
    await delay(30000);

    // Reload the page to simulate recheck revisiting
    await page.reload({ waitUntil: 'networkidle2' });
    await delay(3000);

    const afterUrl = page.url();
    const afterTitle = await page.title();
    const afterContent = await page.content();

    // Check if there's a response in progress indicator
    const progressIndicators = [
      'thinking',
      'generating',
      'loading',
      'processing',
      '...',
      'writing',
      'analyzing',
    ];
    const responseInProgress = progressIndicators.some(indicator =>
      afterContent.toLowerCase().includes(indicator)
    );

    results.afterWait = {
      url: afterUrl,
      title: afterTitle,
      pageContent: afterContent.substring(0, 2000),
      responseInProgress,
      changesFromInitial: [],
    };

    // Detect changes
    if (initialUrl !== afterUrl) {
      results.afterWait.changesFromInitial.push(`URL changed: ${initialUrl} -> ${afterUrl}`);
    }
    if (initialTitle !== afterTitle) {
      results.afterWait.changesFromInitial.push(`Title changed: ${initialTitle} -> ${afterTitle}`);
    }

    console.log('\n--- AFTER RECHECK SIMULATION ---');
    console.log(`Current URL: ${afterUrl}`);
    console.log(`Page Title: ${afterTitle}`);
    console.log(`Response in progress indicators: ${responseInProgress ? 'YES' : 'NO'}`);
    
    if (results.afterWait.changesFromInitial.length > 0) {
      console.log('\nChanges from initial load:');
      results.afterWait.changesFromInitial.forEach(change => {
        console.log(`  - ${change}`);
      });
    }

    // Final analysis
    console.log(`\n${'='.repeat(80)}`);
    console.log('FINDINGS & RECOMMENDATIONS');
    console.log('='.repeat(80));

    if (requiresLogin) {
      console.log('\n🔴 CRITICAL: Fresh profile cannot access conversation');
      console.log('   The URL requires authentication. Without valid session cookies,');
      console.log('   the recheck will see a login page, not the conversation.');
      results.recommendations.push('CRITICAL: Recheck requires authenticated session cookies');
      results.recommendations.push('Use --browser-manual-login with cookie sync for recheck to work');
    } else if (!hasConversationContent) {
      console.log('\n🟡 WARNING: Conversation content not detected');
      console.log('   The page loaded but conversation content may not be visible.');
      console.log('   This could mean:');
      console.log('   - The conversation is private/protected');
      console.log('   - The conversation ID is invalid or expired');
      console.log('   - ChatGPT requires authentication for this content');
      results.recommendations.push('Conversation content not visible - may require auth or be private');
    } else {
      console.log('\n🟢 OK: Conversation appears accessible');
      results.recommendations.push('Conversation appears accessible without login (rare for ChatGPT)');
    }

    if (responseInProgress) {
      console.log('\n🟡 Response appears to be in progress');
      console.log('   The recheck should wait and monitor for completion.');
      results.recommendations.push('Implement progress detection during recheck');
    }

    // Session persistence insights
    console.log('\n--- SESSION PERSISTENCE ANALYSIS ---');
    if (!results.sessionPersistence.cookiesPresent && 
        results.sessionPersistence.localStorageKeys.length === 0 &&
        results.sessionPersistence.sessionStorageKeys.length === 0) {
      console.log('No session data persisted in fresh profile');
      console.log('  -> This is expected for a fresh profile');
      console.log('  -> Recheck without cookie sync will fail for auth-required URLs');
      results.recommendations.push('Fresh profile has no session persistence - cookie sync required');
    }

    console.log('\n--- RECOMMENDATIONS FOR RELIABLE RECHECK ---');
    results.recommendations.forEach((rec, i) => {
      console.log(`${i + 1}. ${rec}`);
    });

    // Save detailed results
    const resultsPath = join(process.cwd(), 'chatgpt-url-test-results.json');
    await writeFile(resultsPath, JSON.stringify(results, null, 2));
    console.log(`\n📄 Detailed results saved to: ${resultsPath}`);

    // Take final screenshot
    const screenshotPath = join(process.cwd(), 'chatgpt-url-test-screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot saved to: ${screenshotPath}`);

    console.log(`\n${'='.repeat(80)}`);
    console.log('TEST COMPLETE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    throw error;
  } finally {
    // Cleanup
    if (browser) {
      await browser.disconnect();
    }
    if (chrome) {
      try {
        await chrome.kill();
        console.log('\nChrome process terminated');
      } catch {
        // ignore
      }
    }
    // Clean up temp profile
    try {
      await rm(userDataDir, { recursive: true, force: true });
      console.log(`Cleaned up temp profile: ${userDataDir}`);
    } catch {
      // ignore cleanup errors
    }
  }
}

// Run the test
testChatGPTUrlAccess().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
// @ts-nocheck
