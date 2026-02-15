#!/usr/bin/env pwsh
<#
.SYNOPSIS
    ローカル開発環境起動スクリプト

.DESCRIPTION
    ローカル環境で npm run dev を実行してフロントエンド開発サーバーを起動します。

.PARAMETER NoEnvSetup
    環境変数セットアップをスキップするかどうか。デフォルトは $false

.PARAMETER Port
    開発サーバーのポート番号。デフォルトは 3000

.EXAMPLE
    # デフォルトでローカル開発サーバーを起動
    pwsh scripts/dev-local.ps1

    # ポート 3001 で起動
    pwsh scripts/dev-local.ps1 -Port 3001
#>

param(
    [bool]$NoEnvSetup = $false,
    
    [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

# Colors
$InfoColor = "Cyan"
$SuccessColor = "Green"
$WarningColor = "Yellow"

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor $InfoColor
Write-Host "║              ローカル開発環境起動スクリプト                        ║" -ForegroundColor $InfoColor
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor $InfoColor

# ============================================================
# 1. Prerequisites チェック
# ============================================================
Write-Host "`n📋 前提条件をチェック中..." -ForegroundColor $InfoColor

# Node.js チェック
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "❌ Node.js がインストールされていません"
    exit 1
}
$nodeVersion = node --version
Write-Host "✅ Node.js ($nodeVersion) がインストール済み" -ForegroundColor $SuccessColor

# npm チェック
if (!(Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "❌ npm がインストールされていません"
    exit 1
}
$npmVersion = npm --version
Write-Host "✅ npm ($npmVersion) がインストール済み" -ForegroundColor $SuccessColor

# ============================================================
# 2. 既存のプロセスをクリーンアップ
# ============================================================
Write-Host "`n🧹 既存のプロセスをクリーンアップ中..." -ForegroundColor $InfoColor

# ポートが使用中か確認
$existingProcess = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($existingProcess) {
    Write-Host "  ⚠️  ポート $Port は既に使用中です (PID: $existingProcess)" -ForegroundColor $WarningColor
    Write-Host "  🛑 既存プロセスを停止中..." -ForegroundColor $InfoColor
    
    foreach ($pid in $existingProcess) {
        if ($pid -ne 0) {
            try {
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                Write-Host "  ✅ プロセス $pid を停止しました" -ForegroundColor $SuccessColor
            } catch {
                Write-Host "  ⚠️  プロセス $pid の停止に失敗しました" -ForegroundColor $WarningColor
            }
        }
    }
    
    Start-Sleep -Seconds 2
}

# .next キャッシュをクリア
if (Test-Path "frontend/.next") {
    Write-Host "  🗑️  .next キャッシュをクリア中..." -ForegroundColor $InfoColor
    Remove-Item -Recurse -Force "frontend/.next" -ErrorAction SilentlyContinue
    Write-Host "  ✅ キャッシュをクリアしました" -ForegroundColor $SuccessColor
}

# ============================================================
# 3. 環境変数セットアップ（オプション）
# ============================================================
if (!$NoEnvSetup) {
    Write-Host "`n⚙️  環境変数をセットアップ中..." -ForegroundColor $InfoColor
    
    # .env.local ファイルのチェック
    $envPath = "frontend/.env.local"
    
    if (!(Test-Path $envPath)) {
        Write-Host "  ⚠️  $envPath が見つかりません" -ForegroundColor $WarningColor
        Write-Host "  💡 cdk/outputs.json から自動生成するため、CDK スタックがデプロイされている必要があります" -ForegroundColor $InfoColor
        
        $outputsPath = "cdk/outputs.json"
        if (Test-Path $outputsPath) {
            Write-Host "  🔄 $outputsPath から環境変数を生成中..." -ForegroundColor $InfoColor
            & ".\scripts\update-frontend-env.ps1"
            
            if (Test-Path $envPath) {
                Write-Host "  ✅ .env.local を自動生成しました" -ForegroundColor $SuccessColor
            } else {
                Write-Host "  ⚠️  .env.local の生成に失敗しました（手動で設定してください）" -ForegroundColor $WarningColor
            }
        } else {
            Write-Host "  ℹ️  ローカル開発の場合は .env.local を手動で作成してください" -ForegroundColor $InfoColor
        }
    } else {
        Write-Host "  ✅ .env.local は既に存在します" -ForegroundColor $SuccessColor
    }
}

# ============================================================
# 4. npm dependencies をインストール
# ============================================================
Write-Host "`n📦 npm dependencies をインストール中..." -ForegroundColor $InfoColor

Push-Location frontend
try {
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Error "❌ npm install に失敗しました"
        exit 1
    }
    Write-Host "✅ 依存関係のインストール完了" -ForegroundColor $SuccessColor
} finally {
    Pop-Location
}

# ============================================================
# 5. npm run dev を起動
# ============================================================
Write-Host "`n🚀 npm run dev を起動中..." -ForegroundColor $InfoColor
Write-Host "   📍 URL: http://localhost:$Port" -ForegroundColor $InfoColor
Write-Host "   💡 終了するには Ctrl+C を押してください" -ForegroundColor $WarningColor

Push-Location frontend
try {
    npm run dev -- -p $Port
} finally {
    Pop-Location
}
