#!/usr/bin/env bash
# Train the whole roster, 4 species at a time. Takes several minutes.
cd "$(dirname "$0")/.."
run() { npx tsx scripts/train-roster.ts "$1" "${GENS:-70}" "${POP:-64}"; }
run Pincer & run Lash & run Oar & run Rotor & wait
run Shears & run Bell & run Lamprey & wait
