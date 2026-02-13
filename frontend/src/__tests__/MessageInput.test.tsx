/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageInput } from '@/components/MessageInput';

describe('MessageInput', () => {
  const onChange = jest.fn();
  const onSend = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function renderInput(value = '', disabled = false) {
    return render(
      <MessageInput
        value={value}
        onChange={onChange}
        onSend={onSend}
        disabled={disabled}
      />
    );
  }

  // ── 1. テキスト入力が動作すること ──
  it('テキストを入力すると onChange が呼ばれる', async () => {
    const user = userEvent.setup();
    renderInput();

    const textarea = screen.getByLabelText('メッセージ入力');
    await user.type(textarea, 'テスト');

    // userEvent.type は1文字ずつ onChange を呼ぶ
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

  // ── 6. disabled 状態 ──
  it('disabled=true のときテキストエリアと送信ボタンが無効化される', () => {
    renderInput('テスト', true);

    const textarea = screen.getByLabelText('メッセージ入力');
    const sendButton = screen.getByLabelText('メッセージを送信');

    expect(textarea).toBeDisabled();
    expect(sendButton).toBeDisabled();
  });
});
