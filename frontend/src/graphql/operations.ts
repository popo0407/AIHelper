/**
 * GraphQL query, mutation, and subscription strings for AICHAT.
 */

// ============================
// Queries
// ============================

export const GET_CONVERSATION = /* GraphQL */ `
  query GetConversation($conversationId: ID!) {
    getConversation(conversationId: $conversationId) {
      conversationId
      createdBy
      createdAt
      participants
      status
      shareLink
      title
    }
  }
`;

export const COMPLETE_KNOWLEDGEBASE_UPLOAD = /* GraphQL */ `
  mutation CompleteKnowledgebaseUpload($input: CompleteKnowledgebaseUploadInput!) {
    completeKnowledgebaseUpload(input: $input) {
      success
      error
    }
  }
`;

export const LIST_CONVERSATIONS = /* GraphQL */ `
  query ListConversations($loginId: ID!) {
    listConversations(loginId: $loginId) {
      conversationId
      createdBy
      createdAt
      participants
      status
      shareLink
      title
    }
  }
`;

export const LIST_MESSAGES = /* GraphQL */ `
  query ListMessages($conversationId: ID!, $limit: Int, $nextToken: String) {
    listMessages(conversationId: $conversationId, limit: $limit, nextToken: $nextToken) {
      items {
        conversationId
        messageId
        userId
        displayName
        content
        timestamp
        isUsedInSummary
      }
      nextToken
    }
  }
`;

export const GET_SUMMARY = /* GraphQL */ `
  query GetSummary($conversationId: ID!) {
    getSummary(conversationId: $conversationId) {
      conversationId
      title
      current
      previous
      updatedAt
      updatedBy
      selectedPromptType
      customPromptText
    }
  }
`;

export const GET_LOCKS = /* GraphQL */ `
  query GetLocks($conversationId: ID!) {
    getLocks(conversationId: $conversationId) {
      conversationId
      lockType
      userId
      operationType
      startTime
      ttl
    }
  }
`;

// ============================
// Mutations
// ============================

export const CREATE_CONVERSATION = /* GraphQL */ `
  mutation CreateConversation($input: CreateConversationInput!) {
    createConversation(input: $input) {
      success
      conversation {
        conversationId
        createdBy
        createdAt
        participants
        status
        shareLink
        title
      }
      error
    }
  }
`;

export const JOIN_CONVERSATION = /* GraphQL */ `
  mutation JoinConversation($input: JoinConversationInput!) {
    joinConversation(input: $input) {
      success
      conversation {
        conversationId
        createdBy
        createdAt
        participants
        status
        shareLink
        title
      }
      error
    }
  }
`;

export const LEAVE_CONVERSATION = /* GraphQL */ `
  mutation LeaveConversation($input: LeaveConversationInput!) {
    leaveConversation(input: $input) {
      success
      conversationId
      error
    }
  }
`;

export const UPDATE_LAST_MESSAGE_ID = /* GraphQL */ `
  mutation UpdateLastMessageId($input: UpdateLastMessageIdInput!) {
    updateLastMessageId(input: $input) {
      success
      userConversation {
        loginId
        conversationId
        joinedAt
        role
        lastMessageId
        lastUpdatedAt
      }
      error
    }
  }
`;

export const SEND_MESSAGE = /* GraphQL */ `
  mutation SendMessage($input: SendMessageInput!) {
    sendMessage(input: $input) {
      conversationId
      messageId
      userId
      displayName
      content
      timestamp
      isUsedInSummary
    }
  }
`;

export const UPDATE_SUMMARY = /* GraphQL */ `
  mutation UpdateSummary($input: UpdateSummaryInput!) {
    updateSummary(input: $input) {
      conversationId
      title
      current
      previous
      updatedAt
      updatedBy
      selectedPromptType
      customPromptText
    }
  }
`;

export const UNDO_SUMMARY = /* GraphQL */ `
  mutation UndoSummary($conversationId: ID!) {
    undoSummary(conversationId: $conversationId) {
      conversationId
      title
      current
      previous
      updatedAt
      updatedBy
      selectedPromptType
      customPromptText
    }
  }
`;

export const SAVE_SUMMARY_EDIT = /* GraphQL */ `
  mutation SaveSummaryEdit($input: SaveSummaryEditInput!) {
    saveSummaryEdit(input: $input) {
      conversationId
      title
      current
      previous
      updatedAt
      updatedBy
      selectedPromptType
      customPromptText
    }
  }
`;

