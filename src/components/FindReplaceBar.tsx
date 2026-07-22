import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useApp } from '@/contexts';
import { i18n } from '@/utils/i18n';
import type { Note } from '@/types';
import { CloseIcon, ChevronUpIcon, ChevronDownIcon, ReplaceIcon, ReplaceAllIcon } from './Icons';

interface FindReplaceBarProps {
  note: Note;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  richtextRef: React.RefObject<HTMLDivElement | null>;
  onApplyText: (content: string, cursor: number) => void;
  onClose: () => void;
  focusTick: number;
}

interface RichMatch {
  node: Text;
  offset: number;
}

const HIGHLIGHT_NAME = 'skrive-find';
const HIGHLIGHT_CURRENT = 'skrive-find-current';

const highlightsSupported = typeof CSS !== 'undefined' && 'highlights' in CSS;

function collectRichMatches(root: HTMLElement, query: string): RichMatch[] {
  const needle = query.toLowerCase();
  const matches: RichMatch[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = (node as Text).data.toLowerCase();
    let i = text.indexOf(needle);
    while (i !== -1) {
      matches.push({ node: node as Text, offset: i });
      i = text.indexOf(needle, i + needle.length);
    }
    node = walker.nextNode();
  }
  return matches;
}

export function FindReplaceBar({ note, textareaRef, richtextRef, onApplyText, onClose, focusTick }: FindReplaceBarProps) {
  const { state } = useApp();
  const t = i18n[state.lang];
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [current, setCurrent] = useState(0);
  const [richMatchCount, setRichMatchCount] = useState(0);
  const findInputRef = useRef<HTMLInputElement>(null);
  const richMatchesRef = useRef<RichMatch[]>([]);
  const isRichtext = note.format === 'richtext';

  // Focus the query field on open and whenever Cmd+F is pressed again
  useEffect(() => {
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, [focusTick]);

  // Matches for plaintext/markdown (case-insensitive)
  const textMatches = useMemo(() => {
    if (isRichtext || !query) return [];
    const haystack = note.content.toLowerCase();
    const needle = query.toLowerCase();
    const result: number[] = [];
    let i = haystack.indexOf(needle);
    while (i !== -1) {
      result.push(i);
      i = haystack.indexOf(needle, i + needle.length);
    }
    return result;
  }, [isRichtext, note.content, query]);

  // Matches and highlights for richtext, recomputed when content changes
  useEffect(() => {
    if (!isRichtext) return;
    const root = richtextRef.current;
    if (!root || !query) {
      richMatchesRef.current = [];
      setRichMatchCount(0);
      if (highlightsSupported) {
        CSS.highlights.delete(HIGHLIGHT_NAME);
        CSS.highlights.delete(HIGHLIGHT_CURRENT);
      }
      return;
    }

    const matches = collectRichMatches(root, query);
    richMatchesRef.current = matches;
    setRichMatchCount(matches.length);
    setCurrent(prev => Math.min(prev, Math.max(0, matches.length - 1)));

    if (highlightsSupported) {
      const ranges = matches.map(m => {
        const range = new Range();
        range.setStart(m.node, m.offset);
        range.setEnd(m.node, m.offset + query.length);
        return range;
      });
      CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
    }
  }, [isRichtext, note.content, note.id, query, richtextRef]);

  // Track the current richtext match with a separate highlight
  useEffect(() => {
    if (!isRichtext || !highlightsSupported) return;
    const match = richMatchesRef.current[current];
    if (match && query) {
      const range = new Range();
      range.setStart(match.node, match.offset);
      range.setEnd(match.node, match.offset + query.length);
      CSS.highlights.set(HIGHLIGHT_CURRENT, new Highlight(range));
    } else {
      CSS.highlights.delete(HIGHLIGHT_CURRENT);
    }
  }, [isRichtext, current, query, richMatchCount]);

  // Clear highlights when the bar closes
  useEffect(() => {
    return () => {
      if (highlightsSupported) {
        CSS.highlights.delete(HIGHLIGHT_NAME);
        CSS.highlights.delete(HIGHLIGHT_CURRENT);
      }
    };
  }, []);

  const matchCount = isRichtext ? richMatchCount : textMatches.length;

  const goTo = useCallback((index: number) => {
    if (matchCount === 0) return;
    const wrapped = ((index % matchCount) + matchCount) % matchCount;
    setCurrent(wrapped);
    if (isRichtext) {
      const match = richMatchesRef.current[wrapped];
      match?.node.parentElement?.scrollIntoView({ block: 'nearest' });
    } else {
      const textarea = textareaRef.current;
      const start = textMatches[wrapped];
      if (textarea && start !== undefined) {
        textarea.focus();
        textarea.setSelectionRange(start, start + query.length);
      }
    }
  }, [matchCount, isRichtext, textMatches, textareaRef, query]);

  const notifyRichtextInput = useCallback(() => {
    richtextRef.current?.dispatchEvent(new Event('input', { bubbles: true }));
  }, [richtextRef]);

  const replaceCurrent = useCallback(() => {
    if (matchCount === 0 || !query) return;
    if (isRichtext) {
      const match = richMatchesRef.current[current];
      if (!match) return;
      match.node.replaceData(match.offset, query.length, replacement);
      notifyRichtextInput();
    } else {
      const start = textMatches[current];
      if (start === undefined) return;
      const content = note.content.substring(0, start) + replacement + note.content.substring(start + query.length);
      onApplyText(content, start + replacement.length);
    }
  }, [matchCount, query, isRichtext, current, replacement, notifyRichtextInput, textMatches, note.content, onApplyText]);

  const replaceAll = useCallback(() => {
    if (matchCount === 0 || !query) return;
    if (isRichtext) {
      // Reverse order keeps earlier offsets valid while replacing
      for (const match of [...richMatchesRef.current].reverse()) {
        match.node.replaceData(match.offset, query.length, replacement);
      }
      notifyRichtextInput();
    } else {
      let content = note.content;
      for (const start of [...textMatches].reverse()) {
        content = content.substring(0, start) + replacement + content.substring(start + query.length);
      }
      onApplyText(content, 0);
    }
    setCurrent(0);
  }, [matchCount, query, isRichtext, replacement, notifyRichtextInput, textMatches, note.content, onApplyText]);

  const handleFindKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      goTo(e.shiftKey ? current - 1 : current + 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleReplaceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      replaceCurrent();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="find-bar" role="search">
      <div className="find-bar-row">
        <button
          className={`find-bar-toggle ${showReplace ? 'active' : ''}`}
          onClick={() => setShowReplace(!showReplace)}
          title={t.replace}
          aria-label={t.replace}
          aria-expanded={showReplace}
        >
          <ReplaceIcon size={15} />
        </button>
        <input
          ref={findInputRef}
          type="text"
          className="find-bar-input"
          placeholder={t.findPlaceholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setCurrent(0); }}
          onKeyDown={handleFindKeyDown}
          aria-label={t.find}
        />
        <span className="find-bar-count">
          {query ? (matchCount > 0 ? `${current + 1}/${matchCount}` : t.noMatches) : ''}
        </span>
        <button
          className="find-bar-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => goTo(current - 1)}
          disabled={matchCount === 0}
          title={t.prevMatch}
          aria-label={t.prevMatch}
        >
          <ChevronUpIcon size={16} />
        </button>
        <button
          className="find-bar-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => goTo(current + 1)}
          disabled={matchCount === 0}
          title={t.nextMatch}
          aria-label={t.nextMatch}
        >
          <ChevronDownIcon size={16} />
        </button>
        <button
          className="find-bar-btn"
          onClick={onClose}
          title={t.close}
          aria-label={t.close}
        >
          <CloseIcon size={14} />
        </button>
      </div>
      {showReplace && (
        <div className="find-bar-row">
          <span className="find-bar-toggle-spacer" />
          <input
            type="text"
            className="find-bar-input"
            placeholder={t.replacePlaceholder}
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={handleReplaceKeyDown}
            aria-label={t.replace}
          />
          <button className="find-bar-text-btn" onClick={replaceCurrent} disabled={matchCount === 0}>
            <ReplaceIcon size={13} />
            {t.replace}
          </button>
          <button className="find-bar-text-btn" onClick={replaceAll} disabled={matchCount === 0}>
            <ReplaceAllIcon size={13} />
            {t.replaceAll}
          </button>
        </div>
      )}
    </div>
  );
}
