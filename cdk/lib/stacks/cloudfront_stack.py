"""CloudFront Distribution Stack for AICHAT.

S3 バケットの前段に CloudFront を配置し、以下を実現する:
  - CORS プリフライト (OPTIONS) を CloudFront Function でエッジ処理
  - PUT presigned URL 経由の安全なファイルアップロード
  - レスポンスへの CORS ヘッダー自動付与
  - DEV: キャッシュ無効 / PROD: キャッシュ有効
"""
from aws_cdk import (
    Stack,
    Duration,
    CfnOutput,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_s3 as s3,
)
from constructs import Construct


# CloudFront Function: OPTIONS プリフライトをエッジで即時応答
_CORS_FUNCTION_CODE = """\
function handler(event) {
  var request = event.request;
  if (request.method === 'OPTIONS') {
    return {
      statusCode: 204,
      statusDescription: 'No Content',
      headers: {
        'access-control-allow-origin':  { value: '*' },
        'access-control-allow-methods': { value: 'GET,HEAD,PUT,POST,DELETE,OPTIONS' },
        'access-control-allow-headers': { value: '*' },
        'access-control-max-age':       { value: '86400' }
      }
    };
  }
  return request;
}
"""


class CloudFrontStack(Stack):
    """CloudFront Distribution for Knowledge S3 bucket."""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        env_name: str,
        project_name: str,
        knowledge_bucket: s3.IBucket,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        self.env_name = env_name
        self.project_name = project_name

        # =========================================================
        # CloudFront Function – CORS OPTIONS ハンドラー
        # =========================================================
        cors_function = cloudfront.Function(
            self,
            "CorsFunction",
            function_name=f"{project_name}-{env_name}-cors-handler",
            code=cloudfront.FunctionCode.from_inline(_CORS_FUNCTION_CODE),
            runtime=cloudfront.FunctionRuntime.JS_2_0,
            comment="CORS preflight (OPTIONS) をエッジで即時処理",
        )

        # =========================================================
        # Response Headers Policy – 全レスポンスに CORS ヘッダー付与
        # =========================================================
        cors_response_policy = cloudfront.ResponseHeadersPolicy(
            self,
            "CorsResponsePolicy",
            response_headers_policy_name=f"{project_name}-{env_name}-cors-response",
            cors_behavior=cloudfront.ResponseHeadersCorsBehavior(
                access_control_allow_credentials=False,
                access_control_allow_headers=["*"],
                access_control_allow_methods=[
                    "GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS",
                ],
                access_control_allow_origins=["*"],
                access_control_max_age=Duration.seconds(86400),
                origin_override=True,
            ),
        )

        # =========================================================
        # Origin Request Policy – クエリ文字列をすべて転送
        # (presigned URL パラメータを S3 へ渡すため必須)
        # =========================================================
        origin_request_policy = cloudfront.OriginRequestPolicy(
            self,
            "S3PresignedOriginRequestPolicy",
            origin_request_policy_name=f"{project_name}-{env_name}-s3-presigned",
            query_string_behavior=cloudfront.OriginRequestQueryStringBehavior.all(),
            header_behavior=cloudfront.OriginRequestHeaderBehavior.none(),
            cookie_behavior=cloudfront.OriginRequestCookieBehavior.none(),
        )

        # =========================================================
        # Cache Policy – 環境別
        # =========================================================
        if env_name == "dev":
            cache_policy = cloudfront.CachePolicy.CACHING_DISABLED
        else:
            cache_policy = cloudfront.CachePolicy.CACHING_OPTIMIZED

        # =========================================================
        # S3 Origin (HTTP Origin – OAI/OAC 不使用)
        #   presigned URL が IAM 認証を持つため OAI 不要。
        #   CloudFront は純粋なプロキシとして機能し、
        #   host ヘッダーを S3 オリジンドメインに書き換える。
        # =========================================================
        s3_origin = origins.HttpOrigin(
            f"{knowledge_bucket.bucket_name}.s3.{self.region}.amazonaws.com",
            protocol_policy=cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
        )

        # =========================================================
        # Distribution
        # =========================================================
        self.distribution = cloudfront.Distribution(
            self,
            "KnowledgeDistribution",
            comment=f"{project_name}-{env_name} Knowledge S3 Distribution",
            default_behavior=cloudfront.BehaviorOptions(
                origin=s3_origin,
                allowed_methods=cloudfront.AllowedMethods.ALLOW_ALL,
                cached_methods=cloudfront.CachedMethods.CACHE_GET_HEAD,
                cache_policy=cache_policy,
                origin_request_policy=origin_request_policy,
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                response_headers_policy=cors_response_policy,
                function_associations=[
                    cloudfront.FunctionAssociation(
                        function=cors_function,
                        event_type=cloudfront.FunctionEventType.VIEWER_REQUEST,
                    ),
                ],
            ),
            price_class=(
                cloudfront.PriceClass.PRICE_CLASS_200
                if env_name == "dev"
                else cloudfront.PriceClass.PRICE_CLASS_ALL
            ),
        )

        # =========================================================
        # Outputs
        # =========================================================
        CfnOutput(
            self,
            "DistributionDomainName",
            value=self.distribution.distribution_domain_name,
            description="CloudFront Distribution domain for knowledge bucket",
            export_name=f"{project_name}-{env_name}-cloudfront-domain",
        )
        CfnOutput(
            self,
            "DistributionId",
            value=self.distribution.distribution_id,
            description="CloudFront Distribution ID",
        )
