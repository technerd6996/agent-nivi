'use client';

import React from 'react';
import { Plus } from 'lucide-react';
import { SeverityLevel } from '../types';

interface HeaderProps {
  onResetSession: () => void;
  incidentCounts?: { p1: number; p2: number; p3: number; p4: number };
  activeSeverity?: SeverityLevel;
}

export const Header: React.FC<HeaderProps> = ({
  onResetSession,
}) => {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 24px',
      borderBottom: '1px solid #dadce0',
      background: '#ffffff',
      position: 'sticky',
      top: 0,
      zIndex: 40,
      boxShadow: '0 1px 3px rgba(60, 64, 67, 0.06)'
    }}>
      {/* Brand & Logo (Green Squircle + Only "Agent Nivi" text) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '11px',
          background: 'linear-gradient(135deg, #76b900 0%, #22c55e 55%, #10b981 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 3px 10px rgba(34, 197, 94, 0.35)',
          flexShrink: 0
        }}>
          <svg
            width="22"
            height="22"
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

        <span style={{
          fontSize: '1.22rem',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: '#202124',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Google Sans", "Segoe UI", Roboto, sans-serif'
        }}>
          Agent Nivi
        </span>
      </div>

      {/* Right Action Buttons - Clean Google Style */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>

        {/* New Session Button */}
        <button
          onClick={onResetSession}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#ffffff',
            color: '#5f6368',
            padding: '7px 14px',
            borderRadius: '20px',
            fontSize: '0.82rem',
            fontWeight: 500,
            border: '1px solid #dadce0',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = '#202124';
            e.currentTarget.style.background = '#f1f3f4';
            e.currentTarget.style.borderColor = '#bdc1c6';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = '#5f6368';
            e.currentTarget.style.background = '#ffffff';
            e.currentTarget.style.borderColor = '#dadce0';
          }}
          title="Clear current triage session messages"
        >
          <Plus size={16} />
          <span>New Session</span>
        </button>
      </div>
    </header>
  );
};
