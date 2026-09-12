# Live reload no celular: o APK passa a carregar a tela deste PC pelo cabo USB.
# Rode com:  npm run android:vivo
# Encerrar: Ctrl+C. Para voltar ao APK normal, rode `npm run android:apk`.

$ErrorActionPreference = 'Stop'
$porta = 5173
$dev = "http://localhost:$porta"

# Caminhos vindos do ambiente, com o padrao do Android Studio como ultimo recurso —
# nada fixo de uma maquina so, senao o script serve a um PC e quebra em todos os outros.
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME }
       elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT }
       else { "$env:LOCALAPPDATA\Android\Sdk" }
$adb = Join-Path $sdk "platform-tools\adb.exe"
if (-not (Test-Path $adb)) { throw "adb nao encontrado em $adb. Defina ANDROID_HOME ou instale o Android SDK." }

if (-not $env:JAVA_HOME) {
  # O Gradle precisa de um JDK 21. Procura os lugares usuais antes de desistir.
  $achados = @(
    (Get-ChildItem "$env:ProgramFiles\Microsoft\jdk-21*" -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1).FullName,
    (Get-ChildItem "$env:ProgramFiles\Eclipse Adoptium\jdk-21*" -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1).FullName,
    "$env:ProgramFiles\Android\Android Studio\jbr"
  ) | Where-Object { $_ -and (Test-Path $_) }
  if (-not $achados) { throw "JDK 21 nao encontrado. Defina JAVA_HOME." }
  $env:JAVA_HOME = $achados[0]
}
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
# É esta variável que faz o Capacitor apontar o APK para o servidor de desenvolvimento.
$env:ALICERCE_DEV_URL = $dev

Set-Location $PSScriptRoot

Write-Host "`n[1/5] Procurando o celular..." -ForegroundColor Cyan
& $adb wait-for-device
$aparelho = (& $adb devices | Select-String "`tdevice$" | Select-Object -First 1).ToString().Split("`t")[0]
if (-not $aparelho) { throw "Nenhum aparelho autorizado. Ligue a depuracao USB e aceite o aviso na tela." }
Write-Host "      $aparelho" -ForegroundColor Green

Write-Host "[2/5] Abrindo o tunel USB (porta $porta)..." -ForegroundColor Cyan
& $adb -s $aparelho reverse "tcp:$porta" "tcp:$porta" | Out-Null

Write-Host "[3/5] Montando o APK que aponta para este PC..." -ForegroundColor Cyan
& npm run build
& npx cap sync android
Push-Location android
& cmd /c "gradlew.bat assembleDebug -q"
Pop-Location

Write-Host "[4/5] Instalando no celular..." -ForegroundColor Cyan
& $adb -s $aparelho install -r "android\app\build\outputs\apk\debug\app-debug.apk"
& $adb -s $aparelho shell am start -n app.alicerce/.MainActivity | Out-Null

Write-Host "[5/5] Servidor no ar. Salve qualquer arquivo e o celular atualiza sozinho." -ForegroundColor Green
Write-Host "      Ctrl+C encerra. Depois rode 'npm run android:apk' para voltar ao APK normal.`n" -ForegroundColor DarkGray
& npx vite --port $porta --strictPort
