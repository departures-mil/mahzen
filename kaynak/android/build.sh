#!/bin/bash
# Builds Mahzen.apk from this folder. Needs: build-tools 34, platform 35 android.jar, JDK 17+.
set -euo pipefail
cd "$(dirname "$0")"
BT=${BT:-/opt/android-sdk/build-tools/35.0.0}
AJ=${AJ:-/opt/android-sdk/platforms/android-35/android.jar}
KS=${KS:-/home/claude/work/keys/mahzen.jks}
KSPASS=${KSPASS:?keystore password}
rm -rf build && mkdir -p build/res build/classes build/dex
# 1. resources
"$BT/aapt2" compile --dir res -o build/res.zip
"$BT/aapt2" link -o build/base.apk -I "$AJ" --manifest AndroidManifest.xml -A assets --java build/gen --auto-add-overlay build/res.zip
# 2. java -> dex
javac -g -source 11 -target 11 -Xlint:-options -cp "$AJ" -d build/classes $(find src build/gen -name '*.java') 2>&1 | grep -v JAVA_TOOL || true
test -f build/classes/com/mahzen/app/MainActivity.class
"$BT/d8" --release --min-api 24 --lib "$AJ" --output build/dex $(find build/classes -name '*.class') 2>&1 | grep -v JAVA_TOOL || true
# 3. pack, align, sign
cp build/base.apk build/unaligned.apk
(cd build/dex && zip -q -X ../unaligned.apk classes.dex)
"$BT/zipalign" -f -p 4 build/unaligned.apk build/aligned.apk
"$BT/apksigner" sign --ks "$KS" --ks-pass "pass:$KSPASS" --key-pass "pass:$KSPASS" --ks-key-alias mahzen --out build/Mahzen.apk build/aligned.apk 2>&1 | grep -v JAVA_TOOL || true
"$BT/apksigner" verify --print-certs build/Mahzen.apk 2>&1 | grep -v JAVA_TOOL | head -3
ls -la build/Mahzen.apk
