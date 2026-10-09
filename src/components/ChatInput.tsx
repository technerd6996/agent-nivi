'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Terminal, Clipboard, Trash2, Search, Image as ImageIcon, X } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (content: string, rawSnippet?: string, imageDataUrl?: string) => void;
  isLoading?: boolean;
}

/** Longest edge we send; screenshots are downscaled to keep payloads sane. */
const MAX_IMAGE_EDGE = 1600;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * Downscales and re-encodes an image file to a JPEG data URL.
 * A raw 4K screenshot base64-encodes to several megabytes, which is slow to
 * upload and wasteful for the vision model.
 */
async function toDownscaledDataUrl(file: File): Promise<string> {
  // Never await a browser callback without a deadline — a stalled FileReader
  // previously left the attach silently pending, with no preview and no error.
  const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${label}-timeout`)), ms)
      ),
    ]);

  const original = await withTimeout(
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('read-failed'));
      r.onabort = () => reject(new Error('read-aborted'));
      r.readAsDataURL(file);
    }),
    15000,
    'read'
  );

  // Downscaling is an optimisation; if any part of it fails, send the original
  // rather than losing the attachment.
  try {
    const img = await withTimeout(
      new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('decode-failed'));
        i.src = original;
      }),
      15000,
      'decode'
    );

    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height));
    if (scale === 1 && original.length < MAX_IMAGE_BYTES) return original;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    // White backdrop so transparent PNGs don't become black text on black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  } catch {
    return original;
  }
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, isLoading }) => {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [image, setImage] = useState<{ dataUrl: string; name: string } | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isAttaching, setIsAttaching] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const attachFileRef = useRef<(f: File | null | undefined) => Promise<void>>(async () => {});

  const attachFile = async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setImageError(`That file is ${file.type || 'an unknown type'}, not an image.`);
      return;
    }
    setImageError(null);
    setIsAttaching(true);
    try {
      const dataUrl = await toDownscaledDataUrl(file);
      if (!dataUrl.startsWith('data:image/')) throw new Error('bad-data-url');
      setImage({ dataUrl, name: file.name || 'screenshot' });
    } catch (err: any) {
      // Surface the reason — a silent failure here is what made this look
      // like "upload does nothing".
      console.error('Image attach failed:', err);
      setImageError(`Could not read that image (${err?.message || 'unknown error'}).`);
    } finally {
      setIsAttaching(false);
    }
  };

  /**
   * File selection is bound with a native listener rather than React's
   * onChange.
   *
   * React only emits a synthetic change event when its internal value tracker
   * sees the input's value change. For a file input that tracking is
   * unreliable — the native `change` event fired with files attached while
   * React's `onChange` never ran, so selecting a file did nothing at all and
   * reported no error. A direct listener removes that layer entirely.
   */
  useEffect(() => {
    const el = fileRef.current;
    if (!el) return;

    const onPick = () => {
      const file = el.files?.[0];
      // Reset only after the read settles, so the File handle stays valid and
      // the same file can be picked twice in a row.
      void attachFileRef.current(file).finally(() => { el.value = ''; });
    };

    el.addEventListener('change', onPick);
    return () => el.removeEventListener('change', onPick);
  }, []);

  attachFileRef.current = attachFile;

  /** Ctrl+V of a screenshot attaches it instead of pasting nothing. */
  const handlePaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData?.items || [])
      .find(i => i.type.startsWith('image/'));
    if (item) {
      e.preventDefault();
      attachFile(item.getAsFile());
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 48), 160)}px`;
    }
  }, [input]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if ((!text && !image) || isLoading) return;

    // Does this look like a pasted log, or like someone talking to the agent?
    //
    // The old test used input.includes('at ') to spot a stack frame, which
    // matched the "at " inside "Wh-at do...". Every question starting with
    // "What" was therefore relabelled "Please triage the following error log",
    // which is why "What do we mean by PVC?" came back asking for logs.
    const lines = text.split('\n');
    const looksLikeStackFrame = /(^|\n)\s*(at\s+[\w$.<>]+\s*\(|File\s+")/.test(text);
    const looksLikePaste =
      lines.length > 2 ||
      looksLikeStackFrame ||
      /\bTraceback\b/.test(text) ||
      /^\s*\{[\s\S]*\}\s*$/.test(text) ||
      (text.length > 220 && /[:;]/.test(text));

    // A question is prose addressed to the agent, never a payload to label.
    const looksLikeQuestion = text.endsWith('?') && lines.length === 1 && text.length < 200;

    const messageText = looksLikePaste && !looksLikeQuestion
      ? 'Please triage the following error log / stack trace snippet:'
      : text;
    // Only carry a separate snippet for real pastes. Setting it for plain prose
    // made the bubble render the same text twice (once as the message, once as
    // a RAW_ERROR_PAYLOAD block).
    const rawSnippet = looksLikePaste && !looksLikeQuestion ? text : undefined;

    onSendMessage(messageText, rawSnippet, image?.dataUrl);
    setInput('');
    setImage(null);
    setImageError(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = '48px';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInput(prev => (prev ? `${prev}\n${text}` : text));
      }
    } catch {
      // Fallback
    }
  };

  return (
    <div style={{
      padding: '12px 28px 16px',
      background: '#ffffff',
      borderTop: '1px solid #e8eaed',
      position: 'sticky',
      bottom: 0,
      zIndex: 30,
    }}>
      {/* Google-Style Omnibox Search Capsule */}
      <div style={{
        maxWidth: '820px',
        margin: '0 auto',
        background: '#ffffff',
        border: '1px solid #dfe1e5',
        borderRadius: '24px',
        padding: '10px 18px 8px',
        boxShadow: isFocused ? '0 2px 10px rgba(32, 33, 36, 0.22)' : '0 1px 6px rgba(32, 33, 36, 0.12)',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
      }}>
        {/* Attached screenshot preview */}
        {image && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 10px',
            marginBottom: '8px',
            background: '#f8f9fa',
            border: '1px solid #dadce0',
            borderRadius: '10px',
          }}>
            <img
              src={image.dataUrl}
              alt="attached screenshot"
              style={{
                width: '56px',
                height: '40px',
                objectFit: 'cover',
                borderRadius: '6px',
                border: '1px solid #dadce0',
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '0.8rem',
                color: '#202124',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {image.name}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#5f6368' }}>
                Screenshot attached — I'll read the error from it
              </div>
            </div>
            <button
              type="button"
              onClick={() => setImage(null)}
              aria-label="Remove attached image"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#5f6368',
                display: 'flex',
                padding: '4px',
              }}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {imageError && (
          <div style={{
            fontSize: '0.76rem',
            color: '#c5221f',
            marginBottom: '6px',
            paddingLeft: '4px',
          }}>
            {imageError}
          </div>
        )}

        {/* Input Row with Google Search Icon */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <Search size={18} color="#9aa0a6" style={{ marginTop: '6px', flexShrink: 0 }} />
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={image
              ? 'Add a note about the screenshot (optional), then press Enter...'
              : 'Paste logs, a stack trace, or a screenshot (Ctrl+V) — or describe the incident...'}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: '#202124',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.88rem',
              lineHeight: 1.5,
              resize: 'none',
              outline: 'none',
              minHeight: '48px',
            }}
          />
        </div>

        {/* Input Footer Controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid #f1f3f4',
          paddingTop: '8px',
          marginTop: '6px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/*
              A <label> wrapping the file input, rather than a button calling
              fileRef.click(). A programmatic click on a display:none input is
              ignored by the browser, so the picker never opened. Native
              label-to-input activation needs no JS and stays keyboard
              accessible, so the input is visually hidden instead of removed
              from the layout.
            */}
            {/*
              The input is a SIBLING of the label, linked by htmlFor — not
              nested inside it. Nesting gave two activation paths (label
              forwards a click to the input, whose own click bubbles back to
              the label), which double-opened the picker and lost the change
              event. It is visually hidden rather than display:none, because a
              display:none input ignores activation entirely.
            */}
            <input
              ref={fileRef}
              id="nivi-image-input"
              type="file"
              accept="image/*"
              style={{
                position: 'absolute',
                width: '1px',
                height: '1px',
                padding: 0,
                margin: '-1px',
                overflow: 'hidden',
                clip: 'rect(0,0,0,0)',
                whiteSpace: 'nowrap',
                border: 0,
              }}
            />
            <label
              htmlFor="nivi-image-input"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.74rem',
                color: '#5f6368',
                background: '#f8f9fa',
                border: '1px solid #dadce0',
                padding: '4px 10px',
                borderRadius: '16px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#f1f3f4';
                e.currentTarget.style.color = '#202124';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#f8f9fa';
                e.currentTarget.style.color = '#5f6368';
              }}
              title="Attach a screenshot of the error"
            >
              <ImageIcon size={12} />
              <span>{isAttaching ? 'Reading…' : 'Image'}</span>
            </label>
            <button
              type="button"
              onClick={handlePasteClipboard}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.74rem',
                color: '#5f6368',
                background: '#f8f9fa',
                border: '1px solid #dadce0',
                padding: '4px 10px',
                borderRadius: '16px',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#f1f3f4';
                e.currentTarget.style.color = '#202124';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#f8f9fa';
                e.currentTarget.style.color = '#5f6368';
              }}
              title="Paste from clipboard"
            >
              <Clipboard size={12} />
              <span>Paste</span>
            </button>

            {input.length > 0 && (
              <button
                type="button"
                onClick={() => setInput('')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.74rem',
                  color: '#70757a',
                  background: 'transparent',
                  padding: '4px 8px',
                  borderRadius: '16px',
                }}
              >
                <Trash2 size={12} />
                <span>Clear</span>
              </button>
            )}

            <span style={{ fontSize: '0.72rem', color: '#80868b', marginLeft: '6px' }}>
              Press <strong>Enter</strong> to triage • <strong>Shift + Enter</strong> for newline
            </span>
          </div>

          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={(!input.trim() && !image) || isLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: (input.trim() || image) && !isLoading ? '#1a73e8' : '#f1f3f4',
              color: (input.trim() || image) && !isLoading ? '#ffffff' : '#80868b',
              padding: '6px 18px',
              borderRadius: '20px',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: (input.trim() || image) && !isLoading ? 'pointer' : 'not-allowed',
              boxShadow: (input.trim() || image) && !isLoading ? '0 1px 3px rgba(26, 115, 232, 0.4)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <span>Triage</span>
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
