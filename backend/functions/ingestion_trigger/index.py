"""
Ingestion Trigger Lambda Handler

Automatically triggers Bedrock Knowledge Base ingestion when:
- S3 ObjectCreated events (new files uploaded)
- S3 ObjectRemoved events (files deleted)
"""
import json
import logging
import os
from typing import Any

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Environment variables
KNOWLEDGE_BASE_ID = os.environ.get("BEDROCK_KB_ID", "")
DATA_SOURCE_ID = os.environ.get("BEDROCK_DS_ID", "")
BEDROCK_REGION = os.environ.get("BEDROCK_REGION", "ap-northeast-1")


def lambda_handler(event: dict, context: Any) -> dict:
    """
    S3 event handler to trigger Knowledge Base ingestion.
    
    Args:
        event: S3 event notification
        context: Lambda context
        
    Returns:
        Response dict with status and details
    """
    logger.info("Ingestion trigger invoked: %s", json.dumps(event))
    
    if not KNOWLEDGE_BASE_ID or not DATA_SOURCE_ID:
        logger.error("Missing required environment variables: BEDROCK_KB_ID or BEDROCK_DS_ID")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Configuration error: Missing KB or DS ID"})
        }
    
    # Extract S3 event details
    try:
        records = event.get("Records", [])
        if not records:
            logger.warning("No records in S3 event")
            return {"statusCode": 200, "body": json.dumps({"message": "No records to process"})}
        
        # Log event details
        for record in records:
            event_name = record.get("eventName", "")
            bucket = record.get("s3", {}).get("bucket", {}).get("name", "")
            key = record.get("s3", {}).get("object", {}).get("key", "")
            logger.info(f"S3 Event: {event_name} - s3://{bucket}/{key}")
        
        # Start ingestion job
        result = start_ingestion_job()
        
        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": "Ingestion job started successfully",
                "jobId": result.get("ingestionJobId"),
                "status": result.get("status")
            })
        }
        
    except Exception as e:
        logger.error(f"Error processing S3 event: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }


def start_ingestion_job() -> dict:
    """
    Start a Knowledge Base ingestion job.
    
    Returns:
        dict: Ingestion job details
    """
    try:
        bedrock_client = boto3.client("bedrock-agent", region_name=BEDROCK_REGION)
        
        logger.info(
            f"Starting ingestion job for KB: {KNOWLEDGE_BASE_ID}, DS: {DATA_SOURCE_ID}"
        )
        
        response = bedrock_client.start_ingestion_job(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            dataSourceId=DATA_SOURCE_ID,
            description="Auto-triggered by S3 event"
        )
        
        ingestion_job = response.get("ingestionJob", {})
        job_id = ingestion_job.get("ingestionJobId", "")
        status = ingestion_job.get("status", "")
        
        logger.info(f"Ingestion job started: {job_id}, status: {status}")
        
        return {
            "ingestionJobId": job_id,
            "status": status,
            "knowledgeBaseId": KNOWLEDGE_BASE_ID,
            "dataSourceId": DATA_SOURCE_ID
        }
        
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        error_message = e.response.get("Error", {}).get("Message", "")
        
        # Handle specific error: ingestion job already running
        if error_code == "ConflictException":
            logger.warning(f"Ingestion job already in progress: {error_message}")
            return {
                "ingestionJobId": None,
                "status": "ALREADY_RUNNING",
                "message": "Ingestion job is already running"
            }
        
        logger.error(f"Failed to start ingestion job: {error_code} - {error_message}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error starting ingestion job: {e}", exc_info=True)
        raise
