/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageInput } from '@/components/MessageInput';
import type { SelectionDisplayItem } from '@/types';

describe('MessageInput', () => {
  const onChange = jest.fn();
  const onSend = jest.fn();
  const onAISend = jest.fn();
  const onRemoveSelection = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function renderInput(
    value = '',
    disabled = false,
    withAISend = false,
    selectionItems: SelectionDisplayItem[] = [],
  ) {
    return render(
      <MessageInput
        value={value}
        onChange={onChange}
        onSend={onSend}
        onAISend={withAISend ? onAISend : undefined}
        disabled={disabled}
        selectionItems={selectionItems}
        onRemoveSelection={onRemoveSelection}
      />
    );
  }

  // ── 1. テキスト入力が動作すること ──
  it('テキストを入力すると onChange が呼ばれる', async () => {
    const user = userEvent.setup();
    renderInput();

    const textarea = screen.getByLabelText('メッセージ入力');
    await user.type(textarea, 'テスト');

    expect(onChange).toHaveBeenCalled();
  });

  it('プレースホルダーが表示される', () => {
    renderInput();

    const textarea = screen.getByPlaceholderText(
      'メッセージを入力... (Shift+Enter で改行)'
    );
    expect(textarea).toBeInTheDocument();
  });

  // ── 2. Enter キーで送信されること ──
  it('Enter キーを押すと onSend が呼ばれる', async () => {
    const user = userEvent.setup();
    renderInput('こんにちは');

    const textarea = screen.getByLabelText('メッセージ入力');
    await user.type(textarea, '{Enter}');

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  // ── 3. Shift+Enter で改行されること（送信されない）──
  it('Shift+Enter では onSend が呼ばれない', async () => {
    const user = userEvent.setup();
    renderInput('こんにちは');

    const textarea = screen.getByLabelText('メッセージ入力');
    await user.type(textarea, '{Shift>}{Enter}{/Shift}');

    expect(onSend).not.toHaveBeenCalled();
  });

  // ── 4. 空メッセージは送信されないこと ──
  it('空文字のときは Enter を押しても onSend が呼ばれない', async () => {
    const user = userEvent.setup();
    renderInput('');

    const textarea = screen.getByLabelText('メッセージ入力');
    await user.type(textarea, '{Enter}');

    expect(onSend).not.toHaveBeenCalled();
  });

  it('空白のみのときも Enter を押しても onSend が呼ばれない', async () => {
    const user = userEvent.setup();
    renderInput('   ');

    const textarea = screen.getByLabelText('メッセージ入力');
    await user.type(textarea, '{Enter}');

    expect(onSend).not.toHaveBeenCalled();
  });

  // ── 5. 送信ボタン ──
  it('送信ボタンをクリックすると onSend が呼ばれる', async () => {
    const user = userEvent.setup();
    renderInput('メッセージ');

    const sendButton = screen.getByLabelText('メッセージを送信');
    await user.click(sendButton);

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('値が空のとき送信ボタンが disabled', () => {
    renderInput('');

    const sendButton = screen.getByLabelText('メッセージを送信');
    expect(sendButton).toBeDisabled();
  });

  it('値があるとき送信ボタンが enabled', () => {
    renderInput('hello');

    const sendButton = screen.getByLabelText('メッセージを送信');
    expect(sendButton).not.toBeDisabled();
  });

  it('選択がある場合は送信ボタンが非表示になる', () => {
    const items: SelectionDisplayItem[] = [
      { id: 'msg-1', label: '田中: テスト', type: 'message' },
    ];
    renderInput('hello', false, false, items);

    expect(screen.queryByLabelText('メッセージを送信')).not.toBeInTheDocument();
  });

  // ── 6. disabled 状態 ──
  it('disabled=true のときテキストエリアと送信ボタンが無効化される', () => {
    renderInput('テスト', true);

    const textarea = screen.getByLabelText('メッセージ入力');
    const sendButton = screen.getByLabelText('メッセージを送信');

    expect(textarea).toBeDisabled();
    expect(sendButton).toBeDisabled();
  });

  // ── 7. AI送信ボタン ──
  it('onAISendが渡されているときAI送信ボタンが表示される', () => {
    renderInput('テスト', false, true);

    const aiSendButton = screen.getByLabelText('AIに質問を送信');
    expect(aiSendButton).toBeInTheDocument();
  });

  it('onAISendが渡されていないときAI送信ボタンは表示されない', () => {
    renderInput('テスト', false, false);

    const aiSendButton = screen.queryByLabelText('AIに質問を送信');
    expect(aiSendButton).not.toBeInTheDocument();
  });

  it('AI送信ボタンをクリックすると onAISend が呼ばれる', async () => {
    const user = userEvent.setup();
    const items: SelectionDisplayItem[] = [
      { id: 'msg-1', label: '田中: テスト...', type: 'message' },
    ];
    renderInput('AIへの質問', false, true, items);

    const aiSendButton = screen.getByLabelText('AIに質問を送信');
    await user.click(aiSendButton);

    expect(onAISend).toHaveBeenCalledTimes(1);
  });

  it('値が空のときAI送信ボタンが disabled', () => {
    const items: SelectionDisplayItem[] = [
      { id: 'msg-1', label: '田中: テスト...', type: 'message' },
    ];
    renderInput('', false, true, items);

    const aiSendButton = screen.getByLabelText('AIに質問を送信');
    expect(aiSendButton).toBeDisabled();
  });

  it('選択がないときAI送信ボタンが disabled', () => {
    renderInput('質問内容', false, true, []);

    const aiSendButton = screen.getByLabelText('AIに質問を送信');
    expect(aiSendButton).toBeDisabled();
  });

  it('選択がありテキストもあるときAI送信ボタンが enabled', () => {
    const items: SelectionDisplayItem[] = [
      { id: 'msg-1', label: '田中: テスト...', type: 'message' },
    ];
    renderInput('質問内容', false, true, items);

    const aiSendButton = screen.getByLabelText('AIに質問を送信');
    expect(aiSendButton).not.toBeDisabled();
  });

  // ── 8. 選択状態表示エリア ──
  it('選択がない場合はガイドメッセージを表示', () => {
    renderInput();

    expect(screen.getByText('チャットやCANVASをクリックして選択してください')).toBeInTheDocument();
  });

  it('選択アイテムが表示される', () => {
    const items: SelectionDisplayItem[] = [
      { id: 'msg-1', label: '田中: こんにちは', type: 'message' },
      { id: 'canvas', label: 'CANVAS', type: 'canvas' },
    ];
    renderInput('', false, false, items);

    expect(screen.getByText('選択中:')).toBeInTheDocument();
    expect(screen.getByText(/田中: こんにちは/)).toBeInTheDocument();
    expect(screen.getByText(/CANVAS/)).toBeInTheDocument();
  });

  it('選択解除ボタンをクリックすると onRemoveSelection が呼ばれる', async () => {
    const user = userEvent.setup();
    const items: SelectionDisplayItem[] = [
      { id: 'msg-1', label: '田中: こんにちは', type: 'message' },
    ];
    renderInput('', false, false, items);

    const removeButton = screen.getByLabelText('田中: こんにちはの選択を解除');
    await user.click(removeButton);

    expect(onRemoveSelection).toHaveBeenCalledWith('msg-1');
  });
});
