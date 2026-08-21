#!/usr/bin/env bash
# PostToolUse gate: re-run the dependency-free engine suite whenever engine.js or
# tests.js changes. Exit 2 hands the failure text back to Claude as a blocking error.
#
# The prerequisite checks are not ceremony. Without them a missing jq yields an
# empty file path, the case below falls through to its catch-all, and the hook
# exits 0 — the gate silently stops gating, which is the one failure mode a gate
# must not have. They report and exit non-zero instead, so the tool call still
# succeeds but the reason is visible.
set -euo pipefail

readonly root="${CLAUDE_PROJECT_DIR:-$PWD}"

require() {
  command -v "$1" >/dev/null 2>&1 && return 0
  printf 'engine-tests hook: %s not found, the engine suite did not run\n' "$1" >&2
  exit 1
}

require jq

file_path=$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')
case "${file_path##*/}" in
  engine.js | tests.js) ;;
  *) exit 0 ;;
esac

require node

if ! output=$(node -e "$(cat -- "$root/engine.js" "$root/tests.js")" 2>&1); then
  printf 'Engine suite failed after editing %s:\n\n%s\n' "$file_path" "$output" >&2
  exit 2
fi

printf '%s\n' "$output" | tail -n 1
