#!/usr/bin/env bash
#
# test-pro-recheck-robust.sh - Robust test for Oracle's browser recheck feature
#
# This improved version addresses issues found in initial testing:
# - Shorter delays to avoid ChatGPT session expiration
# - Better session monitoring
# - Automatic conversation URL extraction
# - Fallback handling for session expiration
#

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORACLE_BIN="${ORACLE_BIN:-$REPO_ROOT/dist/bin/oracle-cli.js}"

# Test configuration - Using shorter delays to avoid session expiration
# Issue found: ChatGPT sessions expire during long (60m+) delays
PROMPT_FILE="${PROMPT_FILE:-$REPO_ROOT/test_prompt.txt}"
ATTACH_FILE="${ATTACH_FILE:-$REPO_ROOT/browser_summary.md}"
OUTPUT_DIR="${OUTPUT_DIR:-$REPO_ROOT/test_output}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_PATH="${OUTPUT_PATH:-$OUTPUT_DIR/${TIMESTAMP}_result.md}"
LOG_FILE="${LOG_FILE:-$OUTPUT_DIR/${TIMESTAMP}_run.log}"

# Timing configuration
# Note: ChatGPT sessions may expire after ~10-15 minutes of inactivity
# Use shorter delays for testing, or ensure active browser usage
BROWSER_TIMEOUT="${BROWSER_TIMEOUT:-5m}"
RECHECK_DELAY="${RECHECK_DELAY:-30s}"  # Short delay for testing (avoid session expiry)
RECHECK_TIMEOUT="${RECHECK_TIMEOUT:-2m}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
  echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"
}

warn() {
  echo -e "${YELLOW}[$(date '+%H:%M:%S')] WARNING:${NC} $*" | tee -a "$LOG_FILE"
}

error() {
  echo -e "${RED}[$(date '+%H:%M:%S')] ERROR:${NC} $*" | tee -a "$LOG_FILE"
}

mkdir -p "$OUTPUT_DIR"

# Build oracle CLI if needed
if [[ ! -f "$ORACLE_BIN" ]]; then
  log "Building oracle CLI..."
  (cd "$REPO_ROOT" && pnpm install && pnpm build)
fi

# Validate inputs
if [[ ! -f "$PROMPT_FILE" ]]; then
  error "Prompt file not found: $PROMPT_FILE"
  exit 1
fi

if [[ ! -f "$ATTACH_FILE" ]]; then
  error "Attachment file not found: $ATTACH_FILE"
  exit 1
fi

# Create test prompt with metadata
PROMPT_CONTENT="This is a test of the Oracle CLI browser recheck feature.

$(cat "$PROMPT_FILE")

---
Test metadata:
- Timestamp: $TIMESTAMP
- Browser timeout: $BROWSER_TIMEOUT
- Recheck delay: $RECHECK_DELAY
- Recheck timeout: $RECHECK_TIMEOUT"

log "Starting Oracle browser test with recheck feature"
log "Browser timeout: $BROWSER_TIMEOUT"
log "Recheck delay: $RECHECK_DELAY"
log "Recheck timeout: $RECHECK_TIMEOUT"

# Build command
CMD=(
  node "$ORACLE_BIN"
  --engine browser
  --browser-manual-login
  --browser-no-cookie-sync
  --model gpt-5.2-pro
  --timeout auto
  --browser-attachments auto
  --browser-timeout "$BROWSER_TIMEOUT"
  --browser-recheck-delay "$RECHECK_DELAY"
  --browser-recheck-timeout "$RECHECK_TIMEOUT"
  --verbose
  --prompt "$PROMPT_CONTENT"
  --file "$ATTACH_FILE"
  --write-output "$OUTPUT_PATH"
)

log "Command: ${CMD[*]}"

# Run oracle and capture output
if ! "${CMD[@]}" 2>&1 | tee "$LOG_FILE"; then
  # Command failed or timed out - this is expected for long Pro runs
  log "Oracle command exited (may be expected for timeout/recheck scenario)"
