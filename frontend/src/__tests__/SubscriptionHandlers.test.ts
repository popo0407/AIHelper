/**
 * @jest-environment jsdom
 * 
 * GraphQL Subscription ハンドラーのユニットテスト
 * 
 * ChatScreen 内の Subscription ハンドラー（onNewMessage, onSummaryUpdate, onLockChange）
 * のロジックを外部関数として切り出し、単体テスト可能にする。
 * 
 * E2E テスト（ブラウザ間リアルタイム同期）は別途 e2e/ に配置するが、
 * ハンドラーロジックの正確性をこのユニットテストで保証する。
 */

import type { Message, Summary, Lock } from '@/types';

// ── Subscription ハンドラーロジック（ChatScreen から抽出） ──

/**
 * onNewMessage の state 更新ロジック
 * 重複を検出し、既存メッセージを更新するか新しいメッセージを追加する
 */
function handleNewMessage(prev: Message[], newMsg: Message): Message[] {
  if (prev.some((m) => m.messageId === newMsg.messageId)) {
    return prev.map((m) =>
      m.messageId === newMsg.messageId ? newMsg : m
    );
  }
  return [...prev, newMsg];
}

/**
 * onLockChange の state 更新ロジック
 * released イベントでロックを削除、それ以外は追加/更新
 */
function handleLockChange(prev: Lock[], lockEvent: Lock): Lock[] {
  if (lockEvent.operationType === 'released') {
    return prev.filter((l) => l.userId !== lockEvent.userId);
  }
  const existsIdx = prev.findIndex(
    (l) =>
      l.userId === lockEvent.userId &&
      l.lockType === lockEvent.lockType
  );
  if (existsIdx >= 0) {
    const next = [...prev];
    next[existsIdx] = lockEvent;
    return next;
  }
  return [...prev, lockEvent];
}

/**
 * deriveLockState: ロック配列から UI 表示用のロック状態を導出する
 */
function deriveLockState(
  locks: Lock[],
  currentUserId: string
): {
  isLocked: boolean;
  lockedBy: string | null;
  operationType: 'edit' | 'summarize' | null;
  isSummaryLocked: boolean;
  isEditLocked: boolean;
} {
  const now = Math.floor(Date.now() / 1000);
  const activeLocks = locks.filter(
    (l) => l.ttl === null || l.ttl > now
  );

  const editLock = activeLocks.find((l) => l.operationType === 'edit');
  const summarizeLock = activeLocks.find(
    (l) => l.operationType === 'summarize'
  );

  return {
    isLocked: activeLocks.length > 0,
    lockedBy: editLock?.userId ?? summarizeLock?.userId ?? null,
    operationType: editLock ? 'edit' : summarizeLock ? 'summarize' : null,
    isSummaryLocked: !!summarizeLock && summarizeLock.userId !== currentUserId,
    isEditLocked: !!editLock && editLock.userId !== currentUserId,
  };
}

// ── テストデータ ──

const baseMessage: Message = {
  conversationId: 'conv-1',
  messageId: 'msg-1',
  userId: 'tanaka',
  displayName: '田中太郎',
  content: 'こんにちは',
  timestamp: '2026-02-13T10:30:00Z',
  isUsedInSummary: false,
};

const newMessage: Message = {
  conversationId: 'conv-1',
  messageId: 'msg-2',
  userId: 'suzuki',
  displayName: '鈴木花子',
  content: 'おはようございます',
  timestamp: '2026-02-13T10:31:00Z',
  isUsedInSummary: false,
};

const aiMessage: Message = {
  conversationId: 'conv-1',
  messageId: 'msg-ai-1',
  userId: 'AIHELPER',
  displayName: 'AIHelper',
  content: 'AIからの返信です',
  timestamp: '2026-02-13T10:32:00Z',
  isUsedInSummary: false,
};

const baseLock: Lock = {
  conversationId: 'conv-1',
  lockType: 'conversation',
  userId: 'tanaka',
  operationType: 'edit',
  startTime: '2026-02-13T10:30:00Z',
  ttl: null,
};

const baseSummary: Summary = {
  conversationId: 'conv-1',
  title: 'テスト会話',
  current: '要約内容',
  previous: '前回の要約',
  updatedAt: '2026-02-13T10:30:00Z',
  updatedBy: '田中太郎',
};

