# 📋 要件定義：音声認識入力機能

**作成日**: 2026年2月16日  
**ステータス**: ✅ 確定  
**対応ブラウザ**: Microsoft Edge (Chromium)

---

## 1. 機能概要

メッセージ入力欄コンポーネントに**マイクボタン**を新規追加し、Web Speech APIを用いて音声をテキストに変換し、入力欄に反映する機能。

### ユースケース
- ユーザーがマイクボタンを押下 → マイクがリッスン開始
- 音声を喋る → テキストに変換され入力欄に追記
- 送信は手動で実施（ユーザーの判断）

---

## 2. 詳細仕様

### 2.1 リッスン動作
- **リッスン方式**: 連続リッスン
  - マイクボタンをクリック中はずっとリッスン状態を保持
  - ボタンを再度クリックで停止
  
- **自動停止条件**:
  - 30秒以上無音状態が続いた場合、自動停止
  - ユーザーに自動停止を通知

- **認識結果の追記**:
  - 認識されたテキストは入力欄に**追記** （置き換えではない）
  - 複数回の認識結果が蓄積される

### 2.2 言語設定
- **対応言語**: 日本語のみ
- `SpeechRecognition` の `lang` プロパティ: `'ja-JP'`

### 2.3 エラーハンドリング
- マイクアクセス拒否 → ユーザーに通知し、リッスン停止
- Web Speech API 非対応 → マイクボタン表示なし or 無効化
- 認識エラー発生 → ユーザーに通知（トースト等）

---

## 3. UI/UX仕様

### 3.1 マイクボタンの配置
- **位置**: メッセージ入力欄の**右側**
- **隣接要素**: 送信ボタンの左側に配置

### 3.2 ビジュアル（状態別）

| 状態 | 背景色 | マイク色 | 説明 |
|------|--------|---------|------|
| **待機中** | 薄い青 | 黒 | リッスン可能な状態 |
| **リッスン中** | 濃い青 | 白 | 現在リッスン中 |
| **自動停止中** | グレー | グレー | 30秒無音で停止（一時的に無効） |

### 3.3 アニメーション・フィードバック
- リッスン中：軽微なパルスアニメーション（音声波形等）でリッスン中であることを表現
- ホバー時：マウスホバーで背景色を若干濃くして操作可能性を示唆

### 3.4 ユーザー通知
- **自動停止通知**: "マイクが停止しました（無音が30秒続きました）"
- **エラー通知**: "マイクアクセスが拒否されました" 等

---

## 4. 詳細設計

### 4.1 ファイル構成

```
frontend/src/
├── components/
│   ├── MessageInput.tsx           ← 既存（マイクボタン統合）
│   ├── MicrophoneButton.tsx       ← 新規作成
│   └── VoiceInputStatus.tsx       ← 新規作成（ステータス表示）
├── lib/
│   └── hooks/
│       └── useSpeechRecognition.ts ← 新規作成
└── styles/
    └── voice-input.css            ← 新規作成（オプション）
```

### 4.2 コンポーネント設計

#### 4.2.1 `useSpeechRecognition.ts` (カスタムフック)

**責務**:
- Web Speech API の初期化・管理
- リッスン開始/停止
- 30秒無音タイムアウト実装
- エラーハンドリング

**入出力**:

```typescript
interface UseSpeechRecognitionResult {
  isListening: boolean;           // リッスン中フラグ
  isSupported: boolean;           // Web Speech API 対応フラグ
  error: string | null;           // エラーメッセージ
  startListening: () => void;     // リッスン開始関数
  stopListening: () => void;      // リッスン停止関数
  transcript: string;             // 認識されたテキスト
}

export const useSpeechRecognition = (): UseSpeechRecognitionResult => {
  // 実装詳細
}
```

#### 4.2.2 `MicrophoneButton.tsx` (UIコンポーネント)

**責務**:
- マイクボタンのUIレンダリング
- 状態別スタイル適用（待機中/リッスン中/自動停止中）
- ボタンクリック時のコールバック処理

**Props**:

```typescript
interface MicrophoneButtonProps {
  isListening: boolean;
  isSupported: boolean;
  disabled?: boolean;
  onClick: () => void;
  onStop?: () => void;
  className?: string;
}
```

**UI状態**:
- **待機中**: `bg-blue-100` + 黒マイクアイコン
- **リッスン中**: `bg-blue-600` + 白マイクアイコン + パルスアニメーション
- **自動停止中**: `bg-gray-300` + グレーマイクアイコン （再開可能）

#### 4.2.3 `VoiceInputStatus.tsx` (ステータス表示)

**責務**:
- エラー通知の表示
- 自動停止通知の表示
- 認識状態の指標表示

### 4.3 MessageInput への統合

**変更箇所** (MessageInput.tsx):

```typescript
// 既存の props に追加
interface MessageInputProps {
  // ... 既存プロパティ
  onVoiceInput?: (text: string) => void;  // 音声入力テキスト取得コールバック
  enableVoiceInput?: boolean;              // 音声入力有効フラグ
}

// textarea と送信ボタンの間に挿入
<div className="flex items-end gap-2">
  <textarea ... />
  {/* ← MicrophoneButton をここに追加 */}
  <button ... /> {/* 送信ボタン */}
</div>
```

### 4.4 状態管理フロー

```
MicrophoneButton クリック
  ↓
useSpeechRecognition.startListening()
  ↓
Web Speech API リッスン開始
  ↓
(ユーザーが会話)
  ↓
認識結果 → onVoiceInput コールバック
  ↓
MessageInput の value に追記（setState）
  ↓
ユーザーが送信ボタンをクリック → メッセージ送信
```

### 4.5 タイムアウト実装

```typescript
// useSpeechRecognition 内で
const silenceTimeout = setTimeout(() => {
  recognition.stop();  // 30秒無音で自動停止
  setError('マイクが停止しました（無音が30秒続きました）');
}, 30000);
```

---

## 5. 技術仕様

### 5.1 使用技術
- **API**: Web Speech API (`SpeechRecognition`)
- **フレームワーク**: React (TypeScript)
- **スタイル**: Tailwind CSS

### 5.2 ブラウザ互換性
| ブラウザ | 対応 | 備考 |
|---------|------|------|
| Microsoft Edge | ✅ | 推奨環境 |
| Chrome | ✅ | 参考用 |
| Firefox | ⚠️ | 部分対応 |
| Safari | ❌ | 非対応 |

---

## 6. 実装チェックリスト

### フェーズ1：基礎実装
- [ ] `useSpeechRecognition.ts` 作成（フック）
- [ ] `MicrophoneButton.tsx` 作成（UIコンポーネント）
- [ ] `VoiceInputStatus.tsx` 作成（ステータス表示）
- [ ] `MessageInput.tsx` 統合

### フェーズ2：機能完成
- [ ] 30秒タイムアウト実装
- [ ] エラーハンドリング実装
- [ ] 音声認識結果の追記ロジック

### フェーズ3：テスト・品質保証
- [ ] ユニットテスト作成（フック + コンポーネント）
- [ ] E2Eテスト作成（Playwright）
- [ ] エラーケーステスト
- [ ] Edgeブラウザで動作確認

### フェーズ4：デプロイ
- [ ] スタイル微調整
- [ ] README 更新
- [ ] 本番環境デプロイ前検証

---

## 7. 参考資料

- [Web Speech API MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [SpeechRecognition MDN](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- [MDN SpeechRecognitionEvent](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionEvent)
