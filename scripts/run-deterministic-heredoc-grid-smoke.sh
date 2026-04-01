#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SESSION_NAME="${SESSION_NAME:-pi-inline-smoke-grid-$(date +%Y%m%d-%H%M%S)}"
WINDOW_NAME="${WINDOW_NAME:-formats}"
KEEP_OPEN=0
SEND_PROMPTS=1
PINNED_SOURCE='git:github.com/Banon-Labs/pi-inline-format-extensions@v0.1.4'
PINNED_HOST_EXTENSION="$REPO_ROOT/.pi/git/github.com/Banon-Labs/pi-inline-format-extensions/packages/host/extensions/index.ts"
LOCAL_DIAGNOSTICS_EXTENSION="$REPO_ROOT/extensions/index.ts"

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
    --no-prompts)
      SEND_PROMPTS=0
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

SCENARIOS=(python javascript typescript bash)
TMP_DIR="/tmp/${SESSION_NAME}"
mkdir -p "$TMP_DIR"

cleanup() {
  if [[ "$KEEP_OPEN" -eq 0 ]]; then
    tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
    /home/choza/projects/scripts/tmux-agent-registry.sh prune >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

model_for() {
  case "$1" in
    python) echo "canonical-heredoc-compare" ;;
    javascript) echo "javascript-heredoc-compare" ;;
    typescript) echo "typescript-heredoc-compare" ;;
    bash) echo "bash-heredoc-compare" ;;
    *)
      echo "unknown scenario: $1" >&2
      exit 1
      ;;
  esac
}

title_for() {
  case "$1" in
    python) echo "Python Heredoc Compare" ;;
    javascript) echo "JavaScript Heredoc Compare" ;;
    typescript) echo "TypeScript Heredoc Compare" ;;
    bash) echo "Bash Heredoc Compare" ;;
    *)
      echo "unknown scenario: $1" >&2
      exit 1
      ;;
  esac
}

prompt_for() {
  case "$1" in
    python)
      echo "Use bash to run python from a heredoc with python3. Use PY as the heredoc delimiter exactly. Keep the transcript inline and normal."
      ;;
    javascript)
      echo "Use bash to run javascript from a heredoc with node. Use JS as the heredoc delimiter exactly. Keep the transcript inline and normal."
      ;;
    typescript)
      echo "Use bash to run typescript from a heredoc with npx tsx. Use TS as the heredoc delimiter exactly. Keep the transcript inline and normal."
      ;;
    bash)
      echo "Use bash to run shell from a heredoc with bash. Use SH as the heredoc delimiter exactly. Keep the transcript inline and normal."
      ;;
    *)
      echo "unknown scenario: $1" >&2
      exit 1
      ;;
  esac
}

expect_for() {
  case "$1" in
    python) echo "hello from py" ;;
    typescript) echo "hello from ts 42" ;;
    javascript) echo "hello from js 42" ;;
    bash) echo "hello from sh" ;;
    *)
      echo "unknown scenario: $1" >&2
      exit 1
      ;;
  esac
}

create_wrapper() {
  local scenario="$1"
  local model
  model=$(model_for "$scenario")
  local wrapper="$TMP_DIR/${scenario}.wrapper.sh"
  cat >"$wrapper" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$REPO_ROOT"
PI_TUI_WRITE_LOG="$TMP_DIR/${scenario}.write.log" script -q -f "$TMP_DIR/${scenario}.typescript" -c 'pi --no-session --no-extensions -e "$PINNED_HOST_EXTENSION" -e "$LOCAL_DIAGNOSTICS_EXTENSION" --model inline-deterministic/${model}'
EOF
  chmod +x "$wrapper"
  echo "$wrapper"
}

wait_for_prompt() {
  local pane="$1"
  local deadline=$((SECONDS + 60))
  while ((SECONDS < deadline)); do
    if tmux capture-pane -pt "$pane" | grep -Eq '^ >[[:space:]]*$'; then
      return 0
    fi
    sleep 0.2
  done
  echo "Timed out waiting for prompt in $pane" >&2
  return 1
}

wait_for_title() {
  local pane="$1"
  local expected="$2"
  local deadline=$((SECONDS + 60))
  while ((SECONDS < deadline)); do
    if tmux capture-pane -pt "$pane" | grep -Fq "$expected"; then
      return 0
    fi
    sleep 0.2
  done
  echo "Timed out waiting for title '$expected' in $pane" >&2
  return 1
}