fi

# Extract session ID from log
SESSION_ID="$(grep -oE "oracle session [a-z0-9-]+" "$LOG_FILE" 2>/dev/null | tail -n1 | awk '{print $3}' || true)"

if [[ -z "${SESSION_ID:-}" ]]; then
  # Try to extract from "Session still in flight" message
  SESSION_ID="$(grep -oE "oracle session <[a-z0-9-]+>" "$LOG_FILE" 2>/dev/null | tail -n1 | sed 's/.*<\(.*\)>.*/\1/' || true)"
fi

if [[ -z "${SESSION_ID:-}" ]]; then
  # Try to find from recent sessions
  log "Session ID not found in log, checking recent sessions..."
  SESSION_ID="$(cd "$REPO_ROOT" && node "$ORACLE_BIN" status --hours 1 2>/dev/null | grep "running" | head -n1 | awk '{print $NF}' || true)"
fi

if [[ -n "${SESSION_ID:-}" ]]; then
  log "Session ID: $SESSION_ID"
  
  # Extract conversation URL
  CONVERSATION_URL="$(grep -oE "https://chatgpt.com/c/[a-f0-9-]+" "$LOG_FILE" 2>/dev/null | tail -n1 || true)"
  if [[ -n "$CONVERSATION_URL" ]]; then
    log "Conversation URL: $CONVERSATION_URL"
    echo "$CONVERSATION_URL" > "$OUTPUT_DIR/${TIMESTAMP}_conversation_url.txt"
  fi
  
  # Wait for potential recheck
  log "Waiting ${RECHECK_DELAY} for potential recheck..."
  sleep "${RECHECK_DELAY%s}s"  # Remove 's' suffix if present
  
  # Check session status
  log "Checking session status..."
  node "$ORACLE_BIN" status --hours 1 2>/dev/null | grep "$SESSION_ID" | tee -a "$LOG_FILE"
  
  # Try to reattach
  log "Attempting to reattach to session..."
  if node "$ORACLE_BIN" session "$SESSION_ID" 2>&1 | tee -a "$LOG_FILE"; then
    log "Reattachment successful!"
  else
    warn "Reattachment failed - session may require manual login or have expired"
    
    # Provide manual recovery instructions
    if [[ -n "$CONVERSATION_URL" ]]; then
      log "Manual recovery: Open $CONVERSATION_URL in your browser"
      log "Then run: oracle session $SESSION_ID"
    fi
  fi
else
  warn "Could not determine session ID"
fi

# Check for result
if [[ -f "$OUTPUT_PATH" ]]; then
  RESULT_SIZE="$(wc -c < "$OUTPUT_PATH")"
  log "Output file created: $OUTPUT_PATH ($RESULT_SIZE bytes)"
  
  if [[ "$RESULT_SIZE" -gt 100 ]]; then
    log "${GREEN}SUCCESS:${NC} Test completed with output"
    head -20 "$OUTPUT_PATH"
  else
    warn "Output file seems small - may be incomplete"
  fi
else
  warn "No output file created at $OUTPUT_PATH"
fi

# Summary
log "--- Test Summary ---"
log "Log file: $LOG_FILE"
log "Session ID: ${SESSION_ID:-unknown}"
log "Output path: $OUTPUT_PATH"

# Check log for key indicators
if grep -q "Assistant response timed out" "$LOG_FILE" 2>/dev/null; then
  log "✓ Timeout detected (expected)"
fi

if grep -q "waiting.*before rechecking" "$LOG_FILE" 2>/dev/null; then
  log "✓ Recheck delay initiated"
fi

if grep -q "Recovered assistant response after delayed recheck" "$LOG_FILE" 2>/dev/null; then
  log "✓ Recheck succeeded"
fi

if grep -q "Session still in flight" "$LOG_FILE" 2>/dev/null; then
  log "✓ Session persistence working"
fi

log "Test complete. Check $LOG_FILE for details."
