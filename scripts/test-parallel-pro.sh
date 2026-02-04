#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORACLE_BIN="${ORACLE_BIN:-$REPO_ROOT/dist/bin/oracle-cli.js}"
PROFILE_DIR="${PROFILE_DIR:-$HOME/.oracle/browser-profile}"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/test_output/parallel}"
ATTACH_FILE="${ATTACH_FILE:-$REPO_ROOT/README.md}"

BROWSER_TIMEOUT="${BROWSER_TIMEOUT:-6m}"
RECHECK_DELAY="${RECHECK_DELAY:-30m}"
RECHECK_TIMEOUT="${RECHECK_TIMEOUT:-3m}"
AUTO_REATTACH_DELAY="${AUTO_REATTACH_DELAY:-0m}"
AUTO_REATTACH_INTERVAL="${AUTO_REATTACH_INTERVAL:-2m}"
AUTO_REATTACH_TIMEOUT="${AUTO_REATTACH_TIMEOUT:-2m}"
REUSE_WAIT="${REUSE_WAIT:-15s}"
PROFILE_LOCK_TIMEOUT="${PROFILE_LOCK_TIMEOUT:-10m}"
WAIT_BEFORE_REATTACH="${WAIT_BEFORE_REATTACH:-480}"

mkdir -p "$OUT_DIR"

if [[ ! -f "$ORACLE_BIN" ]]; then
  echo "[setup] Building oracle CLI..."
  (cd "$REPO_ROOT" && pnpm install && pnpm build)
fi

if [[ ! -f "$ATTACH_FILE" ]]; then
  echo "[error] Attachment file not found: $ATTACH_FILE" >&2
  exit 1
fi

PROMPTS=(
  "PRO-PAR-01: Respond with a 2-line JSON: {id:1, ok:true, note:'alpha'}"
  "PRO-PAR-02: Respond with a 2-line JSON: {id:2, ok:true, note:'beta'}"
  "PRO-PAR-03: Respond with a 2-line JSON: {id:3, ok:true, note:'gamma'}"
  "PRO-PAR-04: Respond with a 2-line JSON: {id:4, ok:true, note:'delta'}"
)

SESSION_FILE="$OUT_DIR/sessions.txt"
: > "$SESSION_FILE"

run_prompt() {
  local idx="$1"
  local prompt="$2"
  local slug="pro-par-${idx}"
  local log="$OUT_DIR/run_${idx}.log"
  local out="$OUT_DIR/out_${idx}.md"
  echo "[run $idx] $prompt" | tee "$log"
  ORACLE_BROWSER_PROFILE_DIR="$PROFILE_DIR" node "$ORACLE_BIN" \
    --engine browser \
    --browser-manual-login \
    --browser-no-cookie-sync \
    --browser-keep-browser \
    --browser-reuse-wait "$REUSE_WAIT" \
    --browser-profile-lock-timeout "$PROFILE_LOCK_TIMEOUT" \
    --model gpt-5.2-pro \
    --timeout auto \
    --browser-attachments auto \
    --browser-timeout "$BROWSER_TIMEOUT" \
    --browser-recheck-delay "$RECHECK_DELAY" \
    --browser-recheck-timeout "$RECHECK_TIMEOUT" \
    --browser-auto-reattach-delay "$AUTO_REATTACH_DELAY" \
    --browser-auto-reattach-interval "$AUTO_REATTACH_INTERVAL" \
    --browser-auto-reattach-timeout "$AUTO_REATTACH_TIMEOUT" \
    --force \
    --slug "$slug" \
    --prompt "$prompt" \
    --file "$ATTACH_FILE" \
    --write-output "$out" \
    2>&1 | tee -a "$log"
  echo "$slug" >> "$SESSION_FILE"
  echo "[run $idx] session=$slug" | tee -a "$log"
}

for i in "${!PROMPTS[@]}"; do
  run_prompt "$((i+1))" "${PROMPTS[$i]}" &
  sleep 1
done
wait

echo "[sleep] Waiting ${WAIT_BEFORE_REATTACH}s before reattach..." | tee -a "$OUT_DIR/reattach.log"
sleep "$WAIT_BEFORE_REATTACH"

idx=1
while read -r sid; do
  echo "[reattach $idx] $sid" | tee -a "$OUT_DIR/reattach.log"
  ORACLE_BROWSER_PROFILE_DIR="$PROFILE_DIR" node "$ORACLE_BIN" session "$sid" | tee -a "$OUT_DIR/reattach.log"
  idx=$((idx+1))
done < "$SESSION_FILE"

echo "[done] outputs in $OUT_DIR" | tee -a "$OUT_DIR/reattach.log"
