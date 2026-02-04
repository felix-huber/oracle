# Browser Mode Implementation Summary

## Overview
The Oracle CLI's browser mode automates Chrome to interact with ChatGPT via the Chrome DevTools Protocol (CDP). This enables running prompts against browser-based models that aren't available via API.

## Key Files and Their Roles

### Core Browser Automation

**`src/browser/index.ts`** (1790 lines)
- Main entry point: `runBrowserMode()` function
- Handles both local and remote Chrome modes
- Implements the delayed recheck feature (`assistantRecheckDelayMs`, `assistantRecheckTimeoutMs`)
- Manages full lifecycle: Chrome launch → cookie sync → navigation → prompt submission → response capture → cleanup
- Key functions:
  - `attemptAssistantRecheck()` - Waits and retries after timeout for long Pro runs
  - `waitForAssistantResponseWithReload()` - Wraps response waiting with reload fallback
  - `maybeRecoverLongAssistantResponse()` - Post-capture refresh for streaming responses
  - `startThinkingStatusMonitor()` - Periodic status logging during thinking

**`src/browser/sessionRunner.ts`** (157 lines)
- Higher-level orchestration: `runBrowserSessionExecution()`
- Assembles browser prompts with attachments
- Handles token estimation for browser mode
- Bridges CLI options to browser mode execution

### Chrome Lifecycle Management

**`src/browser/chromeLifecycle.ts`** (412 lines)
- `launchChrome()` - Chrome launch with custom flags and port selection
- `registerTerminationHooks()` - SIGINT/SIGTERM handling, session persistence
- `connectToChrome()` / `connectToRemoteChrome()` - CDP connection establishment
- `hideChromeWindow()` - macOS window hiding via AppleScript
- Custom port availability checking to avoid attaching to stray Chrome

### Session Recovery & Reattachment

**`src/browser/reattach.ts`** (266 lines)
- `resumeBrowserSession()` - Reconnect to existing Chrome session
- `resumeBrowserSessionViaNewChrome()` - Recovery when direct reattach fails
- Handles conversation URL rebuilding and sidebar navigation
- Implements ping timeout and target validation

**`src/browser/reattachHelpers.ts`** (444 lines)
- `pickTarget()` - Select appropriate Chrome DevTools target
- `openConversationFromSidebar()` / `openConversationFromSidebarWithRetry()` - DOM-based conversation finding
- `buildPromptEchoMatcher()` / `recoverPromptEcho()` - Detect and recover from prompt echo issues
- `alignPromptEchoMarkdown()` - Normalize text vs markdown discrepancies
- `waitForPromptPreview()` - Verify correct conversation by prompt content

### Response Capture

**`src/browser/actions/assistantResponse.ts`** (1118 lines)
- `waitForAssistantResponse()` - Dual-path detection (MutationObserver + polling)
- `pollAssistantCompletion()` - Watchdog poller with stability detection
- `captureAssistantMarkdown()` - Clipboard interception for markdown
- `buildResponseObserverExpression()` - Injected JS for DOM observation
- Handles "Pro thinking" placeholder detection (filters "Answer now" text)
- Dynamic stability windows based on answer length (short/medium/long)

### Prompt & Attachment Handling

**`src/browser/prompt.ts`** (214 lines)
- `assembleBrowserPrompt()` - Build composer text and attachment plan
- Handles inline vs upload attachment policies
- File bundling for large attachment sets
- Media file detection and handling

**`src/browser/policies.ts`**
- `buildAttachmentPlan()` - Decide inline vs upload vs bundle strategy

### Navigation & DOM Actions

**`src/browser/actions/navigation.ts`**
- `navigateToChatGPT()` - Page navigation with readiness checks
- `ensureNotBlocked()` - Cloudflare/interstitial detection
- `ensureLoggedIn()` - Session validation
- `ensurePromptReady()` - Textarea focus and readiness

**`src/browser/actions/promptComposer.ts`**
- `submitPrompt()` - Type and submit prompt, handle Enter key
- `clearPromptComposer()` - Clear textarea before new prompt

**`src/browser/actions/attachments.ts`**
- `uploadAttachmentFile()` - File selection via CDP
- `waitForAttachmentCompletion()` - UI confirmation of uploads
- `waitForUserTurnAttachments()` - Verify attachments on sent message

### Model & Configuration

**`src/browser/config.ts`** (103 lines)
- `resolveBrowserConfig()` - Merge CLI options with defaults
- Default: 120s timeout, 60s input timeout, 0ms recheck delay (disabled by default)
- Windows-specific defaults (manual login enabled, cookie sync disabled)

**`src/browser/modelStrategy.ts`**
- `ensureModelSelection()` - Change model via UI picker
- Strategy: "select" | "verify" | "ignore"

**`src/browser/actions/thinkingTime.ts`** (234 lines)
- `ensureThinkingTime()` / `ensureThinkingTimeIfAvailable()` - Pro thinking level selection
- Dropdown menu interaction for "light" | "standard" | "extended" | "heavy"

### Utilities

**`src/browser/utils.ts`**
- `withRetries()` - Retry wrapper with backoff
- `estimateTokenCount()` - Simple tokenizer for output estimation
- `delay()` - Promise-based sleep

**`src/browser/constants.ts`**
- CSS selectors for ChatGPT DOM elements
- `CHATGPT_URL` default
- `DEFAULT_MODEL_STRATEGY` / `DEFAULT_MODEL_TARGET`

**`src/browser/types.ts`**
- TypeScript interfaces for browser config, attachments, CDP client

**`src/browser/domDebug.ts`**
- `logDomFailure()` - Save DOM snapshots for debugging
- `buildConversationDebugExpression()` - Diagnostic JS for troubleshooting

## Key Features

### 1. Delayed Recheck for Long Pro Runs
Configurable via `assistantRecheckDelayMs` (default: 0/disabled) and `assistantRecheckTimeoutMs` (default: 120s):
- When initial `waitForAssistantResponse()` times out, if recheck is enabled, waits the delay period
- Then reloads the conversation URL and retries with `waitForAssistantResponseWithReload()`
- This allows Pro runs that take 10+ minutes to complete without blocking forever

### 2. Dual-Path Response Detection
- **MutationObserver path**: Fast, reacts to DOM changes in real-time
- **Polling watchdog path**: Fallback when observers miss or JS stalls
- Winner takes all via `Promise.race()`, with proper cleanup of the loser

### 3. Prompt Echo Detection
Compares captured response against original prompt to detect cases where:
- ChatGPT echoes the user prompt instead of responding
- The response contains only "ChatGPT said..." placeholder
- Uses normalized text comparison (whitespace-insensitive, prefix matching)

### 4. Session Persistence
- Runtime hints written with Chrome port/PID/URL for reattachment
- `registerTerminationHooks()` keeps Chrome running on SIGINT if response pending
- `oracle session <slug>` command can reattach to in-flight sessions

### 5. Attachment Handling
- Supports file uploads via CDP Input domain
- Inline embedding for small files (< 60k chars default)
- Automatic bundling for large file sets
- Media files detected by extension and handled appropriately

## Potential Areas of Concern

1. **Race Conditions**: Multiple overlapping timers (observer, poller, thinking monitor, attachment waits)
2. **DOM Fragility**: Heavy reliance on ChatGPT's DOM structure which can change
3. **Timeout Interactions**: Multiple timeout layers (overall, input, recheck, attachment) may interact unexpectedly
4. **Error Recovery**: WebSocket disconnects mid-run require reattachment rather than automatic recovery
5. **Resource Cleanup**: Temporary profile directories must be cleaned up even on crashes
