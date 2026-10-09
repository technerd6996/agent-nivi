'use client';

import React from 'react';
import { Clock, Trash2 } from 'lucide-react';
import { Conversation } from '../types';

interface SidebarProps {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeId,
  onSelect,
  onDelete,
}) => {
  return (
    <aside style={{
      width: '280px',
      minWidth: '260px',
      borderRight: '1px solid #dadce0',
      background: '#f8f9fa',
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 65px)',
      overflowY: 'auto',
      padding: '16px 14px',
    }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px'
        }}>
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#5f6368',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <Clock size={14} color="#1a73e8" />
            Session Incidents ({conversations.length})
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {conversations.map((conv) => {
            const isSelected = activeId === conv.id;
            const sev = conv.severity;
            const badgeClass = sev?.startsWith('P1')
              ? 'badge-p1'
              : sev?.startsWith('P2')
              ? 'badge-p2'
              : 'badge-p3';
            const isEmpty = conv.messages.length === 0;

            return (
              <div
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: isSelected ? '#e8f0fe' : '#ffffff',
                  border: isSelected ? '1px solid #1a73e8' : '1px solid #dadce0',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(60, 64, 67, 0.06)',
                  position: 'relative',
                }}
                onMouseEnter={e => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = '#bdc1c6';
                    e.currentTarget.style.background = '#f1f3f4';
                  }
                }}
                onMouseLeave={e => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = '#dadce0';
                    e.currentTarget.style.background = '#ffffff';
                  }
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '4px',
                  gap: '6px',
                }}>
                  <span style={{
                    fontSize: '0.72rem',
                    fontFamily: 'var(--font-mono)',
                    color: '#5f6368',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {conv.incidentId || (isEmpty ? 'Empty' : 'In progress')}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    {sev && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}
                        className={badgeClass}
                      >
                        {sev.split(' - ')[0]}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                      aria-label="Delete session"
                      title="Delete session"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: '2px',
                        cursor: 'pointer',
                        color: '#bdc1c6',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#d93025')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#bdc1c6')}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                <div style={{
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: isEmpty ? '#80868b' : '#202124',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {conv.title}
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: '6px',
                  fontSize: '0.7rem',
                  color: '#80868b'
                }}>
                  <span>{conv.timestamp}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
};
