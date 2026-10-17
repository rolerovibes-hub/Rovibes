#!/usr/bin/env bash
# Gera o APK do RoVibes. Usado pelo GitHub Actions (.github/workflows/android.yml).
# O app abre o site publicado (server.url no capacitor.config.json), então cada
# atualização do site já aparece no app sem precisar instalar de novo.
set -euo pipefail
set -x
NUM="${1:-1}"

npm install --no-audit --no-fund
npm install --no-save --no-audit --no-fund @capacitor/cli@6 @capacitor/core@6 @capacitor/android@6
npm run build

rm -rf android
npx cap add android
npx cap sync android

RES=android/app/src/main/res
rm -f $RES/mipmap-anydpi-v26/ic_launcher.xml $RES/mipmap-anydpi-v26/ic_launcher_round.xml
cp -r android-config/res/. $RES/

# Localização (check-in e "perto de mim") e câmera (ler QR dos ingressos).
MANIFESTO=android/app/src/main/AndroidManifest.xml
sed -i 's#<uses-permission android:name="android.permission.INTERNET" />#<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />\n    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />\n    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />\n    <uses-feature android:name="android.hardware.location.gps" android:required="false" />#' $MANIFESTO
grep -q ACCESS_FINE_LOCATION $MANIFESTO
grep -q android.permission.CAMERA $MANIFESTO

sed -i "s/versionCode [0-9]*/versionCode ${NUM}/; s/versionName \"[^\"]*\"/versionName \"1.0.${NUM}\"/" android/app/build.gradle

cd android
chmod +x gradlew
./gradlew assembleDebug --no-daemon --stacktrace
cd ..
cp android/app/build/outputs/apk/debug/app-debug.apk rovibes.apk
ls -la rovibes.apk
