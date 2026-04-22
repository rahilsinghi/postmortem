from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


class CitationSourceType(StrEnum):
    PR_BODY = "pr_body"
    PR_COMMENT = "pr_comment"
    REVIEW_COMMENT = "review_comment"
    INLINE_REVIEW_COMMENT = "inline_review_comment"
    LINKED_ISSUE_BODY = "linked_issue_body"
    LINKED_ISSUE_COMMENT = "linked_issue_comment"
    COMMIT_MESSAGE = "commit_message"


class DecisionCategory(StrEnum):
    AUTH = "auth"
    DATA = "data"
    ROUTING = "routing"
    BUILD = "build"
    INFRA = "infra"
    STATE_MANAGEMENT = "state_management"
    API_CONTRACT = "api_contract"
    PERFORMANCE = "performance"
    SECURITY = "security"
    TESTING = "testing"
    TOOLING = "tooling"
    UI_ARCHITECTURE = "ui_architecture"
    OTHER = "other"


class DecisionStatus(StrEnum):
    ACTIVE = "active"
    SUPERSEDED = "superseded"
    REVERTED = "reverted"


class Citation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    claim: str
    citation_quote: str
    citation_source_type: CitationSourceType
    citation_source_id: str
    citation_author: str | None = None
    citation_timestamp: datetime | None = None
    citation_url: str


class Alternative(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    rejection_reason: str
    rejection_reason_quoted: str | None = None
    citation_source_type: CitationSourceType
    citation_source_id: str
    citation_author: str | None = None
    citation_url: str
    confidence: float = Field(ge=0.0, le=1.0)


class ClassificationSnippet(BaseModel):
    model_config = ConfigDict(extra="ignore")

    quote: str
    source: str | None = None
    comment_id: int | str | None = None


class ClassificationAlternative(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    mentioned_where: str | None = None


class ClassificationResult(BaseModel):
    """Mirrors the schema in `.claude/agents/decision-classifier.md` §Output format.

    `extra="ignore"` so the classifier can emit fields we don't consume
    without breaking ingestion.
    """

    model_config = ConfigDict(extra="ignore")

    is_decision: bool
    confidence: float = Field(ge=0.0, le=1.0)
    decision_type: str | None = None
    one_line_title: str | None = None
    key_rationale_snippets: list[ClassificationSnippet] = Field(default_factory=list)
    alternatives_hinted: list[ClassificationAlternative] = Field(default_factory=list)
    rejection_reason: str | None = None


class RationaleExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    category: DecisionCategory
    context: list[Citation] = Field(default_factory=list)
    decision: list[Citation] = Field(default_factory=list)
    forces: list[Citation] = Field(default_factory=list)
    consequences: list[Citation] = Field(default_factory=list)
    deciders: list[str] = Field(default_factory=list)
    decided_at: datetime | None = None
    alternatives: list[Alternative] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)


class DecisionEdgeKind(StrEnum):
    SUPERSEDES = "supersedes"
    DEPENDS_ON = "depends_on"
    RELATED_TO = "related_to"


class DecisionEdge(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_id: UUID
    to_id: UUID
    kind: DecisionEdgeKind
    reason: str | None = None


class DecisionRecord(BaseModel):
    """The fully-assembled row that ends up in the ledger."""

    model_config = ConfigDict(extra="forbid")

    id: UUID = Field(default_factory=uuid4)
    repo: str
    pr_number: int
    title: str
    summary: str
    category: DecisionCategory
    decided_at: datetime | None = None
    decided_by: list[str] = Field(default_factory=list)
    status: DecisionStatus = DecisionStatus.ACTIVE
    superseded_by: UUID | None = None
    commit_shas: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    extracted_at: datetime = Field(default_factory=datetime.utcnow)

    context_citations: list[Citation] = Field(default_factory=list)
    decision_citations: list[Citation] = Field(default_factory=list)
    forces: list[Citation] = Field(default_factory=list)
    consequences: list[Citation] = Field(default_factory=list)
    alternatives: list[Alternative] = Field(default_factory=list)

    pr_url: str
