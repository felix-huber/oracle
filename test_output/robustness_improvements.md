# Oracle Browser Mode - Robustness Improvements Plan

## Executive Summary

Based on real-world testing of the browser recheck feature, the core functionality works correctly, but several robustness issues were identified that prevent 100% reliability for long-running Pro sessions.

## Issues Found & Solutions

### Issue 1: ChatGPT Session Expiration During Recheck Delay

**Severity**: CRITICAL  
**Impact**: Prevents successful reattachment after long delays

**Problem**: 
During the 2-minute recheck delay, the ChatGPT browser session expired, showing the login screen. When attempting reattachment, the browser was no longer authenticated.

**Root Cause**:
- ChatGPT web sessions expire after ~10-15 minutes of inactivity
- The recheck delay keeps the browser idle while waiting
- No session validation occurs before attempting recheck

**Solution**:
```typescript
// In src/browser/index.ts, before attemptAssistantRecheck()

async function validateSessionBeforeRecheck(
  Runtime: ChromeClient['Runtime'],
  logger: BrowserLogger
): Promise<boolean> {
  // Check if we're still logged in
  const { result } = await Runtime.evaluate({
    expression: `
      document.querySelector('[data-testid="login-button"]') === null &&
      document.querySelector('textarea') !== null
    `,
    returnByValue: true
  });
  
  if (!result?.value) {
    logger('[browser] Session expired during recheck delay, attempting refresh...');
    // Attempt to refresh cookies or navigate to re-login
    return false;
  }
  return true;
}
```

**Implementation**:
1. Add session validation before recheck
2. If session expired, attempt cookie refresh from stored cookies
3. If refresh fails, update session status to "needs_login" and provide clear instructions

---

### Issue 2: --no-wait Flag Doesn't Detach Controller

**Severity**: MEDIUM  
**Impact**: Controller process remains running, confusing monitoring

**Problem**:
The `--no-wait` flag was expected to detach the controller immediately, but the node process (PID 91608) remained running until killed.

**Solution**:
```typescript
// In src/cli/sessionRunner.ts or browser entry point

if (options.detach) {
  // Fork child process and exit parent
  const child = spawn(process.argv[0], process.argv.slice(1).filter(arg => arg !== '--no-wait'), {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  
  // Print session info immediately
  console.log(`Session started: ${sessionId}`);
  console.log(`Reattach with: oracle session ${sessionId}`);
  process.exit(0);
}
```

---

### Issue 3: Session Status Not Updated on Timeout

**Severity**: MEDIUM  
**Impact**: Status shows "running" even when timeout/recheck is in progress

**Problem**:
When timeout is triggered and recheck delay starts, session status remains "running" instead of showing a more descriptive status.

**Solution**:
```typescript
// In src/sessionManager.ts

export type SessionStatus = 
  | 'running'
  | 'waiting_for_recheck'  // NEW
  | 'rechecking'           // NEW
  | 'completed'
  | 'error'
  | 'timeout'
  | 'needs_login';         // NEW

// Update status when entering recheck
async function enterRecheckState(sessionId: string): Promise<void> {
  await updateSessionStatus(sessionId, 'waiting_for_recheck', {
    recheckDelayMs: config.assistantRecheckDelayMs,
    recheckTimeoutMs: config.assistantRecheckTimeoutMs,
    recheckStartsAt: Date.now() + config.assistantRecheckDelayMs
  });
}
```

---

### Issue 4: No Persistent Progress Storage

**Severity**: LOW  
**Impact**: Lost progress information on reattachment

**Solution**:
Store partial progress in session metadata:
```typescript
// In session metadata
{
  "progress": {
    "lastPercentage": 93,
    "lastMessage": "Refining response handling...",
    "lastUpdateAt": "2026-02-03T00:46:00.000Z"
  }
}
```

---

## Implementation Priority

### Phase 1: Critical Fixes (Immediate)
1. **Session Validation Before Recheck**
   - Add `validateSessionBeforeRecheck()` function
   - Implement proactive cookie refresh
   - Update status to "needs_login" if session expired

2. **Shorter Default Delays**
   - Change default recheck delay from 60m to something safer (5-10m)
   - Document session expiration risk in help text

### Phase 2: UX Improvements (Next Release)
3. **Better Status Tracking**
   - Add "waiting_for_recheck" and "rechecking" statuses
   - Store progress percentage in metadata

4. **--no-wait Detachment**
   - Fix controller process detachment
   - Ensure clean exit with session info

### Phase 3: Advanced Features (Future)
5. **External Monitoring**
   - Option to monitor via conversation URL without browser
   - Integration with ChatGPT's export/share features

6. **Session Recovery**
   - Automatic retry with fresh cookies
   - Integration with notification systems on failure

## Testing Recommendations

### Unit Tests
```typescript
// tests/browser/recheck.test.ts
describe('attemptAssistantRecheck', () => {
  it('should validate session before recheck', async () => {
    // Mock expired session
    // Expect session refresh attempt
  });
  
  it('should update status to waiting_for_recheck', async () => {
    // Verify status update
  });
  
  it('should handle session expiration gracefully', async () => {
    // Mock unrecoverable session
    // Expect needs_login status
  });
});
```

### Integration Tests
1. **Short Delay Test** (2m delay)
   - Verify recheck works with valid session
   
2. **Long Delay Test** (15m delay)
   - Verify session expiration handling
   - Verify error message clarity

3. **Reattachment Test**
   - Start session, kill controller
   - Verify reattachment works
   - Verify progress continuation

## Documentation Updates

### CLI Help Text
```
--browser-recheck-delay <duration>
  Wait this long after timeout before retrying capture.
  WARNING: ChatGPT sessions may expire after 10-15 minutes.
  For delays >10m, consider using API mode or monitoring manually.
```

### User Guide
Add section: "Long-Running Browser Sessions"
- Explain session expiration risk
- Recommend API mode for >20m runs
- Provide workaround strategies

## Conclusion

The core recheck feature is working correctly. The main blocker for 100% robustness is external (ChatGPT session management), but we can significantly improve the user experience by:

1. Validating sessions before recheck
2. Providing clear status updates
3. Documenting limitations
4. Implementing recovery workflows

With these improvements, Oracle will handle session expiration gracefully and guide users toward successful recovery.
