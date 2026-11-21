import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { EditorView } from '@codemirror/view';
import { useApp } from '@/contexts';
import { i18n } from '@/utils/i18n';
import { setFindMatches } from '@/editor/find';
import { CloseIcon, ChevronUpIcon, ChevronDownIcon, ReplaceIcon, ReplaceAllIcon } from './Icons';

interface FindReplaceBarProps {
  content: string;
  viewRef: React.RefObject<EditorView | null>;
  onClose: () => void;
  focusTick: number;
}

export function FindReplaceBar({ content, viewRef, onClose, focusTick }: FindReplaceBarProps) {
  const { state } = useApp();
  const t = i18n[state.lang];
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [current, setCurrent] = useState(0);
  const findInputRef = useRef<HTMLInputElement>(null);

  // Focus the query field on open and whenever Cmd+F is pressed again
  useEffect(() => {
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, [focusTick]);

  // Case-insensitive offsets, from the editor's document: React's content
  // can trail it, and stale offsets would fall outside the text
  const matches = useMemo(() => {
    if (!query) return [];
    const haystack = (viewRef.current?.state.doc.toString() ?? content).toLowerCase();
    const needle = query.toLowerCase();
    const result: number[] = [];
    for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) {
      result.push(i);
    }
    return result;
  }, [content, query, viewRef]);

  const index = Math.min(current, Math.max(0, matches.length - 1));

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setFindMatches.of({
      ranges: matches.map(from => ({ from, to: from + query.length })),
      current: index
    }) });
  }, [matches, query, index, viewRef]);

  // Clear highlights when the bar closes
  useEffect(() => {
    const view = viewRef.current;
    return () => view?.dispatch({ effects: setFindMatches.of({ ranges: [], current: 0 }) });
  }, [viewRef]);

  // Offsets can be stale right after a restore replaced the text
  const isMatch = useCallback((view: EditorView, from: number) =>
    from + query.length <= view.state.doc.length &&
    view.state.sliceDoc(from, from + query.length).toLowerCase() === query.toLowerCase(), [query]);

  const goTo = useCallback((next: number) => {
    const view = viewRef.current;
    if (matches.length === 0 || !view) return;
    const wrapped = ((next % matches.length) + matches.length) % matches.length;
    if (!isMatch(view, matches[wrapped])) return;
    setCurrent(wrapped);
    view.dispatch({
      selection: { anchor: matches[wrapped], head: matches[wrapped] + query.length },
      scrollIntoView: true
    });
  }, [matches, query, viewRef, isMatch]);

  const replaceCurrent = () => {
    const view = viewRef.current;
    const from = matches[index];
    if (!view || from === undefined || !isMatch(view, from)) return;
    view.dispatch({ changes: { from, to: from + query.length, insert: replacement } });
  };

  const replaceAll = () => {
    const view = viewRef.current;
    if (!view || matches.length === 0) return;
    view.dispatch({ changes: matches.filter(from => isMatch(view, from)).map(from => ({ from, to: from + query.length, insert: replacement })) });
    setCurrent(0);
  };

  const handleKeyDown = (onEnter: (shift: boolean) => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter(e.shiftKey);
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
          onKeyDown={handleKeyDown(shift => goTo(shift ? index - 1 : index + 1))}
          aria-label={t.find}
        />
        <span className="find-bar-count">
          {query ? (matches.length > 0 ? `${index + 1}/${matches.length}` : t.noMatches) : ''}
        </span>
        <button
          className="find-bar-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => goTo(index - 1)}
          disabled={matches.length === 0}
          title={t.prevMatch}
          aria-label={t.prevMatch}
        >
          <ChevronUpIcon size={16} />
        </button>
        <button
          className="find-bar-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => goTo(index + 1)}
          disabled={matches.length === 0}
          title={t.nextMatch}
          aria-label={t.nextMatch}
        >
          <ChevronDownIcon size={16} />
        </button>
        <button className="find-bar-btn" onClick={onClose} title={t.close} aria-label={t.close}>
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
            onKeyDown={handleKeyDown(() => replaceCurrent())}
            aria-label={t.replace}
          />
          <button className="find-bar-text-btn" onClick={replaceCurrent} disabled={matches.length === 0}>
            <ReplaceIcon size={13} />
            {t.replace}
          </button>
          <button className="find-bar-text-btn" onClick={replaceAll} disabled={matches.length === 0}>
            <ReplaceAllIcon size={13} />
            {t.replaceAll}
          </button>
        </div>
      )}
    </div>
  );
}
