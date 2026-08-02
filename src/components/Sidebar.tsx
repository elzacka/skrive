import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { useApp } from '@/contexts';
import { i18n } from '@/utils/i18n';
import { isMac, isFirefox, isSafari, isIpad, isPWAInstalled } from '@/utils';
import { getShortcutLabels } from '@/utils/shortcuts';
import type { Note, Folder } from '@/types';
import { formatDate } from '@/utils/helpers';
import {
  PlusIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderOutputIcon,
  NoteIcon,
  KeyboardIcon,
  EncryptedIcon,
  DeleteIcon,
  EditIcon,
  CopyIcon,
  ArrowForwardIcon,
  SwapVertIcon,
  DownloadIcon,
  UploadIcon,
  ArticleIcon,
  FolderSyncIcon,
  FolderCheckIcon
} from './Icons';
import { PassphraseDialog } from './PassphraseDialog';
// "Skrive" in Columbia Titling, outlined to paths (the font itself is
// commercial and cannot be self-hosted as a webfont)
import wordmarkUrl from '@/assets/skrive-wordmark.svg';

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
}

export type NoteSortMode = 'alpha' | 'recent';

function compareNotes(a: Note, b: Note, sortMode: NoteSortMode, untitledText: string, lang: string): number {
  if (sortMode === 'recent') {
    return b.updatedAt - a.updatedAt;
  }
  return (a.title || untitledText).localeCompare(b.title || untitledText, lang);
}

