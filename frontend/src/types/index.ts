/**
 * Type definitions for the AICHAT application.
 */

// ------ Domain Types ------

export interface User {
  loginId: string;      // Cognito sub (UUID)
  displayName: string;  // Cognito custom:userName
  email: string;        // Cognito email
}

export interface Message {
  conversationId: string;
  messageId: string;
  userId: string;
  displayName: string;
  content: string;
  timestamp: string;
  isUsedInSummary: boolean;
}

export interface Summary {
  conversationId: string;
  title: string | null;
  current: string | null;
  previous: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface Lock {
  conversationId: string;
  lockType: string;
  userId: string;
  operationType: 'edit' | 'summarize' | 'released';
  startTime: string;
  ttl: number | null;
}

export interface Conversation {
  conversationId: string;
  createdBy: string;
  createdAt: string;
  participants: string[];
  status: string;
  shareLink: string | null;
  title: string | null;
}

export interface Notification {
  conversationId: string;
  type: string;
  message: string;
  userId: string | null;
  timestamp: string;
}

// ------ AI Helper Types ------

export type AIActionType = 'summarize' | 'opinion' | 'answer' | 'next_action';

export interface AIHelperRequest {
  conversationId: string;
  userId: string;
  actionType: AIActionType;
  userInput?: string;
  selectedMessageIds?: string[];
}

// ------ App State Types ------

export interface AppState {
  currentUser: User | null;
  currentConversation: Conversation | null;
  messages: Message[];
  summary: Summary | null;
  locks: Lock[];
  selectedMessageIds: Set<string>;
  isEditing: boolean;
  isLoading: boolean;
}

// ------ Lock State ------

export interface LockState {
  isLocked: boolean;
  lockedBy: string | null;
  operationType: 'edit' | 'summarize' | null;
  isSummaryLocked: boolean;
  isEditLocked: boolean;
}

// ------ AIHelper button definition ------

export interface AIButtonConfig {
  id: AIActionType;
  label: string;
  requiresSelection: boolean;
  requiresInput: boolean;
}

export const AI_BUTTONS: AIButtonConfig[] = [
  {
    id: 'summarize',
    label: '選択したチャットをAI要約',
    requiresSelection: true,
    requiresInput: false,
  },
  {
    id: 'opinion',
    label: '選択したチャットに対するAI意見',
    requiresSelection: true,
    requiresInput: false,
  },
  {
    id: 'answer',
    label: '入力している内容についてのAI回答',
    requiresSelection: false,
    requiresInput: true,
  },
  {
    id: 'next_action',
    label: '要約を元にしたネクストアクション提案',
    requiresSelection: false,
    requiresInput: false,
  },
];

// ------ Constants ------

export const AIHELPER_USER_ID = 'AIHELPER';
export const AIHELPER_DISPLAY_NAME = 'AIHelper';
export const SUMMARY_MAX_LENGTH = 5000;
