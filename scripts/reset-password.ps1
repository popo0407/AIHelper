# パスワードリセットスクリプト（管理者用）

param(
    [Parameter(Mandatory=$true, HelpMessage="ユーザーのメールアドレス")]
    [string]$Email,
    
    [Parameter(Mandatory=$true, HelpMessage="新しい仮パスワード（8文字以上、大小英字+数字）")]
    [string]$NewPassword,
    
    [Parameter(HelpMessage="環境名（dev/prod）")]
    [string]$Environment = "dev",

    [Parameter(HelpMessage="パスワードを永続的に設定（初回変更不要）")]
    [switch]$Permanent
)

Write-Host "=== パスワードリセット ===" -ForegroundColor Cyan

# UserPool ID を CloudFormation から取得
Write-Host "UserPool ID を取得中..." -ForegroundColor Yellow
$StackName = "aichat-$Environment-cognito"

try {
    $UserPoolId = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' `
        --output text `
        --region ap-northeast-1 `
        2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ CloudFormation スタック '$StackName' が見つかりません" -ForegroundColor Red
        exit 1
    }

    if ([string]::IsNullOrWhiteSpace($UserPoolId)) {
        Write-Host "❌ UserPool ID が取得できませんでした" -ForegroundColor Red
        exit 1
    }

    Write-Host "UserPool ID: $UserPoolId" -ForegroundColor Green
} catch {
    Write-Host "❌ エラー: $_" -ForegroundColor Red
    exit 1
}

# パスワードポリシーチェック（簡易）
if ($NewPassword.Length -lt 8) {
    Write-Host "❌ パスワードは8文字以上である必要があります" -ForegroundColor Red
    exit 1
}

if ($NewPassword -notmatch '[A-Z]' -or $NewPassword -notmatch '[a-z]' -or $NewPassword -notmatch '[0-9]') {
    Write-Host "❌ パスワードは大文字・小文字・数字を含む必要があります" -ForegroundColor Red
    exit 1
}

# パスワードリセット
Write-Host "`nパスワードをリセット中..." -ForegroundColor Yellow
Write-Host "  ユーザー: $Email"

try {
    if ($Permanent) {
        # 永続的パスワード（初回変更不要）
        aws cognito-idp admin-set-user-password `
            --user-pool-id $UserPoolId `
            --username $Email `
            --password $NewPassword `
            --permanent `
            --region ap-northeast-1
        
        Write-Host "`n✅ パスワードリセット完了！（永続的）" -ForegroundColor Green
        Write-Host "`n📧 メールアドレス: $Email" -ForegroundColor Cyan
        Write-Host "🔑 新しいパスワード: $NewPassword" -ForegroundColor Cyan
        Write-Host "`nすぐにこのパスワードでログインできます" -ForegroundColor Green
    } else {
        # 仮パスワード（初回変更必須）
        aws cognito-idp admin-set-user-password `
            --user-pool-id $UserPoolId `
            --username $Email `
            --password $NewPassword `
            --region ap-northeast-1
        
        Write-Host "`n✅ パスワードリセット完了！（仮パスワード）" -ForegroundColor Green
        Write-Host "`n📧 メールアドレス: $Email" -ForegroundColor Cyan
        Write-Host "🔑 仮パスワード: $NewPassword" -ForegroundColor Cyan
        Write-Host "`n⚠️  初回ログイン時にパスワード変更が必要です" -ForegroundColor Yellow
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ パスワードリセットに失敗しました" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ エラー: $_" -ForegroundColor Red
    exit 1
}

# 使用例
Write-Host "`n使用例:" -ForegroundColor Gray
Write-Host "  初回変更必須: .\reset-password.ps1 -Email user@example.com -NewPassword 'TempPass123!'" -ForegroundColor Gray
Write-Host "  永続設定:     .\reset-password.ps1 -Email user@example.com -NewPassword 'NewPass456!' -Permanent" -ForegroundColor Gray