const TreeFolder = memo(function TreeFolder({ folder, folders, notes, selectedNoteId, multiSelectedIds, onSelectNote, onToggleFolder, onContextMenu, onMoveNote, editingFolderId, editingFolderName, onEditingFolderNameChange, onSaveFolderName, onFolderKeyDown, untitledText, sortMode, editingNoteId, editingNoteName, onEditingNoteNameChange, onSaveNoteName, onNoteNameKeyDown, focusId, onRowFocus, registerRowRef, lang }: TreeItemProps & { lang: string }) {
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
        <button
          className={`tree-expand ${folder.expanded ? 'expanded' : ''} ${!hasChildren ? 'hidden' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleFolder(folder.id); }}
          aria-label={folder.expanded ? 'Collapse' : 'Expand'}
        >
          <ChevronRightIcon />
        </button>
        <span className="tree-icon"><FolderIcon /></span>
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
          <span className="tree-label">{folder.name}</span>
        )}
      </div>
      {folder.expanded && hasChildren && (
        <div className="tree-children expanded" role="group">
          {childFolders.map(child => (
            <TreeFolder
              key={child.id}
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
          {childNotes.map(note => (
            <TreeNote
              key={note.id}
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
});

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
}

const TreeNote = memo(function TreeNote({ note, isSelected, isMultiSelected, onSelect, onContextMenu, onMoveNote, untitledText, editingNoteId, editingNoteName, onEditingNoteNameChange, onSaveNoteName, onNoteNameKeyDown, focusId, onRowFocus, registerRowRef }: TreeNoteProps) {
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
        <span className="tree-expand hidden"><ChevronRightIcon /></span>
        <span className="tree-icon"><NoteIcon /></span>
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
});

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
    enableAutoBackup,
    disableAutoBackup,
    restoreFromBackup,
    fsAccessSupported,
    storagePersisted
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
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [showPrivacyInfo, setShowPrivacyInfo] = useState(false);
  const [showBackupMenu, setShowBackupMenu] = useState(false);
  const [showPassphraseDialog, setShowPassphraseDialog] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
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

  // Close popups when clicking outside sidebar
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setShowShortcuts(false);
        setShowGuide(false);
        setShowLangDropdown(false);
        setShowPrivacyInfo(false);
        setShowBackupMenu(false);
        setContextMenu(null);
        setTagContextMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Safari on macOS fires a click event when the secondary button (or
  // Ctrl+click) is released, right after the contextmenu event. That ghost
  // click reaches the sidebar's close-on-click handler and shuts the context
  // menu again immediately. Stopping it in the capture phase keeps React from
  // seeing it at all, so neither the menu nor the note selection reacts.
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
      setShowShortcuts(false);
      setShowGuide(false);
      setShowLangDropdown(false);
      setShowPrivacyInfo(false);
      setShowBackupMenu(false);
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
    if (e.shiftKey && selectionAnchorRef.current) {
      const from = visibleNoteIds.indexOf(selectionAnchorRef.current);
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
    setContextMenu({ x: e.clientX, y: e.clientY, type, id });
  };

  const handleSidebarContextMenu = (e: React.MouseEvent) => {
    // Only trigger if clicking on the sidebar background, not on items
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('tree')) {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, type: 'sidebar', id: '' });
    }
  };

  const closeContextMenu = () => setContextMenu(null);
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

  // Move the clicked note (or the whole multi-selection) out of folders
  const handleMoveToRoot = () => {
    if (!contextMenu) return;
    if (multiSelected.size > 1 && multiSelected.has(contextMenu.id)) {
      for (const id of multiSelected) {
        moveNote(id, null);
      }
      setMultiSelected(new Set());
    } else {
      moveNote(contextMenu.id, null);
    }
    closeContextMenu();
  };

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
    // A collapsed parent would hide the new folder's rename input
    if (parentId) {
      const parent = state.folders.find(f => f.id === parentId);
      if (parent && !parent.expanded) {
        updateFolder(parentId, { expanded: true });
      }
    }
    const newFolderId = createFolder(parentId);
    // Start editing the new folder name immediately
    setEditingFolderId(newFolderId);
    setEditingFolderName(t.newFolder);
  };

  const handleNewInContext = (type: 'note' | 'folder') => {
    if (!contextMenu) return;
    const parentId = contextMenu.type === 'folder' ? contextMenu.id : null;
    if (type === 'note') {
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

  const focusRow = (id: string) => {
    setFocusedItemId(id);
    rowRefs.current.get(id)?.focus();
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
          focusRow(items[0].id);
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
        }
        focusRow(next.id);
        return;
      }
      case 'Home':
      case 'End': {
        e.preventDefault();
        focusRow(e.key === 'Home' ? items[0].id : items[items.length - 1].id);
        return;
      }
      case 'Enter': {
        if (!item) return;
        e.preventDefault();
        if (item.type === 'note') {
          setMultiSelected(new Set());
          selectionAnchorRef.current = item.id;
          selectNote(item.id);
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
            focusRow(child.id);
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

  // Delete/Backspace deletes the multi-selection or the tree row that
  // actually has DOM focus - never while typing in an input or the editor.
  // Runs without deps: it closes over per-render values (deleteItem,
  // visibleTreeItems), so it must re-register each render
  useEffect(() => {
    const handleDeleteKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
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
      const id = active?.getAttribute('role') === 'treeitem' ? active.getAttribute('data-item-id') : null;
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

  // New folder: Mac Opt+F, Windows Ctrl+Shift+2. The Finder/Explorer combo
  // (Cmd/Ctrl+Shift+N) is reserved for private windows in Chrome, Edge and
  // Safari, so this extends the app's own Opt+N / Ctrl+Shift+1 scheme.
  // Created inside the focused folder, next to the focused note, or at root
  useEffect(() => {
    const macKb = isMac();
    const handleNewFolderKey = (e: KeyboardEvent) => {
      const modifierActive = macKb
        ? (e.altKey && !e.metaKey && !e.shiftKey && !e.ctrlKey)
        : (e.ctrlKey && e.shiftKey && !e.altKey);
      if (!modifierActive) return;
      if (macKb ? e.code !== 'KeyF' : e.code !== 'Digit2') return;
      e.preventDefault();
      const focused = focusedItemId ? visibleTreeItems.find(i => i.id === focusedItemId) : undefined;
      const parentId = focused ? (focused.type === 'folder' ? focused.id : focused.parentId) : null;
      createFolderAt(parentId);
    };
    window.addEventListener('keydown', handleNewFolderKey);
    return () => window.removeEventListener('keydown', handleNewFolderKey);
  });

  const getTagNoteCount = (tagId: string) => {
    return state.notes.filter(n => n.tags.includes(tagId)).length;
  };

  const mac = isMac();
  const shortcuts = useMemo(() => getShortcutLabels(mac), [mac]);

  // Install guidance matching what this browser actually offers; nothing
  // when already installed, and nothing in Firefox (no install support)
  const installHint = useMemo(() => {
    if (isPWAInstalled() || isFirefox()) return null;
    if (isSafari()) return isIpad() ? t.installHintSafariIpad : t.installHintSafariMac;
    return t.installHintChromium;
  }, [t]);

  return (
    <aside ref={sidebarRef} className={`sidebar ${state.sidebarVisible ? '' : 'hidden'}`} onClick={() => { closeContextMenu(); closeTagContextMenu(); setShowShortcuts(false); setShowGuide(false); setShowLangDropdown(false); setShowPrivacyInfo(false); setShowBackupMenu(false); }}>
      <div className="sidebar-header">
        <img src={wordmarkUrl} alt="Skrive" className="sidebar-wordmark" />
      </div>

      <div className="search-container">
        <input
          type="search"
          className="search-input"
          placeholder={t.search}
          value={state.searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label={t.search}
        />
      </div>

      <div className="tags-section">
        <button
          className={`section-header ${tagsExpanded ? 'expanded' : ''}`}
          onClick={() => setTagsExpanded(!tagsExpanded)}
          aria-expanded={tagsExpanded}
        >
          <span className="section-expand"><ChevronRightIcon /></span>
          <span className="section-title">{t.tags}</span>
        </button>
        {tagsExpanded && (
          <div className="tags-list" role="listbox" aria-label={t.tags}>
            <button
              className={`tag-filter-btn ${state.selectedTagFilter === null ? 'active' : ''}`}
              onClick={() => setTagFilter(null)}
              role="option"
              aria-selected={state.selectedTagFilter === null}
            >
              <span>{t.all}</span>
              <span className="tag-count">{state.notes.length}</span>
            </button>
            {sortedTags.map(tag => (
              editingTagId === tag.id ? (
                <div key={tag.id} className="tag-filter-btn editing">
                  <input
                    type="text"
                    className="tag-edit-input"
                    value={editingTagName}
                    onChange={(e) => setEditingTagName(e.target.value)}
                    onBlur={handleSaveTagName}
                    onKeyDown={handleTagKeyDown}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ) : (
                <button
                  key={tag.id}
                  className={`tag-filter-btn ${state.selectedTagFilter === tag.id ? 'active' : ''}`}
                  onClick={() => setTagFilter(tag.id)}
                  onContextMenu={(e) => handleTagContextMenu(e, tag.id)}
                  role="option"
                  aria-selected={state.selectedTagFilter === tag.id}
                >
                  <span>{tag.name}</span>
                  <span className="tag-count">{getTagNoteCount(tag.id)}</span>
                </button>
              )
            ))}
          </div>
        )}
      </div>

      <div className="notes-section">
        <div className="notes-header">
          <span className="section-title">{t.notes}</span>
          <div className="notes-header-actions">
            <button
              className="sort-btn"
              onClick={toggleSortMode}
              title={sortMode === 'alpha' ? t.sortByDate : t.sortByName}
              aria-label={sortMode === 'alpha' ? t.sortByDate : t.sortByName}
            >
              <SwapVertIcon size={16} />
            </button>
            <button className="new-btn" onClick={() => createNote()} title={t.newNote} aria-label={t.newNote}>
              <PlusIcon />
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
        </div>
      </div>

      <div className="sidebar-footer-buttons">
        <button
          className="sidebar-footer-btn"
          onClick={(e) => { e.stopPropagation(); setShowPrivacyInfo(!showPrivacyInfo); setShowShortcuts(false); setShowGuide(false); setShowLangDropdown(false); setShowBackupMenu(false); }}
          title={t.securityPrivacy}
          aria-label={t.securityPrivacy}
        >
          <EncryptedIcon />
        </button>
        {showPrivacyInfo && (
          <div className="privacy-popup show" onClick={(e) => e.stopPropagation()}>
            <p className="privacy-popup-text">
              {state.lang === 'no'
                ? 'Notatene lagres kryptert på din maskin og sendes aldri til noen server.'
                : 'Your notes are stored encrypted on your device and are never sent to any server.'}
            </p>
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
        <button
          className="sidebar-footer-btn"
          onClick={(e) => { e.stopPropagation(); setShowGuide(!showGuide); setShowShortcuts(false); setShowLangDropdown(false); setShowPrivacyInfo(false); setShowBackupMenu(false); }}
          title={t.guide}
          aria-label={t.guide}
        >
          <ArticleIcon />
        </button>
        <button
          className="sidebar-footer-btn"
          onClick={(e) => { e.stopPropagation(); setShowShortcuts(!showShortcuts); setShowGuide(false); setShowLangDropdown(false); setShowPrivacyInfo(false); setShowBackupMenu(false); }}
          title={t.shortcuts}
          aria-label={t.shortcuts}
        >
          <KeyboardIcon />
        </button>
        <div className="lang-picker">
          <button
            className="sidebar-footer-btn"
            onClick={(e) => { e.stopPropagation(); setShowLangDropdown(!showLangDropdown); setShowShortcuts(false); setShowGuide(false); setShowPrivacyInfo(false); setShowBackupMenu(false); }}
            title={t.language}
            aria-label={t.language}
          >
            {state.lang.toUpperCase()}
          </button>
          {showLangDropdown && (
            <div className="lang-dropdown show">
              <button
                className={`lang-option ${state.lang === 'no' ? 'active' : ''}`}
                onClick={() => { setLang('no'); setShowLangDropdown(false); }}
              >
                Norsk
              </button>
              <button
                className={`lang-option ${state.lang === 'en' ? 'active' : ''}`}
                onClick={() => { setLang('en'); setShowLangDropdown(false); }}
              >
                English
              </button>
            </div>
          )}
        </div>
        <button
          className="sidebar-footer-btn"
          onClick={(e) => { e.stopPropagation(); setShowBackupMenu(!showBackupMenu); setShowShortcuts(false); setShowGuide(false); setShowLangDropdown(false); setShowPrivacyInfo(false); }}
          title={t.importExport}
          aria-label={t.importExport}
        >
          <SwapVertIcon />
        </button>
        {showBackupMenu && (
          <div className="backup-popup show" onClick={(e) => e.stopPropagation()}>
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
                        <button className="backup-popup-btn" onClick={async () => { await reactivateBackup(); }}>
                          <FolderSyncIcon size={16} />
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
                    <button className="backup-popup-btn" onClick={async () => { await disableAutoBackup(); setShowBackupMenu(false); }}>
                      <FolderSyncIcon size={16} />
                      <span>{t.disableAutoBackup}</span>
                    </button>
                  </>
                ) : (
                  <button className="backup-popup-btn" onClick={() => { setShowPassphraseDialog(true); setShowBackupMenu(false); }}>
                    <FolderSyncIcon size={16} />
                    <span>{t.enableAutoBackup}</span>
                  </button>
                )}
                <div className="backup-popup-divider" />
                <button className="backup-popup-btn" onClick={async () => { await restoreFromBackup(); setShowBackupMenu(false); }}>
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
            <button className="backup-popup-btn" onClick={() => { exportAllData(); setShowBackupMenu(false); }}>
              <DownloadIcon size={16} />
              <span>{t.exportData}</span>
            </button>
            <button className="backup-popup-btn" onClick={async () => { await importData(); setShowBackupMenu(false); }}>
              <UploadIcon size={16} />
              <span>{t.importData}</span>
            </button>
            <button className="backup-popup-btn" onClick={async () => { await importNote(); setShowBackupMenu(false); }}>
              <UploadIcon size={16} />
              <span>{t.importNote}</span>
            </button>
          </div>
        )}
        {showPassphraseDialog && (
          <PassphraseDialog
            mode="set"
            onSubmit={async (passphrase) => {
              const ok = await enableAutoBackup(passphrase);
              if (ok) setShowPassphraseDialog(false);
              return ok;
            }}
            onCancel={() => setShowPassphraseDialog(false)}
          />
        )}
        {showShortcuts && (
          <div className="shortcuts-popup show" onClick={(e) => e.stopPropagation()}>
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

            <div className="shortcuts-section-title">{t.shortcutsRichtextMarkdown}</div>
            <div className="shortcuts-grid">
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.bodyTextShortcut}</span>
                  <span className="shortcut-key">{shortcuts.bodyText}</span>
                </div>
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
                  <span className="shortcut-desc">{t.underlineShortcut}</span>
                  <span className="shortcut-key">{shortcuts.underline}</span>
                </div>
              </div>
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.heading3Shortcut}</span>
                  <span className="shortcut-key">{shortcuts.heading3}</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.strikethroughShortcut}</span>
                  <span className="shortcut-key">{shortcuts.strikethrough}</span>
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
            </div>

            <div className="shortcuts-section-title">{t.shortcutsMarkdown}</div>
            <div className="shortcuts-grid">
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.inlineCodeShortcut}</span>
                  <span className="shortcut-key">{shortcuts.inlineCode}</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.codeBlockShortcut}</span>
                  <span className="shortcut-key">{shortcuts.codeBlock}</span>
                </div>
              </div>
            </div>
          </div>
        )}
        {showGuide && (
          <div className="shortcuts-popup show" onClick={(e) => e.stopPropagation()}>
            <div className="shortcuts-title">{t.guideWelcome}</div>
            <p className="guide-intro">{t.guideIntro}</p>
            <div className="guide-grid">
              <div className="guide-item">
                <div className="guide-item-title">{t.guideFormats}</div>
                <div className="guide-item-desc">{t.guideFormatsDesc}</div>
              </div>
              <div className="guide-item">
                <div className="guide-item-title">{t.guideNaming}</div>
                <div className="guide-item-desc">{t.guideNamingDesc}</div>
              </div>
              <div className="guide-item">
                <div className="guide-item-title">{t.guideQuickWrite}</div>
                <div className="guide-item-desc">{t.guideQuickWriteDesc}</div>
              </div>
              <div className="guide-item">
                <div className="guide-item-title">{t.guideOrganize}</div>
                <div className="guide-item-desc">{t.guideOrganizeDesc}</div>
              </div>
              <div className="guide-item">
                <div className="guide-item-title">{t.guideAutoBackup}</div>
                <div className="guide-item-desc">{t.guideAutoBackupDesc}</div>
              </div>
              <div className="guide-item">
                <div className="guide-item-title">{t.guideExport}</div>
                <div className="guide-item-desc">{t.guideExportDesc}</div>
              </div>
              <div className="guide-item">
                <div className="guide-item-title">{t.guideOffline}</div>
                <div className="guide-item-desc">{t.guideOfflineDesc}{installHint && ` ${installHint}`}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="app-footer">
        <a href="https://github.com/elzacka" target="_blank" rel="noopener noreferrer" className="footer-link">elzacka</a>
        <span>2026</span>
        <span>v2.14.0</span>
      </div>

      {contextMenu && (
        <div
          className="context-menu show"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'sidebar' ? (
            <>
              <button className="context-menu-item" onClick={() => handleNewInContext('folder')}>
                <FolderIcon />
                <span>{t.newFolder}</span>
              </button>
              <button className="context-menu-item" onClick={() => handleNewInContext('note')}>
                <NoteIcon />
                <span>{t.newNote}</span>
              </button>
            </>
          ) : (
            <>
              <button className="context-menu-item" onClick={() => handleNewInContext('note')}>
                <NoteIcon />
                <span>{t.newNote}</span>
              </button>
              <button className="context-menu-item" onClick={() => handleNewInContext('folder')}>
                <FolderIcon />
                <span>{t.newFolder}</span>
              </button>
              <div className="context-menu-divider" />
              <button
                className="context-menu-item"
                onClick={contextMenu.type === 'folder' ? handleStartEditFolder : handleStartEditNote}
              >
                <EditIcon />
                <span>{t.rename}</span>
              </button>
              {contextMenu.type === 'note' && (
                <button className="context-menu-item" onClick={handleDuplicate}>
                  <CopyIcon />
                  <span>{t.duplicate}</span>
                </button>
              )}
              {contextMenu.type === 'note' &&
                state.notes.find(n => n.id === contextMenu.id)?.parentId != null && (
                <button className="context-menu-item" onClick={handleMoveToRoot}>
                  <FolderOutputIcon />
                  <span>
                    {multiSelected.size > 1 && multiSelected.has(contextMenu.id)
                      ? `${t.moveToRoot} (${multiSelected.size})`
                      : t.moveToRoot}
                  </span>
                </button>
              )}
              <div className="context-menu-divider" />
              <button className="context-menu-item" onClick={handleDelete}>
                <DeleteIcon />
                <span>
                  {contextMenu.type === 'note' && multiSelected.size > 1 && multiSelected.has(contextMenu.id)
                    ? `${t.delete} (${multiSelected.size})`
                    : t.delete}
                </span>
              </button>
            </>
          )}
        </div>
      )}

      {tagContextMenu && (
        <div
          className="context-menu show"
          style={{ left: tagContextMenu.x, top: tagContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="context-menu-item" onClick={handleStartEditTag}>
            <EditIcon />
            <span>{t.rename}</span>
          </button>
          <div className="context-menu-divider" />
          <button className="context-menu-item" onClick={handleDeleteTag}>
            <DeleteIcon />
            <span>{t.delete}</span>
          </button>
        </div>
      )}
    </aside>
  );
}
