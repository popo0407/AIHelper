# ユーザー作成スクリプト（管理者用）

param(
    [Parameter(Mandatory = $true, HelpMessage = "ユーザーのメールアドレス")]
    [string]$Email,
    
    [Parameter(Mandatory = $true, HelpMessage = "表示名（ユーザー名）")]
    [string]$UserName,
    
    [Parameter(Mandatory = $true, HelpMessage = "仮パスワード")]
    [SecureString]$TempPassword,
    
    [Parameter(HelpMessage = "環境名（dev/prod）")]
    [string]$Environment = "dev"
)

Write-Host "=== ユーザー作成 ===" -ForegroundColor Cyan

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
        Write-Host "まず CDK デプロイを実行してください: cdk deploy --all --context environment=$Environment" -ForegroundColor Yellow
        exit 1
    }

    if ([string]::IsNullOrWhiteSpace($UserPoolId)) {
        Write-Host "❌ UserPool ID が取得できませんでした" -ForegroundColor Red
        exit 1
    }

    Write-Host "UserPool ID: $UserPoolId" -ForegroundColor Green
}
catch {
    Write-Host "❌ エラー: $_" -ForegroundColor Red
    exit 1
}

# パスワードポリシーチェック（簡易）
$PlainPassword = [System.Net.NetworkCredential]::new("", $TempPassword).Password
if ($PlainPassword.Length -lt 8) {
    Write-Host "❌ パスワードは8文字以上である必要があります" -ForegroundColor Red
    exit 1
}

if ($PlainPassword -notmatch '[A-Z]' -or $PlainPassword -notmatch '[a-z]' -or $PlainPassword -notmatch '[0-9]') {
    Write-Host "❌ パスワードは大文字・小文字・数字を含む必要があります" -ForegroundColor Red
    exit 1
}

# ユーザー作成
Write-Host "`nユーザーを作成中..." -ForegroundColor Yellow
Write-Host "  メール: $Email"
Write-Host "  表示名: $UserName"

try {
    aws cognito-idp admin-create-user `
        --user-pool-id $UserPoolId `
        --username $Email `
        --user-attributes `
            Name=email,Value=$Email `
            Name=email_verified,Value=true `
            Name=custom:userName,Value=$UserName `
        --temporary-password $PlainPassword `
        --message-action SUPPRESS `
        --region ap-northeast-1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ ユーザー作成完了！" -ForegroundColor Green
        Write-Host "`n📧 メールアドレス: $Email" -ForegroundColor Cyan
        Write-Host "👤 表示名: $UserName" -ForegroundColor Cyan
        Write-Host "🔑 仮パスワード: $PlainPassword" -ForegroundColor Cyan
        Write-Host "`n⚠️  初回ログイン時にパスワード変更が必要です" -ForegroundColor Yellow
        Write-Host "詳細: https://localhost:3000 でログインしてください" -ForegroundColor Gray
    }
    else {
        Write-Host "❌ ユーザー作成に失敗しました" -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host "❌ エラー: $_" -ForegroundColor Red
    exit 1
}
