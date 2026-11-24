#!/usr/bin/env bash
# Release days are Saturday/Sunday (Asia/Manila) per CLAUDE.md.
# On weekdays, a production migration still needs a click from Paulo.
dow=$(TZ=Asia/Manila date +%u)   # 1=Mon … 7=Sun
if [ "$dow" -le 5 ]; then
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Weekday (Manila): production migrations are weekend-only unless Paulo makes an exception."}}'
fi
exit 0
