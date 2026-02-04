#!/usr/bin/env bash
#
# test-pro-recheck.sh - Test script for Oracle's browser mode delayed recheck feature
#
# DESCRIPTION:
#   This script tests the browser recheck functionality designed for long-running
#   ChatGPT Pro sessions that may take 60-90 minutes to complete. Unlike the
#   standard Oracle behavior (which fails on timeout), this script demonstrates
#   the recheck flow that automatically retries capture after a configurable delay.
#
#   STANDARD BEHAVIOR:
#   - If assistant response times out, the run fails immediately
#   - User must manually reattach later with `oracle session <id>`
#
#   RECHECK BEHAVIOR (this script):
#   - After initial timeout, waits a configurable delay (e.g., 60m)
#   - Reopens the conversation URL automatically
#   - Retries capture for a configurable timeout (e.g., 5m)
#   - Only fails if recheck also times out, keeping session reattachable
#
# USAGE:
#   ./scripts/test-pro-recheck.sh
#
#   # With custom parameters
#   PROMPT_FILE=/path/to/prompt.txt \
#   ATTACH_FILE=/path/to/file.md \
#   BROWSER_TIMEOUT=20m \
#   RECHECK_DELAY=60m \
#   RECHECK_TIMEOUT=5m \
#   ATTACH_AFTER_SECONDS=3900 \
#   ./scripts/test-pro-recheck.sh
#
# ENVIRONMENT VARIABLES:
#   ORACLE_BIN              Path to oracle CLI binary (default: dist/bin/oracle-cli.js)
#   PROMPT_FILE             Path to file containing the prompt text
#   ATTACH_FILE             Path to file to attach to the request
#   OUTPUT_DIR              Directory for output files (default: artifacts/06-oracle/prd)
#   OUTPUT_PATH             Full path for output file (auto-generated with timestamp if not set)
#   LOG_FILE                Path to log file (auto-generated if not set)
#
#   BROWSER_TIMEOUT         Initial timeout for assistant response (default: 20m)
#   RECHECK_DELAY           Delay before rechecking after timeout (default: 60m)
#   RECHECK_TIMEOUT         Time budget for recheck capture attempt (default: 5m)
#   ATTACH_AFTER_SECONDS    Seconds to sleep before reattaching (default: 3900 = 65m)
#
#   PROMPT_PREFIX           Prefix added to prompt (default: "#SIMP-001")
#
# NEW CLI FLAGS (used by this script):
#   --browser-recheck-delay <duration>
#       Wait this long after initial timeout before revisiting the conversation.
#       Accepts: ms, s, m, h (e.g., "60m", "1h", "3600s")
#
#   --browser-recheck-timeout <duration>
#       How long to spend trying to capture the answer during the recheck.
#       Accepts: ms, s, m, h (default: 120s if not specified)
#
# CONFIGURATION FILE:
#   You can also set these in ~/.oracle/config.json:
#   {
#     browser: {
#       assistantRecheckDelayMs: 3600000,    // 60 minutes in milliseconds
#       assistantRecheckTimeoutMs: 300000    // 5 minutes in milliseconds
#     }
#   }
#
# FLOW:
#   1. Builds oracle CLI if needed
#   2. Runs oracle with --no-wait to detach immediately
#   3. Captures session ID from output
#   4. Sleeps for ATTACH_AFTER_SECONDS
#   5. Reattaches to session with `oracle session <id>`
#   6. Captures final output to file
#
# NOTES:
#   - Uses --browser-manual-login and --browser-no-cookie-sync for standalone operation
#   - Uses --no-wait so the CLI detaches immediately after starting
#   - Session remains running even if both initial and recheck attempts timeout
#   - Designed for gpt-5.2-pro which can have very long thinking times
#
# REQUIREMENTS:
#   - Node.js 22+
#   - pnpm (for building if binary doesn't exist)
#   - ChatGPT manual login (script will prompt on first run)
#
# AUTHOR:
#   Oracle CLI test suite
#

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Configuration with defaults
ORACLE_BIN="${ORACLE_BIN:-$REPO_ROOT/dist/bin/oracle-cli.js}"
PROMPT_FILE="${PROMPT_FILE:-$REPO_ROOT/prompts/prd/simplicity.txt}"
ATTACH_FILE="${ATTACH_FILE:-$REPO_ROOT/artifacts/final_combined_prd_v9.md}"
OUTPUT_DIR="${OUTPUT_DIR:-$REPO_ROOT/artifacts/06-oracle/prd}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_PATH="${OUTPUT_PATH:-$OUTPUT_DIR/${TIMESTAMP}_simplicity.md}"
LOG_FILE="${LOG_FILE:-$OUTPUT_DIR/${TIMESTAMP}_oracle_run.log}"

# Browser recheck timing configuration
BROWSER_TIMEOUT="${BROWSER_TIMEOUT:-20m}"
RECHECK_DELAY="${RECHECK_DELAY:-60m}"
RECHECK_TIMEOUT="${RECHECK_TIMEOUT:-5m}"
ATTACH_AFTER_SECONDS="${ATTACH_AFTER_SECONDS:-3900}"

PROMPT_PREFIX="${PROMPT_PREFIX:-#SIMP-001}"

mkdir -p "$OUTPUT_DIR"

# Build oracle CLI if needed
if [[ ! -f "$ORACLE_BIN" ]]; then
  echo "[setup] Building oracle CLI..."
  (cd "$REPO_ROOT" && pnpm install && pnpm build)
fi

# Validate inputs
if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "[error] Prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi

if [[ ! -f "$ATTACH_FILE" ]]; then
  echo "[error] Attachment file not found: $ATTACH_FILE" >&2
  exit 1
fi

PROMPT_CONTENT="$PROMPT_PREFIX

$(cat "$PROMPT_FILE")"

# Build command array
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
  --no-wait
  --force
  --prompt "$PROMPT_CONTENT"
  --file "$ATTACH_FILE"
  --write-output "$OUTPUT_PATH"
)

echo "[run] ${CMD[*]}" | tee "$LOG_FILE"
"${CMD[@]}" 2>&1 | tee -a "$LOG_FILE"

# Extract session ID from log
SESSION_ID="$(grep -Eo "oracle session [a-z0-9-]+" "$LOG_FILE" | tail -n1 | awk '{print $3}')"
if [[ -z "${SESSION_ID:-}" ]]; then
  echo "[error] Failed to detect session id in log: $LOG_FILE" >&2
  exit 1
fi

echo "[info] Session id: $SESSION_ID" | tee -a "$LOG_FILE"

echo "[sleep] Waiting ${ATTACH_AFTER_SECONDS}s before reattach..." | tee -a "$LOG_FILE"
sleep "$ATTACH_AFTER_SECONDS"

echo "[reattach] oracle session $SESSION_ID" | tee -a "$LOG_FILE"
node "$ORACLE_BIN" session "$SESSION_ID" | tee -a "$LOG_FILE"

echo "[done] Output: $OUTPUT_PATH" | tee -a "$LOG_FILE"
