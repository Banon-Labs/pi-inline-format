#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SCENARIO="${SCENARIO:-typescript}"
SESSION_NAME="${SESSION_NAME:-pi-inline-smoke-ansi-capture-$(date +%Y%m%d-%H%M%S)}"
WINDOW_NAME="${WINDOW_NAME:-proof}"
KEEP_OPEN=0

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
  python)
    TARGET_COMMAND='/inline-format-run-deterministic-compare python'
    EXPECT_TEXT='print("hello from /tmp/delete.me.py")'
    PLAIN_LINE='print("hello from /tmp/delete.me.py")'
    ANSI_REGEX='\x1b\[[0-9;]*mprint\x1b\[39m\('
    ;;
  javascript)
    TARGET_COMMAND='/inline-format-run-deterministic-compare javascript'
    EXPECT_TEXT='console.log("hello from js", value);'
    PLAIN_LINE='console.log("hello from js", value);'
    ANSI_REGEX='\x1b\[[0-9;]*mconsole\x1b\[39m\.log\('
    ;;
  typescript)
    TARGET_COMMAND='/inline-format-run-deterministic-compare typescript'
    EXPECT_TEXT='type Answer = {'
    PLAIN_LINE='type Answer = {'
    ANSI_REGEX='\x1b\[[0-9;]*mtype\x1b\[39m Answer = \{'
    ;;
  bash)
    TARGET_COMMAND='/inline-format-run-deterministic-compare bash'
    EXPECT_TEXT='echo "hello from sh"'
    PLAIN_LINE='echo "hello from sh"'
    ANSI_REGEX='\x1b\[[0-9;]*mecho\x1b\[39m'
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

/home/choza/projects/scripts/tmux-agent-registry.sh preflight-smoke >/dev/null 2>&1 || true
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  tmux kill-session -t "$SESSION_NAME"
fi

cat >"$TMP_DIR/target.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$REPO_ROOT"
PI_TUI_WRITE_LOG="$TMP_DIR/target.write.log" script -q -f "$TMP_DIR/target.typescript" -c 'pi --no-session'
EOF
chmod +x "$TMP_DIR/target.sh"

cat >"$TMP_DIR/replay.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
REPLAY_FILE="$TMP_DIR/replay.ansi"
while [[ ! -s "\$REPLAY_FILE" ]]; do
  sleep 0.1
done
cat "\$REPLAY_FILE"
sleep 300
EOF
chmod +x "$TMP_DIR/replay.sh"

cat >"$TMP_DIR/observer.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$REPO_ROOT"
PI_TUI_WRITE_LOG="$TMP_DIR/observer.write.log" script -q -f "$TMP_DIR/observer.typescript" -c 'pi --no-session'
EOF
chmod +x "$TMP_DIR/observer.sh"

tmux new-session -d -s "$SESSION_NAME" -n "$WINDOW_NAME" "$TMP_DIR/target.sh"
TARGET_PANE=$(tmux list-panes -t "$SESSION_NAME:$WINDOW_NAME" -F '#{pane_id}' | head -n1)
REPLAY_PANE=$(tmux split-window -h -P -F '#{pane_id}' -t "$TARGET_PANE" "$TMP_DIR/replay.sh")
OBSERVER_PANE=$(tmux split-window -v -P -F '#{pane_id}' -t "$REPLAY_PANE" "$TMP_DIR/observer.sh")
tmux select-layout -t "$SESSION_NAME:$WINDOW_NAME" tiled >/dev/null

tmux setw -t "$SESSION_NAME:$WINDOW_NAME" pane-border-status top
tmux setw -t "$SESSION_NAME:$WINDOW_NAME" pane-border-format '#{pane_title}'
tmux select-pane -t "$TARGET_PANE" -T "target:${SCENARIO}"
tmux select-pane -t "$REPLAY_PANE" -T "replay:ansi-source"
tmux select-pane -t "$OBSERVER_PANE" -T "observer:tmux-capture"
/home/choza/projects/scripts/tmux-agent-registry.sh add "$SESSION_NAME" >/dev/null 2>&1 || true