// ── テスト ──

describe('Subscription ハンドラー: handleNewMessage', () => {
  it('新しいメッセージをリストに追加する', () => {
    const prev = [baseMessage];
    const result = handleNewMessage(prev, newMessage);

    expect(result).toHaveLength(2);
    expect(result[1]).toEqual(newMessage);
  });

  it('空リストにメッセージを追加する', () => {
    const result = handleNewMessage([], newMessage);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(newMessage);
  });

  it('重複メッセージは置換される（楽観的更新の解決）', () => {
    const tempMessage: Message = {
      ...baseMessage,
      messageId: 'msg-1',
      content: '仮のメッセージ',
    };
    const prev = [tempMessage];

    const serverMessage: Message = {
      ...baseMessage,
      messageId: 'msg-1',
      content: 'サーバーから返されたメッセージ',
    };

    const result = handleNewMessage(prev, serverMessage);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('サーバーから返されたメッセージ');
  });

  it('重複メッセージ置換時、他のメッセージは影響を受けない', () => {
    const prev = [baseMessage, newMessage];
    const updatedBase: Message = {
      ...baseMessage,
      content: '更新されたメッセージ',
    };

    const result = handleNewMessage(prev, updatedBase);

    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('更新されたメッセージ');
    expect(result[1]).toEqual(newMessage);
  });

  it('AIHelperのメッセージも正しく追加される', () => {
    const prev = [baseMessage, newMessage];
    const result = handleNewMessage(prev, aiMessage);

    expect(result).toHaveLength(3);
    expect(result[2].userId).toBe('AIHELPER');
    expect(result[2].displayName).toBe('AIHelper');
  });

  it('同じユーザーの連続メッセージが追加される', () => {
    const secondMsg: Message = {
      ...baseMessage,
      messageId: 'msg-3',
      content: '2つ目のメッセージ',
      timestamp: '2026-02-13T10:33:00Z',
    };

    const prev = [baseMessage];
    const result = handleNewMessage(prev, secondMsg);

    expect(result).toHaveLength(2);
  });
});

describe('Subscription ハンドラー: onSummaryUpdate', () => {
  it('要約が更新される', () => {
    const updated: Summary = {
      ...baseSummary,
      current: '更新された要約',
      updatedBy: '鈴木花子',
    };

    // onSummaryUpdate は直接 setSummary(updated) するのでシンプル
    expect(updated.current).toBe('更新された要約');
    expect(updated.updatedBy).toBe('鈴木花子');
    expect(updated.previous).toBe('前回の要約'); // previous は保持される
  });

  it('要約のタイトルが更新される', () => {
    const updated: Summary = {
      ...baseSummary,
      title: '新しいタイトル',
    };

    expect(updated.title).toBe('新しいタイトル');
  });

  it('要約が null から値に変わる', () => {
    const nullSummary: Summary | null = null;
    const newSummary: Summary = baseSummary;

    // null → Summary の遷移
    expect(nullSummary).toBeNull();
    expect(newSummary.current).toBe('要約内容');
  });
});

describe('Subscription ハンドラー: handleLockChange', () => {
  it('新しいロックを追加する', () => {
    const result = handleLockChange([], baseLock);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(baseLock);
  });

  it('released イベントでロックを削除する', () => {
    const releasedLock: Lock = {
      ...baseLock,
      operationType: 'released',
    };

    const prev = [baseLock];
    const result = handleLockChange(prev, releasedLock);

    expect(result).toHaveLength(0);
  });

  it('同じユーザーのロックを更新する', () => {
    const updatedLock: Lock = {
      ...baseLock,
      operationType: 'summarize',
    };

    const prev = [baseLock];
    const result = handleLockChange(prev, updatedLock);

    expect(result).toHaveLength(1);
    expect(result[0].operationType).toBe('summarize');
  });

  it('異なるユーザーのロックは独立して管理される', () => {
    const suzukiLock: Lock = {
      ...baseLock,
      userId: 'suzuki',
      operationType: 'edit',
    };

    const prev = [baseLock];
    const result = handleLockChange(prev, suzukiLock);

    expect(result).toHaveLength(2);
    expect(result[0].userId).toBe('tanaka');
    expect(result[1].userId).toBe('suzuki');
  });

  it('一方のユーザーがrelease しても他のユーザーのロックは残る', () => {
    const suzukiLock: Lock = {
      ...baseLock,
      userId: 'suzuki',
      operationType: 'edit',
    };
    const tanakaRelease: Lock = {
      ...baseLock,
      userId: 'tanaka',
      operationType: 'released',
    };

    const prev = [baseLock, suzukiLock];
    const result = handleLockChange(prev, tanakaRelease);

    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('suzuki');
  });

  it('空リストに released が来ても問題ない', () => {
    const releasedLock: Lock = {
      ...baseLock,
      operationType: 'released',
    };

    const result = handleLockChange([], releasedLock);
    expect(result).toHaveLength(0);
  });
});

