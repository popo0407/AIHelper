#!/usr/bin/env python3
"""
Add Data Source to Bedrock Knowledge Base
"""
import boto3
import json
from botocore.exceptions import ClientError

# Configuration
KB_ID = "2GUBTZQH2E"
DATA_SOURCE_NAME = "aichat-documents"
KNOWLEDGE_BUCKET = "aichat-dev-knowledge-590184009554"
REGION = "ap-northeast-1"

bedrock_client = boto3.client('bedrock-agent', region_name=REGION)

def add_data_source():
    """Add S3 bucket as data source to existing Knowledge Base"""
    
    print("=" * 70)
    print("Adding Data Source to Knowledge Base")
    print("=" * 70)
    print(f"Knowledge Base ID: {KB_ID}")
    print(f"S3 Bucket: {KNOWLEDGE_BUCKET}")
    
    data_source_config = {
        "knowledgeBaseId": KB_ID,
        "name": DATA_SOURCE_NAME,
        "dataSourceConfiguration": {
            "type": "S3",
            "s3Configuration": {
                "bucketArn": f"arn:aws:s3:::{KNOWLEDGE_BUCKET}",
                "inclusionPrefixes": [
                    "conversations/"
                ]
            }
        },
        "vectorIngestionConfiguration": {
            "chunkingConfiguration": {
                "chunkingStrategy": "FIXED_SIZE",
                "fixedSizeChunkingConfiguration": {
                    "maxTokens": 512,
                    "overlapPercentage": 20
                }
            }
        }
    }
    
    try:
        response = bedrock_client.create_data_source(**data_source_config)
        data_source_id = response["dataSource"]["dataSourceId"]
        
        print(f"\n✓ Data Source created successfully!")
        print(f"   Data Source ID: {data_source_id}")
        print(f"   Name: {DATA_SOURCE_NAME}")
        print(f"   Status: {response['dataSource']['status']}")
        
        print(f"\n📍 Next Steps:")
        print(f"   1. Upload documents to s3://{KNOWLEDGE_BUCKET}/documents/")
        print(f"   2. Start ingestion job:")
        print(f"      aws bedrock-agent start-ingestion-job \\")
        print(f"        --knowledge-base-id {KB_ID} \\")
        print(f"        --data-source-id {data_source_id} \\")
        print(f"        --region {REGION}")
        
        return data_source_id
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_msg = e.response['Error']['Message']
        
        if error_code == "ConflictException" and "already exists" in error_msg:
            print(f"\n✓ Data Source already exists")
            # List existing data sources
            response = bedrock_client.list_data_sources(knowledgeBaseId=KB_ID)
            for ds in response.get('dataSourceSummaries', []):
                if ds['name'] == DATA_SOURCE_NAME:
                    print(f"   Data Source ID: {ds['dataSourceId']}")
                    print(f"   Status: {ds['status']}")
                    return ds['dataSourceId']
        else:
            print(f"\n✗ Failed to create Data Source")
            print(f"   Error: {error_code}")
            print(f"   Message: {error_msg}")
            raise

if __name__ == "__main__":
    try:
        add_data_source()
        print("\n" + "=" * 70)
        print("✓ Data Source Setup Complete")
        print("=" * 70)
    except Exception as e:
        print("\n" + "=" * 70)
        print("✗ Setup Failed")
        print("=" * 70)
        print(f"Error: {str(e)}")
        raise
