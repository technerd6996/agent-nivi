export type SeverityLevel = 'P1 - CRITICAL' | 'P2 - HIGH' | 'P3 - MEDIUM' | 'P4 - LOW';

export interface RemediationStep {
  id: string;
  stepNumber: number;
  title: string;
  action: string;
  command?: string;
  expectedOutput?: string;
  warningNote?: string;
}

export interface KBArticle {
  id: string;
  title: string;
  category: 
    | 'Networking & Gateway' 
    | 'Database & Storage' 
    | 'Kubernetes & Containers' 
    | 'Auth & Security' 
    | 'Cloud & Infrastructure' 
    | 'Application Runtime';
  errorCodes: string[];
  keywords: string[];
  severity: SeverityLevel;
  summary: string;
  rootCause: string;
  symptoms: string[];
  steps: RemediationStep[];
  escalationPath: string;
  affectedServices: string[];
  estimatedResolutionMinutes: number;
  authoritativeDocUrl?: string;
}

export interface TriageResult {
  matchedArticle: KBArticle;
  confidenceScore: number;
  matchedKeywords: string[];
  matchedErrorCode?: string;
  severity: SeverityLevel;
  severityReason: string;
  stepProgress: Record<string, boolean>;
  ticketDraft?: {
    ticketId: string;
    title: string;
    priority: string;
    system: string;
    service: string;
    assigneeTeam: string;
    markdownBody: string;
  };
  isEscalated?: boolean;
  isResolved?: boolean;
  isAiGenerated?: boolean;
  modelUsed?: string;
  aiReasoning?: string;
  aiFollowUps?: { question: string; answer: string; timestamp: string }[];
  /** One-sentence justification for confidenceScore (from the AI prompt). */
  confidenceBasis?: string;
  /** Short plain-text reply to the user's latest message (from the AI prompt). */
  agentMessage?: string;
  /** False when no KB article genuinely matched the reported symptoms. */
  kbMatched?: boolean;
  /** Pre-rendered conversational markdown for the agent reply. */
  markdown?: string;
}

/**
 * One chat thread. Persisted and listed in the sidebar; "New Session" adds a
 * conversation rather than clearing the list.
 */
export interface Conversation {
  id: string;
  title: string;
  /** Severity of the incident triaged in this thread, once one exists. */
  severity?: SeverityLevel;
  status: 'Investigating' | 'Remediating' | 'Resolved' | 'Escalated';
  /** Display time of creation. */
  timestamp: string;
  createdAt: number;
  messages: ChatMessage[];
  /** Structured ledger carried across turns of this thread. */
  contextMemory: ContextMemory;
  incidentId?: string;
  articleId?: string;
}

/** Extended session memory carried across turns and fed into the system prompt. */
export interface ContextMemory {
  environment?: string;
  affectedServices: string[];
  errorCodesSeen: string[];
  actionsAlreadyTried: string[];
  confirmedFacts: string[];
  ruledOut: string[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  timestamp: string;
  content: string;
  rawSnippet?: string;
  triageResult?: TriageResult;
  processingTimeMs?: number;
  isAiGenerated?: boolean;
  modelUsed?: string;
  aiReasoning?: string;
  /** True when the agent rejected the input for lacking diagnostic content */
  isRejection?: boolean;
  /** True when the rejection was because the input was a greeting (friendlier styling) */
  isGreetingReply?: boolean;
  /** Data-URL of an image the operator attached. */
  imageDataUrl?: string;
  /** What the vision model read out of the attached image. */
  extractedFromImage?: string;
  /** Pre-rendered markdown for a prose agent reply (follow-up answers). */
  markdown?: string;
  /** True when input was blocked by Llama Guard 4 (12B) */
  isGuardBlocked?: boolean;
  /** Guard model used for inspection */
  guardModel?: string;
}

export interface SessionIncident {
  id: string;
  title: string;
  severity: SeverityLevel;
  timestamp: string;
  status: 'Investigating' | 'Remediating' | 'Resolved' | 'Escalated';
  articleId?: string;
}
