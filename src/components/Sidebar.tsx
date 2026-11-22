import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useApp } from '@/contexts';
import { i18n } from '@/utils/i18n';
import { isMac, isFirefox, isSafari, isIpad, isPWAInstalled } from '@/utils';
import { getShortcutLabels } from '@/utils/shortcuts';
import type { Note, Folder, TreeClipboard } from '@/types';
import { formatDate } from '@/utils/helpers';
import {
  PlusIcon,
  FolderIcon,
  FolderOutputIcon,
  NoteIcon,
  KeyboardIcon,
  EncryptedIcon,
  DeleteIcon,
  EditIcon,
  CopyIcon,
  ArrowForwardIcon,
  SortIcon,
  TransferIcon,
  DownloadIcon,
  UploadIcon,
  ArticleIcon,
  FolderCogIcon,
  FolderCheckIcon,
  FolderDownIcon,
  CutIcon,
  ClipboardIcon
} from './Icons';
import { PassphraseDialog } from './PassphraseDialog';
import { FOCUS_EDITOR_EVENT } from './MarkdownEditor';
import { TrashDialog } from './TrashDialog';
import { exportNotesToFolder } from '@/utils/fileSystem';
import { TRASH_DAYS } from '@/utils/storage';

interface TreeItemProps {
  folder: Folder;
  folders: Folder[];
  notes: Note[];
  selectedNoteId: string | null;
  multiSelectedIds: Set<string>;
  onSelectNote: (id: string, e: React.MouseEvent) => void;
  onToggleFolder: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, type: 'folder' | 'note', id: string) => void;
  onMoveNote?: (noteId: string, targetFolderId: string | null) => void;
  editingFolderId: string | null;
  editingFolderName: string;
  onEditingFolderNameChange: (name: string) => void;
  onSaveFolderName: () => void;
  onFolderKeyDown: (e: React.KeyboardEvent) => void;
  untitledText: string;
  sortMode: NoteSortMode;
  editingNoteId: string | null;
  editingNoteName: string;
  onEditingNoteNameChange: (name: string) => void;
  onSaveNoteName: () => void;
  onNoteNameKeyDown: (e: React.KeyboardEvent) => void;
  focusId: string | null;
  onRowFocus: (id: string) => void;
  registerRowRef: (id: string, el: HTMLDivElement | null) => void;
  branch: Branch;
}

// Where a row sits under its folder: a line for each ancestor with more
// rows below it, and whether the row is its folder's last. null at the top
type Branch = { guides: boolean[]; isLast: boolean } | null;

// File-tree lines, drawn in CSS so they run unbroken from row to row
function TreeGuide({ branch }: { branch: Branch }) {
  if (!branch) return null;
  return (
    <span className="tree-guide" aria-hidden="true">
      {branch.guides.map((more, i) => <span key={i} className={more ? 'tree-guide-line' : 'tree-guide-space'} />)}
      <span className={branch.isLast ? 'tree-guide-last' : 'tree-guide-mid'} />
    </span>
  );
}

const childBranch = (parent: Branch, isLast: boolean): Branch =>
  ({ guides: parent ? [...parent.guides, !parent.isLast] : [], isLast });

export type NoteSortMode = 'alpha' | 'recent';

type FooterPopup = 'privacy' | 'guide' | 'shortcuts' | 'lang' | 'backup';

// Up and down arrows move between the buttons of a popup or menu
function moveFocus(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'));
  if (items.length === 0) return;
  e.preventDefault();
  const i = items.indexOf(document.activeElement as HTMLElement);
  const down = e.key === 'ArrowDown';
  const next = i === -1 ? (down ? 0 : items.length - 1) : (i + (down ? 1 : items.length - 1)) % items.length;
  items[next].focus();
}

function compareNotes(a: Note, b: Note, sortMode: NoteSortMode, untitledText: string, lang: string): number {
  if (sortMode === 'recent') {
    return b.updatedAt - a.updatedAt;
  }
  return (a.title || untitledText).localeCompare(b.title || untitledText, lang);
}

