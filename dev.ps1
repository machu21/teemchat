Write-Host "[TeemChat] Syncing .env to .env.json..." -ForegroundColor Cyan
dart run scripts/sync_env.dart
Write-Host "[TeemChat] Starting local development server on Chrome..." -ForegroundColor Green
flutter run -d chrome --dart-define-from-file=.env.json
