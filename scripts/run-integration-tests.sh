#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${JAVA_HOME:-}" ]] && [[ -x "/usr/libexec/java_home" ]]; then
  JAVA_HOME="$("/usr/libexec/java_home" 2>/dev/null || true)"
  export JAVA_HOME
fi

if [[ -n "${JAVA_HOME:-}" ]]; then
  export PATH="$JAVA_HOME/bin:$PATH"
fi

if ! command -v java >/dev/null 2>&1; then
  echo "Java runtime not found. Install a JDK such as Temurin and/or set JAVA_HOME." >&2
  exit 1
fi

export FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-demo-tenxeng}"
export FIREBASE_CLIENT_EMAIL="${FIREBASE_CLIENT_EMAIL:-test@example.com}"

cmd=(vitest run)
if [[ "$#" -gt 0 ]]; then
  cmd+=("$@")
else
  cmd+=(tests/integration)
fi

printf -v vitest_cmd '%q ' "${cmd[@]}"

./node_modules/.bin/firebase emulators:exec --only firestore --project "$FIREBASE_PROJECT_ID" "$vitest_cmd"
