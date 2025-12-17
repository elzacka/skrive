import { useState } from 'react';
import { useApp } from '@/contexts';
import { i18n } from '@/utils/i18n';
import { isMac } from '@/utils';
import type { Note, Folder } from '@/types';

// SVG Icons (Material Design style)
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z" />
    </svg>
  );
}

// Material Symbols: encrypted
function EncryptedIcon() {
  return (
    <svg viewBox="0 -960 960 960" aria-hidden="true">
      <path d="M420-360h120l-23-129q20-10 31.5-29t11.5-42q0-33-23.5-56.5T480-640q-33 0-56.5 23.5T400-560q0 23 11.5 42t31.5 29l-23 129Zm60 280q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Zm0-84q104-33 172-132t68-220v-189l-240-90-240 90v189q0 121 68 220t172 132Zm0-316Z" />
    </svg>
  );
}

interface TreeItemProps {
  folder: Folder;
  folders: Folder[];
  notes: Note[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onToggleFolder: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, type: 'folder' | 'note', id: string) => void;
  onMoveNote?: (noteId: string, targetFolderId: string | null) => void;
}

function TreeFolder({ folder, folders, notes, selectedNoteId, onSelectNote, onToggleFolder, onContextMenu, onMoveNote }: TreeItemProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const childFolders = folders.filter(f => f.parentId === folder.id);
  const childNotes = notes.filter(n => n.parentId === folder.id);
  const hasChildren = childFolders.length > 0 || childNotes.length > 0;

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
        onClick={() => onToggleFolder(folder.id)}
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
        <span className="tree-label">{folder.name}</span>
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
              onSelectNote={onSelectNote}
              onToggleFolder={onToggleFolder}
              onContextMenu={onContextMenu}
              onMoveNote={onMoveNote}
            />
          ))}
          {childNotes.map(note => (
            <TreeNote
              key={note.id}
              note={note}
              isSelected={note.id === selectedNoteId}
              onSelect={onSelectNote}
              onContextMenu={onContextMenu}
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
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, type: 'folder' | 'note', id: string) => void;
}

function TreeNote({ note, isSelected, onSelect, onContextMenu }: TreeNoteProps) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', note.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="tree-item">
      <div
        className={`tree-item-row ${isSelected ? 'active' : ''}`}
        onClick={() => onSelect(note.id)}
        onContextMenu={(e) => onContextMenu(e, 'note', note.id)}
        draggable
        onDragStart={handleDragStart}
      >
        <span className="tree-expand hidden"><ChevronRightIcon /></span>
        <span className="tree-icon"><NoteIcon /></span>
        <span className="tree-label">{note.title || 'Untitled'}</span>
      </div>
    </div>
  );
}

