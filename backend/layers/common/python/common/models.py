"""Data models for AICHAT."""
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class User:
    """User data model."""

    loginId: str
    displayName: str
    createdAt: str
    conversationIds: list[str] = field(default_factory=list)


@dataclass
class Message:
    """Chat message data model."""

    conversationId: str
    messageId: str
    userId: str
    displayName: str
    content: str
    timestamp: str
    isUsedInSummary: bool = False


@dataclass
class SummaryData:
    """Summary data model."""

    conversationId: str
    title: Optional[str] = None
    current: Optional[str] = None
    previous: Optional[str] = None
    updatedAt: Optional[str] = None
    updatedBy: Optional[str] = None


@dataclass
class LockData:
    """Lock data model."""

    conversationId: str
    lockType: str
    userId: str
    operationType: str
    startTime: str
    ttl: Optional[int] = None


@dataclass
class Conversation:
    """Conversation data model."""

    conversationId: str
    createdBy: str
    createdAt: str
    participants: list[str] = field(default_factory=list)
    status: str = "active"
    shareLink: Optional[str] = None
    title: Optional[str] = None
