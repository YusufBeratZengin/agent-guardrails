#!/bin/sh
# Run from a project with agent-guardrails installed locally.
set -eu
exec npx --no-install agent-guardrails scan .
