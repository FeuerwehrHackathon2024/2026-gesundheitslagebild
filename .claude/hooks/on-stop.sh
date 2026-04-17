#!/usr/bin/env bash
# Stop hook — laeuft wenn Claude Code eine Antwort/Iteration beendet.
# Zweck: STATUS.md minimal auf "Letztes Update = heute" ziehen und
# ein Session-Log fortschreiben, damit der naechste /loop-Lauf den
# aktuellen Stand sofort sieht (SessionStart-Hook zeigt STATUS.md).
#
# Bewusst defensiv: keine Commits, keine destruktiven Operationen.
# Die inhaltliche Pflege der STATUS.md macht Claude in /next-phase.

set -eu

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

d=$(date +%Y-%m-%d)
t=$(date +%H:%M)
sha=$(git rev-parse --short HEAD 2>/dev/null || echo '-')
dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

# "Letztes Update"-Zeile in STATUS.md auf heute ziehen (ERE, Pipe escapen).
if [ -f STATUS.md ]; then
  sed -i -E "s/^(\| Letztes Update \| ).*( \|)[[:space:]]*$/\1${d}\2/" STATUS.md || true
fi

# Session-Log fortschreiben (append-only, fuer Nachvollziehbarkeit).
mkdir -p .claude
printf '%s %s stop sha=%s dirty=%s\n' "$d" "$t" "$sha" "$dirty" >> .claude/session.log

exit 0
