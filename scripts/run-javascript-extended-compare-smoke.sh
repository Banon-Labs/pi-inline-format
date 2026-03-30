#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SESSION_NAME="${SESSION_NAME:-pi-inline-smoke-js-extended-compare-$(date +%Y%m%d-%H%M%S)}"
WINDOW_NAME="${WINDOW_NAME:-compare}"
KEEP_OPEN=0
PINNED_SOURCE='git:github.com/Banon-Labs/pi-inline-format-extensions@aac63aed2e92eadba3db97b7eb1e34d0fd11a7d1'
PINNED_HOST_EXTENSION="$REPO_ROOT/.pi/git/github.com/Banon-Labs/pi-inline-format-extensions/packages/host/extensions/index.ts"
LOCAL_HOST_EXTENSION='/home/choza/projects/pi-inline-format-extensions/packages/host/extensions/index.ts'
LOCAL_DIAGNOSTICS_EXTENSION="$REPO_ROOT/extensions/index.ts"
COMPARE_COMMAND='/inline-format-run-deterministic-compare javascript'
COMPARE_EXPECT='hello from js 42'
EXTENDED_EXPECT='// semantic '

while (($# > 0)); do
  case "$1" in
    --session-name)
      SESSION_NAME="$2"
      shift 2
      ;;
    --window-name)
      WINDOW_NAME="$2"
      shift 2
      ;;
    --keep-open)
      KEEP_OPEN=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

TMP_DIR="/tmp/${SESSION_NAME}"
mkdir -p "$TMP_DIR"

cleanup() {
  if [[ "$KEEP_OPEN" -eq 0 ]]; then
    tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
    /home/choza/projects/scripts/tmux-agent-registry.sh prune >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

cd "$REPO_ROOT"
node --input-type=module - <<'NODE'
import { ensurePackageSourceMaterialized } from './scripts/ensure-package-source.mjs';
ensurePackageSourceMaterialized(process.cwd(), 'git:github.com/Banon-Labs/pi-inline-format-extensions@aac63aed2e92eadba3db97b7eb1e34d0fd11a7d1');
NODE

/home/choza/projects/scripts/tmux-agent-registry.sh preflight-smoke >/dev/null 2>&1 || true
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  tmux kill-session -t "$SESSION_NAME"
fi

cat >"$TMP_DIR/baseline.sh" <<INNER
#!/usr/bin/env bash
set -euo pipefail
cd "$REPO_ROOT"
PI_TUI_WRITE_LOG="$TMP_DIR/baseline.write.log" script -q -f "$TMP_DIR/baseline.typescript" -c 'pi --no-session --no-extensions -e "$PINNED_HOST_EXTENSION" -e "$LOCAL_DIAGNOSTICS_EXTENSION"'
INNER
chmod +x "$TMP_DIR/baseline.sh"

cat >"$TMP_DIR/extended.sh" <<INNER
#!/usr/bin/env bash
set -euo pipefail
cd "$REPO_ROOT"
PI_TUI_WRITE_LOG="$TMP_DIR/extended.write.log" script -q -f "$TMP_DIR/extended.typescript" -c 'pi --no-session --no-extensions -e "$LOCAL_HOST_EXTENSION" -e "$LOCAL_DIAGNOSTICS_EXTENSION"'
INNER
chmod +x "$TMP_DIR/extended.sh"

tmux new-session -d -s "$SESSION_NAME" -n "$WINDOW_NAME" "$TMP_DIR/baseline.sh"
BASELINE_PANE=$(tmux list-panes -t "$SESSION_NAME:$WINDOW_NAME" -F '#{pane_id}' | head -n1)
EXTENDED_PANE=$(tmux split-window -h -P -F '#{pane_id}' -t "$BASELINE_PANE" "$TMP_DIR/extended.sh")
tmux select-layout -t "$SESSION_NAME:$WINDOW_NAME" even-horizontal >/dev/null

tmux setw -t "$SESSION_NAME:$WINDOW_NAME" pane-border-status top
tmux setw -t "$SESSION_NAME:$WINDOW_NAME" pane-border-format '#{pane_title}'
tmux select-pane -t "$BASELINE_PANE" -T 'baseline:js-extension'
tmux select-pane -t "$EXTENDED_PANE" -T 'extended:js-extension-extended'
/home/choza/projects/scripts/tmux-agent-registry.sh add "$SESSION_NAME" >/dev/null 2>&1 || true

wait_for_ready() {
  local pane="$1"
  local deadline=$((SECONDS + 120))
  while ((SECONDS < deadline)); do
    local snapshot
    snapshot=$(tmux capture-pane -pt "$pane" || true)
    if grep -Eq '^[[:space:]]*>[[:space:]]*$' <<<"$snapshot"; then
      return 0
    fi
    if grep -Fq 'Pi can explain its own features' <<<"$snapshot"; then
      sleep 1
      return 0
    fi
    sleep 0.2
  done
  echo "Timed out waiting for startup in $pane" >&2
  tmux capture-pane -pt "$pane" | tail -n 120 >&2 || true
  return 1
}

wait_for_text() {
  local pane="$1"
  local needle="$2"
  local deadline=$((SECONDS + 120))
  while ((SECONDS < deadline)); do
    if tmux capture-pane -pt "$pane" | grep -Fq "$needle"; then
      return 0
    fi
    sleep 0.2
  done
  echo "Timed out waiting for '$needle' in $pane" >&2
  tmux capture-pane -pt "$pane" | tail -n 160 >&2 || true
  return 1
}

wait_for_ready "$BASELINE_PANE"
wait_for_ready "$EXTENDED_PANE"

for pane in "$BASELINE_PANE" "$EXTENDED_PANE"; do
  tmux send-keys -t "$pane" C-u
  tmux send-keys -l -t "$pane" "$COMPARE_COMMAND"
  tmux send-keys -t "$pane" Enter
done

wait_for_text "$BASELINE_PANE" "$COMPARE_EXPECT"
wait_for_text "$EXTENDED_PANE" "$COMPARE_EXPECT"
wait_for_text "$EXTENDED_PANE" "$EXTENDED_EXPECT"

if tmux capture-pane -pt "$BASELINE_PANE" | grep -Fq "$EXTENDED_EXPECT"; then
  echo "Baseline pane unexpectedly showed extended semantic footer." >&2
  exit 1
fi

printf '\nSession: %s\nWindow: %s\nArtifacts: %s\n' "$SESSION_NAME" "$WINDOW_NAME" "$TMP_DIR"
printf '  - baseline pane=%s typescript=%s write_log=%s\n' "$BASELINE_PANE" "$TMP_DIR/baseline.typescript" "$TMP_DIR/baseline.write.log"
printf '  - extended pane=%s typescript=%s write_log=%s\n' "$EXTENDED_PANE" "$TMP_DIR/extended.typescript" "$TMP_DIR/extended.write.log"
printf '  - compare command=%s\n' "$COMPARE_COMMAND"

if [[ "$KEEP_OPEN" -eq 1 ]]; then
  trap - EXIT
  echo "Session left running for inspection: $SESSION_NAME"
fi
