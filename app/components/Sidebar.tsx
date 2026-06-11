'use client';

import { useState } from 'react';
import styles from '../page.module.css';
import type { Conversation } from '@/lib/types';
import {
  CrossIcon,
  ChatIcon,
  ChevronDownIcon,
  CheckIcon,
  CloseIcon,
  EditIcon,
  ArchiveIcon,
  TrashIcon,
  DownloadIcon,
  UploadIcon,
} from './icons';

type Props = {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewWalk: () => void;
  onRename: (id: string, title: string) => void;
  onToggleArchive: (id: string) => void;
  onRequestDelete: (id: string) => void;
  onExport: () => void;
  onImport: (json: string) => void;
};

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNewWalk,
  onRename,
  onToggleArchive,
  onRequestDelete,
  onExport,
  onImport,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [isArchivedExpanded, setIsArchivedExpanded] = useState(false);

  const startEditing = (c: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(c.id);
    setEditTitle(c.title);
  };

  const saveEdit = (id: string) => {
    onRename(id, editTitle);
    setEditingId(null);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onImport(String(reader.result));
    reader.readAsText(file);
    e.target.value = '';
  };

  const renderItem = (c: Conversation) => {
    const isActive = c.id === activeId;
    const isEditing = c.id === editingId;

    return (
      <div
        key={c.id}
        className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ''}`}
        onClick={() => {
          if (!isEditing) onSelect(c.id);
        }}
      >
        <span className={styles.sidebarItemIcon} aria-hidden="true">
          <ChatIcon />
        </span>

        {isEditing ? (
          <div className={styles.editTitleWrapper} onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              className={styles.editTitleInput}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit(c.id);
                if (e.key === 'Escape') setEditingId(null);
              }}
              autoFocus
            />
            <button className={styles.iconBtn} onClick={() => saveEdit(c.id)} title="Save Title" aria-label="Save Title">
              <CheckIcon size={12} />
            </button>
            <button className={styles.iconBtn} onClick={() => setEditingId(null)} title="Cancel" aria-label="Cancel">
              <CloseIcon size={12} />
            </button>
          </div>
        ) : (
          <>
            <span className={styles.sidebarItemTitle}>{c.title}</span>
            <div className={styles.sidebarItemActions}>
              <button className={styles.iconBtn} onClick={(e) => startEditing(c, e)} title="Rename Walk" aria-label="Rename Walk">
                <EditIcon size={12} />
              </button>
              <button
                className={styles.iconBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleArchive(c.id);
                }}
                title={c.isArchived ? 'Unarchive Walk' : 'Archive Walk'}
                aria-label={c.isArchived ? 'Unarchive Walk' : 'Archive Walk'}
              >
                <ArchiveIcon size={12} restore={c.isArchived} />
              </button>
              <button
                className={styles.iconBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestDelete(c.id);
                }}
                title="Delete Walk"
                aria-label="Delete Walk"
              >
                <TrashIcon size={12} />
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  const active = conversations.filter((c) => !c.isArchived);
  const archived = conversations.filter((c) => c.isArchived);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <button className={styles.newWalkBtn} onClick={onNewWalk}>
          <span className={styles.newWalkIcon} aria-hidden="true">
            <CrossIcon size={16} />
          </span>
          <span>New Walk</span>
        </button>
      </div>

      <div className={styles.sidebarContent}>
        <div className={styles.sidebarSection}>
          <h3 className={styles.sidebarSectionTitle}>Active Walks</h3>
          <div className={styles.sidebarList}>{active.map(renderItem)}</div>
        </div>

        {archived.length > 0 && (
          <div className={styles.sidebarSection}>
            <button
              className={styles.accordionHeader}
              onClick={() => setIsArchivedExpanded((prev) => !prev)}
              aria-expanded={isArchivedExpanded}
            >
              <span>Archived Walks</span>
              <span
                className={styles.accordionArrow}
                style={{ transform: isArchivedExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                <ChevronDownIcon size={10} />
              </span>
            </button>
            {isArchivedExpanded && <div className={styles.sidebarList}>{archived.map(renderItem)}</div>}
          </div>
        )}
      </div>

      <div className={styles.sidebarFooter}>
        <button className={styles.sidebarFooterBtn} onClick={onExport} title="Export conversations">
          <DownloadIcon size={13} />
          <span>Export</span>
        </button>
        <label className={styles.sidebarFooterBtn} title="Import conversations">
          <UploadIcon size={13} />
          <span>Import</span>
          <input type="file" accept="application/json" onChange={handleImportFile} hidden />
        </label>
      </div>
    </aside>
  );
}
