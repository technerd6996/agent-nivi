'use client';

import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * Minimal markdown renderer for chat replies.
 *
 * Supports the subset the agent actually emits: paragraphs, **bold**,
 * _italic_, `inline code`, fenced code blocks (with a copy button), and
 * simple bullet / numbered lists. Written inline to avoid adding a
 * markdown dependency for this small surface.
 */

/** Renders **bold**, _italic_ and `code` inside a single line of text. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split on the inline markers, keeping the delimiters.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g);

  parts.forEach((part, i) => {
    const key = `${keyPrefix}-i${i}`;
    if (!part) return;

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      nodes.push(
        <strong key={key} style={{ color: '#202124', fontWeight: 600 }}>
          {part.slice(2, -2)}
        </strong>
      );
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      nodes.push(
        <code
          key={key}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.86em',
            background: '#f1f3f4',
            border: '1px solid #e0e3e7',
            borderRadius: '4px',
            padding: '1px 5px',
            color: '#1a1a1a',
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    } else if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
      nodes.push(
        <em key={key} style={{ color: '#5f6368' }}>
          {part.slice(1, -1)}
        </em>
      );
    } else {
      nodes.push(part);
    }
  });

  return nodes;
}

const CodeBlock: React.FC<{ code: string }> = ({ code }) => {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      style={{
        position: 'relative',
        background: '#1e293b',
        borderRadius: '8px',
        margin: '10px 0',
        overflow: 'hidden',
        border: '1px solid #334155',
      }}
    >
      <button
        onClick={copy}
        aria-label="Copy code"
        style={{
          position: 'absolute',
          top: '6px',
          right: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: 'rgba(255,255,255,0.1)',
          color: '#ffffff',
          border: 'none',
          padding: '3px 8px',
          borderRadius: '4px',
          fontSize: '0.68rem',
          cursor: 'pointer',
        }}
      >
        {copied ? <Check size={11} color="#4ade80" /> : <Copy size={11} />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
      <pre
        style={{
          margin: 0,
          padding: '12px 70px 12px 14px',
          overflowX: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8rem',
          lineHeight: 1.55,
          color: '#38bdf8',
          whiteSpace: 'pre',
        }}
      >
        {code}
      </pre>
    </div>
  );
};

export const Markdown: React.FC<{ text: string }> = ({ text }) => {
  const blocks: React.ReactNode[] = [];
  const lines = (text || '').split('\n');

  let i = 0;
  let b = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trim().startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      i++; // consume closing fence
      blocks.push(<CodeBlock key={`b${b++}`} code={buf.join('\n')} />);
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // List run (bullets or numbered)
    const isListLine = (l: string) => /^\s*([-*•]|\d+\.)\s+/.test(l);
    if (isListLine(line)) {
      const items: string[] = [];
      const ordered = /^\s*\d+\.\s+/.test(line);
      while (i < lines.length && isListLine(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*•]|\d+\.)\s+/, ''));
        i++;
      }
      const ListTag = ordered ? 'ol' : 'ul';
      blocks.push(
        <ListTag
          key={`b${b++}`}
          style={{
            margin: '8px 0',
            paddingLeft: '22px',
            fontSize: '0.9rem',
            lineHeight: 1.65,
            color: '#3c4043',
          }}
        >
          {items.map((it, idx) => (
            <li key={idx} style={{ marginBottom: '4px' }}>
              {renderInline(it, `b${b}-l${idx}`)}
            </li>
          ))}
        </ListTag>
      );
      continue;
    }

    // Paragraph: gather until blank line / fence / list
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('```') &&
      !isListLine(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }

    const joined = para.join(' ');
    // A short all-bold line acts as a section heading.
    const isHeading = /^\*\*[^*]+\*\*$/.test(joined.trim());

    blocks.push(
      <p
        key={`b${b++}`}
        style={{
          margin: isHeading ? '14px 0 2px' : '0 0 10px',
          fontSize: isHeading ? '0.92rem' : '0.9rem',
          lineHeight: 1.65,
          color: '#3c4043',
        }}
      >
        {renderInline(joined, `b${b}`)}
      </p>
    );
  }

  return <div>{blocks}</div>;
};