send_prompt() {
  local pane="$1"
  local prompt="$2"
  tmux send-keys -t "$pane" C-u
  tmux send-keys -l -t "$pane" "$prompt"
  tmux send-keys -t "$pane" Enter
}

wait_for_result() {
  local pane="$1"
  local needle="$2"
  local deadline=$((SECONDS + 90))
  while ((SECONDS < deadline)); do
    local output
    output=$(tmux capture-pane -pt "$pane")
    if [[ "$output" == *"$needle"* && "$output" == *"Took "* ]]; then
      return 0
    fi
    sleep 0.2
  done
  echo "Timed out waiting for '$needle' in $pane" >&2
  tmux capture-pane -pt "$pane" | tail -n 120 >&2
  return 1
}

declare -A PANES

echo "[preflight] session=$SESSION_NAME window=$WINDOW_NAME"
cd "$REPO_ROOT"
node --input-type=module - <<'NODE'
import { ensurePackageSourceMaterialized } from './scripts/ensure-package-source.mjs';
ensurePackageSourceMaterialized(process.cwd(), 'git:github.com/Banon-Labs/pi-inline-format-extensions@v0.1.4');
NODE

/home/choza/projects/scripts/tmux-agent-registry.sh preflight-smoke >/dev/null 2>&1 || true
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  tmux kill-session -t "$SESSION_NAME"
fi

first_wrapper=$(create_wrapper "python")
tmux new-session -d -s "$SESSION_NAME" -n "$WINDOW_NAME" "$first_wrapper"
PANES[python]=$(tmux list-panes -t "$SESSION_NAME:$WINDOW_NAME" -F '#{pane_id}' | head -n1)

PANES[javascript]=$(tmux split-window -h -P -F '#{pane_id}' -t "${PANES[python]}" "$(create_wrapper javascript)")
PANES[typescript]=$(tmux split-window -v -P -F '#{pane_id}' -t "${PANES[python]}" "$(create_wrapper typescript)")
PANES[bash]=$(tmux split-window -v -P -F '#{pane_id}' -t "${PANES[javascript]}" "$(create_wrapper bash)")

tmux select-layout -t "$SESSION_NAME:$WINDOW_NAME" tiled >/dev/null
tmux setw -t "$SESSION_NAME:$WINDOW_NAME" pane-border-status top
tmux setw -t "$SESSION_NAME:$WINDOW_NAME" pane-border-format '#{pane_title}'
for scenario in "${SCENARIOS[@]}"; do
  tmux select-pane -t "${PANES[$scenario]}" -T "$scenario"
done
/home/choza/projects/scripts/tmux-agent-registry.sh add "$SESSION_NAME" >/dev/null 2>&1 || true

for scenario in "${SCENARIOS[@]}"; do
  pane="${PANES[$scenario]}"
  wait_for_prompt "$pane"
  wait_for_title "$pane" "$(title_for "$scenario")"
  echo "[verified] scenario=$scenario pane=$pane title='$(title_for "$scenario")'"
done

if [[ "$SEND_PROMPTS" -eq 1 ]]; then
  for scenario in "${SCENARIOS[@]}"; do
    send_prompt "${PANES[$scenario]}" "$(prompt_for "$scenario")"
  done

  for scenario in "${SCENARIOS[@]}"; do
    wait_for_result "${PANES[$scenario]}" "$(expect_for "$scenario")"
    echo "[result] scenario=$scenario pane=${PANES[$scenario]} expect='$(expect_for "$scenario")'"
  done
fi

printf '\nSession: %s\nWindow: %s\nArtifacts: %s\n' "$SESSION_NAME" "$WINDOW_NAME" "$TMP_DIR"
for scenario in "${SCENARIOS[@]}"; do
  printf '  - %s pane=%s typescript=%s write_log=%s\n' \
    "$scenario" \
    "${PANES[$scenario]}" \
    "$TMP_DIR/${scenario}.typescript" \
    "$TMP_DIR/${scenario}.write.log"
done

if [[ "$KEEP_OPEN" -eq 1 ]]; then
  trap - EXIT
  echo "Session left running for inspection: $SESSION_NAME"
fi
