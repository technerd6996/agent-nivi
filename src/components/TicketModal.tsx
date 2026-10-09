'use client';

import React, { useState } from 'react';
import { X, Copy, Check, Download, Send, CheckCircle2, FileText, Tag, ShieldAlert } from 'lucide-react';

interface TicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticketDraft: {
    ticketId: string;
    title: string;
    priority: string;
    system: string;
    service: string;
    assigneeTeam: string;
    markdownBody: string;
  } | null;
}

export const TicketModal: React.FC<TicketModalProps> = ({
  isOpen,
  onClose,
  ticketDraft
}) => {
  const [copiedMd, setCopiedMd] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [activeTab, setActiveTab] = useState<'markdown' | 'json'>('markdown');

  if (!isOpen || !ticketDraft) return null;

  const copyMarkdown = () => {
    navigator.clipboard.writeText(ticketDraft.markdownBody);
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 2000);
  };

  const copyJson = () => {
    const jsonStr = JSON.stringify(ticketDraft, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const downloadJson = () => {
    const jsonStr = JSON.stringify(ticketDraft, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ticketDraft.ticketId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSimulatedSubmit = () => {
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      onClose();
    }, 1800);
  };

  return (
    <div      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(32, 33, 36, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '740px',
          maxHeight: '90vh',
          background: '#ffffff',
          border: '1px solid #dadce0',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 12px 32px rgba(32, 33, 36, 0.2)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid #dadce0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#e8f0fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileText size={18} color="#1a73e8" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#202124' }}>
                Automated Incident Ticket Draft
              </h3>
              <p style={{ fontSize: '0.76rem', color: '#5f6368' }}>
                Target ITSM: ServiceNow / Jira Service Desk
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#5f6368',
              padding: '6px',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Ticket Metadata Bar */}
        <div
          style={{
            padding: '14px 22px',
            background: '#f8f9fa',
            borderBottom: '1px solid #dadce0',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
            fontSize: '0.8rem',
          }}
        >
          <div>
            <span style={{ color: '#5f6368', display: 'block', fontSize: '0.7rem', fontWeight: 500 }}>Ticket Number</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#1a73e8' }}>
              {ticketDraft.ticketId}
            </span>
          </div>
          <div>
            <span style={{ color: '#5f6368', display: 'block', fontSize: '0.7rem', fontWeight: 500 }}>Severity / Priority</span>
            <span style={{ fontWeight: 700, color: '#d93025' }}>
              {ticketDraft.priority}
            </span>
          </div>
          <div>
            <span style={{ color: '#5f6368', display: 'block', fontSize: '0.7rem', fontWeight: 500 }}>Service</span>
            <span style={{ fontWeight: 600, color: '#202124' }}>
              {ticketDraft.service}
            </span>
          </div>
          <div>
            <span style={{ color: '#5f6368', display: 'block', fontSize: '0.7rem', fontWeight: 500 }}>Assignment Group</span>
            <span style={{ fontWeight: 600, color: '#202124', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {ticketDraft.assigneeTeam}
            </span>
          </div>
        </div>

        {/* Tab switch */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #dadce0',
            background: '#ffffff',
            padding: '0 20px',
            gap: '8px',
          }}
        >
          <button
            onClick={() => setActiveTab('markdown')}
            style={{
              padding: '11px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'markdown' ? '3px solid #1a73e8' : '3px solid transparent',
              color: activeTab === 'markdown' ? '#1a73e8' : '#5f6368',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Markdown Preview
          </button>
          <button
            onClick={() => setActiveTab('json')}
            style={{
              padding: '11px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'json' ? '3px solid #1a73e8' : '3px solid transparent',
              color: activeTab === 'json' ? '#1a73e8' : '#5f6368',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            JSON ITSM Payload
          </button>
        </div>

        {/* Content Box */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#0f172a' }}>
          {activeTab === 'markdown' ? (
            <pre
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.82rem',
                color: '#e2e8f0',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.55,
                margin: 0,
              }}
            >
              {ticketDraft.markdownBody}
            </pre>
          ) : (
            <pre
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                color: '#38bdf8',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.55,
                margin: 0,
              }}
            >
              {JSON.stringify(ticketDraft, null, 2)}
            </pre>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '14px 22px',
            borderTop: '1px solid #dadce0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={copyMarkdown}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '20px',
                background: '#f1f3f4',
                border: '1px solid #dadce0',
                color: '#202124',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {copiedMd ? <Check size={14} color="#1e8e3e" /> : <Copy size={14} color="#5f6368" />}
              <span>{copiedMd ? 'Copied MD' : 'Copy Markdown'}</span>
            </button>
            <button
              onClick={copyJson}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '20px',
                background: '#f1f3f4',
                border: '1px solid #dadce0',
                color: '#202124',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {copiedJson ? <Check size={14} color="#1e8e3e" /> : <Copy size={14} color="#5f6368" />}
              <span>{copiedJson ? 'Copied JSON' : 'Copy JSON'}</span>
            </button>
            <button
              onClick={downloadJson}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '20px',
                background: '#f1f3f4',
                border: '1px solid #dadce0',
                color: '#202124',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Download size={14} color="#5f6368" />
              <span>Download File</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '7px 16px',
                borderRadius: '20px',
                background: 'transparent',
                border: '1px solid #dadce0',
                color: '#5f6368',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
            <button
              onClick={handleSimulatedSubmit}
              disabled={submitted}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 18px',
                borderRadius: '20px',
                background: submitted ? '#1e8e3e' : '#1a73e8',
                border: 'none',
                color: '#ffffff',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: submitted ? 'default' : 'pointer',
                boxShadow: '0 1px 3px rgba(26, 115, 232, 0.3)',
              }}
            >
              {submitted ? (
                <>
                  <CheckCircle2 size={15} />
                  <span>Ticket Dispatched</span>
                </>
              ) : (
                <>
                  <Send size={15} />
                  <span>Sync to ServiceNow</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
