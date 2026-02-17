"""Bedrock Knowledge Base Stack for AICHAT.

Creates a Knowledge Base in Tokyo (ap-northeast-1) with S3 Vectors storage backend.
Uses Claude 3 Haiku for RAG processing within the Knowledge Base.
All resources (KB, Vector Storage, Data Source) are in the same Tokyo region.
"""
import aws_cdk as cdk
from aws_cdk import (
    Stack,
    CfnOutput,
    aws_s3 as s3,
    aws_iam as iam,
    aws_bedrock as bedrock,
)
from constructs import Construct


class BedrockKbStack(Stack):
    """AWS Bedrock Knowledge Base Stack with S3 Vectors storage."""

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
        # S3 Vectors Bucket (ap-northeast-1 Tokyo)
        # =========================================================
        self.vector_bucket = s3.Bucket(
            self,
            "VectorBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            versioned=False,
        )

        # =========================================================
        # Knowledge Base Role (for Bedrock to access resources)
        # =========================================================
        kb_role = iam.Role(
            self,
            "KnowledgeBaseRole",
            assumed_by=iam.ServicePrincipal("bedrock.amazonaws.com"),
            description=f"{project_name}-{env_name} Bedrock Knowledge Base Role",
        )

        # Allow Bedrock to write vectors to S3 Vectors bucket (us-west-2)
        kb_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "s3:GetObject",
                    "s3:PutObject",
                    "s3:ListBucket",
                ],
                resources=[
                    self.vector_bucket.bucket_arn,
                    f"{self.vector_bucket.bucket_arn}/*",
                ],
            )
        )

        # =========================================================
        # Knowledge Base (L1 Construct - Tokyo with S3 Vectors)
        # Using Property classes for correct CloudFormation generation
        # Claude 3 Haiku will be used for RAG processing
        # =========================================================
        self.knowledge_base = bedrock.CfnKnowledgeBase(
            self,
            "KnowledgeBase",
            name=f"{project_name}-{env_name}-kb",
            role_arn=kb_role.role_arn,
            knowledge_base_configuration=bedrock.CfnKnowledgeBase.KnowledgeBaseConfigurationProperty(
                type="VECTOR",
                vector_knowledge_base_configuration=bedrock.CfnKnowledgeBase.VectorKnowledgeBaseConfigurationProperty(
                    # Titan Embeddings V2: 1024 dimensions for semantic search (Tokyo region)
                    embedding_model_arn="arn:aws:bedrock:ap-northeast-1::foundation-model/amazon.titan-embed-text-v2:0",
                ),
            ),
            storage_configuration=bedrock.CfnKnowledgeBase.StorageConfigurationProperty(
                type="S3_VECTORS",
                s3_vectors_configuration=bedrock.CfnKnowledgeBase.S3VectorsConfigurationProperty(
                    vector_bucket_arn=self.vector_bucket.bucket_arn,
                    index_name=f"{project_name}-{env_name}-vectors",
                ),
            ),
        )

        # =========================================================
        # Knowledge Base Role - Allow access to Tokyo S3 Data Source bucket
        # =========================================================
        # NOTE: Both Knowledge Base and Data Source are in ap-northeast-1 (Tokyo)
        # Same-region configuration - fully supported and optimal
        kb_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "s3:GetObject",
                    "s3:ListBucket",
                ],
                resources=[
                    # Source bucket in Tokyo region
                    "arn:aws:s3:::aichat-*-knowledge-*",
                    "arn:aws:s3:::aichat-*-knowledge-*/*",
                ],
            )
        )

        # =========================================================
        # Data Source (S3 with FIXED_SIZE chunking) - Tokyo region S3
        # =========================================================
        # NOTE: Knowledge Base and Data Source both in ap-northeast-1 (Tokyo)
        #       Optimal same-region configuration for RAG processing
        #       Claude 3 Haiku processes the retrieved documents
        self.data_source = bedrock.CfnDataSource(
            self,
            "DataSource",
            knowledge_base_id=self.knowledge_base.attr_knowledge_base_id,
            name=f"{project_name}-{env_name}-datasource",
            data_source_configuration=bedrock.CfnDataSource.DataSourceConfigurationProperty(
                type="S3",
                s3_configuration=bedrock.CfnDataSource.S3DataSourceConfigurationProperty(
                    bucket_arn=f"arn:aws:s3:::aichat-{env_name}-knowledge-base",  # Tokyo bucket
                    inclusion_prefixes=["documents/"],  # Documents folder in Tokyo bucket
                ),
            ),
            vector_ingestion_configuration=bedrock.CfnDataSource.VectorIngestionConfigurationProperty(
                chunking_configuration=bedrock.CfnDataSource.ChunkingConfigurationProperty(
                    chunking_strategy="FIXED_SIZE",
                    fixed_size_chunking_configuration=bedrock.CfnDataSource.FixedSizeChunkingConfigurationProperty(
                        max_tokens=1024,
                        overlap_percentage=20,
                    ),
                ),
            ),
        )
        self.data_source.add_dependency(self.knowledge_base)

        # =========================================================
        # Outputs
        # =========================================================
        CfnOutput(
            self,
            "KnowledgeBaseId",
            value=self.knowledge_base.attr_knowledge_base_id,
            export_name=f"{project_name}-{env_name}-kb-id",
            description="Bedrock Knowledge Base ID (Tokyo ap-northeast-1)",
        )

        CfnOutput(
            self,
            "KnowledgeBaseArn",
            value=self.knowledge_base.attr_knowledge_base_arn,
            export_name=f"{project_name}-{env_name}-kb-arn",
            description="Bedrock Knowledge Base ARN (Tokyo)",
        )

        CfnOutput(
            self,
            "DataSourceId",
            value=self.data_source.attr_data_source_id,
            export_name=f"{project_name}-{env_name}-data-source-id",
            description="Bedrock Data Source ID (Tokyo S3 bucket)",
        )

        CfnOutput(
            self,
            "VectorBucketArn",
            value=self.vector_bucket.bucket_arn,
            export_name=f"{project_name}-{env_name}-vector-bucket-arn",
            description="S3 Vectors Bucket ARN (Tokyo ap-northeast-1)",
        )

        CfnOutput(
            self,
            "DeploymentComplete",
            value="Knowledge Base with Data Source deployed in Tokyo (ap-northeast-1). Claude 3 Haiku processes RAG queries. Sync may take a few minutes.",
            description="Deployment status"
        )
