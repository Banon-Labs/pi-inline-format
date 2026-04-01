#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SESSION_NAME="${SESSION_NAME:-pi-inline-smoke-semantic-highlight-compare-$(date +%Y%m%d-%H%M%S)}"
WINDOW_NAME="${WINDOW_NAME:-compare}"
KEEP_OPEN=0
SCENARIO="${SCENARIO:-javascript}"
PINNED_SOURCE='git:github.com/Banon-Labs/pi-inline-format-extensions@v0.1.2'
PINNED_HOST_EXTENSION="$REPO_ROOT/.pi/git/github.com/Banon-Labs/pi-inline-format-extensions/packages/host/extensions/index.ts"
LOCAL_HOST_EXTENSION='/home/choza/projects/pi-inline-format-extensions/packages/host/extensions/index.ts'
LOCAL_DIAGNOSTICS_EXTENSION="$REPO_ROOT/extensions/index.ts"

while (($# > 0)); do
  case "$1" in
    --scenario)
      SCENARIO="$2"
      shift 2
      ;;
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

case "$SCENARIO" in
  javascript)
    SCENARIO_LABEL='javascript'
    COMPARE_COMMAND='/inline-format-run-deterministic-compare javascript'
    COMPARE_EXPECT='hello from js 42'
    COMPARE_LINE='console.log("hello from js", value);'
    PANE_SUFFIX='js-extension'
    ;;
  typescript)
    SCENARIO_LABEL='typescript'
    COMPARE_COMMAND='/inline-format-run-deterministic-compare typescript'
    COMPARE_EXPECT='(no output)'
    COMPARE_LINE='const answer: Answer = { value: 42 };'
    PANE_SUFFIX='ts-extension'
    ;;
  *)
    echo "Unsupported scenario: $SCENARIO" >&2
    exit 1
    ;;
esac

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
ensurePackageSourceMaterialized(process.cwd(), 'git:github.com/Banon-Labs/pi-inline-format-extensions@v0.1.2');
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
tmux select-pane -t "$BASELINE_PANE" -T "baseline:${PANE_SUFFIX}"
tmux select-pane -t "$EXTENDED_PANE" -T "extended:${PANE_SUFFIX}"
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
wait_for_text "$BASELINE_PANE" 'Took '
wait_for_text "$EXTENDED_PANE" 'Took '

tmux capture-pane -ep -t "$BASELINE_PANE" -S -80 >"$TMP_DIR/baseline.capture"
tmux capture-pane -ep -t "$EXTENDED_PANE" -S -80 >"$TMP_DIR/extended.capture"

COMPARE_LINE_ENV="$COMPARE_LINE" TMP_DIR_ENV="$TMP_DIR" python3 - <<'PY'
from pathlib import Path
import os, re
compare_line = os.environ['COMPARE_LINE_ENV']
tmp_dir = Path(os.environ['TMP_DIR_ENV'])
ansi = re.compile(r'\x1b\[[0-9;]*[A-Za-z]')
osc = re.compile(r'\x1b\][^\x07]*(?:\x07|\x1b\\)')

def normalize(raw: str) -> str:
    return ansi.sub('', osc.sub('', raw)).rstrip()

def find_matching_line(text: str):
    for raw_line in text.splitlines():
        plain_line = normalize(raw_line)
        if compare_line in plain_line:
            return raw_line, plain_line
    return None

baseline_text = (tmp_dir / 'baseline.capture').read_text(errors='ignore')
extended_text = (tmp_dir / 'extended.capture').read_text(errors='ignore')
if '// semantic ' in baseline_text or '// semantic ' in extended_text:
    raise SystemExit('semantic footer text should not be present in highlighting-only compare output')
baseline_line = find_matching_line(baseline_text)
extended_line = find_matching_line(extended_text)
if baseline_line is None or extended_line is None:
    raise SystemExit('could not locate the compare line in one or both pane captures')
if baseline_line[1] != extended_line[1]:
    raise SystemExit('baseline and extended no longer preserve the same visible source text')
status = 'highlight parity achieved'
if baseline_line[0] != extended_line[0]:
    status = 'highlight-only visual difference detected'
print(status)
print('baseline line:', baseline_line[1])
print('extended line:', extended_line[1])
PY

printf '\nSession: %s\nWindow: %s\nScenario: %s\nArtifacts: %s\n' "$SESSION_NAME" "$WINDOW_NAME" "$SCENARIO" "$TMP_DIR"
printf '  - baseline pane=%s typescript=%s write_log=%s capture=%s\n' "$BASELINE_PANE" "$TMP_DIR/baseline.typescript" "$TMP_DIR/baseline.write.log" "$TMP_DIR/baseline.capture"
printf '  - extended pane=%s typescript=%s write_log=%s capture=%s\n' "$EXTENDED_PANE" "$TMP_DIR/extended.typescript" "$TMP_DIR/extended.write.log" "$TMP_DIR/extended.capture"
printf '  - compare command=%s\n' "$COMPARE_COMMAND"

if [[ "$KEEP_OPEN" -eq 1 ]]; then
  trap - EXIT
  echo "Session left running for inspection: $SESSION_NAME"
fi
