#!/usr/bin/env python3
"""
Complete S3 Vectors + Bedrock Knowledge Base Deployment
Step 1: Create S3 Vectors bucket and index
Step 2: Create IAM role
Step 3: Create Knowledge Base with S3 Vectors
"""
import boto3
import json
import time
import subprocess
from botocore.exceptions import ClientError

# Configuration
REGION = "ap-northeast-1"
PROJECT_NAME = "aichat"
ENV = "dev"
VECTOR_BUCKET_NAME = f"{PROJECT_NAME}-{ENV}-vectors"
INDEX_NAME = f"{PROJECT_NAME}-{ENV}-index"
ROLE_NAME = f"{PROJECT_NAME}-{ENV}-kb-role"
KB_NAME = f"{PROJECT_NAME}-{ENV}-kb"

# Initialize clients
iam_client = boto3.client("iam", region_name=REGION)
bedrock_client = boto3.client("bedrock-agent", region_name=REGION)
sts_client = boto3.client("sts", region_name=REGION)

def get_account_id():
    """Get AWS Account ID"""
    return sts_client.get_caller_identity()["Account"]

def create_s3_vectors_resources():
    """Step 1: Create S3 Vectors bucket and index using AWS CLI"""
    account_id = get_account_id()
    
    print("\n" + "=" * 70)
    print("Step 1: Creating S3 Vectors Resources")
    print("=" * 70)
    
    # Create S3 Vectors bucket
    print(f"\n1.1 Creating S3 Vectors bucket: {VECTOR_BUCKET_NAME}")
    try:
        result = subprocess.run([
            "aws", "s3vectors", "create-vector-bucket",
            "--vector-bucket-name", VECTOR_BUCKET_NAME,
            "--region", REGION
        ], capture_output=True, text=True, check=True)
        print(f"✓ Vector bucket created: {VECTOR_BUCKET_NAME}")
    except subprocess.CalledProcessError as e:
        if "BucketAlreadyOwnedByYou" in e.stderr or "already exists" in e.stderr:
            print(f"✓ Vector bucket already exists: {VECTOR_BUCKET_NAME}")
        else:
            print(f"✗ Failed to create vector bucket: {e.stderr}")
            raise
    
    # Create index in the bucket
    print(f"\n1.2 Creating index: {INDEX_NAME}")
    try:
        result = subprocess.run([
            "aws", "s3vectors", "create-index",
            "--vector-bucket-name", VECTOR_BUCKET_NAME,
            "--index-name", INDEX_NAME,
            "--data-type", "float32",
            "--dimension", "1024",
            "--distance-metric", "cosine",
            "--region", REGION
        ], capture_output=True, text=True, check=True)
        print(f"✓ Index created: {INDEX_NAME}")
    except subprocess.CalledProcessError as e:
        if "already exists" in e.stderr:
            print(f"✓ Index already exists: {INDEX_NAME}")
        else:
            print(f"✗ Failed to create index: {e.stderr}")
            raise
    
    # Construct ARNs
    vector_bucket_arn = f"arn:aws:s3vectors:{REGION}:{account_id}:bucket/{VECTOR_BUCKET_NAME}"
    index_arn = f"arn:aws:s3vectors:{REGION}:{account_id}:bucket/{VECTOR_BUCKET_NAME}/index/{INDEX_NAME}"
    
    print(f"\n✓ S3 Vectors resources created:")
    print(f"   Vector Bucket ARN: {vector_bucket_arn}")
    print(f"   Index ARN: {index_arn}")
    
    return vector_bucket_arn, index_arn

