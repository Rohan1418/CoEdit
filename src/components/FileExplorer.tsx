import React, { useState } from 'react';
import type { FileItem } from '../types';
import { 
  Folder, 
  FolderOpen, 
  FileCode, 
  FilePlus, 
  FolderPlus, 
  Trash2, 
  Edit3, 
  ChevronRight, 
  ChevronDown,
  FileText,
  FileJson,
  FileSpreadsheet
} from 'lucide-react';

interface FileExplorerProps {
  files: FileItem[];
  activeFileId: string | null;
  onSelectFile: (file: FileItem) => void;
  onCreateFile: (name: string, parentPath: string, isFolder: boolean) => void;
  onRenameFile: (fileId: string, newName: string) => void;
  onDeleteFile: (fileId: string) => void;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  files,
  activeFileId,
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile
}) => {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [isCreatingFile, setIsCreatingFile] = useState<boolean>(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false);
  const [newItemName, setNewItemName] = useState<string>('');
  const [selectedParentPath, setSelectedParentPath] = useState<string>('/');
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  const toggleFolder = (folderPath: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  const handleStartCreate = (isFolder: boolean) => {
    setIsCreatingFolder(isFolder);
    setIsCreatingFile(!isFolder);
    setNewItemName('');
  };

  const handleConfirmCreate = () => {
    const trimmed = newItemName.trim();
    if (trimmed) {
      onCreateFile(trimmed, selectedParentPath, isCreatingFolder);
      setNewItemName('');
      setIsCreatingFile(false);
      setIsCreatingFolder(false);
    }
  };

  const handleStartRename = (file: FileItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFileId(file.id);
    setEditingName(file.name);
  };

  const handleConfirmRename = (fileId: string) => {
    const trimmed = editingName.trim();
    if (trimmed) {
      onRenameFile(fileId, trimmed);
    }
    setEditingFileId(null);
  };

  const handleDelete = (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Delete this item? This action will sync with all collaborators.')) {
      onDeleteFile(fileId);
    }
  };

  // Helper for file type icon
  const renderFileIcon = (fileName: string, isFolder: boolean, isOpen: boolean) => {
    if (isFolder) {
      return isOpen ? (
        <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
      ) : (
        <Folder className="w-4 h-4 text-amber-400 shrink-0" />
      );
    }

    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
        return <FileCode className="w-4 h-4 text-blue-400 shrink-0" />;
      case 'py':
        return <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'json':
        return <FileJson className="w-4 h-4 text-yellow-400 shrink-0" />;
      case 'md':
        return <FileText className="w-4 h-4 text-sky-400 shrink-0" />;
      default:
        return <FileSpreadsheet className="w-4 h-4 text-stone-400 shrink-0" />;
    }
  };

  // Build sorted hierarchy (folders first, then files)
  const sortedFiles = [...files].sort((a, b) => {
    if (a.is_folder && !b.is_folder) return -1;
    if (!a.is_folder && b.is_folder) return 1;
    return a.path.localeCompare(b.path);
  });

  return (
    <div 
      id="file-explorer-panel"
      className="h-full flex flex-col bg-stone-900 border-r border-stone-800 text-stone-300 select-none text-xs"
    >
      {/* Explorer Top Toolbar */}
      <div 
        id="file-explorer-toolbar"
        className="h-10 px-3 flex items-center justify-between border-b border-stone-800 text-stone-400 font-semibold tracking-wider uppercase text-[11px]"
      >
        <span>Explorer</span>
        <div className="flex items-center space-x-1">
          <button
            id="create-new-file-btn"
            onClick={() => handleStartCreate(false)}
            className="p-1 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded transition"
            title="New File"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
          <button
            id="create-new-folder-btn"
            onClick={() => handleStartCreate(true)}
            className="p-1 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded transition"
            title="New Folder"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Inline Create File / Folder Form */}
      {(isCreatingFile || isCreatingFolder) && (
        <div 
          id="inline-create-form"
          className="p-2 border-b border-stone-800 bg-stone-950/60"
        >
          <div className="flex items-center space-x-1.5 mb-1.5 text-stone-400">
            {isCreatingFolder ? <FolderPlus className="w-3.5 h-3.5 text-amber-400" /> : <FilePlus className="w-3.5 h-3.5 text-emerald-400" />}
            <span className="text-[11px] font-medium">New {isCreatingFolder ? 'Folder' : 'File'} in {selectedParentPath}</span>
          </div>
          <div className="flex items-center space-x-1">
            <input
              id="new-item-input"
              type="text"
              autoFocus
              value={newItemName}
              placeholder={isCreatingFolder ? 'folder-name' : 'filename.ts'}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmCreate();
                if (e.key === 'Escape') {
                  setIsCreatingFile(false);
                  setIsCreatingFolder(false);
                }
              }}
              className="flex-1 bg-stone-900 border border-stone-700 rounded px-2 py-1 text-stone-200 text-xs focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={handleConfirmCreate}
              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium transition"
            >
              Add
            </button>
            <button
              onClick={() => {
                setIsCreatingFile(false);
                setIsCreatingFolder(false);
              }}
              className="px-2 py-1 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded text-xs transition"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* File Tree List */}
      <div 
        id="file-tree-list"
        className="flex-1 overflow-y-auto py-2 px-1 space-y-0.5"
      >
        {sortedFiles.length === 0 ? (
          <div className="px-3 py-6 text-center text-stone-400">
            <p>No files in project.</p>
            <p className="text-[10px] mt-1 text-stone-400">Click the + icon above to create one.</p>
          </div>
        ) : (
          sortedFiles.map((file) => {
            const isFolder = file.is_folder;
            const isCollapsed = collapsedFolders.has(file.path);
            const isActive = activeFileId === file.id;
            const depth = file.path.split('/').filter(Boolean).length - 1;
            const paddingLeft = `${Math.max(4, depth * 14 + 6)}px`;

            // If a parent folder is collapsed, hide this item
            const pathParts = file.path.split('/').filter(Boolean);
            let isParentCollapsed = false;
            let currentCheck = '';
            for (let i = 0; i < pathParts.length - 1; i++) {
              currentCheck += '/' + pathParts[i];
              if (collapsedFolders.has(currentCheck)) {
                isParentCollapsed = true;
                break;
              }
            }
            if (isParentCollapsed) return null;

            return (
              <div
                key={file.id}
                id={`file-item-${file.id}`}
                style={{ paddingLeft }}
                onClick={() => {
                  if (isFolder) {
                    toggleFolder(file.path);
                    setSelectedParentPath(file.path);
                  } else {
                    onSelectFile(file);
                    setSelectedParentPath(file.parent_path);
                  }
                }}
                className={`group flex items-center justify-between pr-2 py-1.5 rounded cursor-pointer transition ${
                  isActive
                    ? 'bg-emerald-950/70 text-emerald-300 font-medium'
                    : 'hover:bg-stone-800/80 text-stone-300 hover:text-stone-100'
                }`}
              >
                <div className="flex items-center space-x-1.5 min-w-0 flex-1">
                  {isFolder && (
                    <span className="text-stone-400">
                      {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  )}
                  {renderFileIcon(file.name, isFolder, !isCollapsed)}

                  {editingFileId === file.id ? (
                    <input
                      type="text"
                      autoFocus
                      value={editingName}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleConfirmRename(file.id);
                        if (e.key === 'Escape') setEditingFileId(null);
                      }}
                      onBlur={() => handleConfirmRename(file.id)}
                      className="bg-stone-950 border border-emerald-500 rounded px-1 text-xs text-white focus:outline-none w-28"
                    />
                  ) : (
                    <span className="truncate font-mono text-[12px]">{file.name}</span>
                  )}
                </div>

                {/* Actions on hover */}
                <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 text-stone-400">
                  <button
                    onClick={(e) => handleStartRename(file, e)}
                    className="p-1 hover:text-stone-200 hover:bg-stone-700 rounded transition"
                    title="Rename"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => handleDelete(file.id, e)}
                    className="p-1 hover:text-rose-400 hover:bg-stone-700 rounded transition"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Target Directory Footer */}
      <div 
        id="file-explorer-footer"
        className="h-7 px-3 bg-stone-950 border-t border-stone-800 text-[10px] text-stone-400 flex items-center justify-between"
      >
        <span className="truncate">Root: {selectedParentPath}</span>
        <span>{files.length} items</span>
      </div>
    </div>
  );
};
