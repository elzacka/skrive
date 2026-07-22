import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { useApp } from '@/contexts';
import { i18n } from '@/utils/i18n';
import { isMac } from '@/utils';
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
}

export type NoteSortMode = 'alpha' | 'recent';

function compareNotes(a: Note, b: Note, sortMode: NoteSortMode, untitledText: string, lang: string): number {
  if (sortMode === 'recent') {
    return b.updatedAt - a.updatedAt;
  }
  return (a.title || untitledText).localeCompare(b.title || untitledText, lang);
}

const TreeFolder = memo(function TreeFolder({ folder, folders, notes, selectedNoteId, multiSelectedIds, onSelectNote, onToggleFolder, onContextMenu, onMoveNote, editingFolderId, editingFolderName, onEditingFolderNameChange, onSaveFolderName, onFolderKeyDown, untitledText, sortMode, editingNoteId, editingNoteName, onEditingNoteNameChange, onSaveNoteName, onNoteNameKeyDown, lang }: TreeItemProps & { lang: string }) {
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
    <div className="tree-item">
      <div
        className={`tree-item-row ${isDragOver ? 'drag-over' : ''}`}
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
        <div className="tree-children expanded">
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
}

const TreeNote = memo(function TreeNote({ note, isSelected, isMultiSelected, onSelect, onContextMenu, onMoveNote, untitledText, editingNoteId, editingNoteName, onEditingNoteNameChange, onSaveNoteName, onNoteNameKeyDown }: TreeNoteProps) {
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
    <div className="tree-item">
      <div
        className={`tree-item-row ${isSelected ? 'active' : ''} ${isMultiSelected ? 'multi-selected' : ''}`}
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

  // Delete/Backspace removes the multi-selection (undo toast covers it),
  // but never while typing in an input or the editor
  useEffect(() => {
    if (multiSelected.size === 0) return;
    const handleDeleteKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
        return;
      }
      e.preventDefault();
      deleteNotes(Array.from(multiSelected));
      setMultiSelected(new Set());
    };
    window.addEventListener('keydown', handleDeleteKey);
    return () => window.removeEventListener('keydown', handleDeleteKey);
  }, [multiSelected, deleteNotes]);

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

  // Finder-style selection: plain click opens a note, Cmd/Ctrl+Click
  // toggles it in the selection, Shift+Click selects the range from the
  // last clicked note
  const handleSelectNote = (id: string, e: React.MouseEvent) => {
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

  const handleDelete = () => {
    if (!contextMenu) return;
    if (contextMenu.type === 'folder') {
      // Folder deletion is recursive and has no undo, so confirm it;
      // note deletion shows an undo toast instead
      if (confirm(t.confirmDeleteFolder)) {
        deleteFolder(contextMenu.id);
      }
    } else if (multiSelected.size > 1 && multiSelected.has(contextMenu.id)) {
      deleteNotes(Array.from(multiSelected));
      setMultiSelected(new Set());
    } else {
      deleteNote(contextMenu.id);
    }
    closeContextMenu();
  };

  const handleNewInContext = (type: 'note' | 'folder') => {
    if (!contextMenu) return;
    const parentId = contextMenu.type === 'folder' ? contextMenu.id : null;
    if (type === 'note') {
      createNote(parentId);
    } else {
      const newFolderId = createFolder(parentId);
      // Start editing the new folder name immediately
      setEditingFolderId(newFolderId);
      setEditingFolderName(t.newFolder);
    }
    closeContextMenu();
  };

  const handleStartEditNote = () => {
    if (!contextMenu || contextMenu.type !== 'note') return;
    const note = state.notes.find(n => n.id === contextMenu.id);
    if (note) {
      setEditingNoteId(note.id);
      setEditingNoteName(note.title);
    }
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

  const handleStartEditFolder = () => {
    if (!contextMenu || contextMenu.type !== 'folder') return;
    const folder = state.folders.find(f => f.id === contextMenu.id);
    if (folder) {
      setEditingFolderId(folder.id);
      setEditingFolderName(folder.name);
    }
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

  const getTagNoteCount = (tagId: string) => {
    return state.notes.filter(n => n.tags.includes(tagId)).length;
  };

  const mac = isMac();
  const shortcuts = useMemo(() => ({
    newNote: mac ? '\u2325N' : 'Ctrl+Shift+1',
    search: mac ? '\u2318K' : 'Ctrl+K',
    find: mac ? '\u2318F' : 'Ctrl+F',
    save: mac ? '\u2318S' : 'Ctrl+S',
    toggleSidebar: mac ? '\u2325M' : 'Ctrl+Shift+3',
    undo: mac ? '\u2318Z' : 'Ctrl+Z',
    redo: mac ? '\u2318\u21E7Z' : 'Ctrl+Y',
    bold: mac ? '\u2318B' : 'Ctrl+B',
    italic: mac ? '\u2318I' : 'Ctrl+I',
    underline: mac ? '\u2318U' : 'Ctrl+U',
    strikethrough: mac ? '\u2318\u21e7X' : 'Ctrl+Shift+X',
    heading1: mac ? '\u2318\u23251' : 'Ctrl+1',
    heading2: mac ? '\u2318\u23252' : 'Ctrl+2',
    heading3: mac ? '\u2318\u23253' : 'Ctrl+3',
    bodyText: mac ? '\u2318\u23250' : 'Ctrl+0',
    bulletList: mac ? '\u2318\u21E78' : 'Ctrl+Shift+8',
    numberedList: mac ? '\u2318\u21E77' : 'Ctrl+Shift+7',
    inlineCode: mac ? '\u2318E' : 'Ctrl+E',
    codeBlock: mac ? '\u2318\u21E7E' : 'Ctrl+Shift+E',
    link: mac ? '\u2318K' : 'Ctrl+K',
    quote: mac ? '\u2318\u21E7.' : 'Ctrl+Shift+.'
  }), [mac]);

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
              </div>
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
                <div className="guide-item-desc">{t.guideOfflineDesc}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="app-footer">
        <a href="https://github.com/elzacka" target="_blank" rel="noopener noreferrer" className="footer-link">elzacka</a>
        <span>2026</span>
        <span>v2.13.2</span>
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
