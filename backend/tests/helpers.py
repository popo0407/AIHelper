"""テスト共通ヘルパー関数."""


def make_appsync_event(field_name: str, arguments: dict | None = None) -> dict:
    """AppSync resolver 形式の event を構築するヘルパー。"""
    return {
        "info": {"fieldName": field_name},
        "arguments": arguments or {},
    }
