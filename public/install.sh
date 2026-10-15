#!/usr/bin/env bash
# AI Search SKILL.md installer
# Usage: curl -fsSL https://aisearches.cc/install.sh | bash

set -e

SKILL_URL="https://aisearches.cc/SKILL.md"
SKILL_NAME="ai-search"

# Detect target directory
if [ -d ".claude/skills" ]; then
  TARGET=".claude/skills/${SKILL_NAME}.md"
elif [ -d ".cursor" ]; then
  TARGET=".cursor/skills/${SKILL_NAME}.md"
  mkdir -p .cursor/skills
else
  TARGET="SKILL.md"
fi

echo "📡 Downloading AI Search skill..."
curl -fsSL "$SKILL_URL" -o "$TARGET"
echo "✅ Installed to $TARGET"
echo ""
echo "Now try asking your Agent:"
echo '  "今天 AI 圈有什么新东西"'
echo '  "最近 OpenAI 有什么发布"'
echo '  "看下最新的 AI 日报"'
