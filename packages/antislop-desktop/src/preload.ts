import { contextBridge, ipcRenderer, clipboard } from 'electron';

// Expose safe generic IPC API
contextBridge.exposeInMainWorld('electronIpc', {
  send: (channel: string, data: unknown) => {
    ipcRenderer.send(channel, data);
  },
  on: (channel: string, func: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => func(...args));
  },
  invoke: (channel: string, data?: unknown) => {
    return ipcRenderer.invoke(channel, data);
  },
});

// Expose typed File System API (R2 & Milestone v0.1.2)
contextBridge.exposeInMainWorld('electronFS', {
  openDirectory: () => ipcRenderer.invoke('fs:openDirectory'),
  getWorkspaceRoot: () => ipcRenderer.invoke('fs:getWorkspaceRoot'),
  readDirectory: (options?: { dirPath?: string; maxDepth?: number }) =>
    ipcRenderer.invoke('fs:readDirectory', options),
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', { filePath }),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('fs:writeFile', { filePath, content }),
  createFile: (filePathOrParams: string | { filePath?: string; path?: string; dirPath?: string; fileName?: string; content?: string }) => {
    const params = typeof filePathOrParams === 'string' ? { filePath: filePathOrParams } : filePathOrParams;
    return ipcRenderer.invoke('fs:createFile', params);
  },
  createDirectory: (dirPathOrParams: string | { dirPath?: string; path?: string }) => {
    const params = typeof dirPathOrParams === 'string' ? { dirPath: dirPathOrParams } : dirPathOrParams;
    return ipcRenderer.invoke('fs:createDirectory', params);
  },
  rename: (oldPathOrParams: string | { oldPath: string; newPath: string }, maybeNewPath?: string) => {
    const params = typeof oldPathOrParams === 'string'
      ? { oldPath: oldPathOrParams, newPath: maybeNewPath ?? '' }
      : oldPathOrParams;
    return ipcRenderer.invoke('fs:rename', params);
  },
  delete: (pathOrParams: string | { filePath?: string; path?: string }) => {
    const params = typeof pathOrParams === 'string' ? { path: pathOrParams } : pathOrParams;
    return ipcRenderer.invoke('fs:delete', params);
  },
  revealInFolder: (pathOrParams: string | { filePath?: string; path?: string }) => {
    const params = typeof pathOrParams === 'string' ? { path: pathOrParams } : pathOrParams;
    return ipcRenderer.invoke('shell:revealInFolder', params);
  },
});

// Expose typed Shell API (Milestone v0.1.2)
contextBridge.exposeInMainWorld('electronShell', {
  revealInFolder: (pathOrParams: string | { filePath?: string; path?: string }) => {
    const params = typeof pathOrParams === 'string' ? { path: pathOrParams } : pathOrParams;
    return ipcRenderer.invoke('shell:revealInFolder', params);
  },
  showItemInFolder: (filePath: string) =>
    ipcRenderer.invoke('shell:revealInFolder', { path: filePath }),
});

// Expose typed Antigravity CLI API (R6)
contextBridge.exposeInMainWorld('electronAntigravity', {
  checkStatus: () => ipcRenderer.invoke('antigravity:checkStatus'),
  runCommand: (params: { prompt: string; correlationId: string; cwd?: string }) =>
    ipcRenderer.invoke('antigravity:runCommand', params),
  cancelCommand: () => ipcRenderer.invoke('antigravity:cancelCommand'),
  onOutput: (callback: (data: { correlationId: string; stream: 'stdout' | 'stderr'; chunk: string; timestamp: number }) => void) => {
    const handler = (_e: any, d: any) => callback(d);
    ipcRenderer.on('antigravity:output', handler);
    return () => ipcRenderer.removeListener('antigravity:output', handler);
  },
  onExit: (callback: (data: { correlationId: string; exitCode: number; durationMs: number }) => void) => {
    const handler = (_e: any, d: any) => callback(d);
    ipcRenderer.on('antigravity:exit', handler);
    return () => ipcRenderer.removeListener('antigravity:exit', handler);
  },
});

// Expose typed Interactive Terminal API (R4)
contextBridge.exposeInMainWorld('electronTerminal', {
  create: (options?: { cwd?: string; shell?: string }) =>
    ipcRenderer.invoke('terminal:create', options),
  write: (idOrParams: string | { id: string; data: string }, maybeData?: string) => {
    const params = typeof idOrParams === 'string'
      ? { id: idOrParams, data: maybeData ?? '' }
      : idOrParams;
    return ipcRenderer.invoke('terminal:write', params);
  },
  kill: (idOrParams: string | { id: string }) => {
    const params = typeof idOrParams === 'string'
      ? { id: idOrParams }
      : idOrParams;
    return ipcRenderer.invoke('terminal:kill', params);
  },
  onData: (callback: (data: { id: string; data: string }) => void) => {
    const handler = (_e: any, d: any) => callback(d);
    ipcRenderer.on('terminal:data', handler);
    return () => ipcRenderer.removeListener('terminal:data', handler);
  },
  onExit: (callback: (data: { id: string; exitCode: number }) => void) => {
    const handler = (_e: any, d: any) => callback(d);
    ipcRenderer.on('terminal:exit', handler);
    return () => ipcRenderer.removeListener('terminal:exit', handler);
  },
});

// Expose typed Git API (Milestone v0.1.1)
contextBridge.exposeInMainWorld('electronGit', {
  status: () => ipcRenderer.invoke('git:status'),
  init: () => ipcRenderer.invoke('git:init'),
  diff: (filePath: string) => ipcRenderer.invoke('git:diff', { filePath }),
  stage: (filePath?: string) => ipcRenderer.invoke('git:stage', { filePath }),
  unstage: (filePath?: string) => ipcRenderer.invoke('git:unstage', { filePath }),
  discard: (filePath: string) => ipcRenderer.invoke('git:discard', { filePath }),
  commit: (message: string) => ipcRenderer.invoke('git:commit', { message }),
});

// Expose typed Search API (Milestone v0.1.1)
contextBridge.exposeInMainWorld('electronSearch', {
  searchFiles: (options: {
    query: string;
    isCaseSensitive?: boolean;
    isWholeWord?: boolean;
    isRegex?: boolean;
    filesToInclude?: string;
    filesToExclude?: string;
    maxResults?: number;
  }) => ipcRenderer.invoke('fs:searchFiles', options),
});

// Expose typed Clipboard API (Milestone v0.1.2)
contextBridge.exposeInMainWorld('electronClipboard', {
  writeText: (text: string) => {
    try {
      clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  },
  readText: () => {
    try {
      return clipboard.readText();
    } catch {
      return '';
    }
  },
});

// Expose typed Guidance API (Milestone v0.2.0)
contextBridge.exposeInMainWorld('electronGuidance', {
  scoutPattern: (target: { filePath: string; startLine: number; endLine?: number; context?: string; promptText?: string }) =>
    ipcRenderer.invoke('guidance:scoutPattern', target),
});


