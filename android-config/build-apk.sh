#!/usr/bin/env bash
# Gera o APK do RoVibes. Usado pelo GitHub Actions (.github/workflows/android.yml).
# O app abre o site publicado (server.url no capacitor.config.json), então cada
# atualização do site já aparece no app sem precisar instalar de novo.
set -euo pipefail
set -x
NUM="${1:-1}"

# Plugin do botão voltar do aparelho / sair do app (precisa estar no package.json para o "cap sync" achar).
npm pkg set "dependencies.@capacitor/app=^6.0.0"
npm install --no-audit --no-fund
npm install --no-save --no-audit --no-fund @capacitor/cli@6 @capacitor/core@6 @capacitor/android@6
test -d node_modules/@capacitor/app
npm run build

rm -rf android
npx cap add android
npx cap sync android

RES=android/app/src/main/res
# Ícone adaptativo (o Android recorta no formato do aparelho: gota, círculo, quadrado...).
cp -r android-config/res/. $RES/
grep -q ic_launcher_foreground $RES/mipmap-anydpi-v26/ic_launcher.xml
grep -q "capacitor-app" android/capacitor.settings.gradle

# Localização (check-in e "perto de mim") e câmera (ler QR dos ingressos).
MANIFESTO=android/app/src/main/AndroidManifest.xml
sed -i 's#<uses-permission android:name="android.permission.INTERNET" />#<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />\n    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />\n    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />\n    <uses-feature android:name="android.hardware.location.gps" android:required="false" />#' $MANIFESTO
grep -q ACCESS_FINE_LOCATION $MANIFESTO
grep -q android.permission.CAMERA $MANIFESTO

# Links: rovibes://... e https://rovibes.vercel.app/... abrem o app direto na tela do link (evento, lista, lugar, perfil).
python3 - "$MANIFESTO" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
filtros = """
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="rovibes" />
            </intent-filter>
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="rovibes.vercel.app" />
            </intent-filter>
        </activity>"""
s = s.replace("</activity>", filtros, 1)
open(p, "w").write(s)
PY
grep -q 'android:scheme="rovibes"' $MANIFESTO

sed -i "s/versionCode [0-9]*/versionCode ${NUM}/; s/versionName \"[^\"]*\"/versionName \"1.0.${NUM}\"/" android/app/build.gradle

cd android
chmod +x gradlew
./gradlew assembleDebug --no-daemon --stacktrace
cd ..
cp android/app/build/outputs/apk/debug/app-debug.apk rovibes.apk
ls -la rovibes.apk
