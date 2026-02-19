/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
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
  onAddToSummary: jest.fn(),
  canAddToSummary: true,
  selectedMessageCount: 0,
  onUpdatePromptType: jest.fn(),
  promptTemplates: [],
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

    expect(screen.getByText(/まだ内容がありません/)).toBeInTheDocument();
  });

  it('最終更新者が表示される', () => {
    render(<SummarySidebar {...defaultProps} />);

    expect(screen.getByText(/最終更新: 田中太郎/)).toBeInTheDocument();
  });

  it('ヘッダーに「CANVAS」タイトルが表示される', () => {
    render(<SummarySidebar {...defaultProps} />);

    expect(screen.getByText('CANVAS')).toBeInTheDocument();
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

  // ── 4. コピー機能 ──
  describe('コピー機能', () => {
    it('コピーボタンが表示される', () => {
      render(<SummarySidebar {...defaultProps} />);

      expect(screen.getByLabelText('CANVASをコピー')).toBeInTheDocument();
    });

    it('テキストがない場合はコピーボタンが disabled', () => {
      render(<SummarySidebar {...defaultProps} summary={null} />);

      expect(screen.getByLabelText('CANVASをコピー')).toBeDisabled();
    });

    it('編集中はコピーボタンが disabled', () => {
      render(
        <SummarySidebar
          {...defaultProps}
          isEditing={true}
          editContent="編集中"
        />
      );

      expect(screen.getByLabelText('CANVASをコピー')).toBeDisabled();
    });
  });

  // ── 5. プロンプト種別ドロップダウン ──
  describe('プロンプト種別選択', () => {
    it('ドロップダウンが表示される', () => {
      render(<SummarySidebar {...defaultProps} />);
      expect(screen.getByLabelText('プロンプト種別を選択')).toBeInTheDocument();
    });

    it('初期値は「要約」である', () => {
      render(<SummarySidebar {...defaultProps} />);
      const select = screen.getByLabelText('プロンプト種別を選択') as HTMLSelectElement;
      expect(select.value).toBe('summary');
    });

    it('selectedPromptType=actionItemの場合正しく選択される', () => {
      const summaryWithPromptType = { ...testSummary, selectedPromptType: 'actionItem' as const };
      render(<SummarySidebar {...defaultProps} summary={summaryWithPromptType} />);
      const select = screen.getByLabelText('プロンプト種別を選択') as HTMLSelectElement;
      expect(select.value).toBe('actionItem');
    });

    it('ドロップダウン変更時に onUpdatePromptType が呼ばれる', async () => {
      const onUpdatePromptType = jest.fn();
      const user = userEvent.setup();
      render(<SummarySidebar {...defaultProps} onUpdatePromptType={onUpdatePromptType} />);

      const select = screen.getByLabelText('プロンプト種別を選択');
      await user.selectOptions(select, 'actionItem');

      expect(onUpdatePromptType).toHaveBeenCalledWith('actionItem');
    });

    it('カスタム選択時に編集ボタンが表示される', () => {
      const summaryCustom = { ...testSummary, selectedPromptType: 'custom' as const, customPromptText: 'テストプロンプト' };
      render(<SummarySidebar {...defaultProps} summary={summaryCustom} />);
      expect(screen.getByLabelText('カスタムプロンプトを編集')).toBeInTheDocument();
    });

    it('カスタム編集ボタンクリックでモーダルが開く', async () => {
      const summaryCustom = { ...testSummary, selectedPromptType: 'custom' as const, customPromptText: 'テストプロンプト' };
      const user = userEvent.setup();
      render(<SummarySidebar {...defaultProps} summary={summaryCustom} />);

      await user.click(screen.getByLabelText('カスタムプロンプトを編集'));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByLabelText('カスタムプロンプトを入力')).toBeInTheDocument();
    });

    it('モーダルで「保存」すると onUpdatePromptType が呼ばれる', async () => {
      const summaryCustom = { ...testSummary, selectedPromptType: 'custom' as const, customPromptText: '' };
      const onUpdatePromptType = jest.fn();
      const user = userEvent.setup();
      render(<SummarySidebar {...defaultProps} summary={summaryCustom} onUpdatePromptType={onUpdatePromptType} />);

      await user.click(screen.getByLabelText('カスタムプロンプトを編集'));
      const textarea = screen.getByLabelText('カスタムプロンプトを入力');
      await user.type(textarea, '新しいプロンプト');
      await user.click(screen.getByLabelText('保存'));

      expect(onUpdatePromptType).toHaveBeenCalledWith('custom', '新しいプロンプト');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('CANVASに追加ボタンに「CANVASに追加」文言が表示される', () => {
      render(
        <SummarySidebar
          {...defaultProps}
          selectedMessageCount={2}
          canAddToSummary={true}
        />
      );
      expect(screen.getByLabelText('CANVASに追加')).toBeInTheDocument();
      expect(screen.getByText('CANVASに追加 (2)')).toBeInTheDocument();
    });
  });
});
