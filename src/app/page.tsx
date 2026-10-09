'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { ChatMessageItem } from '../components/ChatMessageItem';
import { ChatInput } from '../components/ChatInput';
import { KBModal } from '../components/KBModal';
import { TicketModal } from '../components/TicketModal';
import { runTriage } from '../lib/triageEngine';
import { ChatMessage, Conversation, SeverityLevel } from '../types';
import { buildChatHistory, mergeContextMemory, EMPTY_MEMORY } from '../lib/sessionMemory';
import { triageToMarkdown, stepsToMarkdown } from '../lib/triageMarkdown';
import { classifyInput } from '../lib/inputClassifier';
import { Terminal, CheckCircle, Bell } from 'lucide-react';

const STORAGE_KEY = 'agent-nivi-conversations';

// Offline gate messages. Kept in sync with the server-side equivalents in
// src/app/api/triage/route.ts.
const OFFLINE_OFF_TOPIC = `🚫 **Out of Scope**

I'm an SRE incident triage agent — I only work on IT incidents and system failures. I can't answer general knowledge questions, look up people, or write content.

If you do have an incident, send me the signal: error logs, stack traces, error codes (e.g. 504, Exit Code 137, ENOSPC), or metrics and alerts.`;

const OFFLINE_INSUFFICIENT = `⛔ **Insufficient Diagnostic Input**

I triage IT incidents from observable signals. To get started, send at least one of:

• **Error logs** — raw log output from your application, service, or OS
• **Stack traces** — full exception/traceback output
• **Error codes** — HTTP status codes, exit codes, SQL error codes
• **Metrics / symptoms** — CPU spikes, memory pressure, latency readings`;

const OFFLINE_VAGUE = `🔍 **I need a bit more to go on**

That tells me something is failing, but not enough to triage it. Could you add:

• **Which service or host** is affected, and in which environment?
• **The exact error text** — the log line, status code, or stack trace
• **When it started**, and whether it's constant or intermittent
• **What changed recently** — a deploy, config change, or traffic shift`;