export const UPDATE_SUMMARY_PROMPT_TYPE = /* GraphQL */ `
  mutation UpdateSummaryPromptType($input: UpdateSummaryPromptTypeInput!) {
    updateSummaryPromptType(input: $input) {
      conversationId
      title
      current
      previous
      updatedAt
      updatedBy
      selectedPromptType
      customPromptText
    }
  }
`;

export const GET_PROMPT_TEMPLATE = /* GraphQL */ `
  query GetPromptTemplate($promptType: String!) {
    getPromptTemplate(promptType: $promptType) {
      promptType
      promptText
      updatedAt
    }
  }
`;

export const LIST_PROMPT_TEMPLATES = /* GraphQL */ `
  query ListPromptTemplates {
    listPromptTemplates {
      promptType
      promptText
      updatedAt
    }
  }
`;

export const UPDATE_PROMPT_TEMPLATE = /* GraphQL */ `
  mutation UpdatePromptTemplate($input: UpdatePromptTemplateInput!) {
    updatePromptTemplate(input: $input) {
      promptType
      promptText
      updatedAt
    }
  }
`;

export const UPDATE_CONVERSATION_TITLE = /* GraphQL */ `
  mutation UpdateConversationTitle($input: UpdateConversationTitleInput!) {
    updateConversationTitle(input: $input) {
      conversationId
      createdBy
      createdAt
      participants
      status
      shareLink
      title
    }
  }
`;

export const ACQUIRE_LOCK = /* GraphQL */ `
  mutation AcquireLock($input: AcquireLockInput!) {
    acquireLock(input: $input) {
      conversationId
      lockType
      userId
      operationType
      startTime
      ttl
    }
  }
`;

export const RELEASE_LOCK = /* GraphQL */ `
  mutation ReleaseLock($input: ReleaseLockInput!) {
    releaseLock(input: $input) {
      conversationId
      lockType
      userId
      operationType
      startTime
      ttl
    }
  }
`;

export const ASK_AI_HELPER = /* GraphQL */ `
  mutation AskAIHelper($input: AskAIHelperInput!) {
    askAIHelper(input: $input) {
      conversationId
      messageId
      userId
      displayName
      content
      timestamp
      isUsedInSummary
    }
  }
`;

// ============================
// Knowledgebase Operations
// ============================

export const LIST_KNOWLEDGE_SOURCES = /* GraphQL */ `
  query ListKnowledgeSources($conversationId: ID!) {
    listKnowledgeSources(conversationId: $conversationId) {
      conversationId
      fileName
      originalFileName
      fileSize
      s3Key
      contentType
      uploadedBy
      uploadedAt
      status
      errorMessage
    }
  }
`;

export const UPLOAD_KNOWLEDGEBASE = /* GraphQL */ `
  mutation UploadKnowledgebase($input: UploadKnowledgebaseInput!) {
    uploadKnowledgebase(input: $input) {
      success
      knowledgeSource {
        conversationId
        fileName
        originalFileName
        fileSize
        s3Key
        contentType
        uploadedBy
        uploadedAt
        status
        errorMessage
      }
      presignedUrl
      error
    }
  }
`;

export const DELETE_KNOWLEDGEBASE = /* GraphQL */ `
  mutation DeleteKnowledgebase($input: DeleteKnowledgebaseInput!) {
    deleteKnowledgebase(input: $input) {
      success
      fileName
      error
    }
  }
`;

export const SEARCH_KNOWLEDGEBASE = /* GraphQL */ `
  mutation SearchKnowledgebase($input: SearchKnowledgebaseInput!) {
    searchKnowledgebase(input: $input) {
      conversationId
      query
      answer
      sources
      sourceDisplayNames
      userMessageId
      aiMessageId
    }
  }
`;

// ============================
// Subscriptions
// ============================

export const ON_NEW_MESSAGE = /* GraphQL */ `
  subscription OnNewMessage($conversationId: ID!) {
    onNewMessage(conversationId: $conversationId) {
      conversationId
      messageId
      userId
      displayName
      content
      timestamp
      isUsedInSummary
    }
  }
`;

export const ON_SUMMARY_UPDATE = /* GraphQL */ `
  subscription OnSummaryUpdate($conversationId: ID!) {
    onSummaryUpdate(conversationId: $conversationId) {
      conversationId
      title
      current
      previous
      updatedAt
      updatedBy
      selectedPromptType
      customPromptText
    }
  }
`;

export const ON_LOCK_CHANGE = /* GraphQL */ `
  subscription OnLockChange($conversationId: ID!) {
    onLockChange(conversationId: $conversationId) {
      conversationId
      lockType
      userId
      operationType
      startTime
      ttl
    }
  }
`;
