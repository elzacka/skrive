import { useState, useEffect, useRef, useMemo, memo } from 'react';
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
  EditIcon,
  ArrowForwardIcon,
  SwapVertIcon,
  DownloadIcon,
  UploadIcon
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
  untitledText: string;
}

const TreeFolder = memo(function TreeFolder({ folder, folders, notes, selectedNoteId, onSelectNote, onToggleFolder, onContextMenu, onMoveNote, editingFolderId, editingFolderName, onEditingFolderNameChange, onSaveFolderName, onFolderKeyDown, untitledText, lang }: TreeItemProps & { lang: string }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const childFolders = folders.filter(f => f.parentId === folder.id).sort((a, b) => a.name.localeCompare(b.name, lang));
  const childNotes = notes.filter(n => n.parentId === folder.id).sort((a, b) => (a.title || untitledText).localeCompare(b.title || untitledText, lang));
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
              untitledText={untitledText}
              lang={lang}
            />
          ))}
          {childNotes.map(note => (
            <TreeNote
              key={note.id}
              note={note}
              isSelected={note.id === selectedNoteId}
              onSelect={onSelectNote}
              onContextMenu={onContextMenu}
              untitledText={untitledText}
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
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, type: 'folder' | 'note', id: string) => void;
  untitledText: string;
}

const TreeNote = memo(function TreeNote({ note, isSelected, onSelect, onContextMenu, untitledText }: TreeNoteProps) {
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
        <span className="tree-label">{note.title || untitledText}</span>
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
    deleteFolder,
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
    importNote
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
  const [showPrivacyInfo, setShowPrivacyInfo] = useState(false);
  const [showBackupMenu, setShowBackupMenu] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const sidebarRef = useRef<HTMLElement>(null);

  // Close popups when clicking outside sidebar
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setShowShortcuts(false);
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

  const rootFolders = useMemo(() =>
    state.folders.filter(f => f.parentId === null).sort((a, b) => a.name.localeCompare(b.name, state.lang)),
    [state.folders, state.lang]
  );
  const rootNotes = useMemo(() =>
    filteredNotes.filter(n => n.parentId === null).sort((a, b) => (a.title || t.untitled).localeCompare(b.title || t.untitled, state.lang)),
    [filteredNotes, state.lang, t.untitled]
  );

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
  const shortcuts = useMemo(() => ({
    newNote: mac ? '\u2325N' : 'Ctrl+Shift+1',
    search: mac ? '\u2318K' : 'Ctrl+K',
    save: mac ? '\u2318S' : 'Ctrl+S',
    toggleSidebar: mac ? '\u2325M' : 'Ctrl+Shift+3',
    undo: mac ? '\u2318Z' : 'Ctrl+Z',
    redo: mac ? '\u2318\u21E7Z' : 'Ctrl+Y',
    bold: mac ? '\u2318B' : 'Ctrl+B',
    italic: mac ? '\u2318I' : 'Ctrl+I',
    heading1: mac ? '\u23181' : 'Ctrl+1',
    heading2: mac ? '\u23182' : 'Ctrl+2',
    heading3: mac ? '\u23183' : 'Ctrl+3',
    bodyText: mac ? '\u23180' : 'Ctrl+0',
    bulletList: mac ? '\u2318\u21E78' : 'Ctrl+Shift+8',
    numberedList: mac ? '\u2318\u21E77' : 'Ctrl+Shift+7',
    inlineCode: mac ? '\u2318E' : 'Ctrl+E',
    codeBlock: mac ? '\u2318\u21E7E' : 'Ctrl+Shift+E',
    link: mac ? '\u2318L' : 'Ctrl+L',
    quote: mac ? '\u2318\u21E7.' : 'Ctrl+Shift+.'
  }), [mac]);

  return (
    <aside ref={sidebarRef} className={`sidebar ${state.sidebarVisible ? '' : 'hidden'}`} onClick={() => { closeContextMenu(); closeTagContextMenu(); setShowShortcuts(false); setShowLangDropdown(false); setShowPrivacyInfo(false); setShowBackupMenu(false); }}>
      <div className="sidebar-header">
        <span className="sidebar-title">Skrive</span>
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
            {[...state.tags].sort((a, b) => a.name.localeCompare(b.name, state.lang)).map(tag => (
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
              untitledText={t.untitled}
              lang={state.lang}
            />
          ))}
          {rootNotes.map(note => (
            <TreeNote
              key={note.id}
              note={note}
              isSelected={note.id === state.selectedNoteId}
              onSelect={selectNote}
              onContextMenu={handleContextMenu}
              untitledText={t.untitled}
            />
          ))}
        </div>
      </div>

      <div className="sidebar-footer-buttons">
        <button
          className="sidebar-footer-btn"
          onClick={(e) => { e.stopPropagation(); setShowPrivacyInfo(!showPrivacyInfo); setShowShortcuts(false); setShowBackupMenu(false); }}
          title={t.securityPrivacy}
          aria-label={t.securityPrivacy}
        >
          <EncryptedIcon />
        </button>
        {showPrivacyInfo && (
          <div className="privacy-popup show" onClick={(e) => e.stopPropagation()}>
            <p className="privacy-popup-text">
              {state.lang === 'no'
                ? 'Notatene dine er ende-til-ende-kryptert med AEGIS-256. Bare du kan lese dem.'
                : 'Your notes are end-to-end encrypted with AEGIS-256. Only you can read them.'}
            </p>
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
          onClick={(e) => { e.stopPropagation(); setShowShortcuts(!showShortcuts); setShowPrivacyInfo(false); setShowBackupMenu(false); }}
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
        <button
          className="sidebar-footer-btn"
          onClick={(e) => { e.stopPropagation(); setShowBackupMenu(!showBackupMenu); setShowPrivacyInfo(false); setShowShortcuts(false); }}
          title={t.importExport}
          aria-label={t.importExport}
        >
          <SwapVertIcon />
        </button>
        {showBackupMenu && (
          <div className="backup-popup show" onClick={(e) => e.stopPropagation()}>
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
                  <span className="shortcut-desc">{t.bulletListShortcut}</span>
                  <span className="shortcut-key">{shortcuts.bulletList}</span>
                </div>
              </div>
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.heading3Shortcut}</span>
                  <span className="shortcut-key">{shortcuts.heading3}</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.numberedListShortcut}</span>
                  <span className="shortcut-key">{shortcuts.numberedList}</span>
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
                  <span className="shortcut-desc">{t.linkShortcut}</span>
                  <span className="shortcut-key">{shortcuts.link}</span>
                </div>
              </div>
              <div className="shortcut-row">
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.codeBlockShortcut}</span>
                  <span className="shortcut-key">{shortcuts.codeBlock}</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t.quoteShortcut}</span>
                  <span className="shortcut-key">{shortcuts.quote}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="app-footer">
        <a href="https://github.com/elzacka" target="_blank" rel="noopener noreferrer" className="footer-link">elzacka</a>
        <span>2025</span>
        <span>v2.8.0</span>
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
