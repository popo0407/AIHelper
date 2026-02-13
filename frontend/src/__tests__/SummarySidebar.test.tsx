/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SummarySidebar } from '@/components/SummarySidebar';
import type { Summary, LockState } from '@/types';

// ── Test data ──
const defaultLockState: LockState = {
  isLocked: false,
  lockedBy: null,
  operationType: null,
  isSummaryLocked: false,
  isEditLocked: false,
};

const lockedByOther: LockState = {
  isLocked: true,
  lockedBy: '鈴木花子',
  operationType: 'edit',
  isSummaryLocked: false,
  isEditLocked: true,
};

const summarizeLock: LockState = {
  isLocked: true,
  lockedBy: 'AIHelper',
  operationType: 'summarize',
  isSummaryLocked: true,
  isEditLocked: false,
};

const testSummary: Summary = {
  conversationId: 'conv-1',
  title: 'プロジェクト打ち合わせ',
  current: '本日の議題:\n1. スケジュール確認\n2. タスク割り当て',
  previous: '前回の議事録内容',
  updatedAt: '2026-02-13T10:00:00Z',
  updatedBy: '田中太郎',
};

const defaultProps = {
  summary: testSummary,
  isEditing: false,
  editContent: '',
  onEditContentChange: jest.fn(),
  onStartEdit: jest.fn(),
  onSaveEdit: jest.fn(),
  onCancelEdit: jest.fn(),
  onUndo: jest.fn(),
  canEdit: true,
  canUndo: true,
  lockState: defaultLockState,
  isSummaryProcessing: false,
};

describe('SummarySidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── 1. 要約が表示されること ──
  it('要約の内容が表示される', () => {
    render(<SummarySidebar {...defaultProps} />);

    expect(screen.getByText(/本日の議題/)).toBeInTheDocument();
    expect(screen.getByText(/スケジュール確認/)).toBeInTheDocument();
  });

  it('要約がない場合は空メッセージが表示される', () => {
    render(<SummarySidebar {...defaultProps} summary={null} />);

    expect(screen.getByText(/まだ要約がありません/)).toBeInTheDocument();
  });

  it('最終更新者が表示される', () => {
    render(<SummarySidebar {...defaultProps} />);

    expect(screen.getByText(/最終更新: 田中太郎/)).toBeInTheDocument();
  });

  it('ヘッダーに「要約・議事録」タイトルが表示される', () => {
    render(<SummarySidebar {...defaultProps} />);

    expect(screen.getByText('要約・議事録')).toBeInTheDocument();
  });

  // ── 2. 編集モードに切り替えられること ──
  it('編集ボタンをクリックすると onStartEdit が呼ばれる', async () => {
    const user = userEvent.setup();
    render(<SummarySidebar {...defaultProps} />);

    await user.click(screen.getByLabelText('要約を編集'));

    expect(defaultProps.onStartEdit).toHaveBeenCalledTimes(1);
  });

  it('編集中はテキストエリアと保存/キャンセルボタンが表示される', () => {
    render(
      <SummarySidebar
        {...defaultProps}
        isEditing={true}
        editContent="編集中の内容"
      />
    );

    expect(screen.getByLabelText('要約を編集')).toBeInTheDocument();
    expect(screen.getByLabelText('編集を保存')).toBeInTheDocument();
    expect(screen.getByLabelText('編集をキャンセル')).toBeInTheDocument();
  });

  it('保存ボタンをクリックすると onSaveEdit が呼ばれる', async () => {
    const user = userEvent.setup();
    render(
      <SummarySidebar
        {...defaultProps}
        isEditing={true}
        editContent="更新内容"
      />
    );

    await user.click(screen.getByLabelText('編集を保存'));

    expect(defaultProps.onSaveEdit).toHaveBeenCalledTimes(1);
  });

  it('キャンセルボタンをクリックすると onCancelEdit が呼ばれる', async () => {
    const user = userEvent.setup();
    render(
      <SummarySidebar
        {...defaultProps}
        isEditing={true}
        editContent="キャンセルする内容"
      />
    );

    await user.click(screen.getByLabelText('編集をキャンセル'));

    expect(defaultProps.onCancelEdit).toHaveBeenCalledTimes(1);
  });

  it('取消ボタンをクリックすると onUndo が呼ばれる', async () => {
    const user = userEvent.setup();
    render(<SummarySidebar {...defaultProps} />);

    await user.click(screen.getByLabelText('要約を元に戻す'));

    expect(defaultProps.onUndo).toHaveBeenCalledTimes(1);
  });

  // ── 3. ロック中は編集できないこと ──
  it('ロック中はロックオーバーレイが表示される', () => {
    render(<SummarySidebar {...defaultProps} lockState={lockedByOther} />);

    expect(screen.getByText(/鈴木花子さんが思考中です/)).toBeInTheDocument();
  });

  it('要約ロック中は通知が表示される', () => {
    render(<SummarySidebar {...defaultProps} lockState={summarizeLock} />);

    expect(
      screen.getByText(/AIHelperさんが要約に追加中です/)
    ).toBeInTheDocument();
  });

  it('canEdit=false のとき編集ボタンが disabled', () => {
    render(<SummarySidebar {...defaultProps} canEdit={false} />);

    expect(screen.getByLabelText('要約を編集')).toBeDisabled();
  });

  it('canUndo=false のとき取消ボタンが disabled', () => {
    render(<SummarySidebar {...defaultProps} canUndo={false} />);

    expect(screen.getByLabelText('要約を元に戻す')).toBeDisabled();
  });

  it('要約生成中はスピナーが表示される', () => {
    render(<SummarySidebar {...defaultProps} isSummaryProcessing={true} />);

    expect(screen.getByText('要約を生成中...')).toBeInTheDocument();
  });

  it('要約生成中は編集ボタンが disabled', () => {
    render(
      <SummarySidebar
        {...defaultProps}
        isSummaryProcessing={true}
        canEdit={true}
      />
    );

    expect(screen.getByLabelText('要約を編集')).toBeDisabled();
  });

  // ── 文字数表示 ──
  it('現在の文字数と上限が表示される', () => {
    render(<SummarySidebar {...defaultProps} />);

    // testSummary.current の長さ + " / 5000"
    const expectedLength = testSummary.current!.length;
    expect(screen.getByText(`${expectedLength} / 5000`)).toBeInTheDocument();
  });
});
