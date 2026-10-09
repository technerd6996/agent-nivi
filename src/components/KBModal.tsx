'use client';

import React, { useState } from 'react';
import { X, Search, BookOpen, Clock, ShieldAlert, Terminal, Copy, Check, ExternalLink, ArrowRight } from 'lucide-react';
import { KNOWLEDGE_BASE } from '../data/knowledgeBase';
import { KBArticle } from '../types';

interface KBModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedArticleId?: string;
  onInjectArticleSample?: (snippet: string) => void;
}

export const KBModal: React.FC<KBModalProps> = ({
  isOpen,
  onClose,
  selectedArticleId,
  onInjectArticleSample
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [activeArticleId, setActiveArticleId] = useState<string>(selectedArticleId || KNOWLEDGE_BASE[0].id);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  if (!isOpen) return null;

  const categories = ['All', 'Networking & Gateway', 'Database & Storage', 'Kubernetes & Containers', 'Auth & Security', 'Cloud & Infrastructure', 'Application Runtime'];

  const filteredArticles = KNOWLEDGE_BASE.filter(article => {
    const matchesCategory = selectedCategory === 'All' || article.category === selectedCategory;
    const matchesSearch = 
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.errorCodes.some(c => c.toLowerCase().includes(searchQuery.toLowerCase())) ||
      article.keywords.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const activeArticle = KNOWLEDGE_BASE.find(a => a.id === activeArticleId) || filteredArticles[0] || KNOWLEDGE_BASE[0];

  const copyCommand = (cmd: string, id: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  return (
    <div
      style={{
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
          maxWidth: '1100px',
          height: '85vh',
          background: '#ffffff',
          border: '1px solid #dadce0',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 12px 32px rgba(32, 33, 36, 0.2)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 24px',
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
              <BookOpen size={18} color="#1a73e8" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#202124' }}>
                IT Knowledge Base & SOP Directory
              </h2>
              <p style={{ fontSize: '0.76rem', color: '#5f6368' }}>
                Authoritative Standard Operating Procedures & Automated Triage Runbooks
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

        {/* Search & Filters */}
        <div
          style={{
            padding: '12px 24px',
            borderBottom: '1px solid #dadce0',
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            background: '#f8f9fa',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              position: 'relative',
              flex: '1',
              minWidth: '240px',
            }}
          >
            <Search size={15} color="#5f6368" style={{ position: 'absolute', left: '12px', top: '10px' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search error codes (e.g. 504, 137), symptoms, keywords..."
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                borderRadius: '20px',
                background: '#ffffff',
                border: '1px solid #dadce0',
                color: '#202124',
                fontSize: '0.82rem',
                outline: 'none',
                boxShadow: '0 1px 3px rgba(60, 64, 67, 0.08)',
              }}
            />
          </div>

          {/* Category Filter Pills */}
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  fontSize: '0.74rem',
                  padding: '5px 12px',
                  borderRadius: '16px',
                  background: selectedCategory === cat ? '#e8f0fe' : '#ffffff',
                  color: selectedCategory === cat ? '#1a73e8' : '#5f6368',
                  border: selectedCategory === cat ? '1px solid #1a73e8' : '1px solid #dadce0',
                  fontWeight: selectedCategory === cat ? 600 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Main Body: Two Columns (Article List + Article View) */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Article List Pane */}
          <div
            style={{
              width: '360px',
              borderRight: '1px solid #dadce0',
              overflowY: 'auto',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              background: '#f8f9fa',
            }}
          >
            {filteredArticles.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#5f6368', fontSize: '0.82rem' }}>
                No SOPs matched your query.
              </div>
            ) : (
              filteredArticles.map(article => {
                const isSelected = activeArticle?.id === article.id;
                const isP1 = article.severity.startsWith('P1');
                const isP2 = article.severity.startsWith('P2');
                const badgeClass = isP1 ? 'badge-p1' : isP2 ? 'badge-p2' : 'badge-p3';

                return (
                  <div
                    key={article.id}
                    onClick={() => setActiveArticleId(article.id)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: isSelected ? '#e8f0fe' : '#ffffff',
                      border: isSelected ? '1px solid #1a73e8' : '1px solid #dadce0',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 1px 4px rgba(26, 115, 232, 0.15)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#1a73e8' }}>
                        {article.id}
                      </span>
                      <span style={{ fontSize: '0.66rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px' }} className={badgeClass}>
                        {article.severity.split(' - ')[0]}
                      </span>
                    </div>

                    <h4 style={{ fontSize: '0.86rem', fontWeight: 600, color: '#202124', marginBottom: '4px', lineHeight: 1.3 }}>
                      {article.title}
                    </h4>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#5f6368' }}>
                      <span>{article.category}</span>
                      <span>•</span>
                      <span>{article.steps.length} steps</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Article Full Detail View */}
          {activeArticle ? (
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', background: '#ffffff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: '#e8f0fe',
                      color: '#1a73e8',
                    }}
                  >
                    {activeArticle.id}
                  </span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '6px',
                    }}
                    className={activeArticle.severity.startsWith('P1') ? 'badge-p1' : 'badge-p2'}
                  >
                    {activeArticle.severity}
                  </span>
                </div>

                {onInjectArticleSample && (
                  <button
                    onClick={() => {
                      onInjectArticleSample(activeArticle.errorCodes[0] || activeArticle.title);
                      onClose();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: '#1a73e8',
                      color: '#ffffff',
                      padding: '6px 14px',
                      borderRadius: '20px',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 1px 3px rgba(26, 115, 232, 0.3)',
                    }}
                  >
                    <span>Test Triage on this SOP</span>
                    <ArrowRight size={13} />
                  </button>
                )}
              </div>

              <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#202124', marginBottom: '10px' }}>
                {activeArticle.title}
              </h1>

              <p style={{ fontSize: '0.9rem', color: '#3c4043', lineHeight: 1.55, marginBottom: '20px' }}>
                {activeArticle.summary}
              </p>

              {/* Error Codes & Keywords */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px',
                  marginBottom: '20px',
                  padding: '12px 16px',
                  background: '#f8f9fa',
                  borderRadius: '10px',
                  border: '1px solid #dadce0',
                }}
              >
                <span style={{ fontSize: '0.76rem', color: '#5f6368', display: 'flex', alignItems: 'center', gap: '4px', marginRight: '6px', fontWeight: 500 }}>
                  Target Codes:
                </span>
                {activeArticle.errorCodes.map((code, idx) => (
                  <span
                    key={idx}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: '#ffffff',
                      color: '#202124',
                      border: '1px solid #dadce0',
                    }}
                  >
                    {code}
                  </span>
                ))}
              </div>

              {/* Root Cause Box */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  background: '#e8f0fe',
                  borderLeft: '4px solid #1a73e8',
                  marginBottom: '22px',
                }}
              >
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#1a73e8', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>
                  Root Cause Explanation
                </div>
                <div style={{ fontSize: '0.86rem', color: '#202124', lineHeight: 1.45 }}>
                  {activeArticle.rootCause}
                </div>
              </div>

              {/* SOP Steps */}
              <div style={{ marginBottom: '22px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#202124', marginBottom: '12px' }}>
                  Official Remediation Checklist
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {activeArticle.steps.map(step => (
                    <div
                      key={step.id}
                      style={{
                        padding: '14px 16px',
                        borderRadius: '10px',
                        background: '#f8f9fa',
                        border: '1px solid #dadce0',
                      }}
                    >
                      <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#202124', marginBottom: '4px' }}>
                        Step {step.stepNumber}: {step.title}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#3c4043', marginBottom: step.command ? '10px' : '0', lineHeight: 1.4 }}>
                        {step.action}
                      </div>
                      {step.command && (
                        <div
                          style={{
                            background: '#1e293b',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginTop: '6px',
                          }}
                        >
                          <code style={{ fontSize: '0.78rem', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                            $ {step.command}
                          </code>
                          <button
                            onClick={() => copyCommand(step.command!, step.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#94a3b8',
                              cursor: 'pointer',
                              padding: '2px',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            {copiedCmd === step.id ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Escalation Details */}
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '10px',
                  background: '#fce8e6',
                  border: '1px solid #f6aea9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ fontSize: '0.82rem', color: '#c5221f' }}>
                  <strong>Escalation Path:</strong> {activeArticle.escalationPath}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#80868b' }}>
                  Target Resolution: ~{activeArticle.estimatedResolutionMinutes}m
                </div>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5f6368' }}>
              Select an article to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