def create_iam_role(vector_bucket_arn):
    """Step 2: Create IAM role for Bedrock"""
    account_id = get_account_id()
    
    print("\n" + "=" * 70)
    print("Step 2: Creating IAM Role")
    print("=" * 70)
    
    # Trust policy
    trust_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "BedrockKnowledgeBaseTrustPolicy",
                "Effect": "Allow",
                "Principal": {
                    "Service": "bedrock.amazonaws.com"
                },
                "Action": "sts:AssumeRole"
            }
        ]
    }
    
    try:
        print(f"\n2.1 Creating IAM role: {ROLE_NAME}")
        iam_client.create_role(
            RoleName=ROLE_NAME,
            AssumeRolePolicyDocument=json.dumps(trust_policy),
            Description="Bedrock Knowledge Base execution role for S3 Vectors"
        )
        print(f"✓ Role created: {ROLE_NAME}")
    except ClientError as e:
        if e.response["Error"]["Code"] == "EntityAlreadyExists":
            print(f"✓ Role already exists: {ROLE_NAME}")
            iam_client.update_assume_role_policy(
                RoleName=ROLE_NAME,
                PolicyDocument=json.dumps(trust_policy)
            )
        else:
            raise
    
    # Attach permissions
    bucket_name = f"{PROJECT_NAME}-{ENV}-knowledge-{account_id}"
    policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "S3DataBucketAccess",
                "Effect": "Allow",
                "Action": [
                    "s3:GetObject",
                    "s3:PutObject",
                    "s3:ListBucket"
                ],
                "Resource": [
                    f"arn:aws:s3:::{bucket_name}",
                    f"arn:aws:s3:::{bucket_name}/*"
                ]
            },
            {
                "Sid": "S3VectorsAccess",
                "Effect": "Allow",
                "Action": [
                    "s3vectors:GetIndex",
                    "s3vectors:QueryVectors",
                    "s3vectors:PutVectors",
                    "s3vectors:GetVectors",
                    "s3vectors:DeleteVectors"
                ],
                "Resource": [
                    vector_bucket_arn,
                    f"{vector_bucket_arn}/*"
                ]
            },
            {
                "Sid": "BedrockInvokeModel",
                "Effect": "Allow",
                "Action": [
                    "bedrock:InvokeModel"
                ],
                "Resource": [
                    f"arn:aws:bedrock:{REGION}::foundation-model/amazon.titan-embed-text-v2:0"
                ]
            }
        ]
    }
    
    print("\n2.2 Attaching permissions policy...")
    iam_client.put_role_policy(
        RoleName=ROLE_NAME,
        PolicyName="BedrockKBFullAccess",
        PolicyDocument=json.dumps(policy)
    )
    print("✓ Permissions attached")
    
    print("\n2.3 Waiting 15 seconds for IAM propagation...")
    time.sleep(15)

def create_knowledge_base(vector_bucket_arn, index_arn):
    """Step 3: Create Knowledge Base with S3 Vectors"""
    account_id = get_account_id()
    role_arn = f"arn:aws:iam::{account_id}:role/{ROLE_NAME}"
    embedding_arn = f"arn:aws:bedrock:{REGION}::foundation-model/amazon.titan-embed-text-v2:0"
    
    print("\n" + "=" * 70)
    print("Step 3: Creating Knowledge Base")
    print("=" * 70)
    
    kb_config = {
        "name": KB_NAME,
        "roleArn": role_arn,
        "knowledgeBaseConfiguration": {
            "type": "VECTOR",
            "vectorKnowledgeBaseConfiguration": {
                "embeddingModelArn": embedding_arn,
                "embeddingModelConfiguration": {
                    "bedrockEmbeddingModelConfiguration": {
                        "dimensions": 1024,
                        "embeddingDataType": "FLOAT32"
                    }
                }
            }
        },
        "storageConfiguration": {
            "type": "S3_VECTORS",
            "s3VectorsConfiguration": {
                "vectorBucketArn": vector_bucket_arn,
                "indexArn": index_arn
            }
        }
    }
    
    try:
        print(f"\n3.1 Creating Knowledge Base: {KB_NAME}")
        print(f"   Role ARN: {role_arn}")
        print(f"   Vector Bucket ARN: {vector_bucket_arn}")
        print(f"   Index ARN: {index_arn}")
        print(f"   Storage Type: S3_VECTORS")
        
        response = bedrock_client.create_knowledge_base(**kb_config)
        kb_id = response["knowledgeBase"]["knowledgeBaseId"]
        
        print(f"\n✓ Knowledge Base created successfully!")
        print(f"   Knowledge Base ID: {kb_id}")
        return kb_id
    except ClientError as e:
        print(f"\n✗ Failed to create Knowledge Base")
        print(f"   Error: {e.response['Error']['Code']}")
        print(f"   Message: {e.response['Error']['Message']}")
        raise

def main():
    print("=" * 70)
    print("Amazon Bedrock Knowledge Base with S3 Vectors Deployment")
    print("=" * 70)
    
    try:
        account_id = get_account_id()
        print(f"\nAccount ID: {account_id}")
        print(f"Region: {REGION}")
        
        # Step 1: Create S3 Vectors resources
        vector_bucket_arn, index_arn = create_s3_vectors_resources()
        
        # Step 2: Create IAM role
        create_iam_role(vector_bucket_arn)
        
        # Step 3: Create Knowledge Base
        kb_id = create_knowledge_base(vector_bucket_arn, index_arn)
        
        print("\n" + "=" * 70)
        print("✓ Deployment Completed Successfully!")
        print("=" * 70)
        print(f"Knowledge Base ID: {kb_id}")
        print(f"Vector Bucket: {VECTOR_BUCKET_NAME}")
        print(f"Index Name: {INDEX_NAME}")
        print(f"Role: {ROLE_NAME}")
        print(f"\nConsole URL:")
        print(f"https://console.aws.amazon.com/bedrock/home?region={REGION}#/knowledge-bases/{kb_id}")
        
    except Exception as e:
        print("\n" + "=" * 70)
        print("✗ Deployment Failed")
        print("=" * 70)
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
