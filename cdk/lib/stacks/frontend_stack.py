"""Frontend Hosting Stack for AICHAT.

S3 + CloudFront でフロントエンド（Next.js静的エクスポート）を配信。
ビルド成果物の自動デプロイも含む。
"""
import os
from aws_cdk import (
    Stack,
    CfnOutput,
    RemovalPolicy,
    Duration,
    aws_s3 as s3,
    aws_s3_deployment as s3deploy,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_iam as iam,
)
from constructs import Construct


class FrontendStack(Stack):
    """Frontend hosting stack with S3 + CloudFront."""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        env_name: str,
        project_name: str,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        self.env_name = env_name
        self.project_name = project_name

        # =========================================================
        # S3 Bucket for Frontend
        # =========================================================
        self.frontend_bucket = s3.Bucket(
            self,
            "FrontendBucket",
            bucket_name=f"{project_name}-{env_name}-frontend-{self.account}",
            removal_policy=RemovalPolicy.DESTROY if env_name == "dev" else RemovalPolicy.RETAIN,
            auto_delete_objects=env_name == "dev",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
        )

        # =========================================================
        # CloudFront Origin Access Identity (OAI)
        # =========================================================
        oai = cloudfront.OriginAccessIdentity(
            self,
            "FrontendOAI",
            comment=f"{project_name}-{env_name}-frontend-oai",
        )

        # S3 バケットポリシー: CloudFront OAI からのアクセスを許可
        self.frontend_bucket.add_to_resource_policy(
            iam.PolicyStatement(
                actions=["s3:GetObject"],
                resources=[f"{self.frontend_bucket.bucket_arn}/*"],
                principals=[iam.CanonicalUserPrincipal(oai.cloud_front_origin_access_identity_s3_canonical_user_id)],
            )
        )

        # =========================================================
        # CloudFront Distribution
        # =========================================================
        self.distribution = cloudfront.Distribution(
            self,
            "FrontendDistribution",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3Origin(
                    self.frontend_bucket,
                    origin_access_identity=oai,
                ),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowed_methods=cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                cached_methods=cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
                compress=True,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED if env_name == "prod" else cloudfront.CachePolicy.CACHING_DISABLED,
            ),
            default_root_object="index.html",
            error_responses=[
                cloudfront.ErrorResponse(
                    http_status=403,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=Duration.minutes(5),
                ),
                cloudfront.ErrorResponse(
                    http_status=404,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=Duration.minutes(5),
                ),
            ],
            comment=f"{project_name}-{env_name}-frontend-distribution",
        )

        # =========================================================
        # Auto Deployment（frontend/out が存在する場合のみ）
        # =========================================================
        frontend_out_path = os.path.join(
            os.path.dirname(__file__), "../../../frontend/out"
        )

        if os.path.exists(frontend_out_path) and os.path.isdir(frontend_out_path):
            s3deploy.BucketDeployment(
                self,
                "DeployFrontend",
                sources=[s3deploy.Source.asset(frontend_out_path)],
                destination_bucket=self.frontend_bucket,
                distribution=self.distribution,
                distribution_paths=["/*"],
                prune=True,  # 古いファイルを削除
                memory_limit=512,
            )

        # =========================================================
        # Outputs
        # =========================================================
        CfnOutput(
            self,
            "FrontendURL",
            value=f"https://{self.distribution.distribution_domain_name}",
            description="Frontend CloudFront URL",
        )
        CfnOutput(
            self,
            "FrontendBucketName",
            value=self.frontend_bucket.bucket_name,
            description="Frontend S3 Bucket Name",
        )
        CfnOutput(
            self,
            "FrontendDistributionId",
            value=self.distribution.distribution_id,
            description="Frontend CloudFront Distribution ID",
        )
