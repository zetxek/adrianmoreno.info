#!/usr/bin/env bash
set -u
cd /home/zetxek/Projects/adrianmoreno.info-race
SPEC=.astra-briefs/astra-continuity/00-continuity-spec.md
SPEC2=.astra-briefs/astra-gamify/00-gamify-spec.md
OUT=.astra-briefs/kimi-patch/out
NEW=.astra-briefs/kimi-patch/new
LOG=.astra-briefs/kimi-patch/driver.log
: > "$LOG"

# --- A. Function-level patches for the big JS files -------------------------
patch_file() {
  f="$1"; shift
  surv="$*"
  name=$(echo "$f" | tr '/' '_')
  [ -s "$OUT/$name" ] && { echo "SKIP $f" | tee -a "$LOG"; return; }
  {
    echo "You are patching ONE JavaScript file of a multi-file change. Return ONLY the"
    echo "functions/classes that must CHANGE -- never the whole file."
    echo ""
    echo "TARGET FILE: $f"
    echo ""
    echo "Output format, exactly, and nothing else:"
    echo "=== FUNCTION: <exactFunctionName> ==="
    echo "<complete replacement source: the function's first line through its closing brace>"
    echo "=== END FUNCTION ==="
    echo "(repeat for every function that must change; add NEW functions the same way)"
    echo ""
    echo "RULES:"
    echo " - Return ONLY functions whose body actually changes, plus any genuinely new ones."
    echo " - Every function you do not return is preserved byte-for-byte by an automated"
    echo "   splices. You MUST NOT rely on that to delete anything."
    echo " - These functions MUST continue to exist and keep working. If you change one, return"
    echo "   it in full and intact -- never stub, shorten or 'simplify' it:"
    echo "   $surv"
    echo " - Preserve every existing exported/factory signature."
    echo " - Motion is a PURE FUNCTION of scroll progress: no idle rAF loop, no elapsed-time"
    echo "   animation, no timers, no CSS transitions. Reduced motion => no motion."
    echo " - Per-zone triangle cap 1,100; only the four palette roles for materials."
    echo ""
    echo "===== BINDING SPECIFICATION (continuity) ====="; cat "$SPEC"
    echo ""; echo "===== BINDING SPECIFICATION (interactive layer) ====="; cat "$SPEC2"
    echo ""; echo "===== CURRENT CONTENTS OF $f (authoritative) ====="; cat "$f"
  } > /tmp/kp.txt
  echo "[$(date +%H:%M:%S)] PATCH $f ($(wc -c < /tmp/kp.txt) chars)" | tee -a "$LOG"
  ASTRA_MODEL=kimi-k3 python3 ~/.hermes/profiles/codebot/scripts/astra-call.py "$OUT/$name" < /tmp/kp.txt >> "$LOG" 2>&1
  echo "[$(date +%H:%M:%S)] -> $(stat -c %s "$OUT/$name" 2>/dev/null) bytes" | tee -a "$LOG"
}

patch_file assets/js/race-world/zones.js "buildUnitGeometries buildZones addBatch t1AtlanticPacket t1Tunnel t2MovingRoom t2Tunnel amsterdamMerchantHouses amsterdamCanalBridge amsterdamTulipRows amsterdamWindmill amsterdamBike landmarkTower nyhavnRow borsenLandmark copenhagenRun finishPier canalHouses houseSpecs lampPosts archBridge sailMasts moored horreoRow materials checkedCityResult"
patch_file assets/js/race-world/main.js "createWorld initWorld renderAt disposeWorld chapterGroups"
patch_file assets/js/race/state.js "jointTransforms setDiscipline jointVisibility"
patch_file assets/js/race/index.js "writeAthlete registerEvents onScroll onLayoutChange"

# --- B. New, purely additive modules: whole file is safe --------------------
new_module() {
  f="$1"; purpose="$2"
  name=$(echo "$f" | tr '/' '_')
  [ -s "$NEW/$name" ] && { echo "SKIP new $f" | tee -a "$LOG"; return; }
  {
    echo "Write ONE NEW JavaScript module. It is additive: nothing existing calls it yet,"
    echo "so returning the whole file is correct here."
    echo ""
    echo "NEW FILE PATH: $f"
    echo "PURPOSE: $purpose"
    echo ""
    echo "Return ONLY the module source. No markdown fences, no prose, no other files."
    echo "It must export the functions/constants the two specifications below assign to it."
    echo "Motion must be a pure function of an explicit progress argument -- no rAF loop, no"
    echo "timers, no Date.now(), no accumulation across frames."
    echo ""
    echo "===== BINDING SPECIFICATION (continuity) ====="; cat "$SPEC"
    echo ""; echo "===== BINDING SPECIFICATION (interactive layer) ====="; cat "$SPEC2"
  } > /tmp/kn.txt
  echo "[$(date +%H:%M:%S)] NEW $f ($(wc -c < /tmp/kn.txt) chars)" | tee -a "$LOG"
  ASTRA_MODEL=kimi-k3 python3 ~/.hermes/profiles/codebot/scripts/astra-call.py "$NEW/$name" < /tmp/kn.txt >> "$LOG" 2>&1
  echo "[$(date +%H:%M:%S)] -> $(stat -c %s "$NEW/$name" 2>/dev/null) bytes" | tee -a "$LOG"
}

new_module assets/js/race-world/vessel.js "The single vessel carried across every scene: geometry construction from the four palette roles, its journey-coordinate transform law, heading/heel, and wake. Follow the continuity spec sections on the vessel, motion law and wake exactly."
new_module assets/js/race-world/journey.js "Journey-coordinate knots and interpolation between them, per the continuity spec's motion law section."

echo "[$(date +%H:%M:%S)] DRIVER COMPLETE" | tee -a "$LOG"
