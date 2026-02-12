# AWSシステム構成

## 1. 全体構成イメージ

フロントエンドは **AWS Amplify (React/Next.js)**、バックエンドの通信には **AWS AppSync (GraphQL)** を採用します。

- **AppSync:** WebSocketベースのリアルタイム通信（チャットの更新・ロック状態の同期）をフルマネージドで実現。

* **Amazon Bedrock:** オレゴンリージョンの **Claude Haiku 4.5 推論プロファイルモデル** を使用（クロスリージョン呼び出し）。

- **DynamoDB:** チャット履歴、要約内容、および「誰がどこをロックしているか」の状態を保存。

---

## 2. AWSサービス構成図 (論理構成)

### ① 通信・API層

- **AWS AppSync:** チャットの投稿、選択状態の通知、ロック制御、要約の同期を全てGraphQL Subscriptionで行います。
- **Amazon API Gateway (HTTP API):** AIへの相談や要約実行など、時間のかかる非同期処理のトリガーとして併用（AppSyncから直接Lambdaを呼ぶことも可能）。

### ② 処理層 (Logic)

- **AWS Lambda:**
- **Summarizer Lambda:** 要約ロジック担当。「現在の要約」と「選択メッセージ」をBedrockに渡し、結果をDBへ書き込む。
- **AI Support Lambda:** AI相談役担当。ユーザーの指示とコンテキストをBedrockに投げ、回答をチャットへ流す。
- **Lock Manager Lambda:** 3分タイムアウトの管理や、編集・要約開始時のロックフラグ操作。

- **Amazon Bedrock (オレゴンリージョン):** 生成AI基盤。Claude Haiku 4.5 推論プロファイルモデルを使用。プロンプト管理や推論を実行。

### ③ ストレージ層 (Data) - パターンB: シンプル設計

- **Amazon DynamoDB:**

#### **Messages Table**

- **PK:** conversationId（会話ID）
- **SK:** messageId（メッセージID / UUID）
- **userId:** 発言者のログイン ID
- **timestamp:** メッセージ投稿日時
- **content:** メッセージ本文
- **isUsedInSummary:** 要約に含まれたフラグ（色表示用）

#### **Summary Table**

- **PK:** conversationId（会話ID）
- **title:** 会話のタイトル（要約の最初の行から自動抽出、AI要約に必須）
- **current:** 現在の要約テキスト（最大 5000 文字、マークダウン形式で「# タイトル」から開始）
- **previous:** 1つ前の要約テキスト（Undo用）
- **updatedAt:** 最終更新日時
- **updatedBy:** 要約を実行したユーザーのログイン ID

#### **Locks Table**

- **PK:** conversationId（会話ID）
- **SK:** userId（ロックを持つユーザーのログイン ID）
- **operationType:** ロックの種類（`edit` / `summarize`）
- **startTime:** ロック開始時刻
- **TTL:** 3分で自動削除

#### **Users Table**

- **PK:** loginId（ログイン ID / 一意）
- **displayName:** 表示名（チャット内表示用）
- **createdAt:** アカウント作成日時
- **conversationIds:** 参加中の会話 ID 配列

#### **Conversations Table** 〜（オプション：会話メタデータ）

- **PK:** conversationId
- **createdBy:** 会話作成者の loginId
- **createdAt:** 会話作成日時
- **participants:** 参加者の loginId 配列
- **status:** 「active」/ 「archived」（カレントは archived 不使用）
- **shareLink:** 会話共有リンク（例: `https://app.example.com/chat?cid=<conversationId>`）

---

## 3. ワークフロー詳細

### A. 要約の更新プロセス

1. **フロント:**
   - ユーザーがメッセージを選択（ハイライト）し、「要約に追加」ボタンを押す。
   - **フロント状態管理:** previousSummary ← currentSummary（Undo用に古い状態を保存）
   - **Undo ボタン無効化:** Lambda 実行中は Undo ボタンをグレーアウト

2. **AppSync:** `updateSummary` ミューテーション実行 + Locks Table に `(conversationId, userId, operationType: summarize)` を書き込み。

3. **Lambda (Summarizer):**
   - DynamoDB から「現在の要約」を取得。
   - 選択された「メッセージ群」を Bedrock（オレゴン、Claude Haiku 4.5）に送り、新しい要約を生成。
   - **プロンプト工夫:**
     ```
     現在の要約を尊重し、矛盾や先祖返りを防ぐこと。
     必ず「# タイトル」で始まること（最初の行）。
     その後、決定事項・TODO・その他と分類して記述すること。
     最大 5000 文字以内にまとめること。
     ```
   - Summary Table を更新（current ← 新要約、previous ← 古い要約、title ← 最初の行から抽出）。
   - Messages Table の `isUsedInSummary` フラグを更新。

4. **AppSync (Subscription):**
   - 全ユーザーのサイドバーをリアルタイム更新。
   - 他ユーザーに「○○さんが... を要約に追加中です」通知を配信。

5. **ロック解除:** Lambda 完了時に Locks Table から該当レコード削除。フロント: Undo ボタン有効化。

6. **Undo 実行:**
   - **フロント:** currentSummary ← previousSummary に更新（ローカル状態）
   - **バックエンド:** Undo Lambda を呼び出し、DynamoDB の Summary Table を previous 値で上書き。

### B. 排他制御（ロック）

1. **フロント:** 「編集開始」ボタン押下。

2. **AppSync/DynamoDB:** `Locks Table` に `(conversationId, userId, operationType: edit)` を書き込む。