wait_for_prompt() {
  local pane="$1"
  local deadline=$((SECONDS + 90))
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
    if grep -Fq "$(basename "$REPO_ROOT")" <<<"$snapshot"; then
      sleep 1
      return 0
    fi
    sleep 0.2
  done
  echo "Timed out waiting for prompt in $pane" >&2
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

wait_for_file() {
  local path="$1"
  local deadline=$((SECONDS + 120))
  while ((SECONDS < deadline)); do
    if [[ -s "$path" ]]; then
      return 0
    fi
    sleep 0.2
  done
  echo "Timed out waiting for file: $path" >&2
  return 1
}

wait_for_prompt "$TARGET_PANE"
wait_for_prompt "$OBSERVER_PANE"

tmux send-keys -t "$TARGET_PANE" C-u
tmux send-keys -l -t "$TARGET_PANE" "$TARGET_COMMAND"
tmux send-keys -t "$TARGET_PANE" Enter
wait_for_text "$TARGET_PANE" "Took "
wait_for_file "$TMP_DIR/target.write.log"

PLAIN_LINE_ENV="$PLAIN_LINE" ANSI_REGEX_ENV="$ANSI_REGEX" TMP_DIR_ENV="$TMP_DIR" python3 - <<'PY'
from pathlib import Path
import os, re
plain_line = os.environ['PLAIN_LINE_ENV']
ansi_regex = re.compile(os.environ['ANSI_REGEX_ENV'])
tmp_dir = Path(os.environ['TMP_DIR_ENV'])
ansi_strip = re.compile(r'\x1b\[[0-9;]*[A-Za-z]')
replay_lines = []
for candidate in [tmp_dir / 'target.write.log', tmp_dir / 'target.typescript']:
    if not candidate.exists():
        continue
    for line in candidate.read_text(errors='ignore').splitlines():
        plain = ansi_strip.sub('', line)
        if plain_line in plain and ansi_regex.search(line):
            replay_lines.append(line)
    if replay_lines:
        break
if not replay_lines:
    raise SystemExit('could not extract ANSI-rich proof line from target.write.log or target.typescript')
(tmp_dir / 'replay.ansi').write_text('\n'.join(replay_lines) + '\n')
print('extracted replay lines', len(replay_lines))
PY

wait_for_text "$REPLAY_PANE" "$PLAIN_LINE"

OBSERVER_PROMPT="Use the tmux-capture tool with name $REPLAY_PANE, lines 20, and ansi true. Do not do anything else."
tmux send-keys -t "$OBSERVER_PANE" C-u
tmux send-keys -l -t "$OBSERVER_PANE" "$OBSERVER_PROMPT"
tmux send-keys -t "$OBSERVER_PANE" Enter
wait_for_text "$OBSERVER_PANE" "$PLAIN_LINE"
wait_for_file "$TMP_DIR/observer.write.log"

ANSI_REGEX_ENV="$ANSI_REGEX" TMP_DIR_ENV="$TMP_DIR" python3 - <<'PY'
from pathlib import Path
import os, re
log_path = Path(os.environ['TMP_DIR_ENV']) / 'observer.write.log'
text = log_path.read_text(errors='ignore')
pattern = re.compile(os.environ['ANSI_REGEX_ENV'])
if pattern.search(text) is None:
    raise SystemExit('observer write log did not preserve the expected ANSI-highlighted pattern')
print('validated ansi observer log')
PY

printf '\nSession: %s\nWindow: %s\nScenario: %s\nArtifacts: %s\n' "$SESSION_NAME" "$WINDOW_NAME" "$SCENARIO" "$TMP_DIR"
printf '  - target pane=%s typescript=%s write_log=%s\n' "$TARGET_PANE" "$TMP_DIR/target.typescript" "$TMP_DIR/target.write.log"
printf '  - replay pane=%s ansi_source=%s\n' "$REPLAY_PANE" "$TMP_DIR/replay.ansi"
printf '  - observer pane=%s typescript=%s write_log=%s\n' "$OBSERVER_PANE" "$TMP_DIR/observer.typescript" "$TMP_DIR/observer.write.log"

if [[ "$KEEP_OPEN" -eq 1 ]]; then
  trap - EXIT
  echo "Session left running for inspection: $SESSION_NAME"
fi
