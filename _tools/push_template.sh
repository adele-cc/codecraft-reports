#!/bin/bash
# Push the CodeCraft report template to GitHub.
# Usage: bash push_template.sh [path/to/template.html]
#
# Requires: GITHUB_TOKEN environment variable
# On Mac/Linux: export GITHUB_TOKEN=ghp_xxx  (add to ~/.zshrc to persist)
# On Windows Git Bash: export GITHUB_TOKEN=ghp_xxx  (add to ~/.bashrc)

set -e

REPO="adele-cc/codecraft-reports"
REMOTE_PATH="_template/index.html"

# Default: look for template in this repo's root, or accept an argument
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
FILE="${1:-$REPO_ROOT/_template/index.html}"

if [ ! -f "$FILE" ]; then
  echo "❌ Template file not found: $FILE"
  echo "   Pass the path as an argument: bash push_template.sh /path/to/template.html"
  exit 1
fi

if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ GITHUB_TOKEN is not set."
  echo "   Run: export GITHUB_TOKEN=ghp_xxxxxxxxxxxxx"
  exit 1
fi

echo "📄 Pushing: $FILE → $REMOTE_PATH"

# Fetch current SHA (needed for updates, not required for new files)
SHA=$(curl -s \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/$REPO/contents/$REMOTE_PATH" \
  | grep -o '"sha":"[^"]*"' | head -1 | cut -d'"' -f4)

B64=$(base64 -w 0 "$FILE" 2>/dev/null || base64 "$FILE")

# Build payload
if [ -n "$SHA" ]; then
  PAYLOAD=$(printf '{"message":"Update template","sha":"%s","content":"%s"}' "$SHA" "$B64")
else
  PAYLOAD=$(printf '{"message":"Add template","content":"%s"}' "$B64")
fi

RESULT=$(curl -s -X PUT \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  --data "$PAYLOAD" \
  "https://api.github.com/repos/$REPO/contents/$REMOTE_PATH")

NEW_SHA=$(echo "$RESULT" | grep -o '"sha":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$NEW_SHA" ]; then
  echo "✅ Pushed! New SHA: $NEW_SHA"
else
  echo "❌ Push may have failed. Response:"
  echo "$RESULT" | head -c 500
  exit 1
fi
