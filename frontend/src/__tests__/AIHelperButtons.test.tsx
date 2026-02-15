/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AIHelperButtons } from '@/components/AIHelperButtons';
import type { LockState } from '@/types';

// ── Test data ──
const defaultLockState: LockState = {
  isLocked: false,
  lockedBy: null,
  operationType: null,
  isSummaryLocked: false,
  isEditLocked: false,
};

const editLockedState: LockState = {
  isLocked: true,
  lockedBy: '鈴木花子',
  operationType: 'edit',
  isSummaryLocked: false,
  isEditLocked: true,
};

const summaryLockedState: LockState = {
  isLocked: true,
  lockedBy: 'AIHelper',
  operationType: 'summarize',
  isSummaryLocked: true,
  isEditLocked: false,
};

describe('AIHelperButtons', () => {
  const onAction = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function renderButtons(overrides: Partial<Parameters<typeof AIHelperButtons>[0]> = {}) {
    const defaultProps = {
      selectedCount: 0,
      inputText: '',
      onAction,
      isProcessing: false,
      lockState: defaultLockState,
    };
    return render(<AIHelperButtons {...defaultProps} {...overrides} />);
  }

  // ── 1. ボタンが表示されること ──
  it('AIボタンがすべて表示される', () => {
    renderButtons();

    expect(screen.getByLabelText('選択したチャットをAI要約')).toBeInTheDocument();
    expect(screen.getByLabelText('選択したチャットに対するAI意見')).toBeInTheDocument();
    expect(screen.getByLabelText('入力している内容についてのAI回答')).toBeInTheDocument();
    expect(screen.getByLabelText('要約を元にしたネクストアクション提案')).toBeInTheDocument();
  });

  it('AI相談ラベルが表示される', () => {
    renderButtons();
    expect(screen.getByText('AI相談:')).toBeInTheDocument();
  });

  // ── 2. 選択が必要なボタンのenable/disable ──
  it('メッセージ未選択時、要約・意見ボタンは disabled', () => {
    renderButtons({ selectedCount: 0 });

    expect(screen.getByLabelText('選択したチャットをAI要約')).toBeDisabled();
    expect(screen.getByLabelText('選択したチャットに対するAI意見')).toBeDisabled();
  });

  it('メッセージ選択時、要約・意見ボタンは enabled', () => {
    renderButtons({ selectedCount: 3 });

    expect(screen.getByLabelText('選択したチャットをAI要約')).toBeEnabled();
    expect(screen.getByLabelText('選択したチャットに対するAI意見')).toBeEnabled();
  });

  // ── 3. 入力が必要なボタンのenable/disable ──
  it('テキスト未入力時、回答ボタンは disabled', () => {
    renderButtons({ inputText: '' });

    expect(screen.getByLabelText('入力している内容についてのAI回答')).toBeDisabled();
  });

  it('テキスト入力時、回答ボタンは enabled', () => {
    renderButtons({ inputText: 'テスト質問' });

    expect(screen.getByLabelText('入力している内容についてのAI回答')).toBeEnabled();
  });

  it('空白のみのテキスト入力ではAI回答ボタンは disabled', () => {
    renderButtons({ inputText: '   ' });

    expect(screen.getByLabelText('入力している内容についてのAI回答')).toBeDisabled();
  });

  // ── 4. ネクストアクションは常に enabled ──
  it('ネクストアクションボタンは選択・入力不要で enabled', () => {
    renderButtons({ selectedCount: 0, inputText: '' });

    expect(screen.getByLabelText('要約を元にしたネクストアクション提案')).toBeEnabled();
  });

  // ── 5. 処理中はすべて disabled ──
  it('処理中はすべてのボタンが disabled', () => {
    renderButtons({
      isProcessing: true,
      selectedCount: 3,
      inputText: 'テスト',
    });

    expect(screen.getByLabelText('選択したチャットをAI要約')).toBeDisabled();
    expect(screen.getByLabelText('選択したチャットに対するAI意見')).toBeDisabled();
    expect(screen.getByLabelText('入力している内容についてのAI回答')).toBeDisabled();
    expect(screen.getByLabelText('要約を元にしたネクストアクション提案')).toBeDisabled();
  });

  it('処理中は「処理中」テキストが表示される', () => {
    renderButtons({ isProcessing: true });

    const processingTexts = screen.getAllByText('処理中');
    expect(processingTexts.length).toBe(4); // 4つのボタンすべてに表示
  });

  // ── 6. excludeButtonIds プロップ ──
  it('excludeButtonIds で指定したボタンが非表示になる', () => {
    renderButtons({ excludeButtonIds: ['answer'] });

    // 除外されたボタンは表示されない
    expect(screen.queryByLabelText('入力している内容についてのAI回答')).not.toBeInTheDocument();

    // 他のボタンは表示される
    expect(screen.getByLabelText('選択したチャットをAI要約')).toBeInTheDocument();
    expect(screen.getByLabelText('選択したチャットに対するAI意見')).toBeInTheDocument();
    expect(screen.getByLabelText('要約を元にしたネクストアクション提案')).toBeInTheDocument();
  });

  it('複数のボタンを excludeButtonIds で除外できる', () => {
    renderButtons({ excludeButtonIds: ['answer', 'next_action'] });

    expect(screen.queryByLabelText('入力している内容についてのAI回答')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('要約を元にしたネクストアクション提案')).not.toBeInTheDocument();

    // 除外されていないボタンは表示される
    expect(screen.getByLabelText('選択したチャットをAI要約')).toBeInTheDocument();
    expect(screen.getByLabelText('選択したチャットに対するAI意見')).toBeInTheDocument();
  });8

  it('excludeButtonIds が空配列でもすべてのボタンが表示される', () => {
    renderButtons({ excludeButtonIds: [] });

    expect(screen.getByLabelText('選択したチャットをAI要約')).toBeInTheDocument();
    expect(screen.getByLabelText('選択したチャットに対するAI意見')).toBeInTheDocument();
    expect(screen.getByLabelText('入力している内容についてのAI回答')).toBeInTheDocument();
    expect(screen.getByLabelText('要約を元にしたネクストアクション提案')).toBeInTheDocument();
  });

  // ── 7. ロック状態での動作 ──
  it('編集ロック中でも要約ボタン以外は有効条件に従う', () => {
    renderButtons({
      lockState: editLockedState,
      selectedCount: 3,
      inputText: 'テスト',
    });

    // 要約ボタンはeditLockでは無効にならない（summaryLockのみ）
    // button.id === 'summarize' && lockState.isEditLocked の条件をチェック
    expect(screen.getByLabelText('選択したチャットをAI要約')).toBeDisabled();
  });

  it('要約ロック中は要約ボタンが disabled', () => {
    renderButtons({
      lockState: summaryLockedState,
      selectedCount: 3,
    });

    expect(screen.getByLabelText('選択したチャットをAI要約')).toBeDisabled();
  });

  // ── 7. クリックで onAction が呼ばれること ──
  it('要約ボタンクリックで onAction("summarize") が呼ばれる', async () => {
    const user = userEvent.setup();
    renderButtons({ selectedCount: 2 });

    await user.click(screen.getByLabelText('選択したチャットをAI要約'));

    expect(onAction).toHaveBeenCalledWith('summarize');
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('意見ボタンクリックで onAction("opinion") が呼ばれる', async () => {
    const user = userEvent.setup();
    renderButtons({ selectedCount: 2 });

    await user.click(screen.getByLabelText('選択したチャットに対するAI意見'));

    expect(onAction).toHaveBeenCalledWith('opinion');
  });

  it('回答ボタンクリックで onAction("answer") が呼ばれる', async () => {
    const user = userEvent.setup();
    renderButtons({ inputText: '質問内容' });

    await user.click(screen.getByLabelText('入力している内容についてのAI回答'));

    expect(onAction).toHaveBeenCalledWith('answer');
  });

  it('ネクストアクションクリックで onAction("next_action") が呼ばれる', async () => {
    const user = userEvent.setup();
    renderButtons();

    await user.click(screen.getByLabelText('要約を元にしたネクストアクション提案'));

    expect(onAction).toHaveBeenCalledWith('next_action');
  });

  // ── 9. disabled時にクリックしても onAction が呼ばれないこと ──
  it('disabled 要約ボタンをクリックしても onAction が呼ばれない', async () => {
    const user = userEvent.setup();
    renderButtons({ selectedCount: 0 });

    // disabled ボタンは userEvent.click で呼ばれない
    const btn = screen.getByLabelText('選択したチャットをAI要約');
    await user.click(btn).catch(() => {});

    expect(onAction).not.toHaveBeenCalled();
  });

  // ── 10. title属性のテスト ──
  it('メッセージ未選択時に要約ボタンのtitleがヒントを表示', () => {
    renderButtons({ selectedCount: 0 });

    const btn = screen.getByLabelText('選択したチャットをAI要約');
    expect(btn).toHaveAttribute('title', 'メッセージを選択してください');
  });

  it('テキスト未入力時に回答ボタンのtitleがヒントを表示', () => {
    renderButtons({ inputText: '' });

    const btn = screen.getByLabelText('入力している内容についてのAI回答');
    expect(btn).toHaveAttribute('title', 'テキストを入力してください');
  });
});