3. **同期:** AppSync の Subscription により、他ユーザーの画面の以下ボタンがグレーアウト（非活性）：
   - 「要約に追加」ボタン
   - 「サイドバー編集」ボタン
   - 「選択したチャットをAI要約」ボタン

4. **許可される操作:** 他のユーザーは選択、通常チャット投稿、AIHelper相談は可能。

5. **UI 通知:** サイドバー上部に「○○さんが編集中です。」と表示。
   - 「要約に追加」ボタン
   - 全 4 つの AI 相談ボタン
   - (編集ボタン自体は無効化されない)

6. **UI 通知:** 「○○さんが編集中です。」とサイドバー上部に表示。

7. **タイムアウト:** DynamoDB の **TTL (Time to Live)** を 3 分に設定。ブラウザを閉じてもAWS側で自動的にロック解除。

8. **ロック解除:** 保存ボタン押下時に Locks Table から削除。

### C. ユーザー登録・ログインフロー

1. **アプリ起動時:**
   - AppSync Query: `listUsers()` で Users Table を検索。
   - **ログイン画面表示:**
     - 「登録ユーザーを選択」ドロップダウン
     - 「新規ユーザー登録」セクション（loginId + displayName 入力フォーム）

2. **既存ユーザー選択:**
   - ドロップダウンから displayName を選択 → チャット画面へ遷移

3. **新規ユーザー登録:**
   - ユーザーが loginId と displayName を入力
   - AppSync Mutation: `registerUser(loginId, displayName)` を実行

4. **Lambda (User Registration):**
   - **重複チェック:** DynamoDB から `PK: loginId` で検索
   - 重複していれば Error 返却（ログイン画面に "このIDは既に登録されています" 表示）
   - 重複していなければ Users Table に新規レコード追加
   - AppSync 経由で全ユーザーに「新しいユーザーが参加」を通知（チャット内 AIHelper メッセージ）

5. **チャット画面遷移:**
   - 登録成功後 → conversationId パラメータ付きで会話画面へ遷移
   - または会話選択画面を表示

### D. AI 相談ボタン実行フロー（AIHelper 系）

**例：「入力している内容についてのAI回答」**

1. **フロント:** ボタン押下（入力欄にテキスト存在時のみ有効）
2. **AppSync:** `askAIHelper(userInput, currentSummary)` Mutation 実行 + Locks Table には書き込まない（ロック不要）
3. **Lambda (AI Support):**
   - DynamoDB から現在の要約を取得
   - Bedrock（オレゴン、Claude Haiku 4.5）に投げて回答生成
   - **プロンプト例:**

     ```
     ユーザーの質問：[userInput]
     現在の会話要約：[currentSummary]

     この質問に対する回答をしてください。
     ```

   - チャットに回答投稿（userId: "AIHELPER", displayName: "AIHelper"）
   - **エラー時:** AIHelper 名義でエラーメッセージを投稿
4. **AppSync (Subscription):** 全ユーザーに新しい AIHelper メッセージを配信
5. **キューイング:** 複数の AIHelper 要望が同時に入った場合、キューイングして順番に処理

### E. 要約実行フロー（AI要約）

**例：「選択したチャットをAI要約」**

1. **フロント:** ボタン押下（メッセージ1個以上選択時のみ有効）
2. **AppSync:** `updateSummary(selectedMessageIds)` Mutation 実行 + Locks Table に `(conversationId, userId, operationType: summarize)` 書き込み
3. **Lambda (Summarizer):**
   - DynamoDB から「現在の要約」を取得
   - 選択メッセージ + 現在の要約を Bedrock に送信
   - プロンプト：「現在の要約を尊重し、選択メッセージを追加、矛盾なく再構成。必ず『# タイトル』で始まること。」
   - Summary Table 更新（current ← 新要約、previous ← 古い要約）
   - **エラー時:** AIHelper 名義でエラーメッセージを投稿
4. **AppSync (Subscription):**
   - 全ユーザーのサイドバーを更新
   - 「○○さんがチャット①『...』を要約に追加中です」通知
5. **ロック解除:** Lambda 完了時に Locks Table から削除 → フロント Undo ボタン有効化

---

## 6. 選択状態の管理（AppSync State）

- **設計:** 各ユーザーの選択状態は **AppSync のメモリ（State）** で管理。永続化しない。
- **管理形式:** `{ userId, selectedMessageIds: [msg1, msg2...] }`
- **同期機構:** AppSync Subscription で、必要に応じて他ユーザーの選択状態も配信可能。
- **メリット:**
  - リアルタイムレスポンス（DB 往復なし）
  - DynamoDB ストレージ最小化
  - シンプル実装
- **デメリット:** AppSync 再起動時に消える（実務上問題なし）

---

## 7. この構成のメリット

- **管理不要:** サーバーを立てる必要がなく、使った分だけの従量課金。
- **リアルタイム性:** AppSync (GraphQL) を使うことで、「誰かが編集中」という状態を 1 秒以内に全員に伝えられる。Subscription で選択状態も同期可能。
- **シンプルなデータ層:** パターンB の設計により、DynamoDB スキーマが単純化。保守性向上、コストダウン。
- **Undo の堅牢性:** フロント側で Undo ボタンロック + Lambda 競合処理で、安全な実装を実現。
- **AIの柔軟性:** Amazon Bedrock を使うことで、モデルを（Claude から Llama 等へ）切り替えるのもコード 1 行で可能。
- **複数会話対応:** Users Table に conversationIds を保持することで、ユーザーが複数会話に参加可能。
