#!/usr/bin/env pwsh
<#
.SYNOPSIS
    AWS へのデプロイスクリプト

.DESCRIPTION
    フロントエンドをビルドしてから AWS CDK でデプロイします。

.PARAMETER Environment
    デプロイする環境（dev または prod）。デフォルトは dev

.PARAMETER SetEnv
    デプロイ後に .env.local ファイルを自動生成するか。デフォルトは $true

.EXAMPLE
    # 開発環境にデプロイ
    pwsh scripts/deploy-aws.ps1 -Environment dev

    # 本番環境にデプロイ
    pwsh scripts/deploy-aws.ps1 -Environment prod
#>

param(
    [ValidateSet("dev", "prod")]
    [string]$Environment = "dev",
    
    [bool]$SetEnv = $true
)

$ErrorActionPreference = "Stop"

# Colors
$InfoColor = "Cyan"
$SuccessColor = "Green"
$WarningColor = "Yellow"
$ErrorColor = "Red"

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor $InfoColor
Write-Host "║          AWS デプロイスクリプト (環境: $Environment)               ║" -ForegroundColor $InfoColor
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor $InfoColor

# ============================================================
# 1. prerequisites チェック
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

# AWS CLI チェック
if (!(Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Error "❌ AWS CLI がインストールされていません"
    exit 1
}
$awsVersion = aws --version
Write-Host "✅ AWS CLI がインストール済み" -ForegroundColor $SuccessColor

# AWS 認証チェック
Write-Host "`n🔐 AWS 認証をチェック中..." -ForegroundColor $InfoColor
try {
    $awsIdentity = aws sts get-caller-identity --output text 2>$null
    Write-Host "✅ AWS 認証済み" -ForegroundColor $SuccessColor
}
catch {
    Write-Host "⚠️  AWS 認証情報が見つかりません。AWS SSO ログインを実行します..." -ForegroundColor $WarningColor
    aws sso login
}

# ============================================================
# 2. フロントエンドをビルド
# ============================================================
Write-Host "`n🏗️  フロントエンドをビルド中..." -ForegroundColor $InfoColor

Push-Location frontend
try {
    # 依存関係をインストール
    Write-Host "  📦 npm dependencies をインストール中..." -ForegroundColor $InfoColor
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Error "❌ npm install に失敗しました"
        exit 1
    }

    # ビルド実行
    Write-Host "  🔨 npm run build 実行中..." -ForegroundColor $InfoColor
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "❌ npm run build に失敗しました"
        exit 1
    }
    Write-Host "✅ フロントエンドのビルド完了" -ForegroundColor $SuccessColor
}
finally {
    Pop-Location
}

# ============================================================
# 3. CDK デプロイ
# ============================================================
Write-Host "`n🚀 CDK デプロイを実行中..." -ForegroundColor $InfoColor

Push-Location cdk
try {
    # CDK のコンテキスト設定
    $cdkContext = "--context environment=$Environment"
    
    # デプロイ実行
    Write-Host "  📡 CDK デプロイ開始：$Environment 環境" -ForegroundColor $InfoColor
    cdk deploy --all --require-approval never --outputs-file ../cdk/outputs.json $cdkContext
    if ($LASTEXITCODE -ne 0) {
        Write-Error "❌ CDK デプロイに失敗しました"
        exit 1
    }
    Write-Host "✅ CDK デプロイ完了" -ForegroundColor $SuccessColor
}
finally {
    Pop-Location
}

# ============================================================
# 4. フロントエンド .env.local を自動生成（オプション）
# ============================================================
if ($SetEnv) {
    Write-Host "`n⚙️  フロントエンド環境変数を更新中..." -ForegroundColor $InfoColor
    
    $outputsPath = "cdk/outputs.json"
    if (Test-Path $outputsPath) {
        # update-frontend-env.ps1 を実行
        & ".\scripts\update-frontend-env.ps1"
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ .env.local を自動生成しました" -ForegroundColor $SuccessColor
        }
        else {
            Write-Host "⚠️  .env.local の自動生成に失敗しました（手動で設定してください）" -ForegroundColor $WarningColor
        }
    }
}

# ============================================================
# 完了
# ============================================================
Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor $SuccessColor
Write-Host "║              🎉 AWS デプロイが完了しました！                      ║" -ForegroundColor $SuccessColor
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor $SuccessColor

Write-Host "`n📋 次のステップ：" -ForegroundColor $InfoColor
Write-Host "   1. AWS Console でスタックが正常に作成されたか確認"
Write-Host "   2. CloudFront ディストリビューションの URL にアクセス"
Write-Host "   3. アプリケーションが正常に起動しているか確認"
Write-Host ""
