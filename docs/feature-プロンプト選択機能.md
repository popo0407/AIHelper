1. 機能概要
右サイドバーの「要約」領域を「CANVAS」とし、AI指示用のカスタムプロンプト選択機能を追加する。
ドロップダウンで「要約」「アクションアイテム」「要件定義」「MEDS」「カスタムプロンプト」を選択可能。
選択したプロンプト種別に応じて、AIへの指示内容や生成結果が切り替わる。
「要約」「アクションアイテム」「要件定義」「MEDS」の各プロンプト内容はDynamoDBで管理・保存。
「カスタムプロンプト」選択時は、プロンプト内容もDynamoDB「summary」テーブルに保存し、再表示時に呼び出す。
2. データ設計
summaryテーブル（既存）
PK: conversationId
既存属性: title, current, previous, updatedAt, updatedBy など
追加属性:
selectedPromptType（string, 例: "summary", "actionItem", "requirement", "meds", "custom"）
customPromptText（string, カスタムプロンプト選択時のみ内容を保存）
PromptTemplatesテーブル（新設）
PK: promptType（例: "summary", "actionItem", "requirement", "meds"）
promptText（テンプレート本文）
updatedAt（更新日時）など
3. UI/UX要件
タイトル部分：<h2>要約 → <h2>CANVAS に変更。
追加ボタン：要約に追加 → CANVASに追加 に変更。
タイトル右側にドロップダウン（「要約」「アクションアイテム」「要件定義」「MEDS」「カスタムプロンプト」）を配置。
ドロップダウン選択時、該当プロンプトの説明や入力欄を表示。
カスタムプロンプト選択時は自由入力欄を表示。
文字数カウント・コピー・追加ボタン等は既存要約機能と同様に動作。
ドロップダウン・ボタンはアクセシビリティ対応（aria-label等）。
キーボード操作対応（Tab/Enter/Space）。
4. 挙動要件
ドロップダウンでプロンプト種別を選択すると、summaryテーブルのselectedPromptTypeを更新。
カスタムプロンプト選択時はcustomPromptTextも保存・取得。
サイドバー初期表示時、summaryテーブルから選択状態・カスタム内容を取得し反映。
テンプレート本文はPromptTemplatesテーブルから取得。
プロンプト編集・保存時はDynamoDBへ反映。
CANVASに追加ボタン押下時、選択中プロンプト種別に応じた内容をAIへ送信。
カスタムプロンプトはsummaryテーブルで管理、PromptTemplatesには保存しない。
既存の要約機能は「要約」選択時に維持。
5. 技術要件
フロントエンド：React/TypeScriptで実装。プロンプト取得APIを呼び出し、選択時に内容を反映。
バックエンド：AWS SDK（DynamoDB）、API Gateway or Lambda経由でCRUD。
PromptTemplatesテーブル新設（PK: promptType, promptText, updatedAt）。
summaryテーブルにselectedPromptType, customPromptText属性追加。
CRUDは管理画面またはAPI経由で実装（初期値はシードデータ投入も可）。
6. テスト/運用
summaryテーブルのselectedPromptType, customPromptTextのCRUDテスト
PromptTemplatesテーブルのCRUDテスト
E2Eテストでプロンプト切替・カスタム保存/復元を検証
DynamoDBテーブル作成・初期データ投入手順をdocs/deploy-guide.md等に記載
7. 想定ファイル
frontend/src/components/SummarySidebar.tsx（CANVASサイドバー本体）
frontend/tests/SummarySidebar.test.tsx（ユニットテスト）
frontend/e2e/conversation-features.spec.ts（E2Eテスト）
backend/functions/（API実装）
cdk/ ディレクトリ配下でDynamoDBリソース定義