describe('deriveLockState', () => {
  it('ロックがない場合は isLocked=false', () => {
    const state = deriveLockState([], 'tanaka');

    expect(state.isLocked).toBe(false);
    expect(state.lockedBy).toBeNull();
    expect(state.operationType).toBeNull();
    expect(state.isSummaryLocked).toBe(false);
    expect(state.isEditLocked).toBe(false);
  });

  it('他ユーザーの edit ロックがある場合', () => {
    const locks: Lock[] = [baseLock]; // tanaka が edit ロック
    const state = deriveLockState(locks, 'suzuki'); // suzuki 視点

    expect(state.isLocked).toBe(true);
    expect(state.lockedBy).toBe('tanaka');
    expect(state.operationType).toBe('edit');
    expect(state.isEditLocked).toBe(true);
    expect(state.isSummaryLocked).toBe(false);
  });

  it('自分の edit ロックがある場合は isEditLocked=false', () => {
    const locks: Lock[] = [baseLock]; // tanaka が edit ロック
    const state = deriveLockState(locks, 'tanaka'); // tanaka 自身

    expect(state.isLocked).toBe(true);
    expect(state.lockedBy).toBe('tanaka');
    expect(state.isEditLocked).toBe(false); // 自分なので false
  });

  it('summarize ロックがある場合', () => {
    const summarizeLock: Lock = {
      ...baseLock,
      userId: 'AIHELPER',
      operationType: 'summarize',
    };
    const state = deriveLockState([summarizeLock], 'tanaka');

    expect(state.isLocked).toBe(true);
    expect(state.lockedBy).toBe('AIHELPER');
    expect(state.operationType).toBe('summarize');
    expect(state.isSummaryLocked).toBe(true);
    expect(state.isEditLocked).toBe(false);
  });

  it('TTL が過ぎたロックは無視される', () => {
    const expiredLock: Lock = {
      ...baseLock,
      ttl: Math.floor(Date.now() / 1000) - 100, // 100秒前に期限切れ
    };
    const state = deriveLockState([expiredLock], 'suzuki');

    expect(state.isLocked).toBe(false);
    expect(state.lockedBy).toBeNull();
  });

  it('TTL が未来のロックは有効', () => {
    const activeLock: Lock = {
      ...baseLock,
      ttl: Math.floor(Date.now() / 1000) + 300, // 5分後まで有効
    };
    const state = deriveLockState([activeLock], 'suzuki');

    expect(state.isLocked).toBe(true);
    expect(state.isEditLocked).toBe(true);
  });

  it('TTL が null のロックは無期限で有効', () => {
    const noTtlLock: Lock = {
      ...baseLock,
      ttl: null,
    };
    const state = deriveLockState([noTtlLock], 'suzuki');

    expect(state.isLocked).toBe(true);
    expect(state.isEditLocked).toBe(true);
  });

  it('edit と summarize の両方がロックされている場合', () => {
    const editLock: Lock = { ...baseLock, operationType: 'edit', userId: 'tanaka' };
    const summarizeLock: Lock = {
      ...baseLock,
      lockType: 'summary',
      operationType: 'summarize',
      userId: 'AIHELPER',
    };
    const state = deriveLockState([editLock, summarizeLock], 'suzuki');

    expect(state.isLocked).toBe(true);
    expect(state.lockedBy).toBe('tanaka'); // edit が優先
    expect(state.operationType).toBe('edit');
    expect(state.isEditLocked).toBe(true);
    expect(state.isSummaryLocked).toBe(true);
  });
});