function TreeFolder({ folder, folders, notes, selectedNoteId, multiSelectedIds, onSelectNote, onToggleFolder, onContextMenu, onMoveNote, editingFolderId, editingFolderName, onEditingFolderNameChange, onSaveFolderName, onFolderKeyDown, untitledText, sortMode, editingNoteId, editingNoteName, onEditingNoteNameChange, onSaveNoteName, onNoteNameKeyDown, focusId, onRowFocus, registerRowRef, branch, lang }: TreeItemProps & { lang: string }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const childFolders = useMemo(
    () => folders.filter(f => f.parentId === folder.id).sort((a, b) => a.name.localeCompare(b.name, lang)),
    [folders, folder.id, lang]
  );
  const childNotes = useMemo(
    () => notes.filter(n => n.parentId === folder.id).sort((a, b) => compareNotes(a, b, sortMode, untitledText, lang)),
    [notes, folder.id, untitledText, sortMode, lang]
  );
  const hasChildren = childFolders.length > 0 || childNotes.length > 0;
  const isEditing = editingFolderId === folder.id;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const noteId = e.dataTransfer.getData('text/plain');
    if (noteId && onMoveNote) {
      onMoveNote(noteId, folder.id);
    }
  };

  return (
    <div className="tree-item" role="none">
      <div
        className={`tree-item-row ${isDragOver ? 'drag-over' : ''}`}
        role={isEditing ? undefined : 'treeitem'}
        aria-expanded={isEditing ? undefined : folder.expanded}
        tabIndex={isEditing ? -1 : focusId === folder.id ? 0 : -1}
        data-item-id={folder.id}
        ref={(el) => registerRowRef(folder.id, el)}
        onFocus={() => onRowFocus(folder.id)}
        onClick={() => !isEditing && onToggleFolder(folder.id)}
        onContextMenu={(e) => onContextMenu(e, 'folder', folder.id)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <TreeGuide branch={branch} />
        {isEditing ? (
          <input
            type="text"
            className="folder-edit-input"
            value={editingFolderName}
            onChange={(e) => onEditingFolderNameChange(e.target.value)}
            onBlur={onSaveFolderName}
            onKeyDown={onFolderKeyDown}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="tree-label">
            {folder.name}
            {/* A collapsed folder hides rows; aria-expanded says so to screen readers */}
            {!folder.expanded && hasChildren && <span className="tree-hint" aria-hidden="true"> …</span>}
          </span>
        )}
      </div>
      {folder.expanded && hasChildren && (
        <div className="tree-children expanded" role="group">
          {childFolders.map((child, i) => (
            <TreeFolder
              key={child.id}
              branch={childBranch(branch, i === childFolders.length - 1 && childNotes.length === 0)}
              folder={child}
              folders={folders}
              notes={notes}
              selectedNoteId={selectedNoteId}
              multiSelectedIds={multiSelectedIds}
              onSelectNote={onSelectNote}
              onToggleFolder={onToggleFolder}
              onContextMenu={onContextMenu}
              onMoveNote={onMoveNote}
              editingFolderId={editingFolderId}
              editingFolderName={editingFolderName}
              onEditingFolderNameChange={onEditingFolderNameChange}
              onSaveFolderName={onSaveFolderName}
              onFolderKeyDown={onFolderKeyDown}
              untitledText={untitledText}
              sortMode={sortMode}
              editingNoteId={editingNoteId}
              editingNoteName={editingNoteName}
              onEditingNoteNameChange={onEditingNoteNameChange}
              onSaveNoteName={onSaveNoteName}
              onNoteNameKeyDown={onNoteNameKeyDown}
              focusId={focusId}
              onRowFocus={onRowFocus}
              registerRowRef={registerRowRef}
              lang={lang}
            />
          ))}
          {childNotes.map((note, i) => (
            <TreeNote
              key={note.id}
              branch={childBranch(branch, i === childNotes.length - 1)}
              note={note}
              isSelected={note.id === selectedNoteId}
              isMultiSelected={multiSelectedIds.has(note.id)}
              onSelect={onSelectNote}
              onContextMenu={onContextMenu}
              onMoveNote={onMoveNote}
              untitledText={untitledText}
              editingNoteId={editingNoteId}
              editingNoteName={editingNoteName}
              onEditingNoteNameChange={onEditingNoteNameChange}
              onSaveNoteName={onSaveNoteName}
              onNoteNameKeyDown={onNoteNameKeyDown}
              focusId={focusId}
              onRowFocus={onRowFocus}
              registerRowRef={registerRowRef}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface TreeNoteProps {
  note: Note;
  isSelected: boolean;
  isMultiSelected: boolean;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent, type: 'folder' | 'note', id: string) => void;
  onMoveNote?: (noteId: string, targetFolderId: string | null) => void;
  untitledText: string;
  editingNoteId: string | null;
  editingNoteName: string;
  onEditingNoteNameChange: (name: string) => void;
  onSaveNoteName: () => void;
  onNoteNameKeyDown: (e: React.KeyboardEvent) => void;
  focusId: string | null;
  onRowFocus: (id: string) => void;
  registerRowRef: (id: string, el: HTMLDivElement | null) => void;
  branch: Branch;
}

function TreeNote({ note, isSelected, isMultiSelected, onSelect, onContextMenu, onMoveNote, untitledText, editingNoteId, editingNoteName, onEditingNoteNameChange, onSaveNoteName, onNoteNameKeyDown, focusId, onRowFocus, registerRowRef, branch }: TreeNoteProps) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', note.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  // Dropping a note onto another note places it next to that note
  // (same folder, or the root) - this is how notes leave folders
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId && draggedId !== note.id && onMoveNote) {
      onMoveNote(draggedId, note.parentId);
    }
  };

  const isEditing = editingNoteId === note.id;

  return (
    <div className="tree-item" role="none">
      <div
        className={`tree-item-row ${isSelected ? 'active' : ''} ${isMultiSelected ? 'multi-selected' : ''}`}
        role={isEditing ? undefined : 'treeitem'}
        aria-selected={isEditing ? undefined : isSelected || isMultiSelected}
        tabIndex={isEditing ? -1 : focusId === note.id ? 0 : -1}
        data-item-id={note.id}
        ref={(el) => registerRowRef(note.id, el)}
        onFocus={() => onRowFocus(note.id)}
        onClick={(e) => !isEditing && onSelect(note.id, e)}
        onContextMenu={(e) => onContextMenu(e, 'note', note.id)}
        draggable={!isEditing}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <TreeGuide branch={branch} />
        {isEditing ? (
          <input
            type="text"
            className="folder-edit-input"
            value={editingNoteName}
            onChange={(e) => onEditingNoteNameChange(e.target.value)}
            onBlur={onSaveNoteName}
            onKeyDown={onNoteNameKeyDown}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="tree-label">{note.title || untitledText}</span>
        )}
      </div>
    </div>
  );
}

export function Sidebar() {
  const {
    state,
    createNote,
    duplicateNote,
    createFolder,
    deleteNote,
    deleteNotes,
    deleteFolder,
    updateNote,
    updateFolder,
    selectNote,
    setTagFilter,
    setSearchQuery,
    setLang,
    getFilteredNotes,
    moveNote,
    updateTag,
    deleteTag,
    exportAllData,
    importData,
    importNote,
    autoBackupEnabled,
    lastBackupTime,
    backupError,
    backupPermissionNeeded,
    reactivateBackup,
    backupKeyStale,
    renewBackupProtection,
    enableAutoBackup,
    disableAutoBackup,
    restoreFromBackup,
    fsAccessSupported,
    storagePersisted,
    recoveryCopies,
    pasteItems
  } = useApp();

  const t = i18n[state.lang];
  const filteredNotes = getFilteredNotes();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'folder' | 'note' | 'sidebar'; id: string } | null>(null);
  const [tagContextMenu, setTagContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteName, setEditingNoteName] = useState('');
  const [popup, setPopup] = useState<FooterPopup | null>(null);
  const popupTriggers = useRef(new Map<FooterPopup, HTMLButtonElement>());
  const popupRef = useRef<HTMLDivElement>(null);
  const [showMoveList, setShowMoveList] = useState(false);
  const [clipboard, setClipboard] = useState<TreeClipboard | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [showPassphraseDialog, setShowPassphraseDialog] = useState(false);
  const [showRenewDialog, setShowRenewDialog] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [exportResult, setExportResult] = useState<{ folder: string } | 'failed' | null>(null);
  const [sortMode, setSortMode] = useState<NoteSortMode>(() =>
    localStorage.getItem('skrive-sort') === 'recent' ? 'recent' : 'alpha'
  );
  // Multi-selection (Cmd/Ctrl+Click toggles, Shift+Click selects a range)
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const selectionAnchorRef = useRef<string | null>(null);
  // Roving tabindex: the tree row that currently holds keyboard focus
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const registerRowRef = (id: string, el: HTMLDivElement | null) => {
    if (el) {
      rowRefs.current.set(id, el);
    } else {
      rowRefs.current.delete(id);
    }
  };

  const sidebarRef = useRef<HTMLElement>(null);

  const toggleSortMode = () => {
    const next: NoteSortMode = sortMode === 'alpha' ? 'recent' : 'alpha';
    setSortMode(next);
    localStorage.setItem('skrive-sort', next);
  };

  const trashButtonRef = useRef<HTMLButtonElement>(null);
  const closeTrash = useCallback(() => {
    setShowTrash(false);
    trashButtonRef.current?.focus();
  }, []);

  const exportFiles = async () => {
    try {
      const folder = await exportNotesToFolder(state.notes, state.folders, t.untitled);
      if (folder) setExportResult({ folder });
    } catch (error) {
      console.warn('Export to folder failed:', error);
      setExportResult('failed');
    }
  };

  const togglePopup = (name: FooterPopup) => setPopup(open => open === name ? null : name);

  const popupProps = (name: FooterPopup) => ({
    ref: popupRef,
    tabIndex: -1,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    // A click on a non-focusable spot inside has no relatedTarget
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setPopup(null);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      moveFocus(e);
      if (e.key === 'Escape') popupTriggers.current.get(name)?.focus();
    }
  });

  const footerButton = (name: FooterPopup, label: string, content: React.ReactNode, ariaLabel = label) => (
    <button
      className="sidebar-footer-btn"
      ref={el => { if (el) popupTriggers.current.set(name, el); }}
      onClick={(e) => { e.stopPropagation(); togglePopup(name); setExportResult(null); }}
      title={label}
      aria-label={ariaLabel}
      aria-expanded={popup === name}
    >
      {content}
    </button>
  );

  // Focus moves into a popup when it opens, so Tab and the arrow keys reach it
  useEffect(() => {
    if (!popup) return;
    const target = popupRef.current?.querySelector<HTMLElement>('button, a[href]') ?? popupRef.current;
    target?.focus();
  }, [popup]);

  // Context menus take focus like a native menu
  useEffect(() => {
    if (contextMenu || tagContextMenu) contextMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [contextMenu, tagContextMenu]);

  // Close popups when clicking outside sidebar
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setPopup(null);
        setContextMenu(null);
        setTagContextMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // macOS Safari fires a ghost click after contextmenu (right-click or Ctrl+click)
  // that would close the menu at once; stop it in the capture phase before React sees it.
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const mac = isMac();
    const stopSecondaryClick = (e: MouseEvent) => {
      if (e.button !== 0 || (mac && e.ctrlKey)) {
        e.stopPropagation();
      }
    };
    sidebar.addEventListener('click', stopSecondaryClick, true);
    return () => sidebar.removeEventListener('click', stopSecondaryClick, true);
  }, []);

  // Escape closes popups and context menus (WCAG: keyboard-dismissable)
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setPopup(null);
      setContextMenu(null);
      setTagContextMenu(null);
      setMultiSelected(new Set());
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  const rootFolders = useMemo(() =>
    state.folders.filter(f => f.parentId === null).sort((a, b) => a.name.localeCompare(b.name, state.lang)),
    [state.folders, state.lang]
  );
  const rootNotes = useMemo(() =>
    filteredNotes.filter(n => n.parentId === null).sort((a, b) => compareNotes(a, b, sortMode, t.untitled, state.lang)),
    [filteredNotes, state.lang, t.untitled, sortMode]
  );
  // While searching, folders are ignored and all matches are shown flat:
  // matches inside collapsed folders would otherwise stay invisible
  const isSearching = state.searchQuery.trim().length > 0;
  const searchResults = useMemo(() =>
    isSearching ? [...filteredNotes].sort((a, b) => b.updatedAt - a.updatedAt) : [],
    [isSearching, filteredNotes]
  );

  // Visible notes in render order; Shift+Click ranges follow this list
  const visibleNoteIds = useMemo(() => {
    if (isSearching) return searchResults.map(n => n.id);
    const ids: string[] = [];
    const collectFolder = (folderId: string) => {
      const childFolders = state.folders
        .filter(f => f.parentId === folderId)
        .sort((a, b) => a.name.localeCompare(b.name, state.lang));
      for (const child of childFolders) {
        if (child.expanded) collectFolder(child.id);
      }
      const childNotes = filteredNotes
        .filter(n => n.parentId === folderId)
        .sort((a, b) => compareNotes(a, b, sortMode, t.untitled, state.lang));
      ids.push(...childNotes.map(n => n.id));
    };
    for (const folder of rootFolders) {
      if (folder.expanded) collectFolder(folder.id);
    }
    ids.push(...rootNotes.map(n => n.id));
    return ids;
  }, [isSearching, searchResults, state.folders, state.lang, filteredNotes, sortMode, t.untitled, rootFolders, rootNotes]);

  // Folders AND notes in render order, for arrow-key navigation. Unlike
  // visibleNoteIds, a collapsed folder still contributes its own row
  type TreeItemRef = { type: 'folder' | 'note'; id: string; parentId: string | null };
  const visibleTreeItems = useMemo<TreeItemRef[]>(() => {
    if (isSearching) return searchResults.map(n => ({ type: 'note' as const, id: n.id, parentId: n.parentId }));
    const items: TreeItemRef[] = [];
    const collect = (parentId: string | null) => {
      const childFolders = state.folders
        .filter(f => f.parentId === parentId)
        .sort((a, b) => a.name.localeCompare(b.name, state.lang));
      for (const f of childFolders) {
        items.push({ type: 'folder', id: f.id, parentId: f.parentId });
        if (f.expanded) collect(f.id);
      }
      const childNotes = filteredNotes
        .filter(n => n.parentId === parentId)
        .sort((a, b) => compareNotes(a, b, sortMode, t.untitled, state.lang));
      items.push(...childNotes.map(n => ({ type: 'note' as const, id: n.id, parentId: n.parentId })));
    };
    collect(null);
    return items;
  }, [isSearching, searchResults, state.folders, state.lang, filteredNotes, sortMode, t.untitled]);

  // Tab lands on the open note when visible, else the first row; a stale
  // focusedItemId (deleted row) falls back the same way
  const defaultFocusId = useMemo(() => {
    if (state.selectedNoteId && visibleTreeItems.some(i => i.id === state.selectedNoteId)) {
      return state.selectedNoteId;
    }
    return visibleTreeItems[0]?.id ?? null;
  }, [state.selectedNoteId, visibleTreeItems]);
  const effectiveFocusId =
    focusedItemId && visibleTreeItems.some(i => i.id === focusedItemId)
      ? focusedItemId
      : defaultFocusId;

  // Finder-style selection: plain click opens a note, Cmd/Ctrl+Click
  // toggles it in the selection, Shift+Click selects the range from the
  // last clicked note
  const handleSelectNote = (id: string, e: React.MouseEvent) => {
    setFocusedItemId(id);
    // Without an earlier click, the range starts at the open note
    const anchor = selectionAnchorRef.current ?? state.selectedNoteId;
    if (e.shiftKey && anchor) {
      const from = visibleNoteIds.indexOf(anchor);
      const to = visibleNoteIds.indexOf(id);
      if (from !== -1 && to !== -1) {
        const [start, end] = from < to ? [from, to] : [to, from];
        setMultiSelected(new Set(visibleNoteIds.slice(start, end + 1)));
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) {
      const next = new Set(multiSelected);
      // The open note is part of the selection being extended
      if (next.size === 0 && state.selectedNoteId && state.selectedNoteId !== id) {
        next.add(state.selectedNoteId);
      }
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      setMultiSelected(next);
      selectionAnchorRef.current = id;
      return;
    }
    setMultiSelected(new Set());
    selectionAnchorRef.current = id;
    selectNote(id);
  };
  const sortedTags = useMemo(() =>
    [...state.tags].sort((a, b) => a.name.localeCompare(b.name, state.lang)),
    [state.tags, state.lang]
  );

  const handleToggleFolder = (id: string) => {
    const folder = state.folders.find(f => f.id === id);
    if (folder) {
      updateFolder(id, { expanded: !folder.expanded });
    }
  };

  const handleContextMenu = (e: React.MouseEvent, type: 'folder' | 'note' | 'sidebar', id: string) => {
    e.preventDefault();
    // Right-clicking outside the current multi-selection resets it
    if (type === 'note' && !multiSelected.has(id)) {
      setMultiSelected(new Set());
    }
    setShowMoveList(false);
    setContextMenu({ x: e.clientX, y: e.clientY, type, id });
  };

  const handleSidebarContextMenu = (e: React.MouseEvent) => {
    // Only on the tree background, not on its rows
    if (e.target === e.currentTarget) {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, type: 'sidebar', id: '' });
    }
  };

  // Focus goes back to the row unless the chosen action moved it
  const closeContextMenu = () => {
    const id = contextMenu?.id;
    setContextMenu(null);
    if (id) requestAnimationFrame(() => { if (document.activeElement === document.body) rowRefs.current.get(id)?.focus(); });
  };
  const closeTagContextMenu = () => setTagContextMenu(null);

  const handleTagContextMenu = (e: React.MouseEvent, tagId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setTagContextMenu({ x: e.clientX, y: e.clientY, id: tagId });
  };

  const handleDeleteTag = () => {
    if (!tagContextMenu) return;
    deleteTag(tagContextMenu.id);
    closeTagContextMenu();
  };

  const handleStartEditTag = () => {
    if (!tagContextMenu) return;
    const tag = state.tags.find(t => t.id === tagContextMenu.id);
    if (tag) {
      setEditingTagId(tag.id);
      setEditingTagName(tag.name);
    }
    closeTagContextMenu();
  };

  const handleSaveTagName = () => {
    if (editingTagId && editingTagName.trim()) {
      updateTag(editingTagId, { name: editingTagName.trim() });
    }
    setEditingTagId(null);
    setEditingTagName('');
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveTagName();
    } else if (e.key === 'Escape') {
      setEditingTagId(null);
      setEditingTagName('');
    }
  };

  // Dropping on the tree background (folders and notes stop propagation)
  // moves the note out to the root level
  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const noteId = e.dataTransfer.getData('text/plain');
    if (noteId) {
      moveNote(noteId, null);
    }
  };

  // Move the clicked note (or the whole multi-selection) to a folder or,
  // with null, out of folders
  const handleMoveTo = (folderId: string | null) => {
    if (!contextMenu) return;
    if (contextMenu.type === 'folder') {
      pasteItems({ mode: 'move', notes: [], folders: [contextMenu.id] }, folderId);
    } else if (multiSelected.size > 1 && multiSelected.has(contextMenu.id)) {
      for (const id of multiSelected) {
        moveNote(id, folderId);
      }
      setMultiSelected(new Set());
    } else {
      moveNote(contextMenu.id, folderId);
    }
    // A collapsed target would hide the moved notes
    if (folderId && !state.folders.find(f => f.id === folderId)?.expanded) updateFolder(folderId, { expanded: true });
    closeContextMenu();
  };

  // The rows a copy or cut acts on: the multi-selection when the row is in it
  const clipboardFor = (type: 'folder' | 'note', id: string, mode: TreeClipboard['mode']): TreeClipboard =>
    type === 'note' && multiSelected.size > 1 && multiSelected.has(id)
      ? { mode, notes: [...multiSelected], folders: [] }
      : { mode, notes: type === 'note' ? [id] : [], folders: type === 'folder' ? [id] : [] };

  // Into the folder, next to the note, or at the top level; a cut is used up
  // by its paste, a copy can be pasted again
  const pasteAt = (type: 'folder' | 'note' | 'sidebar', id: string, move = false) => {
    if (!clipboard) return;
    let target = type === 'folder' ? id : type === 'note' ? state.notes.find(n => n.id === id)?.parentId ?? null : null;
    const moving = move || clipboard.mode === 'move';
    // Pasting a cut item on the folder it is already in moves it out, next to that folder
    const parentOf = (itemId: string) => (state.notes.find(n => n.id === itemId) ?? state.folders.find(f => f.id === itemId))?.parentId ?? null;
    if (moving && type === 'folder' && [...clipboard.notes, ...clipboard.folders].every(itemId => parentOf(itemId) === id)) {
      target = parentOf(id);
    }
    pasteItems(move ? { ...clipboard, mode: 'move' } : clipboard, target);
    expandFolder(target);
    if (moving) setClipboard(null);
  };

  // Cut rows show dimmed until the paste, as in Finder and Explorer
  useEffect(() => {
    const cut = new Set(clipboard?.mode === 'move' ? [...clipboard.notes, ...clipboard.folders] : []);
    rowRefs.current.forEach((el, id) => el.classList.toggle('cut', cut.has(id)));
  });

  // Every folder, depth first and by name, for "Move to folder"
  const folderList = useMemo(() => {
    const list: { folder: Folder; depth: number }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      state.folders
        .filter(f => f.parentId === parentId)
        .sort((a, b) => a.name.localeCompare(b.name, state.lang))
        .forEach(folder => { list.push({ folder, depth }); walk(folder.id, depth + 1); });
    };
    walk(null, 0);
    return list;
  }, [state.folders, state.lang]);

  const deleteItem = (type: 'folder' | 'note', id: string): boolean => {
    if (type === 'folder') {
      // Folder deletion is recursive and has no undo, so confirm it;
      // note deletion shows an undo toast instead
      if (!confirm(t.confirmDeleteFolder)) return false;
      deleteFolder(id);
    } else if (multiSelected.size > 1 && multiSelected.has(id)) {
      deleteNotes(Array.from(multiSelected));
      setMultiSelected(new Set());
    } else {
      deleteNote(id);
    }
    return true;
  };

  const handleDelete = () => {
    if (!contextMenu || contextMenu.type === 'sidebar') return;
    deleteItem(contextMenu.type, contextMenu.id);
    closeContextMenu();
  };

  const createFolderAt = (parentId: string | null) => {
    expandFolder(parentId);
    const newFolderId = createFolder(parentId);
    // Start editing the new folder name immediately
    setEditingFolderId(newFolderId);
    setEditingFolderName(t.newFolder);
  };

  // A collapsed parent would hide a new item in it
  const expandFolder = (parentId: string | null) => {
    if (parentId) {
      const parent = state.folders.find(f => f.id === parentId);
      if (parent && !parent.expanded) {
        updateFolder(parentId, { expanded: true });
      }
    }
  };

  const handleNewInContext = (type: 'note' | 'folder') => {
    if (!contextMenu) return;
    const parentId = contextMenu.type === 'folder' ? contextMenu.id : null;
    if (type === 'note') {
      expandFolder(parentId);
      createNote(parentId);
    } else {
      createFolderAt(parentId);
    }
    closeContextMenu();
  };

  const handleDuplicate = () => {
    if (!contextMenu || contextMenu.type !== 'note') return;
    duplicateNote(contextMenu.id);
    closeContextMenu();
  };

  const startEditNote = (id: string) => {
    const note = state.notes.find(n => n.id === id);
    if (note) {
      setEditingNoteId(note.id);
      setEditingNoteName(note.title);
    }
  };

  const handleStartEditNote = () => {
    if (!contextMenu || contextMenu.type !== 'note') return;
    startEditNote(contextMenu.id);
    closeContextMenu();
  };

  const handleSaveNoteName = () => {
    if (editingNoteId && editingNoteName.trim()) {
      updateNote(editingNoteId, { title: editingNoteName.trim() });
    }
    setEditingNoteId(null);
    setEditingNoteName('');
  };

  const handleNoteNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveNoteName();
    } else if (e.key === 'Escape') {
      setEditingNoteId(null);
      setEditingNoteName('');
    }
  };

  const startEditFolder = (id: string) => {
    const folder = state.folders.find(f => f.id === id);
    if (folder) {
      setEditingFolderId(folder.id);
      setEditingFolderName(folder.name);
    }
  };

  const handleStartEditFolder = () => {
    if (!contextMenu || contextMenu.type !== 'folder') return;
    startEditFolder(contextMenu.id);
    closeContextMenu();
  };

  const handleSaveFolderName = () => {
    if (editingFolderId && editingFolderName.trim()) {
      updateFolder(editingFolderId, { name: editingFolderName.trim() });
    }
    setEditingFolderId(null);
    setEditingFolderName('');
  };

  const handleFolderKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveFolderName();
    } else if (e.key === 'Escape') {
      setEditingFolderId(null);
      setEditingFolderName('');
    }
  };

  // From the search field and the buttons above the tree, the arrow keys
  // go straight into the tree, to its tab stop
  const arrowsIntoTree = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const row = sidebarRef.current?.querySelector<HTMLElement>('[role="tree"] [tabindex="0"]');
    if (!row) return;
    e.preventDefault();
    row.focus();
  };

  const focusRow = (id: string) => {
    setFocusedItemId(id);
    rowRefs.current.get(id)?.focus();
  };

  // Plain arrow keys open the note they land on, as in a mail or notes app;
  // focus stays in the tree
  const goToRow = (id: string) => {
    focusRow(id);
    if (!state.notes.some(n => n.id === id)) return;
    setMultiSelected(new Set());
    selectionAnchorRef.current = id;
    selectNote(id);
  };

  // Finder/Explorer-style keyboard navigation for the tree
  const handleTreeKeyDown = (e: React.KeyboardEvent) => {
    // Keys typed in a rename input must never drive tree navigation
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const items = visibleTreeItems;
    if (items.length === 0) return;
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.code === 'KeyA') {
      e.preventDefault();
      setMultiSelected(new Set(items.filter(i => i.type === 'note').map(i => i.id)));
      return;
    }
    // The row that actually holds DOM focus wins over remembered state
    const activeId = (document.activeElement as HTMLElement | null)?.dataset?.itemId;
    const index = items.findIndex(i => i.id === (activeId ?? effectiveFocusId));
    const item = index === -1 ? null : items[index];
    if (e.key === 'F2') {
      if (!item) return;
      e.preventDefault();
      if (item.type === 'note') {
        startEditNote(item.id);
      } else {
        startEditFolder(item.id);
      }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.code === 'KeyC' || e.code === 'KeyX')) {
      if (!item) return;
      e.preventDefault();
      setClipboard(clipboardFor(item.type, item.id, e.code === 'KeyX' ? 'move' : 'copy'));
      return;
    }
    // Cmd+Opt+V moves what was copied, as in Finder
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === 'KeyV' && (!e.altKey || isMac())) {
      if (!clipboard) return;
      e.preventDefault();
      pasteAt(item?.type ?? 'sidebar', item?.id ?? '', e.altKey);
      return;
    }
    // Escape in the tree drops a cut; a copy stays for further pastes
    if (e.key === 'Escape' && clipboard?.mode === 'move') {
      setClipboard(null);
      return;
    }
    // Tab goes straight to the open note's text, past the footer and toolbar
    if (e.key === 'Tab' && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey && state.selectedNoteId) {
      e.preventDefault();
      window.dispatchEvent(new Event(FOCUS_EDITOR_EVENT));
      return;
    }
    // Chrome on macOS sends no contextmenu event for Shift+F10
    if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
      const rect = item && rowRefs.current.get(item.id)?.getBoundingClientRect();
      if (!item || !rect) return;
      e.preventDefault();
      if (item.type === 'note' && !multiSelected.has(item.id)) setMultiSelected(new Set());
      setShowMoveList(false);
      setContextMenu({ x: rect.left + 16, y: rect.bottom, type: item.type, id: item.id });
      return;
    }
    // Finder's duplicate combo; only claimed from the browser's bookmark
    // default while a note row has focus
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.code === 'KeyD') {
      if (item?.type === 'note') {
        e.preventDefault();
        const copyId = duplicateNote(item.id);
        if (copyId) {
          setFocusedItemId(copyId);
          requestAnimationFrame(() => rowRefs.current.get(copyId)?.focus());
        }
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault();
        if (!item) {
          goToRow(items[0].id);
          return;
        }
        const nextIndex = e.key === 'ArrowDown' ? index + 1 : index - 1;
        if (nextIndex < 0 || nextIndex >= items.length) return;
        const next = items[nextIndex];
        // Shift extends the note selection; folders move focus unselected
        if (e.shiftKey && next.type === 'note') {
          if (!selectionAnchorRef.current || !visibleNoteIds.includes(selectionAnchorRef.current)) {
            selectionAnchorRef.current = item.type === 'note' ? item.id : next.id;
          }
          const from = visibleNoteIds.indexOf(selectionAnchorRef.current);
          const to = visibleNoteIds.indexOf(next.id);
          if (from !== -1 && to !== -1) {
            const [start, end] = from < to ? [from, to] : [to, from];
            setMultiSelected(new Set(visibleNoteIds.slice(start, end + 1)));
          }
          focusRow(next.id);
          return;
        }
        goToRow(next.id);
        return;
      }
      case 'Home':
      case 'End': {
        e.preventDefault();
        goToRow(e.key === 'Home' ? items[0].id : items[items.length - 1].id);
        return;
      }
      case 'Enter': {
        if (!item) return;
        e.preventDefault();
        if (item.type === 'note') {
          setMultiSelected(new Set());
          selectionAnchorRef.current = item.id;
          selectNote(item.id);
          // Enter goes on to writing; the editor may mount on this render
          requestAnimationFrame(() => window.dispatchEvent(new Event(FOCUS_EDITOR_EVENT)));
        } else {
          handleToggleFolder(item.id);
        }
        return;
      }
      case 'ArrowRight': {
        if (!item || item.type !== 'folder') return;
        e.preventDefault();
        const folder = state.folders.find(f => f.id === item.id);
        if (!folder) return;
        if (!folder.expanded) {
          updateFolder(item.id, { expanded: true });
        } else {
          const child = items[index + 1];
          if (child && child.parentId === item.id) {
            goToRow(child.id);
          }
        }
        return;
      }
      case 'ArrowLeft': {
        if (!item) return;
        e.preventDefault();
        if (item.type === 'folder') {
          const folder = state.folders.find(f => f.id === item.id);
          if (folder?.expanded) {
            updateFolder(item.id, { expanded: false });
            return;
          }
        }
        if (item.parentId) {
          focusRow(item.parentId);
        }
        return;
      }
    }
  };

  // Delete/Backspace deletes the selection or the focused tree row, only
  // with focus in the sidebar and never while typing.
  // No deps: it closes over per-render values (deleteItem, visibleTreeItems).
  useEffect(() => {
    const handleDeleteKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      // The editor sits in a shadow root: document.activeElement is only its
      // host, so the real target comes from the composed path
      const target = e.composedPath()[0] as HTMLElement | undefined;
      if (e.defaultPrevented || !target?.closest('.sidebar') || target.closest('[role="dialog"]') ||
          target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      if (multiSelected.size > 0) {
        e.preventDefault();
        deleteNotes(Array.from(multiSelected));
        setMultiSelected(new Set());
        return;
      }
      // Single-item delete requires the row itself to hold focus, not just
      // a focusedItemId remembered from earlier navigation
      const id = target.getAttribute('role') === 'treeitem' ? target.getAttribute('data-item-id') : null;
      const item = id ? visibleTreeItems.find(i => i.id === id) : undefined;
      if (!item) return;
      e.preventDefault();
      const idx = visibleTreeItems.indexOf(item);
      const nextId = visibleTreeItems[idx + 1]?.id ?? visibleTreeItems[idx - 1]?.id ?? null;
      if (deleteItem(item.type, item.id) && nextId) {
        setFocusedItemId(nextId);
        requestAnimationFrame(() => rowRefs.current.get(nextId)?.focus());
      }
    };
    window.addEventListener('keydown', handleDeleteKey);
    return () => window.removeEventListener('keydown', handleDeleteKey);
  });

  // New folder: Opt+F (Mac), Ctrl+Shift+2 (Windows). Cmd/Ctrl+Shift+N opens private
  // windows in browsers, so this extends the app's Opt+N / Ctrl+Shift+1 scheme.
  // Created in the focused folder, next to the focused note, or at root.
  useEffect(() => {
    const macKb = isMac();
    const handleNewFolderKey = (e: KeyboardEvent) => {
      const modifierActive = macKb
        ? (e.altKey && !e.metaKey && !e.shiftKey && !e.ctrlKey)
        : (e.ctrlKey && e.shiftKey && !e.altKey);
      if (!modifierActive || document.querySelector('[aria-modal="true"]')) return;
      if (macKb ? e.code !== 'KeyF' : e.code !== 'Digit2') return;
      e.preventDefault();
      const focused = focusedItemId ? visibleTreeItems.find(i => i.id === focusedItemId) : undefined;
      const parentId = focused ? (focused.type === 'folder' ? focused.id : focused.parentId) : null;
      createFolderAt(parentId);
    };
    window.addEventListener('keydown', handleNewFolderKey);
    return () => window.removeEventListener('keydown', handleNewFolderKey);
  });

  const mac = isMac();
  const shortcuts = useMemo(() => getShortcutLabels(mac), [mac]);
  // " (3)" when the context menu acts on a multi-selection
  const moveCount = contextMenu && multiSelected.size > 1 && multiSelected.has(contextMenu.id) ? ` (${multiSelected.size})` : '';
  const moveTargets = contextMenu?.type === 'note'
    ? folderList.filter(({ folder }) => folder.id !== state.notes.find(n => n.id === contextMenu.id)?.parentId)
    : [];
  const clipboardItems = contextMenu && contextMenu.type !== 'sidebar' && (
    <>
      <div className="context-menu-divider" role="separator" />
      <button className="context-menu-item" role="menuitem" onClick={() => { setClipboard(clipboardFor(contextMenu.type as 'folder' | 'note', contextMenu.id, 'copy')); closeContextMenu(); }}>
        <CopyIcon />
        <span>{t.copy}{moveCount}</span>
      </button>
      <button className="context-menu-item" role="menuitem" onClick={() => { setClipboard(clipboardFor(contextMenu.type as 'folder' | 'note', contextMenu.id, 'move')); closeContextMenu(); }}>
        <CutIcon />
        <span>{t.cut}{moveCount}</span>
      </button>
    </>
  );
  const pasteItem = contextMenu && clipboard && (
    <button className="context-menu-item" role="menuitem" onClick={() => { pasteAt(contextMenu.type, contextMenu.id); closeContextMenu(); }}>
      <ClipboardIcon />
      <span>{t.paste}</span>
    </button>
  );

  // Install guidance matching what this browser actually offers; nothing
  // when already installed, and nothing in Firefox (no install support)
  const installHint = useMemo(() => {
    if (isPWAInstalled() || isFirefox()) return null;
    if (isSafari()) return isIpad() ? t.installHintSafariIpad : t.installHintSafariMac;
    return t.installHintChromium;
  }, [t]);

  return (
    <aside ref={sidebarRef} className={`sidebar ${state.sidebarVisible ? '' : 'hidden'}`} inert={!state.sidebarVisible} onClick={() => { closeContextMenu(); closeTagContextMenu(); setPopup(null); }}>
      <div className="search-container">
        <input
          type="search"
          className="search-input"
          placeholder={t.search}
          value={state.searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={arrowsIntoTree}
          aria-label={t.search}
        />
      </div>

      {sortedTags.length > 0 && (
        <div className="tags-section">
          <div className="section-header">
            <span className="section-title">{t.tags}</span>
          </div>
          <div className="tag-chips" role="group" aria-label={t.tags}>
            {sortedTags.map(tag => (
              editingTagId === tag.id ? (
                <input
                  key={tag.id}
                  type="text"
                  className="tag-edit-input"
                  value={editingTagName}
                  onChange={(e) => setEditingTagName(e.target.value)}
                  onBlur={handleSaveTagName}
                  onKeyDown={handleTagKeyDown}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                // A second click on the active tag shows all notes again
                <button
                  key={tag.id}
                  data-tag-id={tag.id}
                  className={`tag-chip ${state.selectedTagFilter === tag.id ? 'active' : ''}`}
                  onClick={() => setTagFilter(state.selectedTagFilter === tag.id ? null : tag.id)}
                  onContextMenu={(e) => handleTagContextMenu(e, tag.id)}
                  aria-pressed={state.selectedTagFilter === tag.id}
                >
                  {tag.name}
                </button>
              )
            ))}
          </div>
        </div>
      )}

      <div className="notes-section">
        <div className="section-header">
          <span className="section-title">{t.notes}</span>
          <div className="section-actions" onKeyDown={arrowsIntoTree}>
            <button
              className="section-btn"
              onClick={toggleSortMode}
              title={sortMode === 'alpha' ? t.sortByDate : t.sortByName}
              aria-label={sortMode === 'alpha' ? t.sortByDate : t.sortByName}
            >
              <SortIcon size={16} />
            </button>
            <button className="section-btn primary" onClick={() => createNote()} title={t.newNote} aria-label={t.newNote}>
              <PlusIcon size={16} />
            </button>
          </div>
        </div>
        <div
          className="notes-tree"
          role="tree"
          aria-label={t.notes}
          aria-multiselectable={true}
          onKeyDown={handleTreeKeyDown}
          onContextMenu={handleSidebarContextMenu}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleRootDrop}
        >
          {isSearching ? (
            searchResults.map(note => (
              <TreeNote
                key={note.id}
                branch={null}
                note={note}
                isSelected={note.id === state.selectedNoteId}
                isMultiSelected={multiSelected.has(note.id)}
                onSelect={handleSelectNote}
                onContextMenu={handleContextMenu}
                onMoveNote={moveNote}
                untitledText={t.untitled}
                editingNoteId={editingNoteId}
                editingNoteName={editingNoteName}
                onEditingNoteNameChange={setEditingNoteName}
                onSaveNoteName={handleSaveNoteName}
                onNoteNameKeyDown={handleNoteNameKeyDown}
                focusId={effectiveFocusId}
                onRowFocus={setFocusedItemId}
                registerRowRef={registerRowRef}
              />
            ))
          ) : (
            <>
              {rootFolders.map(folder => (
                <TreeFolder
                  key={folder.id}
                  branch={null}
                  folder={folder}
                  folders={state.folders}
                  notes={filteredNotes}
                  selectedNoteId={state.selectedNoteId}
                  multiSelectedIds={multiSelected}
                  onSelectNote={handleSelectNote}
                  onToggleFolder={handleToggleFolder}
                  onContextMenu={handleContextMenu}
                  onMoveNote={moveNote}
                  editingFolderId={editingFolderId}
                  editingFolderName={editingFolderName}
                  onEditingFolderNameChange={setEditingFolderName}
                  onSaveFolderName={handleSaveFolderName}
                  onFolderKeyDown={handleFolderKeyDown}
                  untitledText={t.untitled}
                  sortMode={sortMode}
                  editingNoteId={editingNoteId}
                  editingNoteName={editingNoteName}
                  onEditingNoteNameChange={setEditingNoteName}
                  onSaveNoteName={handleSaveNoteName}
                  onNoteNameKeyDown={handleNoteNameKeyDown}
                  focusId={effectiveFocusId}
                  onRowFocus={setFocusedItemId}
                  registerRowRef={registerRowRef}
                  lang={state.lang}
                />
              ))}
              {rootNotes.map(note => (
                <TreeNote
                  key={note.id}
                  branch={null}
                  note={note}
                  isSelected={note.id === state.selectedNoteId}
                  isMultiSelected={multiSelected.has(note.id)}
                  onSelect={handleSelectNote}
                  onContextMenu={handleContextMenu}
                  onMoveNote={moveNote}
                  untitledText={t.untitled}
                  editingNoteId={editingNoteId}
                  editingNoteName={editingNoteName}
                  onEditingNoteNameChange={setEditingNoteName}
                  onSaveNoteName={handleSaveNoteName}
                  onNoteNameKeyDown={handleNoteNameKeyDown}
                  focusId={effectiveFocusId}
                  onRowFocus={setFocusedItemId}
                  registerRowRef={registerRowRef}
                />
              ))}
            </>
          )}
          {filteredNotes.length === 0 && (isSearching || state.selectedTagFilter) && (
            <p className="tree-empty">{t.noMatches}</p>
          )}
        </div>
      </div>

      <div className="sidebar-footer-buttons">
        {footerButton('privacy', t.securityPrivacy, <EncryptedIcon />)}
        {popup === 'privacy' && (
          <div className="privacy-popup show" {...popupProps('privacy')}>
            <p className="privacy-popup-text">{t.privacySummary}</p>
            {storagePersisted !== null && (
              <p className="privacy-popup-text privacy-popup-storage">
                {storagePersisted ? t.storagePersistent : t.storageNotPersistent}
              </p>
            )}
            <a
              href={`${import.meta.env.BASE_URL}${state.lang === 'no' ? 'personvern.html' : 'privacy.html'}`}
              className="privacy-popup-link"
            >
              <ArrowForwardIcon size={12} />
              {t.privacyPolicy}
            </a>
          </div>
        )}
        {footerButton('guide', t.guide, <ArticleIcon />)}
        {footerButton('shortcuts', t.shortcuts, <KeyboardIcon />)}
        <div className="lang-picker">
          {/* The name holds the visible "NO"/"EN", so voice control finds it */}
          {footerButton('lang', t.language, state.lang.toUpperCase(), `${t.language} (${state.lang.toUpperCase()})`)}
          {popup === 'lang' && (
            <div className="lang-dropdown show" {...popupProps('lang')}>
              <button
                className={`lang-option ${state.lang === 'no' ? 'active' : ''}`}
                lang="nb"
                aria-pressed={state.lang === 'no'}
                onClick={() => { setLang('no'); setPopup(null); popupTriggers.current.get('lang')?.focus(); }}
              >
                Norsk
              </button>
              <button
                className={`lang-option ${state.lang === 'en' ? 'active' : ''}`}
                lang="en"
                aria-pressed={state.lang === 'en'}
                onClick={() => { setLang('en'); setPopup(null); popupTriggers.current.get('lang')?.focus(); }}
              >
                English
              </button>
            </div>
          )}
        </div>
        <button
          className="sidebar-footer-btn"
          ref={trashButtonRef}
          onClick={(e) => { e.stopPropagation(); setShowTrash(true); setPopup(null); }}
          title={state.trash.length > 0 ? `${t.trash} (${state.trash.length})` : t.trash}
          aria-label={state.trash.length > 0 ? `${t.trash} (${state.trash.length})` : t.trash}
        >
          <DeleteIcon size={16} />
        </button>
        {footerButton('backup', t.importExport, <TransferIcon />)}
        {popup === 'backup' && (
          <div className="backup-popup show" {...popupProps('backup')}>
            {fsAccessSupported ? (
              <>
                <div className="backup-popup-section">
                  <span className="backup-popup-section-title">{t.autoBackup}</span>
                </div>
                {autoBackupEnabled ? (
                  <>
                    {backupPermissionNeeded && (
                      <>
                        <div className="backup-popup-error">
                          {t.backupPermissionNeeded}
                        </div>
                        <div className="backup-popup-detail">
                          {t.backupPermissionHint}
                        </div>
                        <button className="backup-popup-btn" onClick={async () => { await reactivateBackup(); }}>
                          <FolderCogIcon size={16} />
                          <span>{t.reactivateBackup}</span>
                        </button>
                      </>
                    )}
                    <div className="backup-popup-status">
                      <FolderCheckIcon size={14} />
                      <span>{t.autoBackupActive}</span>
                    </div>
                    {lastBackupTime && (
                      <div className="backup-popup-detail">
                        {t.lastBackup}: {formatDate(lastBackupTime, state.lang)}
                      </div>
                    )}
                    {backupError && (
                      <div className="backup-popup-error">
                        {t.backupFailed}
                      </div>
                    )}
                    {backupKeyStale && (
                      <>
                        <div className="backup-popup-error">
                          {t.backupKeyStale}
                        </div>
                        <button className="backup-popup-btn" onClick={() => { setShowRenewDialog(true); setPopup(null); }}>
                          <FolderCogIcon size={16} />
                          <span>{t.renewBackup}</span>
                        </button>
                      </>
                    )}
                    {recoveryCopies > 0 && (
                      <div className="backup-popup-error">
                        {t.backupPaused}
                      </div>
                    )}
                    <button className="backup-popup-btn" onClick={async () => { await disableAutoBackup(); setPopup(null); }}>
                      <FolderCogIcon size={16} />
                      <span>{t.disableAutoBackup}</span>
                    </button>
                  </>
                ) : (
                  <button className="backup-popup-btn" onClick={() => { setShowPassphraseDialog(true); setPopup(null); }}>
                    <FolderCogIcon size={16} />
                    <span>{t.enableAutoBackup}</span>
                  </button>
                )}
                <div className="backup-popup-divider" />
                <button className="backup-popup-btn" onClick={async () => { await restoreFromBackup(); setPopup(null); }}>
                  <UploadIcon size={16} />
                  <span>{t.restoreFromBackup}</span>
                </button>
                <div className="backup-popup-divider" />
              </>
            ) : (
              <>
                <div className="backup-popup-reminder">
                  {t.autoBackupUnsupported}
                </div>
                <div className="backup-popup-divider" />
              </>
            )}
            {fsAccessSupported && (
              <button className="backup-popup-btn" onClick={exportFiles}>
                <FolderDownIcon size={16} />
                <span>{t.exportAsFiles}</span>
              </button>
            )}
            {exportResult === 'failed' && <div className="backup-popup-error">{t.exportFilesFailed}</div>}
            {exportResult && exportResult !== 'failed' && (
              <div className="backup-popup-detail">{t.exportedTo.replace('{folder}', exportResult.folder)}</div>
            )}
            <button className="backup-popup-btn" onClick={() => { exportAllData(); setPopup(null); }}>
              <DownloadIcon size={16} />
              <span>{t.exportData}</span>
            </button>
            <button className="backup-popup-btn" onClick={async () => { await importData(); setPopup(null); }}>
              <UploadIcon size={16} />
              <span>{t.importData}</span>
            </button>
            <button className="backup-popup-btn" onClick={async () => { await importNote(); setPopup(null); }}>
              <UploadIcon size={16} />
              <span>{t.importNote}</span>
            </button>
          </div>
        )}
        {showTrash && <TrashDialog onClose={closeTrash} />}
        {showPassphraseDialog && (
          <PassphraseDialog
            mode="set"
            onSubmit={async (passphrase) => {
              const ok = await enableAutoBackup(passphrase);
              if (ok) setShowPassphraseDialog(false);
              return ok;
            }}
            onCancel={() => setShowPassphraseDialog(false)}
            returnFocus={() => popupTriggers.current.get('backup') ?? null}
          />
        )}
        {showRenewDialog && (
          <PassphraseDialog
            mode="enter"
            hint={t.renewBackupHint}
            onSubmit={async (passphrase) => {
              const ok = await renewBackupProtection(passphrase);
              if (ok) setShowRenewDialog(false);
              return ok;
            }}
            onCancel={() => setShowRenewDialog(false)}
            returnFocus={() => popupTriggers.current.get('backup') ?? null}
          />
        )}
        {popup === 'shortcuts' && (
          <div className="shortcuts-popup show" {...popupProps('shortcuts')}>
            <div className="shortcuts-title">{t.shortcuts}</div>

            <div className="shortcuts-section-title">{t.shortcutsFunctions}</div>
            <div className="shortcuts-grid">
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.toggleSidebar}</span>
                  <span className="shortcut-key">{shortcuts.toggleSidebar}</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.undoShortcut}</span>
                  <span className="shortcut-key">{shortcuts.undo}</span>
                </div>
              </div>
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.searchShortcut}</span>
                  <span className="shortcut-key">{shortcuts.search}</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.redoShortcut}</span>
                  <span className="shortcut-key">{shortcuts.redo}</span>
                </div>
              </div>
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.newNoteShortcut}</span>
                  <span className="shortcut-key">{shortcuts.newNote}</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.saveShortcut}</span>
                  <span className="shortcut-key">{shortcuts.save}</span>
                </div>
              </div>
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.findShortcut}</span>
                  <span className="shortcut-key">{shortcuts.find}</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.newTagShortcut}</span>
                  <span className="shortcut-key">{shortcuts.newTag}</span>
                </div>
              </div>
            </div>

            <div className="shortcuts-section-title">{t.shortcutsSidebar}</div>
            <div className="shortcuts-grid">
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.navigateShortcut}</span>
                  <span className="shortcut-key">{shortcuts.navigate}</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.openItemShortcut}</span>
                  <span className="shortcut-key">{shortcuts.openItem}</span>
                </div>
              </div>
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.renameShortcut}{mac && <sup className="footnote-mark">*</sup>}</span>
                  <span className="shortcut-key">{shortcuts.rename}</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.deleteShortcut}</span>
                  <span className="shortcut-key">{shortcuts.deleteItem}</span>
                </div>
              </div>
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.duplicateShortcut}</span>
                  <span className="shortcut-key">{shortcuts.duplicate}</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.newFolderShortcut}</span>
                  <span className="shortcut-key">{shortcuts.newFolder}</span>
                </div>
              </div>
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.copy}</span>
                  <span className="shortcut-key">{shortcuts.copy}</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.cut}</span>
                  <span className="shortcut-key">{shortcuts.cut}</span>
                </div>
              </div>
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.paste}</span>
                  <span className="shortcut-key">{shortcuts.paste}</span>
                </div>
                {shortcuts.moveHere && (
                  <div className="shortcut-item">
                    <span className="shortcut-desc">{t.moveHereShortcut}</span>
                    <span className="shortcut-key">{shortcuts.moveHere}</span>
                  </div>
                )}
              </div>
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.selectAllShortcut}</span>
                  <span className="shortcut-key">{shortcuts.selectAll}</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.extendSelectionShortcut}</span>
                  <span className="shortcut-key">{shortcuts.extendSelection}</span>
                </div>
              </div>
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.multiSelectHint}</span>
                  <span className="shortcut-key">{shortcuts.multiSelectModifier}+{t.clickLabel}</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.rangeSelectHint}</span>
                  <span className="shortcut-key">{shortcuts.rangeSelectModifier}+{t.clickLabel}</span>
                </div>
              </div>
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.contextMenuHint}</span>
                  <span className="shortcut-key">{t.rightClickLabel}</span>
                </div>
              </div>
              {mac && <div className="shortcuts-hint">*{t.renameF2MacHint}</div>}
            </div>

            <div className="shortcuts-section-title">{t.formatting}</div>
            <div className="shortcuts-grid">
              <div className="shortcut-row">
                {shortcuts.bodyText && (
                  <div className="shortcut-item">
                    <span className="shortcut-desc">{t.bodyTextShortcut}</span>
                    <span className="shortcut-key">{shortcuts.bodyText}</span>
                  </div>
                )}
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.boldShortcut}</span>
                  <span className="shortcut-key">{shortcuts.bold}</span>
                </div>
              </div>
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.heading1Shortcut}</span>
                  <span className="shortcut-key">{shortcuts.heading1}</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.italicShortcut}</span>
                  <span className="shortcut-key">{shortcuts.italic}</span>
                </div>
              </div>
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.heading2Shortcut}</span>
                  <span className="shortcut-key">{shortcuts.heading2}</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.strikethroughShortcut}</span>
                  <span className="shortcut-key">{shortcuts.strikethrough}</span>
                </div>
              </div>
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.heading3Shortcut}</span>
                  <span className="shortcut-key">{shortcuts.heading3}</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.inlineCodeShortcut}</span>
                  <span className="shortcut-key">{shortcuts.inlineCode}</span>
                </div>
              </div>
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.bulletListShortcut}</span>
                  <span className="shortcut-key">{shortcuts.bulletList}</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.linkShortcut}</span>
                  <span className="shortcut-key">{shortcuts.link}</span>
                </div>
              </div>
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.numberedListShortcut}</span>
                  <span className="shortcut-key">{shortcuts.numberedList}</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.quoteShortcut}</span>
                  <span className="shortcut-key">{shortcuts.quote}</span>
                </div>
              </div>
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.taskListShortcut}</span>
                  <span className="shortcut-key">{shortcuts.taskList}</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.codeBlockShortcut}</span>
                  <span className="shortcut-key">{shortcuts.codeBlock}</span>
                </div>
              </div>
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.showMarkdown}</span>
                  <span className="shortcut-key">{shortcuts.markdownLens}</span>
                </div>
              </div>
            </div>
          </div>
        )}
        {popup === 'guide' && (
          <div className="shortcuts-popup show" {...popupProps('guide')}>
            <div className="shortcuts-title">{t.guide}</div>
            <p className="guide-intro">{t.guideIntro}</p>
            <div className="guide-grid">
              <div className="guide-item">
                <div className="guide-item-title">{t.guideNaming}</div>
                <div className="guide-item-desc">{t.guideNamingDesc}</div>
              </div>
              <div className="guide-item">
                <div className="guide-item-title">{t.guideFormats}</div>
                <div className="guide-item-desc">{t.guideFormatsDesc}</div>
              </div>
              <div className="guide-item">
                <div className="guide-item-title">{t.guideTypography}</div>
                <div className="guide-item-desc">{t.guideTypographyDesc}</div>
              </div>
              <div className="guide-item">
                <div className="guide-item-title">{t.guideOrganize}</div>
                <div className="guide-item-desc">{t.guideOrganizeDesc}</div>
              </div>
              <div className="guide-item">
                <div className="guide-item-title">{t.guideTrash}</div>
                <div className="guide-item-desc">{t.guideTrashDesc.replace('{days}', String(TRASH_DAYS))}</div>
              </div>
              <div className="guide-item">
                <div className="guide-item-title">{t.guideExport}</div>
                <div className="guide-item-desc">{t.guideExportDesc}</div>
              </div>
              <div className="guide-item">
                <div className="guide-item-title">{t.guideAutoBackup}</div>
                <div className="guide-item-desc">{t.guideAutoBackupDesc}</div>
              </div>
              {installHint && (
                <div className="guide-item">
                  <div className="guide-item-title">{t.guideInstall}</div>
                  <div className="guide-item-desc">{installHint}</div>
                </div>
              )}
            </div>
            <p className="guide-version">Skrive {__APP_VERSION__}</p>
          </div>
        )}
      </div>


      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu show"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { moveFocus(e); if (e.key === 'Escape') rowRefs.current.get(contextMenu.id)?.focus(); }}
        >
          {contextMenu.type === 'sidebar' ? (
            <>
              <button className="context-menu-item" role="menuitem" onClick={() => handleNewInContext('note')}>
                <NoteIcon />
                <span>{t.newNote}</span>
              </button>
              <button className="context-menu-item" role="menuitem" onClick={() => handleNewInContext('folder')}>
                <FolderIcon />
                <span>{t.newFolder}</span>
              </button>
              {pasteItem && <div className="context-menu-divider" role="separator" />}
              {pasteItem}
            </>
          ) : (
            <>
              <button className="context-menu-item" role="menuitem" onClick={() => handleNewInContext('note')}>
                <NoteIcon />
                <span>{t.newNote}</span>
              </button>
              <button className="context-menu-item" role="menuitem" onClick={() => handleNewInContext('folder')}>
                <FolderIcon />
                <span>{t.newFolder}</span>
              </button>
              <div className="context-menu-divider" role="separator" />
              <button
                className="context-menu-item"
                role="menuitem"
                onClick={contextMenu.type === 'folder' ? handleStartEditFolder : handleStartEditNote}
              >
                <EditIcon />
                <span>{t.rename}</span>
              </button>
              {contextMenu.type === 'note' && (
                <button className="context-menu-item" role="menuitem" onClick={handleDuplicate}>
                  <CopyIcon />
                  <span>{t.duplicate}</span>
                </button>
              )}
              {clipboardItems}
              {pasteItem}
              {contextMenu.type === 'note' && moveTargets.length > 0 && (
                <button className="context-menu-item" role="menuitem" aria-expanded={showMoveList} onClick={() => setShowMoveList(open => !open)}>
                  <FolderIcon />
                  <span>{t.moveToFolder}{moveCount}</span>
                </button>
              )}
              {contextMenu.type === 'note' && showMoveList && moveTargets.map(({ folder, depth }) => (
                  <button key={folder.id} className="context-menu-item context-menu-subitem" role="menuitem" style={{ paddingLeft: 32 + depth * 12 }} onClick={() => handleMoveTo(folder.id)}>
                    <span>{folder.name}</span>
                  </button>
                ))}
              {(contextMenu.type === 'note' ? state.notes : state.folders).find(x => x.id === contextMenu.id)?.parentId != null && (
                <button className="context-menu-item" role="menuitem" onClick={() => handleMoveTo(null)}>
                  <FolderOutputIcon />
                  <span>{t.moveToRoot}{moveCount}</span>
                </button>
              )}
              <div className="context-menu-divider" role="separator" />
              <button className="context-menu-item" role="menuitem" onClick={handleDelete}>
                <DeleteIcon />
                <span>{t.delete}{contextMenu.type === 'note' ? moveCount : ''}</span>
              </button>
            </>
          )}
        </div>
      )}

      {tagContextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu show"
          role="menu"
          style={{ left: tagContextMenu.x, top: tagContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { moveFocus(e); if (e.key === 'Escape') sidebarRef.current?.querySelector<HTMLElement>(`[data-tag-id="${tagContextMenu.id}"]`)?.focus(); }}
        >
          <button className="context-menu-item" role="menuitem" onClick={handleStartEditTag}>
            <EditIcon />
            <span>{t.rename}</span>
          </button>
          <div className="context-menu-divider" role="separator" />
          <button className="context-menu-item" role="menuitem" onClick={handleDeleteTag}>
            <DeleteIcon />
            <span>{t.delete}</span>
          </button>
        </div>
      )}
    </aside>
  );
}
