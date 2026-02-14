"""AI Support Lambda Handler.

Handles:
  - Mutation.askAIHelper
  Four action types:
    1. summarize    - Selected messages AI summary
    2. opinion      - AI opinion on selected messages
    3. answer       - AI answer to user input
    4. next_action  - Next action suggestions from summary
"""
import logging
from typing import Any

from common.config import get_config
from common.utils import (
    generate_uuid,
    get_bedrock_client,
    get_dynamodb_table,
    invoke_bedrock,
    utc_now_iso,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

config = get_config()

AIHELPER_USER_ID = "AIHELPER"
AIHELPER_DISPLAY_NAME = "AIHelper"

# ----- Prompt Templates -----

SUMMARIZE_PROMPT = """あなたはグループチャットのAIアシスタントです。

選択されたメッセージ:
{selected_messages}

現在の要約:
{current_summary}

上記の選択メッセージの内容を要約してチャットに返信してください。
簡潔かつ要点を押さえた回答を心がけてください。
"""

OPINION_PROMPT = """あなたはグループチャットのAIアシスタントです。

選択されたメッセージ:
{selected_messages}

現在の要約:
{current_summary}

上記の選択メッセージに対するあなたの意見・分析を提示してください。
多角的な視点から考察し、建設的なフィードバックを提供してください。
"""

ANSWER_PROMPT = """あなたはグループチャットのAIアシスタントです。

ユーザーの質問:
{user_input}

現在の会話要約:
{current_summary}

この質問に対する回答をしてください。
会話の文脈を考慮した的確な回答を心がけてください。
"""

NEXT_ACTION_PROMPT = """あなたはグループチャットのAIアシスタントです。

現在の会話要約:
{current_summary}

この要約を元に、次に取るべきアクションを提案してください。
優先度順にリスト形式で提案し、各アクションの理由も簡潔に述べてください。
"""


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Handle askAIHelper mutation."""
    try:
        info = event.get("info", {})
        field_name = info.get("fieldName", "")
        arguments = event.get("arguments", {})

        logger.info("AISupport invoked: field=%s", field_name)

        if field_name != "askAIHelper":
            return {"success": False, "error": f"Unknown field: {field_name}"}

        return handle_ask_ai_helper(arguments)
    
    except Exception as e:
        logger.error("AISupport error: %s", str(e))
        return {"success": False, "error": str(e)}


def handle_ask_ai_helper(args: dict) -> dict[str, Any]:
    """Process an AI helper request."""
    inp = args.get("input", {})
    conversation_id = inp.get("conversationId")
    user_id = inp.get("userId")
    action_type = inp.get("actionType", "")
    user_input = inp.get("userInput", "")
    selected_message_ids = inp.get("selectedMessageIds", [])

    # Validate required fields before try block (so validation errors aren't caught)
    if not conversation_id or not user_id or not action_type:
        raise ValueError("conversationId, userId, and actionType are required.")

    try:
        # Fetch current summary
        summary_table = get_dynamodb_table(config.summary_table)
        summary_resp = summary_table.get_item(Key={"conversationId": conversation_id})
        current_summary = summary_resp.get("Item", {}).get("current", "(no summary)")

        # Fetch selected messages if needed
        selected_messages_text = ""
        if selected_message_ids:
            messages_table = get_dynamodb_table(config.messages_table)
            msgs = []
            for msg_id in selected_message_ids:
                resp = messages_table.get_item(
                    Key={"conversationId": conversation_id, "messageId": msg_id}
                )
                item = resp.get("Item")
                if item:
                    name = item.get("displayName", item.get("userId", "Unknown"))
                    msgs.append(f"[{name}] {item.get('content', '')}")
            selected_messages_text = "\n".join(msgs)

        # Build prompt based on action type
        prompt = _build_prompt(
            action_type, current_summary, selected_messages_text, user_input
        )

        # Generate response
        if config.use_mock_ai:
            ai_response = _mock_response(action_type, current_summary, selected_messages_text, user_input)
        else:
            client = get_bedrock_client(config.bedrock_region)
            ai_response = invoke_bedrock(client, config.bedrock_model_id, prompt)

        # Post as AIHelper message
        message_id = generate_uuid()
        timestamp = utc_now_iso()
        message_item = {
            "conversationId": conversation_id,
            "messageId": message_id,
            "userId": AIHELPER_USER_ID,
            "displayName": AIHELPER_DISPLAY_NAME,
            "content": ai_response,
            "timestamp": timestamp,
            "isUsedInSummary": False,
        }

        messages_table = get_dynamodb_table(config.messages_table)
        messages_table.put_item(Item=message_item)

        logger.info(
            "AIHelper responded: conv=%s action=%s msgId=%s",
            conversation_id,
            action_type,
            message_id,
        )
        # Subscription対応: Message型を直接返す
        return message_item

    except Exception as e:
        logger.error("AIHelper error: %s", str(e))
        # Post error message as AIHelper
        error_msg = f"申し訳ありません。処理中にエラーが発生しました: {str(e)}"
        error_message_item = {
            "conversationId": conversation_id,
            "messageId": generate_uuid(),
            "userId": AIHELPER_USER_ID,
            "displayName": AIHELPER_DISPLAY_NAME,
            "content": error_msg,
            "timestamp": utc_now_iso(),
            "isUsedInSummary": False,
        }
        try:
            messages_table = get_dynamodb_table(config.messages_table)
            messages_table.put_item(Item=error_message_item)
            # エラーメッセージを投稿できた場合はそれを返す
            return error_message_item
        except Exception:
            # 投稿も失敗した場合は例外を投げる
            raise


def _build_prompt(
    action_type: str,
    current_summary: str,
    selected_messages: str,
    user_input: str,
) -> str:
    """Build the Bedrock prompt based on action type."""
    templates = {
        "summarize": SUMMARIZE_PROMPT,
        "opinion": OPINION_PROMPT,
        "answer": ANSWER_PROMPT,
        "next_action": NEXT_ACTION_PROMPT,
    }

    template = templates.get(action_type)
    if not template:
        return f"Action: {action_type}\nSummary: {current_summary}\nMessages: {selected_messages}\nInput: {user_input}"

    return template.format(
        current_summary=current_summary,
        selected_messages=selected_messages or "(none)",
        user_input=user_input or "(none)",
    )


def _mock_response(action_type: str, current_summary: str = "", selected_messages: str = "", user_input: str = "") -> str:
    """Generate a mock AI response for dev environment with debug info.
    
    Returns the prompt that would be sent to Bedrock for debugging Lambda data flow.
    """
    return f"""【モック応答 - デバッグ情報】

アクションタイプ: {action_type}

## Lambda が Bedrock に渡すはずのプロンプト要素

### 【現在の要約】（DynamoDB 取得）
{current_summary if current_summary else '(要約なし)'}

### 【選択されたメッセージ】（messageId で取得したテキスト）
{selected_messages if selected_messages else '(メッセージ未選択)'}

### 【ユーザー入力】（answer/next_action で使用）
{user_input if user_input else '(入力なし)'}

---

## アクション別ガイド

**summarize**: 選択メッセージの内容が表示される → データ取得 OK
**opinion**: 選択メッセージ + 要約が表示される → データ取得 OK
**answer**: ユーザー入力が表示される → ユーザー入力の受け取り OK
**next_action**: 現在の要約が表示される → 要約取得 OK

---

本番時（USE_MOCK_AI=false）はこの部分が Claude Haiku 4.5 の実際の回答に置き換わります。
"""
