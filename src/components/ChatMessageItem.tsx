'use client';

import React, { useState } from 'react';
import { 
  Check, 
  Copy, 
  Terminal, 
  AlertTriangle, 
  FileText, 
  ExternalLink, 
  ShieldAlert, 
  CheckCircle, 
  Bell, 
  Clock, 
  Tag, 
  HelpCircle,
  Share2,
  Sparkles,
  Brain,
  Cpu,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Send,
  Loader2
} from 'lucide-react';
import { ChatMessage, RemediationStep, SeverityLevel } from '../types';
import { Markdown } from './Markdown';
import { triageToMarkdown } from '../lib/triageMarkdown';

interface ChatMessageItemProps {
  message: ChatMessage;
  onToggleStep: (messageId: string, stepId: string) => void;
  onOpenTicketModal: (draft: any) => void;
  onOpenKBModal: (articleId: string) => void;
  onEscalate: (messageId: string) => void;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  message,
  onToggleStep,
  onOpenTicketModal,
  onOpenKBModal,
  onEscalate
}) => {
  const [copiedCommandId, setCopiedCommandId] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [isReasoningOpen, setIsReasoningOpen] = useState(false);
  const [copilotQuestion, setCopilotQuestion] = useState('');
  const [copilotHistory, setCopilotHistory] = useState<{ role: 'user' | 'assistant'; content: string; reasoning?: string }[]>([]);
  const [isCopilotLoading, setIsCopilotLoading] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);

  const handleAskCopilot = async (overrideQuestion?: string) => {
    const q = (overrideQuestion || copilotQuestion).trim();
    if (!q || isCopilotLoading || !message.triageResult) return;

    setCopilotHistory(prev => [...prev, { role: 'user', content: q }]);
    setCopilotQuestion('');
    setIsCopilotLoading(true);
    setIsCopilotOpen(true);

    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          incidentContext: {
            title: message.triageResult.matchedArticle.title,
            severity: message.triageResult.severity,
            category: message.triageResult.matchedArticle.category,
            rootCause: message.triageResult.matchedArticle.rootCause,
            steps: message.triageResult.matchedArticle.steps
          },
          chatHistory: copilotHistory
        })
      });

      const data = await res.json();
      if (data.answer) {
        setCopilotHistory(prev => [...prev, { role: 'assistant', content: data.answer, reasoning: data.reasoning }]);
      } else {
        setCopilotHistory(prev => [...prev, { role: 'assistant', content: 'Unable to get response from NVIDIA Nemotron-3 Ultra.' }]);
      }
    } catch (err: any) {
      setCopilotHistory(prev => [...prev, { role: 'assistant', content: `Error contacting SRE Copilot: ${err.message}` }]);
    } finally {
      setIsCopilotLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCommandId(id);
    setTimeout(() => setCopiedCommandId(null), 2000);
  };

  const copyFullSummary = () => {
    if (!message.triageResult) return;
    const { matchedArticle, severity, severityReason } = message.triageResult;
    const summary = `[IT Triage Report]
Incident: ${matchedArticle.title} (${matchedArticle.id})
Severity: ${severity}
Reason: ${severityReason}
Root Cause: ${matchedArticle.rootCause}
Remediation Steps:
${matchedArticle.steps.map(s => `${s.stepNumber}. ${s.title}\n   Command: ${s.command || 'N/A'}`).join('\n')}
Escalation: ${matchedArticle.escalationPath}
`;
    navigator.clipboard.writeText(summary);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  // If user message
  if (message.sender === 'user') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        marginBottom: '20px',
        animation: 'fadeInSlideUp 0.3s ease',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '6px',
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
        }}>
          <span style={{ fontWeight: 600, color: 'var(--brand-cyan)' }}>IT Operator</span>
          <span>•</span>
          <span>{message.timestamp}</span>
        </div>

        <div style={{
          maxWidth: '85%',
          background: '#f1f3f4',
          border: '1px solid #dadce0',
          borderRadius: '16px 16px 4px 16px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(60, 64, 67, 0.08)',
        }}>
          {message.content && (
            <div style={{
              padding: '12px 16px',
              fontSize: '0.9rem',
              color: '#202124',
              lineHeight: 1.5,
            }}>
              {message.content}
            </div>
          )}

          {message.imageDataUrl && (
            <div style={{
              borderTop: message.content ? '1px solid #dadce0' : 'none',
              padding: '10px 12px',
              background: '#ffffff',
            }}>
              <img
                src={message.imageDataUrl}
                alt="Attached screenshot"
                style={{
                  maxWidth: '100%',
                  maxHeight: '260px',
                  borderRadius: '8px',
                  border: '1px solid #dadce0',
                  display: 'block',
                }}
              />
            </div>
          )}

          {message.rawSnippet && (
            <div style={{
              background: '#ffffff',
              borderTop: (message.content || message.imageDataUrl) ? '1px solid #dadce0' : 'none',
              padding: '12px 14px',
              position: 'relative',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
                borderBottom: '1px solid #f1f3f4',
                paddingBottom: '6px',
              }}>
                <span style={{
                  fontSize: '0.7rem',
                  fontFamily: 'var(--font-mono)',
                  color: '#5f6368',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  <Terminal size={12} color="#1a73e8" />
                  RAW_ERROR_PAYLOAD
                </span>
                <button
                  onClick={() => copyToClipboard(message.rawSnippet || '', 'user-raw')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.7rem',
                    color: '#5f6368',
                    background: '#f8f9fa',
                    border: '1px solid #dadce0',
                    padding: '3px 8px',
                    borderRadius: '4px',
                  }}
                  title="Copy raw error payload"
                >
                  {copiedCommandId === 'user-raw' ? <Check size={12} color="#1e8e3e" /> : <Copy size={12} />}
                  <span>{copiedCommandId === 'user-raw' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <pre style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.78rem',
                color: '#202124',
                lineHeight: 1.5,
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '220px',
              }}>
                {message.rawSnippet}
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Bot Triage Response
  const triage = message.triageResult;
  if (!triage) {
    // --- Follow-up answer: prose reply with no new incident attached ---
    if (message.markdown) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          marginBottom: '26px',
          animation: 'fadeInSlideUp 0.3s ease',
          width: '100%',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '8px',
            fontSize: '0.75rem',
            color: '#5f6368',
          }}>
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #76b900 0%, #22c55e 55%, #10b981 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="5 6 12 12 5 18" />
                <line x1="14" y1="18" x2="20" y2="18" />
              </svg>
            </div>
            <span style={{ fontWeight: 600, color: '#202124' }}>Agent Nivi</span>
            {message.processingTimeMs && (
              <>
                <span>•</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>
                  {(message.processingTimeMs / 1000).toFixed(1)}s
                </span>
              </>
            )}
            <span>•</span>
            <span>{message.timestamp}</span>
          </div>

          <div style={{
            maxWidth: '820px',
            width: '100%',
            background: '#ffffff',
            border: '1px solid #e3e6ea',
            borderRadius: '4px 14px 14px 14px',
            padding: '16px 20px',
            boxShadow: '0 1px 3px rgba(60,64,67,0.08)',
          }}>
            <Markdown text={message.markdown} />

            {message.aiReasoning && (
              <div style={{ marginTop: '14px', borderTop: '1px solid #f1f3f4', paddingTop: '10px' }}>
                <button
                  onClick={() => setIsReasoningOpen(prev => !prev)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    color: '#5f6368',
                    fontSize: '0.76rem',
                    cursor: 'pointer',
                  }}
                >
                  <Brain size={13} color="#76b900" />
                  <span>{isReasoningOpen ? 'Hide reasoning' : 'Show reasoning'}</span>
                  {isReasoningOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                {isReasoningOpen && (
                  <div style={{
                    marginTop: '8px',
                    background: '#f8f9fa',
                    border: '1px solid #e8eaed',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: '0.78rem',
                    lineHeight: 1.6,
                    color: '#5f6368',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '280px',
                    overflowY: 'auto',
                  }}>
                    {message.aiReasoning}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => copyToClipboard(message.markdown || '', 'reply')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: 'transparent',
                  border: 'none',
                  color: '#80868b',
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                  padding: '2px 4px',
                }}
                title="Copy reply"
              >
                {copiedCommandId === 'reply'
                  ? <><Check size={12} color="#1e8e3e" /><span style={{ color: '#1e8e3e' }}>Copied</span></>
                  : <><Copy size={12} /><span>Copy</span></>}
              </button>
            </div>
          </div>
        </div>
      );
    }

    // --- Rejection / Greeting / Prompt Guard intercept bubble ---
    if (message.isRejection) {
      const isGreet = message.isGreetingReply === true;
      const isGuard = message.isGuardBlocked === true;
      const accentCol = isGuard ? '#c5221f' : isGreet ? '#1a73e8' : '#b06000';
      const accentBg  = isGuard ? '#fce8e6' : isGreet ? '#f8fafd' : '#fef7e0';
      const borderCol = isGuard ? '#fad2cf' : isGreet ? '#c2e7ff' : '#fce8b2';
      const lines = message.content.split('\n').filter(l => l.trim() !== '');

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          marginBottom: '20px',
          animation: 'fadeInSlideUp 0.3s ease',
          width: '100%',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '8px',
            fontSize: '0.75rem',
            color: '#5f6368',
          }}>
            <div style={{
              width: '18px',
              height: '18px',
              borderRadius: '5px',
              background: 'linear-gradient(135deg, #76b900 0%, #22c55e 55%, #10b981 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 4px rgba(34, 197, 94, 0.3)'
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="5 6 12 12 5 18" />
                <line x1="14" y1="18" x2="20" y2="18" />
              </svg>
            </div>
            <span style={{ fontWeight: 600, color: '#202124' }}>
              {isGuard ? 'Agent Nivi • Prompt Guard' : 'Agent Nivi'}
            </span>
            {isGuard && (
              <span style={{
                fontSize: '0.68rem',
                padding: '1px 6px',
                borderRadius: '4px',
                background: '#fce8e6',
                color: '#c5221f',
                border: '1px solid #fad2cf',
                fontWeight: 600,
              }}>
                Llama Guard 4 (12B)
              </span>
            )}
            <span>•</span>
            <span>{message.timestamp}</span>
          </div>

          {/* Card */}
          <div style={{
            maxWidth: '720px',
            width: '100%',
            background: accentBg,
            border: `1px solid ${borderCol}`,
            borderLeft: `4px solid ${accentCol}`,
            borderRadius: '4px 12px 12px 4px',
            padding: '16px 20px',
            boxShadow: '0 1px 4px rgba(60,64,67,0.1)',
          }}>
            {lines.map((line, i) => {
              // Title — starts with emoji (⛔ or 👋 or 🛡️)
              if (/^[⛔👋🛡]/.test(line)) {
                const emoji = line.charAt(0);
                const text  = line.slice(1).replace(/\*\*/g, '').trim();
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '1.2rem' }}>{emoji}</span>
                    <span style={{ fontSize: '0.94rem', fontWeight: 700, color: accentCol, letterSpacing: '-0.01em' }}>
                      {text}
                    </span>
                  </div>
                );
              }
              // Bullet items: • **Label** — desc
              if (line.startsWith('•') || line.startsWith('-')) {
                const m = line.match(/^[•\-]\s+\*\*(.+?)\*\*\s*[—-]\s*(.+)$/);
                if (m) {
                  return (
                    <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px', fontSize: '0.82rem' }}>
                      <span style={{ color: accentCol, flexShrink: 0 }}>›</span>
                      <span style={{ color: '#202124' }}>
                        <strong style={{ color: accentCol }}>{m[1]}</strong>
                        <span style={{ color: '#5f6368' }}> — </span>
                        {m[2]}
                      </span>
                    </div>
                  );
                }
              }
              // Italic example hint
              if (line.startsWith('_')) {
                return (
                  <p key={i} style={{ marginTop: '12px', fontSize: '0.78rem', color: '#5f6368', fontStyle: 'italic' }}>
                    {line.replace(/_/g, '')}
                  </p>
                );
              }
              // Body paragraph lines
              if (line.trim().length > 0) {
                const parts = line.split(/(\*\*.*?\*\*)/g);
                return (
                  <p key={i} style={{ fontSize: '0.84rem', color: '#3c4043', lineHeight: 1.6, marginBottom: '10px' }}>
                    {parts.map((part, pIdx) => {
                      if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={pIdx} style={{ color: '#202124', fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
                      }
                      return part;
                    })}
                  </p>
                );
              }
              return null;
            })}
          </div>
        </div>
      );
    }

    // Generic agent message with no triage data
    return (
      <div style={{
        padding: '14px 18px',
        borderRadius: '10px',
        background: 'rgba(18, 24, 38, 0.7)',
        border: '1px solid var(--border-subtle)',
        marginBottom: '20px',
        color: 'var(--text-primary)',
        fontSize: '0.88rem'
      }}>
        {message.content}
      </div>
    );
  }

  // --- Agent reply: conversational markdown, not a runbook dashboard ---
  const replyMarkdown = triage.markdown || triageToMarkdown(triage);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      marginBottom: '26px',
      animation: 'fadeInSlideUp 0.3s ease',
      width: '100%',
    }}>
      {/* Agent header: name, model, latency, time */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '8px',
        fontSize: '0.75rem',
        color: '#5f6368',
        flexWrap: 'wrap',
      }}>
        <div style={{
          width: '20px',
          height: '20px',
          borderRadius: '6px',
          background: 'linear-gradient(135deg, #76b900 0%, #22c55e 55%, #10b981 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="5 6 12 12 5 18" />
            <line x1="14" y1="18" x2="20" y2="18" />
          </svg>
        </div>
        <span style={{ fontWeight: 600, color: '#202124' }}>Agent Nivi</span>
        {message.processingTimeMs && (
          <>
            <span>•</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              {(message.processingTimeMs / 1000).toFixed(1)}s
            </span>
          </>
        )}
        <span>•</span>
        <span>{message.timestamp}</span>
      </div>

      {/* Reply bubble */}
      <div style={{
        maxWidth: '820px',
        width: '100%',
        background: '#ffffff',
        border: '1px solid #e3e6ea',
        borderRadius: '4px 14px 14px 14px',
        padding: '16px 20px',
        boxShadow: '0 1px 3px rgba(60,64,67,0.08)',
      }}>
        <Markdown text={replyMarkdown} />

        {/* Chain-of-thought, collapsed by default — standard LLM affordance */}
        {triage.aiReasoning && (
          <div style={{ marginTop: '14px', borderTop: '1px solid #f1f3f4', paddingTop: '10px' }}>
            <button
              onClick={() => setIsReasoningOpen(prev => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'transparent',
                border: 'none',
                padding: 0,
                color: '#5f6368',
                fontSize: '0.76rem',
                cursor: 'pointer',
              }}
            >
              <Brain size={13} color="#76b900" />
              <span>{isReasoningOpen ? 'Hide reasoning' : 'Show reasoning'}</span>
              {isReasoningOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            {isReasoningOpen && (
              <div style={{
                marginTop: '8px',
                background: '#f8f9fa',
                border: '1px solid #e8eaed',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '0.78rem',
                lineHeight: 1.6,
                color: '#5f6368',
                whiteSpace: 'pre-wrap',
                maxHeight: '280px',
                overflowY: 'auto',
              }}>
                {triage.aiReasoning}
              </div>
            )}
          </div>
        )}

        {/* Copy the whole reply — the one action every chat UI has */}
        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => copyToClipboard(replyMarkdown, 'reply')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              background: 'transparent',
              border: 'none',
              color: '#80868b',
              fontSize: '0.74rem',
              cursor: 'pointer',
              padding: '2px 4px',
            }}
            title="Copy reply"
          >
            {copiedCommandId === 'reply'
              ? <><Check size={12} color="#1e8e3e" /><span style={{ color: '#1e8e3e' }}>Copied</span></>
              : <><Copy size={12} /><span>Copy</span></>}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Previous structured-runbook rendering (severity banner, SOP metadata grid,
 * interactive step checklist, ticket/escalation toolbar). Retained but no
 * longer mounted — the agent now replies in conversational prose.
 */
const LegacyTriageCard: React.FC<ChatMessageItemProps & { triage: NonNullable<ChatMessage['triageResult']> }> = ({
  message,
  triage,
  onToggleStep,
  onOpenTicketModal,
  onOpenKBModal,
  onEscalate,
}) => {
  const [copiedCommandId, setCopiedCommandId] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [isReasoningOpen, setIsReasoningOpen] = useState(false);
  const [copilotQuestion, setCopilotQuestion] = useState('');
  const [copilotHistory, setCopilotHistory] = useState<{ role: 'user' | 'assistant'; content: string; reasoning?: string }[]>([]);
  const [isCopilotLoading, setIsCopilotLoading] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCommandId(id);
    setTimeout(() => setCopiedCommandId(null), 2000);
  };

  const handleAskCopilot = async (overrideQuestion?: string) => {
    const q = (overrideQuestion || copilotQuestion).trim();
    if (!q || isCopilotLoading) return;
    setCopilotHistory(prev => [...prev, { role: 'user', content: q }]);
    setCopilotQuestion('');
    setIsCopilotLoading(true);
    setIsCopilotOpen(true);
    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          incidentContext: {
            title: triage.matchedArticle.title,
            severity: triage.severity,
            category: triage.matchedArticle.category,
            rootCause: triage.matchedArticle.rootCause,
            steps: triage.matchedArticle.steps
          },
          chatHistory: copilotHistory
        })
      });
      const data = await res.json();
      setCopilotHistory(prev => [...prev, {
        role: 'assistant',
        content: data.answer || data.reply || 'Unable to get a response.',
        reasoning: data.reasoning
      }]);
    } catch (err: any) {
      setCopilotHistory(prev => [...prev, { role: 'assistant', content: `Error contacting SRE Copilot: ${err.message}` }]);
    } finally {
      setIsCopilotLoading(false);
    }
  };

  const copyFullSummary = () => {
    const { matchedArticle, severity, severityReason } = triage;
    const summary = `[IT Triage Report]
Incident: ${matchedArticle.title} (${matchedArticle.id})
Severity: ${severity}
Reason: ${severityReason}
Root Cause: ${matchedArticle.rootCause}
Remediation Steps:
${matchedArticle.steps.map(s => `${s.stepNumber}. ${s.title}\n   Command: ${s.command || 'N/A'}`).join('\n')}
Escalation: ${matchedArticle.escalationPath}
`;
    navigator.clipboard.writeText(summary);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const { matchedArticle, confidenceScore, matchedErrorCode, severity, severityReason, stepProgress } = triage;
  const isP1 = severity.startsWith('P1');
  const isP2 = severity.startsWith('P2');
  const isP3 = severity.startsWith('P3');

  const badgeClass = isP1 ? 'badge-p1 animate-pulse-glow' : isP2 ? 'badge-p2' : isP3 ? 'badge-p3' : 'badge-p4';
  const accentColor = isP1 ? 'var(--p1-color)' : isP2 ? 'var(--p2-color)' : isP3 ? 'var(--p3-color)' : 'var(--p4-color)';

  const completedStepsCount = Object.values(stepProgress || {}).filter(Boolean).length;
  const totalStepsCount = matchedArticle.steps.length;
  const allStepsCompleted = totalStepsCount > 0 && completedStepsCount === totalStepsCount;
  const progressPercent = Math.round((completedStepsCount / totalStepsCount) * 100);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      marginBottom: '28px',
      animation: 'fadeInSlideUp 0.35s ease',
      width: '100%',
    }}>
      {/* Bot Persona Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '8px',
        fontSize: '0.75rem',
        color: '#5f6368',
      }}>
        <div style={{
          width: '22px',
          height: '22px',
          borderRadius: '6px',
          background: 'linear-gradient(135deg, #76b900 0%, #22c55e 55%, #10b981 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(34, 197, 94, 0.3)'
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="5 6 12 12 5 18" />
            <line x1="14" y1="18" x2="20" y2="18" />
          </svg>
        </div>
        <span style={{ fontWeight: 600, color: '#202124' }}>
          Agent Nivi
        </span>
        <span>•</span>
        <span style={{ color: '#1a73e8', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
          {message.processingTimeMs ? `${message.processingTimeMs}ms triage` : '< 20ms triage'}
        </span>
        <span>•</span>
        <span>{message.timestamp}</span>
      </div>

      {/* Main Triage Card - Google Material White Card */}
      <div style={{
        width: '100%',
        maxWidth: '920px',
        background: '#ffffff',
        border: `1px solid ${isP1 ? '#fad2cf' : isP2 ? '#fedfc8' : '#dadce0'}`,
        borderRadius: '14px',
        boxShadow: '0 1px 6px rgba(60, 64, 67, 0.12), 0 1px 2px rgba(60, 64, 67, 0.08)',
        overflow: 'hidden',
      }}>
        {/* Banner Section: Severity + Confidence + KB Code */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid #dadce0',
          background: isP1 
            ? '#fce8e6'
            : isP2
            ? '#feefe3'
            : '#f8fafd',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '0.85rem',
              letterSpacing: '0.04em',
            }} className={badgeClass}>
              <ShieldAlert size={16} />
              {severity}
            </span>

            {triage.isAiGenerated && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '6px',
                background: '#e6f4ea',
                border: '1px solid #ceead6',
                color: '#137333',
                fontSize: '0.74rem',
                fontWeight: 600,
              }}>
                <Cpu size={13} color="#1e8e3e" />
                NVIDIA 550B Neural Triage
              </span>
            )}

            {matchedErrorCode && (
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.78rem',
                padding: '4px 10px',
                borderRadius: '6px',
                background: '#ffffff',
                color: '#202124',
                border: '1px solid #dadce0',
              }}>
                Matched Code: <strong>{matchedErrorCode}</strong>
              </span>
            )}

            <button
              onClick={() => onOpenKBModal(matchedArticle.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.78rem',
                color: '#1a73e8',
                background: '#ffffff',
                border: '1px solid #dadce0',
                padding: '4px 10px',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              <span>{matchedArticle.id}</span>
              <ExternalLink size={12} />
            </button>
          </div>

          {/* Confidence Meter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: '#5f6368' }}>Match Confidence</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e8e3e', fontFamily: 'var(--font-mono)' }}>
                {confidenceScore}%
              </div>
            </div>
            <div style={{
              width: '50px',
              height: '6px',
              background: '#e8eaed',
              borderRadius: '999px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${confidenceScore}%`,
                height: '100%',
                background: '#1e8e3e',
                borderRadius: '999px'
              }} />
            </div>
          </div>
        </div>

        {/* Title & Classification Summary */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #dadce0' }}>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#202124',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            {matchedArticle.title}
          </h2>

          <div style={{
            background: '#f8f9fa',
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid #dadce0',
            borderLeft: `3px solid ${accentColor}`,
            marginBottom: '14px',
            fontSize: '0.85rem',
            lineHeight: 1.5,
            color: '#3c4043'
          }}>
            <strong style={{ color: '#202124' }}>Classification Rationale: </strong>
            {severityReason}
          </div>

          {/* Metadata Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            fontSize: '0.8rem',
          }}>
            <div style={{
              padding: '8px 12px',
              borderRadius: '6px',
              background: '#f8f9fa',
              border: '1px solid #dadce0'
            }}>
              <span style={{ color: '#5f6368', display: 'block', fontSize: '0.7rem' }}>SOP Category</span>
              <span style={{ fontWeight: 600, color: '#202124' }}>{matchedArticle.category}</span>
            </div>

            <div style={{
              padding: '8px 12px',
              borderRadius: '6px',
              background: '#f8f9fa',
              border: '1px solid #dadce0'
            }}>
              <span style={{ color: '#5f6368', display: 'block', fontSize: '0.7rem' }}>Estimated MTTR</span>
              <span style={{ fontWeight: 600, color: '#202124', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={13} color="#1a73e8" />
                ~{matchedArticle.estimatedResolutionMinutes} minutes
              </span>
            </div>

            <div style={{
              padding: '8px 12px',
              borderRadius: '6px',
              background: '#f8f9fa',
              border: '1px solid #dadce0'
            }}>
              <span style={{ color: '#5f6368', display: 'block', fontSize: '0.7rem' }}>Escalation Path</span>
              <span style={{ fontWeight: 600, color: '#202124', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {matchedArticle.escalationPath}
              </span>
            </div>
          </div>
        </div>

        {/* Root Cause Hypothesis Card */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #dadce0',
          background: '#f8f9fa',
        }}>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#1a73e8',
            marginBottom: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <HelpCircle size={14} />
            Root Cause Hypothesis (from Knowledge Base)
          </div>
          <p style={{ fontSize: '0.88rem', color: '#202124', lineHeight: 1.5 }}>
            {matchedArticle.rootCause}
          </p>
        </div>

        {/* AI Diagnostic Reasoning (Chain-of-Thought) */}
        {triage.aiReasoning && (
          <div style={{
            borderBottom: '1px solid var(--border-subtle)',
            background: 'rgba(10, 15, 26, 0.75)',
          }}>
            <button
              onClick={() => setIsReasoningOpen(prev => !prev)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 20px',
                background: 'transparent',
                border: 'none',
                color: '#a3e635',
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontWeight: 600,
                transition: 'background 0.2s ease',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(118, 185, 0, 0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Brain size={15} color="#76b900" />
                <span>NVIDIA Nemotron AI Diagnostic Reasoning (Chain-of-Thought)</span>
                <span style={{
                  fontSize: '0.68rem',
                  padding: '1px 7px',
                  borderRadius: '999px',
                  background: 'rgba(118, 185, 0, 0.15)',
                  color: '#d9f99d',
                  border: '1px solid rgba(118, 185, 0, 0.3)',
                  fontWeight: 600
                }}>
                  Deep SRE Analysis
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                <span style={{ fontSize: '0.72rem' }}>{isReasoningOpen ? 'Hide Reasoning' : 'View Chain-of-Thought'}</span>
                {isReasoningOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </div>
            </button>

            {isReasoningOpen && (
              <div style={{
                padding: '0 20px 16px',
                animation: 'fadeInSlideUp 0.2s ease',
              }}>
                <div style={{
                  background: '#04070d',
                  border: '1px solid rgba(118, 185, 0, 0.25)',
                  borderRadius: '8px',
                  padding: '14px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78rem',
                  color: '#cbd5e1',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  maxHeight: '280px',
                  overflowY: 'auto'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: '#76b900',
                    fontSize: '0.7rem',
                    marginBottom: '8px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    paddingBottom: '6px'
                  }}>
                    <Terminal size={12} />
                    <span>MODEL: nvidia/nemotron-3-ultra-550b-a55b // SYSTEM REASONING TRACE</span>
                  </div>
                  {triage.aiReasoning}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step-by-Step Interactive Remediation Checklist */}
        <div style={{ padding: '20px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            <div>
              <h3 style={{
                fontSize: '0.95rem',
                fontWeight: 700,
                color: '#202124',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <CheckCircle size={18} color="#1a73e8" />
                Step-by-Step Triaging & Remediation Procedure
              </h3>
              <p style={{ fontSize: '0.75rem', color: '#5f6368', marginTop: '2px' }}>
                Check off each step as you execute to track incident resolution progress:
              </p>
            </div>

            {/* Checklist Progress Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: allStepsCompleted ? '#1e8e3e' : '#5f6368',
                fontFamily: 'var(--font-mono)'
              }}>
                {completedStepsCount}/{totalStepsCount} Done ({progressPercent}%)
              </span>
              <div style={{
                width: '70px',
                height: '8px',
                background: '#e8eaed',
                borderRadius: '999px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  background: allStepsCompleted ? '#1e8e3e' : '#1a73e8',
                  transition: 'width 0.3s ease',
                  borderRadius: '999px'
                }} />
              </div>
            </div>
          </div>

          {/* All steps resolved banner */}
          {allStepsCompleted && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              borderRadius: '8px',
              background: '#e6f4ea',
              border: '1px solid #ceead6',
              color: '#137333',
              marginBottom: '16px',
              fontSize: '0.85rem',
              fontWeight: 600,
              animation: 'fadeInSlideUp 0.3s ease'
            }}>
              <CheckCircle size={18} />
              <span>All remediation steps verified! You can mark this incident as resolved or archive.</span>
            </div>
          )}

          {/* List of Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {matchedArticle.steps.map((step) => {
              const isChecked = !!stepProgress?.[step.id];

              return (
                <div
                  key={step.id}
                  style={{
                    borderRadius: '10px',
                    background: isChecked ? '#e6f4ea' : '#f8f9fa',
                    border: isChecked ? '1px solid #ceead6' : '1px solid #dadce0',
                    padding: '14px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {/* Step Title Row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <input
                      type="checkbox"
                      id={`step-${message.id}-${step.id}`}
                      checked={isChecked}
                      onChange={() => onToggleStep(message.id, step.id)}
                      style={{
                        marginTop: '3px',
                        cursor: 'pointer',
                        accentColor: '#1e8e3e',
                        width: '16px',
                        height: '16px',
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <label
                        htmlFor={`step-${message.id}-${step.id}`}
                        style={{
                          fontSize: '0.88rem',
                          fontWeight: 600,
                          color: isChecked ? '#80868b' : '#202124',
                          textDecoration: isChecked ? 'line-through' : 'none',
                          cursor: 'pointer',
                          display: 'block',
                          marginBottom: '4px'
                        }}
                      >
                        Step {step.stepNumber}: {step.title}
                      </label>
                      <p style={{
                        fontSize: '0.82rem',
                        color: isChecked ? '#80868b' : '#3c4043',
                        lineHeight: 1.4,
                        marginBottom: step.command ? '8px' : '0'
                      }}>
                        {step.action}
                      </p>

                      {/* Command Block if present */}
                      {step.command && (
                        <div style={{
                          background: '#1e293b',
                          borderRadius: '8px',
                          border: '1px solid #334155',
                          marginTop: '8px',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 12px',
                            background: '#0f172a',
                            borderBottom: '1px solid #334155',
                          }}>
                            <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: '#94a3b8' }}>
                              Terminal Runbook Command
                            </span>
                            <button
                              onClick={() => copyToClipboard(step.command!, `cmd-${step.id}`)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'rgba(255,255,255,0.1)',
                                color: '#ffffff',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              {copiedCommandId === `cmd-${step.id}` ? (
                                <>
                                  <Check size={12} color="#4ade80" />
                                  <span style={{ color: '#4ade80' }}>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={12} />
                                  <span>Copy Command</span>
                                </>
                              )}
                            </button>
                          </div>
                          <div style={{ padding: '10px 14px' }}>
                            <code style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.8rem',
                              color: '#38bdf8',
                              display: 'block',
                              overflowX: 'auto',
                              whiteSpace: 'pre',
                            }}>
                              $ {step.command}
                            </code>
                          </div>
                          {step.expectedOutput && (
                            <div style={{
                              padding: '6px 14px 8px',
                              background: '#0f172a',
                              borderTop: '1px dashed #334155',
                              fontSize: '0.72rem',
                              color: '#94a3b8',
                            }}>
                              <span style={{ color: '#cbd5e1' }}>Expected: </span>
                              {step.expectedOutput}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Warning note if any */}
                      {step.warningNote && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginTop: '6px',
                          fontSize: '0.74rem',
                          color: '#b06000',
                          background: '#fef7e0',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #fce8b2'
                        }}>
                          <AlertTriangle size={13} color="#c26401" />
                          <span>{step.warningNote}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Interactive Agent Nivi AI Copilot Section */}
        <div style={{
          borderTop: '1px solid #dadce0',
          background: '#f8fafd',
          padding: '16px 20px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #76b900, #10b981)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(34, 197, 94, 0.3)'
              }}>
                <MessageSquare size={13} color="#ffffff" />
              </div>
              <div>
                <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#202124' }}>
                  Agent Nivi Copilot
                </span>
                <span style={{
                  marginLeft: '8px',
                  fontSize: '0.68rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: '#e6f4ea',
                  color: '#137333',
                  border: '1px solid #ceead6',
                  fontWeight: 600
                }}>
                  NVIDIA Nemotron-3 Ultra (550B)
                </span>
              </div>
            </div>
            
            <button
              onClick={() => setIsCopilotOpen(prev => !prev)}
              style={{
                background: '#ffffff',
                border: '1px solid #dadce0',
                borderRadius: '16px',
                padding: '4px 10px',
                color: '#5f6368',
                fontSize: '0.74rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>{isCopilotOpen ? 'Collapse' : 'Ask Question'}</span>
              {isCopilotOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          {/* Quick Prompts */}
          <div style={{
            display: 'flex',
            gap: '6px',
            overflowX: 'auto',
            paddingBottom: '8px',
            scrollbarWidth: 'none',
            marginBottom: isCopilotOpen || copilotHistory.length > 0 ? '12px' : '0'
          }}>
            {[
              'Generate rollback script',
              'Draft post-mortem incident brief',
              'What if restarting the service fails?',
              'Explain root cause to leadership'
            ].map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleAskCopilot(q)}
                disabled={isCopilotLoading}
                style={{
                  fontSize: '0.74rem',
                  padding: '4px 12px',
                  borderRadius: '16px',
                  background: '#ffffff',
                  border: '1px solid #dadce0',
                  color: '#3c4043',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#1a73e8';
                  e.currentTarget.style.color = '#1a73e8';
                  e.currentTarget.style.background = '#f8fafd';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#dadce0';
                  e.currentTarget.style.color = '#3c4043';
                  e.currentTarget.style.background = '#ffffff';
                }}
              >
                ⚡ {q}
              </button>
            ))}
          </div>

          {/* Copilot Chat History */}
          {(isCopilotOpen || copilotHistory.length > 0) && (
            <div style={{ animation: 'fadeInSlideUp 0.2s ease' }}>
              {copilotHistory.length > 0 && (
                <div style={{
                  maxHeight: '260px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  marginBottom: '12px',
                  padding: '8px',
                  background: '#f1f3f4',
                  borderRadius: '8px',
                  border: '1px solid #dadce0'
                }}>
                  {copilotHistory.map((item, idx) => (
                    <div key={idx} style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: item.role === 'user' ? '#e8f0fe' : '#ffffff',
                      border: item.role === 'user' ? '1px solid #d2e3fc' : '1px solid #dadce0',
                      fontSize: '0.82rem',
                      lineHeight: 1.5,
                      color: '#202124'
                    }}>
                      <div style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        color: item.role === 'user' ? '#1a73e8' : '#1e8e3e',
                        marginBottom: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <span>{item.role === 'user' ? 'Operator' : 'SRE Copilot (Nemotron-3 550B)'}</span>
                        {item.role === 'assistant' && (
                          <button
                            onClick={() => copyToClipboard(item.content, `copilot-${idx}`)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#5f6368',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}
                          >
                            {copiedCommandId === `copilot-${idx}` ? <Check size={11} color="#1e8e3e" /> : <Copy size={11} />}
                            <span style={{ fontSize: '0.65rem' }}>{copiedCommandId === `copilot-${idx}` ? 'Copied' : 'Copy'}</span>
                          </button>
                        )}
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {item.content}
                      </div>
                    </div>
                  ))}
                  {isCopilotLoading && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      color: '#1a73e8',
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Nemotron-3 Ultra 550B is formulating SRE guidance...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Input Form */}
              <form onSubmit={e => { e.preventDefault(); handleAskCopilot(); }} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Ask SRE Copilot anything about this incident..."
                  value={copilotQuestion}
                  onChange={e => setCopilotQuestion(e.target.value)}
                  disabled={isCopilotLoading}
                  style={{
                    flex: 1,
                    background: '#ffffff',
                    border: '1px solid #dadce0',
                    borderRadius: '20px',
                    padding: '8px 16px',
                    fontSize: '0.82rem',
                    color: '#202124',
                    outline: 'none',
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = '#1a73e8'}
                  onBlur={e => e.currentTarget.style.borderColor = '#dadce0'}
                />
                <button
                  type="submit"
                  disabled={!copilotQuestion.trim() || isCopilotLoading}
                  style={{
                    background: copilotQuestion.trim() && !isCopilotLoading ? '#1a73e8' : '#f1f3f4',
                    color: copilotQuestion.trim() && !isCopilotLoading ? '#ffffff' : '#80868b',
                    border: 'none',
                    borderRadius: '20px',
                    padding: '0 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: copilotQuestion.trim() && !isCopilotLoading ? 'pointer' : 'not-allowed',
                  }}
                >
                  <Send size={13} />
                  <span>Ask</span>
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer Actions & Escalation Toolbar */}
        <div style={{
          padding: '12px 20px',
          background: '#f8f9fa',
          borderTop: '1px solid #dadce0',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {triage.ticketDraft && (
              <button
                onClick={() => onOpenTicketModal(triage.ticketDraft)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#ffffff',
                  color: '#1a73e8',
                  padding: '7px 14px',
                  borderRadius: '20px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  border: '1px solid #dadce0',
                  transition: 'all 0.15s ease',
                  cursor: 'pointer'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#1a73e8';
                  e.currentTarget.style.background = '#f8fafd';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#dadce0';
                  e.currentTarget.style.background = '#ffffff';
                }}
              >
                <FileText size={14} color="#1a73e8" />
                <span>Generate Ticket (ServiceNow/Jira)</span>
              </button>
            )}

            <button
              onClick={() => onEscalate(message.id)}
              disabled={triage.isEscalated}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: triage.isEscalated ? '#e6f4ea' : '#fce8e6',
                color: triage.isEscalated ? '#137333' : '#c5221f',
                padding: '7px 14px',
                borderRadius: '20px',
                fontSize: '0.78rem',
                fontWeight: 600,
                border: triage.isEscalated ? '1px solid #ceead6' : '1px solid #fad2cf',
                cursor: triage.isEscalated ? 'default' : 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Bell size={14} />
              <span>{triage.isEscalated ? 'On-Call Paged (Active)' : 'Page On-Call Team'}</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={copyFullSummary}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: '#ffffff',
                color: '#5f6368',
                padding: '7px 14px',
                borderRadius: '20px',
                fontSize: '0.78rem',
                border: '1px solid #dadce0',
                cursor: 'pointer'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#f1f3f4';
                e.currentTarget.style.color = '#202124';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#ffffff';
                e.currentTarget.style.color = '#5f6368';
              }}
              title="Copy incident triage summary to clipboard"
            >
              {copiedSummary ? <Check size={14} color="#1e8e3e" /> : <Copy size={14} />}
              <span>{copiedSummary ? 'Summary Copied' : 'Copy Summary'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
