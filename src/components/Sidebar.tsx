import { useState } from 'react';
import { useApp } from '@/contexts';
import { i18n } from '@/utils/i18n';
import { isMac } from '@/utils';
import type { Note, Folder } from '@/types';
import {
  PlusIcon,
  ChevronRightIcon,
  FolderIcon,
  NoteIcon,
  KeyboardIcon,
  EncryptedIcon,
  DeleteIcon,
  EditIcon
} from './Icons';

interface TreeItemProps {
  folder: Folder;
  folders: Folder[];
  notes: Note[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onToggleFolder: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, type: 'folder' | 'note', id: string) => void;
  onMoveNote?: (noteId: string, targetFolderId: string | null) => void;
  editingFolderId: string | null;
  editingFolderName: string;
  onEditingFolderNameChange: (name: string) => void;
  onSaveFolderName: () => void;
  onFolderKeyDown: (e: React.KeyboardEvent) => void;
}

function TreeFolder({ folder, folders, notes, selectedNoteId, onSelectNote, onToggleFolder, onContextMenu, onMoveNote, editingFolderId, editingFolderName, onEditingFolderNameChange, onSaveFolderName, onFolderKeyDown }: TreeItemProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const childFolders = folders.filter(f => f.parentId === folder.id);
  const childNotes = notes.filter(n => n.parentId === folder.id);
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
              onSelectNote={onSelectNote}
              onToggleFolder={onToggleFolder}
              onContextMenu={onContextMenu}
              onMoveNote={onMoveNote}
              editingFolderId={editingFolderId}
              editingFolderName={editingFolderName}
              onEditingFolderNameChange={onEditingFolderNameChange}
              onSaveFolderName={onSaveFolderName}
              onFolderKeyDown={onFolderKeyDown}
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
    moveNote,
    updateTag,
    deleteTag
  } = useApp();

  const t = i18n[state.lang];
  const filteredNotes = getFilteredNotes();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'folder' | 'note'; id: string } | null>(null);
  const [tagContextMenu, setTagContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
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
  const shortcuts = {
    newNote: mac ? '⌥N' : 'Ctrl+Shift+1',
    search: mac ? '⌘K' : 'Ctrl+K',
    save: mac ? '⌘S' : 'Ctrl+S',
    toggleSidebar: mac ? '⌥M' : 'Ctrl+Shift+3',
    undo: mac ? '⌘Z' : 'Ctrl+Z',
    redo: mac ? '⌘⇧Z' : 'Ctrl+Y'
  };

  return (
    <aside className={`sidebar ${state.sidebarVisible ? '' : 'hidden'}`} onClick={() => { closeContextMenu(); closeTagContextMenu(); setShowShortcuts(false); setShowLangDropdown(false); setShowEncryptionInfo(false); }}>
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
              editingFolderId={editingFolderId}
              editingFolderName={editingFolderName}
              onEditingFolderNameChange={setEditingFolderName}
              onSaveFolderName={handleSaveFolderName}
              onFolderKeyDown={handleFolderKeyDown}
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
              <span className="shortcut-key">{shortcuts.search}</span>
              <span className="shortcut-desc">{t.searchShortcut}</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-key">{shortcuts.save}</span>
              <span className="shortcut-desc">{t.saveShortcut}</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-key">{shortcuts.undo}</span>
              <span className="shortcut-desc">{t.undoShortcut}</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-key">{shortcuts.redo}</span>
              <span className="shortcut-desc">{t.redoShortcut}</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-key">{shortcuts.toggleSidebar}</span>
              <span className="shortcut-desc">{t.toggleSidebar}</span>
            </div>
          </div>
        )}
      </div>

      <div className="app-footer">
        <a href="https://github.com/elzacka" target="_blank" rel="noopener noreferrer" className="footer-link">elzacka</a>
        <span>2025</span>
        <span>v2.2.0</span>
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
          {contextMenu.type === 'folder' && (
            <>
              <div className="context-menu-divider" />
              <button className="context-menu-item" onClick={handleStartEditFolder}>
                <EditIcon />
                <span>{t.rename}</span>
              </button>
            </>
          )}
          <div className="context-menu-divider" />
          <button className="context-menu-item" onClick={handleDelete}>
            <DeleteIcon />
            <span>{t.delete}</span>
          </button>
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
