"""Cognito User Pool Stack for AICHAT."""
from aws_cdk import (
    Stack,
    CfnOutput,
    RemovalPolicy,
    Duration,
    aws_cognito as cognito,
)
from constructs import Construct


class CognitoStack(Stack):
    """Cognito User Pool for user authentication."""

    def __init__(
        self,
        scope: Construct,
        id: str,
        env_name: str,
        project_name: str,
        **kwargs,
    ) -> None:
        super().__init__(scope, id, **kwargs)

        self.env_name = env_name
        self.project_name = project_name

        # =========================================================
        # Cognito User Pool
        # =========================================================
        self.user_pool = cognito.UserPool(
            self,
            "UserPool",
            user_pool_name=f"{project_name}-{env_name}-users",
            # サインアップ無効（管理者のみがユーザー作成可能）
            self_sign_up_enabled=False,
            # メールアドレスでサインイン
            sign_in_aliases=cognito.SignInAliases(email=True),
            # メール検証を無効化（管理者が作成するため不要）
            auto_verify=None,
            # パスワードポリシー
            password_policy=cognito.PasswordPolicy(
                min_length=8,
                require_lowercase=True,
                require_uppercase=True,
                require_digits=True,
                require_symbols=False,  # 記号は任意
            ),
            # カスタム属性: userName（表示名）
            custom_attributes={
                "userName": cognito.StringAttribute(
                    mutable=True,  # 後から変更可能
                    min_len=1,
                    max_len=100,
                ),
            },
            # アカウントリカバリー（メール認証無効なので管理者対応のみ）
            account_recovery=cognito.AccountRecovery.NONE,
            # MFA 無効
            mfa=cognito.Mfa.OFF,
            # 開発環境では削除時に完全削除
            removal_policy=(
                RemovalPolicy.DESTROY if env_name == "dev" else RemovalPolicy.RETAIN
            ),
        )

        # =========================================================
        # User Pool Client
        # =========================================================
        self.user_pool_client = self.user_pool.add_client(
            "UserPoolClient",
            user_pool_client_name=f"{project_name}-{env_name}-client",
            # 認証フロー
            auth_flows=cognito.AuthFlow(
                user_password=True,  # ユーザー名+パスワード認証
                user_srp=True,       # SRP（Secure Remote Password）認証
            ),
            # トークン有効期限
            access_token_validity=Duration.hours(1),
            id_token_validity=Duration.hours(1),
            refresh_token_validity=Duration.days(30),
            # OAuth 無効（SPAとして使用）
            o_auth=None,
        )

        # =========================================================
        # Outputs
        # =========================================================
        CfnOutput(
            self,
            "UserPoolId",
            value=self.user_pool.user_pool_id,
            description="Cognito User Pool ID",
        )

        CfnOutput(
            self,
            "UserPoolClientId",
            value=self.user_pool_client.user_pool_client_id,
            description="Cognito User Pool Client ID",
        )

        CfnOutput(
            self,
            "UserPoolArn",
            value=self.user_pool.user_pool_arn,
            description="Cognito User Pool ARN",
        )