const nowTime = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const nowStamp = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function newConversation(): Conversation {
  return {
    id: `conv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    title: 'New session',
    status: 'Investigating',
    timestamp: nowTime(),
    createdAt: Date.now(),
    messages: [],
    contextMemory: { ...EMPTY_MEMORY },
  };
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [isKBOpen, setIsKBOpen] = useState(false);
  const [activeKBArticleId, setActiveKBArticleId] = useState<string | undefined>();
  const [ticketDraft, setTicketDraft] = useState<any | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'alert' } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAiMode] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConv = conversations.find(c => c.id === activeId);
  const messages = activeConv?.messages ?? [];

  /** Applies a change to the active conversation only. */
  const updateActive = (fn: (c: Conversation) => Conversation) => {
    setConversations(prev => prev.map(c => (c.id === activeId ? fn(c) : c)));
  };

  // --- Restore conversations on load; seed one if there are none -------------
  useEffect(() => {
    let restored: Conversation[] = [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) restored = parsed;
      }
    } catch {
      // Corrupt or unavailable storage — start fresh rather than crash.
    }

    if (restored.length) {
      setConversations(restored);
      setActiveId(restored[0].id);
    } else {
      const c = newConversation();
      setConversations([c]);
      setActiveId(c.id);
    }
  }, []);

  // --- Persist on change ----------------------------------------------------
  useEffect(() => {
    if (!conversations.length) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch {
      // Over quota (large pasted logs) — keep running without persistence.
    }
  }, [conversations]);

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading, activeId]);

  const showToast = (text: string, type: 'success' | 'alert' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Handle incoming message — history-aware, scoped to the active conversation
  const handleSendMessage = async (content: string, rawSnippet?: string, imageDataUrl?: string) => {
    if (!activeConv) return;

    const userMessage: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      sender: 'user',
      timestamp: nowStamp(),
      content,
      rawSnippet,
      imageDataUrl
    };

    // Snapshot memory BEFORE appending this turn, so the transcript we send is
    // the prior context — the new message travels separately as `input`.
    const priorMessages = activeConv.messages;
    const chatHistory = buildChatHistory(priorMessages);
    const contextMemory = activeConv.contextMemory || EMPTY_MEMORY;

    updateActive(c => ({
      ...c,
      messages: [...c.messages, userMessage],
      // Title the thread from its first message so the sidebar is readable
      // even before triage returns.
      title: c.messages.length === 0
        ? (content || rawSnippet || (imageDataUrl ? 'Screenshot triage' : 'New session')).slice(0, 60)
        : c.title,
    }));
    setIsLoading(true);

    const startTime = performance.now();
    const isFollowUp = chatHistory.length > 0;
    const appendAgent = (msg: ChatMessage, patch?: Partial<Conversation>) =>
      updateActive(c => ({ ...c, ...patch, messages: [...c.messages, msg] }));

    /**
     * Offline path. Mirrors the server gate: refuse off-topic, ask on vague,
     * and never present the generic no-match article as a real diagnosis.
     */
    const localFallback = (
      text: string,
      snippet: string | undefined,
      t0: number,
      followUp: boolean
    ) => {
      const query = (snippet || text).trim();
      const cls = classifyInput(query);
      const prose = (markdown: string) =>
        appendAgent({
          id: `msg-local-${Date.now()}`,
          sender: 'agent',
          timestamp: nowStamp(),
          content: '',
          markdown,
          processingTimeMs: Math.round(performance.now() - t0),
        });

      if (!followUp) {
        if (cls.kind === 'off-topic') return prose(OFFLINE_OFF_TOPIC);
        if (cls.kind === 'insufficient') return prose(OFFLINE_INSUFFICIENT);
        if (cls.kind === 'vague') return prose(OFFLINE_VAGUE);
      }

      const triageResult = runTriage(query);

      // No KB article matched — offer read-only checks, claim nothing.
      if (triageResult.matchedArticle.id === 'KB-GEN-DIAG') {
        const steps = triageResult.matchedArticle.steps.filter(s => !!s.command);
        return prose([
          `⚠️ **No matching runbook**`,
          `I couldn't match this to a runbook in the knowledge base, and the AI model is unreachable right now — so I won't guess at a severity or root cause.`,
          `Safe read-only checks to narrow it down. None of these change system state:`,
          stepsToMarkdown(steps),
          `_Paste the output back and I'll take another pass._`,
        ].join('\n\n'));
      }

      triageResult.isAiGenerated = false;
      triageResult.modelUsed = 'Knowledge Base runbook (AI unavailable)';
      triageResult.markdown = triageToMarkdown(triageResult);
      appendAgent({
        id: `msg-bot-${Date.now()}`,
        sender: 'agent',
        timestamp: nowStamp(),
        content: '',
        triageResult,
        processingTimeMs: Math.round(performance.now() - t0),
      }, {
        title: triageResult.matchedArticle.title,
        severity: triageResult.severity,
        incidentId: triageResult.ticketDraft?.ticketId,
        articleId: triageResult.matchedArticle.id,
        status: 'Investigating',
      });
    };

    try {
      if (isAiMode) {
        const response = await fetch('/api/triage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: content, rawSnippet, chatHistory, contextMemory, imageDataUrl })
        });

        if (response.ok) {
          const data = await response.json();

          // --- Greeting / rejection / guard / clarification: prose only ---
          if (data.rejected) {
            appendAgent({
              id: `msg-reject-${Date.now()}`,
              sender: 'agent',
              timestamp: nowStamp(),
              content: data.message,
              isRejection: true,
              isGreetingReply: data.isGreeting === true,
              isGuardBlocked: data.isGuardBlocked === true,
              guardModel: data.guardModel,
            });
            setIsLoading(false);
            return;
          }

          // --- Follow-up answer: continues the incident, no new sidebar entry ---
          if (data.followUp) {
            appendAgent({
              id: `msg-followup-${Date.now()}`,
              sender: 'agent',
              timestamp: nowStamp(),
              content: '',
              markdown: data.markdown,
              processingTimeMs: data.processingTimeMs,
              aiReasoning: data.aiReasoning,
            }, {
              contextMemory: mergeContextMemory(contextMemory, data.contextUpdate),
            });
            setIsLoading(false);
            return;
          }

          const triageResult = data.triageResult;
          appendAgent({
            id: `msg-bot-${Date.now()}`,
            sender: 'agent',
            timestamp: nowStamp(),
            content: '',
            triageResult,
            processingTimeMs: Math.round(performance.now() - startTime),
            isAiGenerated: data.isAiPowered ?? false,
            aiReasoning: triageResult?.aiReasoning,
          }, {
            contextMemory: mergeContextMemory(contextMemory, data.contextUpdate),
            title: triageResult?.matchedArticle?.title || activeConv.title,
            severity: triageResult?.severity,
            incidentId: triageResult?.ticketDraft?.ticketId,
            articleId: triageResult?.matchedArticle?.id,
            status: 'Investigating',
          });
          showToast('Triage analysis complete', 'success');
          return;
        }
      }

      // Local heuristic engine (AI disabled, or the API returned non-OK).
      // This path bypasses the server-side gate, so it must gate itself —
      // otherwise an off-topic or vague message gets a fabricated runbook.
      localFallback(content, rawSnippet, startTime, isFollowUp);
    } catch (err: any) {
      console.error('Triage error:', err);
      localFallback(content, rawSnippet, startTime, isFollowUp);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle step checklist (legacy card only; prose replies have no checkboxes)
  const handleToggleStep = (messageId: string, stepId: string) => {
    updateActive(c => ({
      ...c,
      messages: c.messages.map(msg => {
        if (msg.id !== messageId || !msg.triageResult) return msg;
        const progress = { ...msg.triageResult.stepProgress, [stepId]: !msg.triageResult.stepProgress?.[stepId] };
        const allDone = msg.triageResult.matchedArticle.steps.every(s => progress[s.id]);
        return { ...msg, triageResult: { ...msg.triageResult, stepProgress: progress, isResolved: allDone } };
      }),
    }));
  };

  // Escalate to On-Call
  const handleEscalate = (messageId: string) => {
    updateActive(c => ({
      ...c,
      status: 'Escalated',
      messages: c.messages.map(msg =>
        msg.id === messageId && msg.triageResult
          ? { ...msg, triageResult: { ...msg.triageResult, isEscalated: true } }
          : msg
      ),
    }));
    showToast('🚨 Escalation dispatched to the on-call team', 'alert');
  };

  /**
   * New Session starts a fresh thread and leaves existing ones in the sidebar.
   * Reuses the current thread if it is already empty, so repeated clicks don't
   * pile up blanks.
   */
  const handleNewSession = () => {
    if (activeConv && activeConv.messages.length === 0) {
      showToast('Already in a new session', 'success');
      return;
    }
    const c = newConversation();
    setConversations(prev => [c, ...prev]);
    setActiveId(c.id);
  };

  const handleDeleteConversation = (id: string) => {
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id);
      if (next.length === 0) {
        const fresh = newConversation();
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  };

  // Severity counts across all threads that have been triaged
  const incidentCounts = {
    p1: conversations.filter(c => c.severity?.startsWith('P1')).length,
    p2: conversations.filter(c => c.severity?.startsWith('P2')).length,
    p3: conversations.filter(c => c.severity?.startsWith('P3')).length,
    p4: conversations.filter(c => c.severity?.startsWith('P4')).length,
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: 'var(--bg-primary)',
      overflow: 'hidden',
    }}>
      {/* Top Header */}
      <Header
        onResetSession={handleNewSession}
        incidentCounts={incidentCounts}
      />

      {/* Main Two-Pane Layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Sidebar — conversation list */}
        <Sidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={setActiveId}
          onDelete={handleDeleteConversation}
        />

        {/* Center / Right Chat View Area */}
        <main style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 65px)',
          position: 'relative',
          overflow: 'hidden',
          background: '#ffffff'
        }}>
          {/* Scrollable Message List */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 32px',
            display: 'flex',
            flexDirection: 'column',
            background: '#ffffff'
          }}>
            {messages.length === 0 ? (
              // Empty State / Welcome Guide - Google Search Style
              <div style={{
                maxWidth: '680px',
                margin: 'auto',
                padding: '60px 20px',
                textAlign: 'center',
                animation: 'fadeInSlideUp 0.35s ease'
              }}>
                {/* Logo matching user attached image */}
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '18px',
                  background: 'linear-gradient(135deg, #76b900 0%, #22c55e 55%, #10b981 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px',
                  boxShadow: '0 6px 20px rgba(34, 197, 94, 0.35)',
                }}>
                  <svg
                    width="36"
                    height="36"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="5 6 12 12 5 18" />
                    <line x1="14" y1="18" x2="20" y2="18" />
                  </svg>
                </div>

                <h1 style={{
                  fontSize: '2.4rem',
                  fontWeight: 700,
                  color: '#202124',
                  marginBottom: '10px',
                  letterSpacing: '-0.025em',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Google Sans", "Segoe UI", Roboto, sans-serif'
                }}>
                  Agent Nivi
                </h1>

                <p style={{
                  fontSize: '0.98rem',
                  color: '#5f6368',
                  maxWidth: '540px',
                  margin: '0 auto 18px',
                  lineHeight: 1.5
                }}>
                  AI-powered SRE triage and IT incident diagnostics
                </p>

                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 16px',
                  borderRadius: '24px',
                  background: '#f8f9fa',
                  fontSize: '0.84rem',
                  color: '#5f6368',
                  border: '1px solid #dadce0'
                }}>
                  <span>Paste an error log, stack trace, or incident telemetry below to begin</span>
                </div>
              </div>
            ) : (
              messages.map(msg => (
                <ChatMessageItem
                  key={msg.id}
                  message={msg}
                  onToggleStep={handleToggleStep}
                  onOpenTicketModal={(draft) => setTicketDraft(draft)}
                  onOpenKBModal={(articleId) => {
                    setActiveKBArticleId(articleId);
                    setIsKBOpen(true);
                  }}
                  onEscalate={handleEscalate}
                />
              ))
            )}

            {/* Loading Indicator */}
            {isLoading && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 18px',
                borderRadius: '24px',
                background: '#ffffff',
                border: '1px solid #dadce0',
                boxShadow: '0 2px 8px rgba(60, 64, 67, 0.1)',
                width: 'fit-content',
                animation: 'fadeInSlideUp 0.2s ease',
                marginBottom: '20px'
              }}>
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid #e8eaed',
                  borderTopColor: '#1a73e8',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <span style={{ fontSize: '0.82rem', color: '#3c4043', fontWeight: 500 }}>
                  Analyzing incident...
                </span>
                <style jsx>{`
                  @keyframes spin {
                    to { transform: rotate(360deg); }
                  }
                `}</style>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Standard AI disclaimer, above the composer */}
          <div style={{
            textAlign: 'center',
            fontSize: '0.74rem',
            color: '#80868b',
            padding: '0 32px 6px',
            lineHeight: 1.4,
          }}>
            Agent Nivi can make mistakes. Verify commands and severity before acting on production systems.
          </div>

          {/* Bottom Chat Input */}
          <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
        </main>
      </div>

      {/* Knowledge Base Modal */}
      <KBModal
        isOpen={isKBOpen}
        onClose={() => setIsKBOpen(false)}
        selectedArticleId={activeKBArticleId}
        onInjectArticleSample={(snippet) => handleSendMessage(`Simulating triage for SOP:`, snippet)}
      />

      {/* Ticket Generator Modal */}
      <TicketModal
        isOpen={!!ticketDraft}
        onClose={() => setTicketDraft(null)}
        ticketDraft={ticketDraft}
      />

      {/* Floating Notification Toast */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '88px',
          right: '24px',
          background: '#202124',
          color: '#ffffff',
          padding: '10px 20px',
          borderRadius: '24px',
          boxShadow: '0 4px 16px rgba(32, 33, 36, 0.28)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.84rem',
          fontWeight: 500,
          zIndex: 200,
          animation: 'fadeInSlideUp 0.25s ease',
        }}>
          {toastMessage.type === 'alert' ? <Bell size={18} color="#ea4335" /> : <CheckCircle size={18} color="#34a853" />}
          <span>{toastMessage.text}</span>
        </div>
      )}
    </div>
  );
}