export function Sidebar() {
  const {
    state,
    createNote,
    createFolder,
    deleteNote,
    deleteFolder,
    updateFolder,
    selectNote,
    setTagFilter,
    setSearchQuery,
    setLang,
    getFilteredNotes,
    moveNote
  } = useApp();

  const t = i18n[state.lang];
  const filteredNotes = getFilteredNotes();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'folder' | 'note'; id: string } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [showEncryptionInfo, setShowEncryptionInfo] = useState(false);

  const rootFolders = state.folders.filter(f => f.parentId === null);
  const rootNotes = filteredNotes.filter(n => n.parentId === null);

  const handleToggleFolder = (id: string) => {
    const folder = state.folders.find(f => f.id === id);
    if (folder) {
      updateFolder(id, { expanded: !folder.expanded });
    }
  };

  const handleContextMenu = (e: React.MouseEvent, type: 'folder' | 'note', id: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type, id });
  };

  const closeContextMenu = () => setContextMenu(null);

  const handleDelete = () => {
    if (!contextMenu) return;
    if (contextMenu.type === 'folder') {
      deleteFolder(contextMenu.id);
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
      createFolder(parentId);
    }
    closeContextMenu();
  };

  const getTagNoteCount = (tagId: string) => {
    return state.notes.filter(n => n.tags.includes(tagId)).length;
  };

  const mac = isMac();
  const shortcuts = {
    newNote: mac ? '⌥N' : 'Ctrl+Shift+1',
    tags: mac ? '⌥T' : 'Ctrl+Shift+2',
    toggleSidebar: mac ? '⌥M' : 'Ctrl+Shift+3',
    search: mac ? '⌘K' : 'Ctrl+K'
  };

  return (
    <aside className={`sidebar ${state.sidebarVisible ? '' : 'hidden'}`} onClick={() => { closeContextMenu(); setShowShortcuts(false); setShowLangDropdown(false); setShowEncryptionInfo(false); }}>
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
        <div className="section-title">{t.tags}</div>
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
          {state.tags.map(tag => (
            <button
              key={tag.id}
              className={`tag-filter-btn ${state.selectedTagFilter === tag.id ? 'active' : ''}`}
              onClick={() => setTagFilter(tag.id)}
              role="option"
              aria-selected={state.selectedTagFilter === tag.id}
            >
              <span>{tag.name}</span>
              <span className="tag-count">{getTagNoteCount(tag.id)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="notes-section">
        <div className="notes-header">
          <span className="section-title">{t.notes}</span>
          <button className="new-btn" onClick={() => createNote()} title={t.newNote} aria-label={t.newNote}>
            <PlusIcon />
          </button>
        </div>
        <div className="notes-tree" role="tree" aria-label={t.notes}>
          {rootFolders.map(folder => (
            <TreeFolder
              key={folder.id}
              folder={folder}
              folders={state.folders}
              notes={filteredNotes}
              selectedNoteId={state.selectedNoteId}
              onSelectNote={selectNote}
              onToggleFolder={handleToggleFolder}
              onContextMenu={handleContextMenu}
              onMoveNote={moveNote}
            />
          ))}
          {rootNotes.map(note => (
            <TreeNote
              key={note.id}
              note={note}
              isSelected={note.id === state.selectedNoteId}
              onSelect={selectNote}
              onContextMenu={handleContextMenu}
            />
          ))}
        </div>
      </div>

      <div className="sidebar-footer-buttons">
        <button
          className="sidebar-footer-btn"
          onClick={(e) => { e.stopPropagation(); setShowEncryptionInfo(!showEncryptionInfo); setShowShortcuts(false); }}
          title={state.lang === 'no' ? 'Kryptering' : 'Encryption'}
          aria-label={state.lang === 'no' ? 'Kryptering' : 'Encryption'}
        >
          <EncryptedIcon />
        </button>
        {showEncryptionInfo && (
          <div className="encryption-popup show" onClick={(e) => e.stopPropagation()}>
            <p className="encryption-popup-text">
              {state.lang === 'no'
                ? 'Notatene dine er ende-til-ende-kryptert med AEGIS-256 slik at andre ikke får se dem.'
                : 'Your notes are end-to-end encrypted with AEGIS-256 so others cannot see them.'}
            </p>
          </div>
        )}
        <button
          className="sidebar-footer-btn"
          onClick={(e) => { e.stopPropagation(); setShowShortcuts(!showShortcuts); setShowEncryptionInfo(false); }}
          title={t.shortcuts}
          aria-label={t.shortcuts}
        >
          <KeyboardIcon />
        </button>
        <div className="lang-picker">
          <button
            className="sidebar-footer-btn"
            onClick={(e) => { e.stopPropagation(); setShowLangDropdown(!showLangDropdown); }}
            title="Språk"
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
                Engelsk
              </button>
            </div>
          )}
        </div>
        {showShortcuts && (
          <div className="shortcuts-popup show" onClick={(e) => e.stopPropagation()}>
            <div className="shortcuts-title">{t.shortcuts}</div>
            <div className="shortcut-item">
              <span className="shortcut-key">{shortcuts.newNote}</span>
              <span className="shortcut-desc">{t.newNoteShortcut}</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-key">{shortcuts.tags}</span>
              <span className="shortcut-desc">{t.tagsShortcut}</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-key">{shortcuts.toggleSidebar}</span>
              <span className="shortcut-desc">{t.toggleSidebar}</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-key">{shortcuts.search}</span>
              <span className="shortcut-desc">{t.search.replace('...', '')}</span>
            </div>
          </div>
        )}
      </div>

      <div className="app-footer">
        <a href="https://github.com/elzacka" target="_blank" rel="noopener noreferrer" className="footer-link">elzacka</a>
        <span>2025</span>
        <span>v2.0.0</span>
      </div>

      {contextMenu && (
        <div
          className="context-menu show"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="context-menu-item" onClick={() => handleNewInContext('note')}>
            <NoteIcon />
            <span>{t.newNote}</span>
          </button>
          <button className="context-menu-item" onClick={() => handleNewInContext('folder')}>
            <FolderIcon />
            <span>{t.newFolder}</span>
          </button>
          <div className="context-menu-divider" />
          <button className="context-menu-item" onClick={handleDelete}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
            <span>{t.delete}</span>
          </button>
        </div>
      )}
    </aside>
  );
}
