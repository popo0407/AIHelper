"""
Bedrock Knowledge Base Stack with S3 Vectors managed by CDK
"""
from aws_cdk import (
    Stack,
    aws_bedrock as bedrock,
    aws_iam as iam,
    aws_s3 as s3,
    CfnOutput,
    CfnResource,
    RemovalPolicy,
)
from constructs import Construct


class BedrockStack(Stack):
    """Bedrock Knowledge Base with S3_VECTORS (fully CDK-managed)"""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        knowledge_bucket: s3.IBucket,
        environment: str,
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        account_id = Stack.of(self).account
        region = Stack.of(self).region

        # ====== S3 Vectors: VectorBucket (CDK-managed) ======
        # 既存のVectorBucketとの衝突を避けるため -v2 サフィックスを追加
        vector_bucket_name = f"aichat-{environment}-vectors-v2"
        vector_bucket = CfnResource(
            self,
            "VectorBucket",
            type="AWS::S3Vectors::VectorBucket",
            properties={
                "VectorBucketName": vector_bucket_name
            }
        )
        vector_bucket.apply_removal_policy(RemovalPolicy.RETAIN)

        # ====== S3 Vectors: Index (CDK-managed) ======
        vector_index_name = f"aichat-{environment}-kb-index-v2"
        vector_index = CfnResource(
            self,
            "VectorIndex",
            type="AWS::S3Vectors::Index",
            properties={
                "IndexName": vector_index_name,
                "VectorBucketArn": vector_bucket.get_att("VectorBucketArn").to_string(),
                "Dimension": 1024,  # Titan Embed Text V2
                "DataType": "float32",
                "DistanceMetric": "cosine"
            }
        )
        vector_index.apply_removal_policy(RemovalPolicy.RETAIN)
        vector_index.add_dependency(vector_bucket)

        # ARN references
        vector_bucket_arn = vector_bucket.get_att("VectorBucketArn").to_string()
        index_arn = vector_index.get_att("IndexArn").to_string()

        # IAM Role for Knowledge Base
        kb_role = iam.Role(
            self,
            "KnowledgeBaseRole",
            role_name=f"aichat-{environment}-kb-role",
            assumed_by=iam.ServicePrincipal("bedrock.amazonaws.com"),
            inline_policies={
                "BedrockKnowledgeBasePolicy": iam.PolicyDocument(
                    statements=[
                        # S3 permissions for knowledge bucket
                        iam.PolicyStatement(
                            effect=iam.Effect.ALLOW,
                            actions=[
                                "s3:GetObject",
                                "s3:ListBucket",
                            ],
                            resources=[
                                knowledge_bucket.bucket_arn,
                                f"{knowledge_bucket.bucket_arn}/*",
                            ],
                        ),
                        # S3 Vectors permissions (least privilege)
                        iam.PolicyStatement(
                            effect=iam.Effect.ALLOW,
                            actions=[
                                "s3vectors:PutVectors",
                                "s3vectors:QueryVectors",
                                "s3vectors:GetVectors",
                                "s3vectors:GetIndex",
                                "s3vectors:GetVectorBucket",
                            ],
                            resources=[
                                f"arn:aws:s3vectors:{region}:{account_id}:bucket/*",
                            ],
                        ),
                        # Bedrock InvokeModel for embeddings
                        iam.PolicyStatement(
                            effect=iam.Effect.ALLOW,
                            actions=[
                                "bedrock:InvokeModel",
                            ],
                            resources=[
                                f"arn:aws:bedrock:{region}::foundation-model/amazon.titan-embed-text-v2:0",
                            ],
                        ),
                    ]
                )
            },
        )

        # Knowledge Base with S3_VECTORS
        cfn_knowledge_base = bedrock.CfnKnowledgeBase(
            self,
            "KnowledgeBase",
            name=f"aichat-{environment}-kb",
            role_arn=kb_role.role_arn,
            knowledge_base_configuration=bedrock.CfnKnowledgeBase.KnowledgeBaseConfigurationProperty(
                type="VECTOR",
                vector_knowledge_base_configuration=bedrock.CfnKnowledgeBase.VectorKnowledgeBaseConfigurationProperty(
                    embedding_model_arn=f"arn:aws:bedrock:{region}::foundation-model/amazon.titan-embed-text-v2:0",
                    embedding_model_configuration=bedrock.CfnKnowledgeBase.EmbeddingModelConfigurationProperty(
                        bedrock_embedding_model_configuration=bedrock.CfnKnowledgeBase.BedrockEmbeddingModelConfigurationProperty(
                            dimensions=1024,
                            embedding_data_type="FLOAT32"
                        )
                    )
                )
            ),
            storage_configuration=bedrock.CfnKnowledgeBase.StorageConfigurationProperty(
                type="S3_VECTORS",
                s3_vectors_configuration=bedrock.CfnKnowledgeBase.S3VectorsConfigurationProperty(
                    vector_bucket_arn=vector_bucket_arn,
                    index_arn=index_arn,
                )
            ),
        )
        cfn_knowledge_base.add_dependency(kb_role.node.default_child)
        cfn_knowledge_base.add_dependency(vector_index)

        # Data Source
        cfn_data_source = bedrock.CfnDataSource(
            self,
            "DataSource",
            name=f"aichat-{environment}-datasource",
            knowledge_base_id=cfn_knowledge_base.attr_knowledge_base_id,
            data_source_configuration=bedrock.CfnDataSource.DataSourceConfigurationProperty(
                type="S3",
                s3_configuration=bedrock.CfnDataSource.S3DataSourceConfigurationProperty(
                    bucket_arn=knowledge_bucket.bucket_arn,
                    # No prefix filter - use metadata filter instead
                )
            ),
            vector_ingestion_configuration=bedrock.CfnDataSource.VectorIngestionConfigurationProperty(
                chunking_configuration=bedrock.CfnDataSource.ChunkingConfigurationProperty(
                    chunking_strategy="FIXED_SIZE",
                    fixed_size_chunking_configuration=bedrock.CfnDataSource.FixedSizeChunkingConfigurationProperty(
                        max_tokens=300,
                        overlap_percentage=10
                    )
                )
            )
        )
        cfn_data_source.add_dependency(cfn_knowledge_base)

        # Outputs
        self.knowledge_base_id = cfn_knowledge_base.attr_knowledge_base_id
        self.data_source_id = cfn_data_source.attr_data_source_id

        CfnOutput(
            self,
            "KnowledgeBaseId",
            value=self.knowledge_base_id,
            description="Bedrock Knowledge Base ID",
            export_name=f"aichat-{environment}-kb-id"
        )
        CfnOutput(
            self,
            "DataSourceId",
            value=self.data_source_id,
            description="Bedrock Data Source ID",
            export_name=f"aichat-{environment}-datasource-id"
        )
