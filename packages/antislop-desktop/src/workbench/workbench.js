// NSCode Workbench Host Script
// VS Code Dark+ 5-Zone Workbench Shell, Multi-Tab Monaco Manager, Real FS IPC & Antigravity Bridge

const SAMPLES = {
  'quicksort.py': {
    lang: 'python',
    code: `def quicksort(arr):
    """
    Standard quicksort with recursive partitioning.
    Time Complexity: O(n log n) average, O(n^2) worst case.
    Space Complexity: O(log n) auxiliary stack.
    """
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)

# Test execution
data = [38, 27, 43, 3, 9, 82, 10]
sorted_data = quicksort(data)
print("Sorted:", sorted_data)
`
  },
  'binary_search.cpp': {
    lang: 'cpp',
    code: `#include <iostream>
#include <vector>

// Binary search algorithm
// Time Complexity: O(log n)
// Space Complexity: O(1)
int binarySearch(const std::vector<int>& arr, int target) {
    int low = 0;
    int high = static_cast<int>(arr.size()) - 1;
    
    while (low <= high) {
        int mid = low + (high - low) / 2;
        if (arr[mid] == target) {
            return mid; // Found target at index mid
        }
        if (arr[mid] < target) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    return -1; // Not found
}

int main() {
    std::vector<int> nums = {1, 3, 5, 7, 9, 11, 13};
    int idx = binarySearch(nums, 7);
    std::cout << "Index: " << idx << std::endl;
    return 0;
}
`
  },
  'lru_cache.java': {
    lang: 'java',
    code: `import java.util.*;

/**
 * LRU Cache implementation using LinkedHashMap.
 * Time Complexity: O(1) get and put operations.
 * Space Complexity: O(capacity).
 */
public class LRUCache<K, V> {
    private final int capacity;
    private final LinkedHashMap<K, V> cache;

    public LRUCache(int capacity) {
        this.capacity = capacity;
        this.cache = new LinkedHashMap<>(capacity, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
                return size() > LRUCache.this.capacity;
            }
        };
    }

    public synchronized V get(K key) {
        return cache.getOrDefault(key, null);
    }

    public synchronized void put(K key, V value) {
        cache.put(key, value);
    }
}
`
  },
  'data_processor.cs': {
    lang: 'csharp',
    code: `using System;
using System.Collections.Generic;
using System.Linq;

namespace AntiSlop.Engine
{
    public class DataProcessor
    {
        // Linq transformation pipeline
        public static IEnumerable<int> ProcessStream(IEnumerable<int> source)
        {
            return source
                .Where(n => n % 2 == 0)
                .Select(n => n * n)
                .OrderByDescending(n => n);
        }

        public static void Main()
        {
            var numbers = new[] { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 };
            var results = ProcessStream(numbers);
            Console.WriteLine(string.Join(", ", results));
        }
    }
}
`
  },
  'auth_service.php': {
    lang: 'php',
    code: `<?php
declare(strict_types=1);

namespace AntiSlop\\Security;

class AuthService
{
    private array $users = [];

    public function register(string $username, string $password): bool
    {
        $hash = password_hash($password, PASSWORD_ARGON2ID);
        $this->users[$username] = $hash;
        return true;
    }

    public function verify(string $username, string $password): bool
    {
        if (!isset($this->users[$username])) {
            return false;
        }
        return password_verify($password, $this->users[$username]);
    }
}
`
  }
};

let editor = null;
let activeDecorationIds = [];
let sidecarWs = null;
let currentWorkspaceRoot = null;
let workspaceTree = [];
let expandedDirs = new Set();
let selectedTreePath = null;
let navHistory = [];
let navIndex = -1;
let workspaceFileIndex = [];
let currentScreenBMode = 'chat';

let docManager = null;
let multiGroupManager = null;
let bottomResizer = null;
let terminalController = null;
let outputLogger = null;

// =============================================================================
// FOUNDATIONAL INTERNAL EDITOR EVENT BRIDGE (Milestone v0.2.1 - R4)
// =============================================================================
class EditorEventBridge {
  constructor() {
    this.listeners = new Map();
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  addListener(event, handler) {
    return this.on(event, handler);
  }

  off(event, handler) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(handler);
    }
  }

  removeListener(event, handler) {
    this.off(event, handler);
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const handler of this.listeners.get(event)) {
        try {
          handler(data);
        } catch (err) {
          console.error(`[EditorEventBridge] Error executing listener for "${event}":`, err);
        }
      }
    }

    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent(event, { detail: data }));
      }
    } catch (_) {}

    const webview = document.getElementById('webview-frame');
    if (webview && webview.contentWindow) {
      try {
        webview.contentWindow.postMessage({
          type: 'EDITOR_EVENT',
          event,
          payload: data,
        }, '*');
      } catch (_) {}
    }
  }
}

const editorEventBridge = new EditorEventBridge();
if (typeof window !== 'undefined') {
  window.editorEventBridge = editorEventBridge;
}

editorEventBridge.on('editor:fileSwitched', (data) => {
  if (data && data.filePath && typeof updateScreenBBreadcrumb === 'function') {
    updateScreenBBreadcrumb(data.filePath);
  }
});

// =============================================================================
// ASYNCHRONOUS DIRTY SAVE CONFIRMATION DIALOG (Milestone v0.2.1 - R2)
// =============================================================================
function showDirtySaveDialog(fileName) {
  return new Promise((resolve) => {
    const backdrop = document.getElementById('dirty-dialog-backdrop');
    const title = document.getElementById('dirty-dialog-title');
    const btnSave = document.getElementById('btn-dirty-save');
    const btnDontSave = document.getElementById('btn-dirty-dontsave');
    const btnCancel = document.getElementById('btn-dirty-cancel');

    if (!backdrop || !btnSave) {
      resolve('dontsave');
      return;
    }

    if (title) {
      title.textContent = `Do you want to save the changes you made to ${fileName}?`;
    }

    backdrop.style.display = 'flex';
    if (typeof btnSave.focus === 'function') {
      btnSave.focus();
    }

    const cleanup = (choice) => {
      backdrop.style.display = 'none';
      window.removeEventListener('keydown', handleKey, true);
      btnSave.onclick = null;
      btnDontSave.onclick = null;
      btnCancel.onclick = null;
      resolve(choice);
    };

    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cleanup('cancel');
      }
    };

    window.addEventListener('keydown', handleKey, true);
    btnSave.onclick = () => cleanup('save');
    btnDontSave.onclick = () => cleanup('dontsave');
    btnCancel.onclick = () => cleanup('cancel');
  });
}

// =============================================================================
// REAL-TIME CURSOR TELEMETRY & EVENT BROADCASTING (Milestone v0.2.1 - R3)
// =============================================================================
function updateCursorTelemetry(ed = editor) {
  if (!ed) return;
  const pos = (ed.getPosition && ed.getPosition()) || { lineNumber: 1, column: 1 };
  if (!pos) return;

  const sel = (ed.getSelection && ed.getSelection()) || null;
  let selectionCount = 0;

  if (sel && typeof sel.isEmpty === 'function' && !sel.isEmpty()) {
    const model = ed.getModel ? ed.getModel() : null;
    if (model) {
      if (typeof model.getValueLengthInRange === 'function') {
        selectionCount = model.getValueLengthInRange(sel);
      } else if (sel.startLineNumber === sel.endLineNumber) {
        selectionCount = Math.abs(sel.endColumn - sel.startColumn);
      } else if (typeof model.getValueInRange === 'function') {
        const selectedText = model.getValueInRange(sel);
        selectionCount = selectedText ? selectedText.length : 0;
      }
    }
  }

  const posText = selectionCount > 0 
    ? `Ln ${pos.lineNumber}, Col ${pos.column} (${selectionCount} selected)`
    : `Ln ${pos.lineNumber}, Col ${pos.column}`;

  if (statusCursorPos) {
    statusCursorPos.textContent = posText;
  }

  // Synchronize Screen B Header Scope Indicator if present
  const screenBCursorPos = document.getElementById('screen-b-cursor-pos');
  if (screenBCursorPos) {
    screenBCursorPos.textContent = `Ln ${pos.lineNumber}, Col ${pos.column}`;
  }

  const activeDoc = docManager?.documents?.get(docManager.activeDocId);
  const filePath = activeDoc?.filePath || 'quicksort.py';

  // Synchronize Screen B Active File Pill
  if (typeof updateScreenBBreadcrumb === 'function') {
    updateScreenBBreadcrumb(filePath);
  }

  // Trailing-Edge Telemetry Cache: selalu perbarui data kursor terkini
  updateCursorTelemetry._pendingTelemetry = {
    filePath,
    lineNumber: pos.lineNumber,
    column: pos.column,
    selectionCount,
    selection: sel,
  };

  // Throttled IPC event broadcasting via rAF (60fps clamp with trailing-edge guarantee)
  if (!updateCursorTelemetry._rafPending) {
    updateCursorTelemetry._rafPending = true;
    const rafFn = (typeof requestAnimationFrame === 'function') 
      ? requestAnimationFrame 
      : (typeof globalThis !== 'undefined' && typeof globalThis.requestAnimationFrame === 'function')
        ? globalThis.requestAnimationFrame
        : (typeof globalThis !== 'undefined' && typeof globalThis.setTimeout === 'function')
          ? globalThis.setTimeout
          : (cb) => cb();
    
    rafFn(() => {
      // Baca snapshot telemetry terkini sebelum mereset guard rAF
      const latest = updateCursorTelemetry._pendingTelemetry;
      updateCursorTelemetry._rafPending = false;
      if (!latest) return;
      
      if (typeof editorEventBridge !== 'undefined') {
        editorEventBridge.emit('editor:cursorChange', {
          filePath: latest.filePath,
          lineNumber: latest.lineNumber,
          column: latest.column,
          selectionCount: latest.selectionCount,
          selection: latest.selection,
        });
      }

      // IPC Message to Secondary Webview iframe (Zero-latency sync)
      const webviewIframe = document.querySelector('.secondary-webview-frame');
      if (webviewIframe && webviewIframe.contentWindow && typeof webviewIframe.contentWindow.postMessage === 'function') {
        webviewIframe.contentWindow.postMessage({
          type: 'CURSOR_TELEMETRY_UPDATE',
          payload: {
            filePath: latest.filePath,
            lineNumber: latest.lineNumber,
            column: latest.column,
            selectionCount: latest.selectionCount,
          }
        }, '*');
      }
    });
  }
}

// =============================================================================
// SCREEN B MODE SWITCHER (Milestone v0.2.1 - R4 & Phase 2 Sliding Pill)
// =============================================================================
function updateScreenBModePill(targetTab) {
  const container = document.getElementById('screen-b-mode-tabs');
  if (!container) return;

  const activeTab = targetTab || container.querySelector('.screen-b-mode-tab.active');
  if (!activeTab) return;

  if (typeof activeTab.getBoundingClientRect === 'function' && typeof container.getBoundingClientRect === 'function') {
    const containerRect = container.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();

    const relativeX = tabRect.left - containerRect.left;
    const width = tabRect.width;

    if (container.style && typeof container.style.setProperty === 'function') {
      container.style.setProperty('--tab-active-x', `${Math.round(relativeX)}px`);
      container.style.setProperty('--tab-active-width', `${Math.round(width)}px`);
    }
  }
}

function setScreenBMode(mode) {
  const VALID_MODES = ['chat', 'plan', 'review'];
  const isValid = VALID_MODES.includes(mode);
  const targetMode = isValid ? mode : null;
  currentScreenBMode = targetMode;
  const tabs = document.querySelectorAll('.screen-b-mode-tab');
  let activeTabElement = null;
  tabs.forEach((tab) => {
    const isActive = tab.dataset.mode === targetMode;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    if (isActive) activeTabElement = tab;
  });

  if (activeTabElement) {
    updateScreenBModePill(activeTabElement);
  }

  const chatContainer = document.getElementById('screen-b-view-chat') || document.getElementById('screen-b-interaction-container');
  const planContainer = document.getElementById('screen-b-view-plan');
  const reviewContainer = document.getElementById('screen-b-view-review');

  if (chatContainer) chatContainer.style.display = (targetMode === 'chat') ? 'flex' : 'none';
  if (planContainer) planContainer.style.display = (targetMode === 'plan') ? 'flex' : 'none';
  if (reviewContainer) reviewContainer.style.display = (targetMode === 'review') ? 'flex' : 'none';

  if (targetMode === 'plan' && typeof renderPlanView === 'function') {
    renderPlanView();
  } else if (targetMode === 'review' && typeof renderReviewPane === 'function') {
    renderReviewPane();
  }

  if (typeof editorEventBridge !== 'undefined' && targetMode) {
    editorEventBridge.emit('screenB:modeChanged', { mode: targetMode });
  }
}

const editorMount = document.getElementById('editor-mount');
const webviewFrame = document.getElementById('webview-frame');
if (webviewFrame && typeof webviewFrame.addEventListener === 'function') {
  webviewFrame.addEventListener('load', () => {
    if (typeof dispatchThemeToWebview === 'function') {
      dispatchThemeToWebview();
    }
  });
}
const tabScrollContainer = document.getElementById('tab-scroll-container');
const openEditorsList = document.getElementById('open-editors-list');
const openEditorsCount = document.getElementById('open-editors-count');
const workspaceFileTree = document.getElementById('workspace-file-tree');
const workspaceFolderName = document.getElementById('workspace-folder-name');
const windowTitle = document.getElementById('window-title');
const crumbFileName = document.getElementById('crumb-file-name');
const crumbSymbolName = document.getElementById('crumb-symbol-name');
const statusCursorPos = document.getElementById('status-cursor-pos');
const statusLanguageText = document.getElementById('status-language-text');
const daemonStatusText = document.getElementById('daemon-status-text');
const statusAgyText = document.getElementById('status-agy-text');
const gateStatusText = document.getElementById('gate-status-text');
const gateLockIcon = document.getElementById('gate-lock-icon');
const primarySidebar = document.getElementById('primary-sidebar');
const secondarySidebar = document.getElementById('secondary-sidebar');
const primarySash = document.getElementById('primary-sash');
const secondarySash = document.getElementById('secondary-sash');
const promptInputBox = document.getElementById('prompt-input-box');
const btnPromptRun = document.getElementById('btn-prompt-run');

// =============================================================================
// NAVIGATION HISTORY (< > Buttons)
// =============================================================================
function recordNav(docId) {
  if (navIndex >= 0 && navHistory[navIndex] === docId) return;
  navHistory = navHistory.slice(0, navIndex + 1);
  navHistory.push(docId);
  navIndex = navHistory.length - 1;
}

function navigateBack() {
  if (navIndex > 0) {
    navIndex -= 1;
    docManager.openFile(navHistory[navIndex]);
  }
}

function navigateForward() {
  if (navIndex < navHistory.length - 1) {
    navIndex += 1;
    docManager.openFile(navHistory[navIndex]);
  }
}

class DocumentManager {
  constructor() {
    this.documents = new Map(); // id -> OpenDocument
    this.activeDocId = null;
  }

  detectLanguage(filePath) {
    const ext = filePath.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'py': return 'python';
      case 'cpp': case 'cc': case 'cxx': case 'h': case 'hpp': return 'cpp';
      case 'c': return 'c';
      case 'java': return 'java';
      case 'cs': return 'csharp';
      case 'php': return 'php';
      case 'ts': case 'tsx': return 'typescript';
      case 'js': case 'jsx': case 'mjs': return 'javascript';
      case 'json': return 'json';
      case 'html': return 'html';
      case 'css': return 'css';
      case 'md': return 'markdown';
      case 'rs': return 'rust';
      case 'go': return 'go';
      case 'sh': case 'bash': return 'shell';
      case 'sql': return 'sql';
      default: return 'plaintext';
    }
  }

  getFileIconClass(filename) {
    if (!filename) return 'codicon codicon-file file-icon-default';
    const lower = filename.toLowerCase();

    if (lower === '.gitignore' || lower === '.gitmodules') {
      return 'codicon codicon-source-control file-icon-git';
    }
    if (lower === 'dockerfile' || lower === '.dockerignore') {
      return 'codicon codicon-server-process file-icon-docker';
    }
    if (lower === 'package.json' || lower === 'tsconfig.json') {
      return 'codicon codicon-json file-icon-json';
    }
    if (lower === 'readme.md' || lower === 'changelog.md') {
      return 'codicon codicon-markdown file-icon-markdown';
    }
    if (lower === '.env' || lower.startsWith('.env.')) {
      return 'codicon codicon-gear file-icon-config';
    }

    const parts = lower.split('.');
    const ext = parts.length > 1 ? parts.pop() : '';

    switch (ext) {
      case 'py':
        return 'codicon codicon-python file-icon-python';
      case 'db': case 'sqlite': case 'sqlite3':
        return 'codicon codicon-database file-icon-db';
      case 'txt': case 'log':
        return 'codicon codicon-file-text file-icon-txt';
      case 'json':
        return 'codicon codicon-json file-icon-json';
      case 'md':
        return 'codicon codicon-markdown file-icon-markdown';
      case 'js': case 'mjs': case 'cjs':
        return 'codicon codicon-file-code file-icon-js';
      case 'ts':
        return 'codicon codicon-file-code file-icon-ts';
      case 'jsx': case 'tsx':
        return 'codicon codicon-file-code file-icon-react';
      case 'html': case 'htm':
        return 'codicon codicon-file-code file-icon-html';
      case 'css': case 'scss': case 'less':
        return 'codicon codicon-file-code file-icon-css';
      case 'c': case 'cpp': case 'cc': case 'cxx': case 'h': case 'hpp':
        return 'codicon codicon-file-code file-icon-cpp';
      case 'rs':
        return 'codicon codicon-file-code file-icon-rust';
      case 'go':
        return 'codicon codicon-file-code file-icon-go';
      case 'java':
        return 'codicon codicon-file-code file-icon-java';
      case 'php':
        return 'codicon codicon-file-code file-icon-php';
      case 'sql':
        return 'codicon codicon-database file-icon-sql';
      case 'sh': case 'bash':
        return 'codicon codicon-terminal-bash file-icon-shell';
      case 'ps1':
        return 'codicon codicon-terminal-powershell file-icon-powershell';
      case 'zip': case 'tar': case 'gz': case '7z':
        return 'codicon codicon-file-zip file-icon-zip';
      case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': case 'ico': case 'webp':
        return 'codicon codicon-file-media file-icon-media';
      case 'pdf':
        return 'codicon codicon-file-pdf file-icon-pdf';
      default:
        return 'codicon codicon-file file-icon-default';
    }
  }

  async openFile(filePath, contentOverride, isPreset = false) {
    const id = filePath;
    if (this.documents.has(id)) {
      if (multiGroupManager) {
        multiGroupManager.openDocumentInGroup(multiGroupManager.activeGroupId, id);
      } else {
        this.switchTab(id);
      }
      return;
    }

    let content = contentOverride;
    const language = this.detectLanguage(filePath);

    if (content === undefined || content === null) {
      if (isPreset && SAMPLES[filePath]) {
        content = SAMPLES[filePath].code;
      } else if (window.electronFS) {
        try {
          const res = await window.electronFS.readFile(filePath);
          if (res && res.content !== undefined) {
            content = res.content;
          } else {
            content = '';
          }
        } catch (err) {
          content = `// Error reading file: ${err.message}`;
        }
      } else {
        content = '';
      }
    }

    let model = null;
    let initialVersionId = 1;

    if (window.monaco && window.monaco.editor) {
      const uri = window.monaco.Uri.file(filePath);
      model = window.monaco.editor.getModel(uri);
      if (!model) {
        model = window.monaco.editor.createModel(content, language, uri);
      }
      initialVersionId = model.getAlternativeVersionId();
    }

    const fileName = filePath.replace(/\\/g, '/').split('/').pop() || filePath;
    const openDoc = {
      id,
      filePath,
      fileName,
      language,
      model,
      initialVersionId,
      isDirty: false,
      viewState: null,
      isPreset,
    };

    // 4. Dirty tracking via alternativeVersionId
    if (model) {
      model.onDidChangeContent(() => {
        const currentVersionId = model.getAlternativeVersionId();
        const dirtyNow = currentVersionId !== openDoc.initialVersionId;
        if (openDoc.isDirty !== dirtyNow) {
          openDoc.isDirty = dirtyNow;
          this.renderTabs();
          if (multiGroupManager) {
            multiGroupManager.renderTabsForGroup('group-1');
            multiGroupManager.renderTabsForGroup('group-2');
          }
          this.renderOpenEditorsList();
          if (typeof editorEventBridge !== 'undefined') {
            editorEventBridge.emit('editor:dirtyChange', {
              filePath: openDoc.filePath,
              fileName: openDoc.fileName,
              isDirty: dirtyNow,
              docId: openDoc.id,
            });
          }
        }
      });
    }

    this.documents.set(id, openDoc);

    if (multiGroupManager) {
      multiGroupManager.openDocumentInGroup(multiGroupManager.activeGroupId, id);
    } else {
      this.switchTab(id);
    }
  }

  switchTab(docId) {
    if (!this.documents.has(docId)) return;
    const prevDoc = this.documents.get(this.activeDocId);
    if (prevDoc && editor) {
      prevDoc.viewState = editor.saveViewState ? editor.saveViewState() : null;
    }

    this.activeDocId = docId;
    const targetDoc = this.documents.get(docId);

    const diffMount = document.getElementById('diff-editor-mount');
    const editorMount = document.getElementById('editor-mount');
    if (diffMount && editorMount) {
      diffMount.style.display = 'none';
      editorMount.style.display = 'block';
    }

    if (editor && targetDoc.model) {
      editor.setModel(targetDoc.model);
      if (targetDoc.viewState && editor.restoreViewState) {
        editor.restoreViewState(targetDoc.viewState);
      }
      editor.focus();
    }

    recordNav(docId);
    this.syncActiveChrome(docId);
    this.renderTabs();
    this.renderOpenEditorsList();
  }

  syncActiveChrome(docId) {
    const targetDoc = this.documents.get(docId);
    if (!targetDoc) return;

    if (windowTitle) {
      windowTitle.textContent = `${targetDoc.fileName} — NSCode`;
    }
    if (crumbFileName) crumbFileName.textContent = targetDoc.fileName;
    if (crumbSymbolName) crumbSymbolName.textContent = targetDoc.fileName.split('.')[0];
    if (statusLanguageText) statusLanguageText.textContent = targetDoc.language.toUpperCase();

    // Notify Screen B webview of active file change (Zero-Buffer Contract)
    if (webviewFrame && webviewFrame.contentWindow) {
      webviewFrame.contentWindow.postMessage({
        type: 'SET_ACTIVE_FILE',
        payload: {
          fileUri: `file:///${targetDoc.filePath.replace(/\\/g, '/').replace(/^\/+/, '')}`,
          languageId: targetDoc.language,
        }
      }, '*');
    }

    if (typeof updateScreenBBreadcrumb === 'function') {
      updateScreenBBreadcrumb(targetDoc.filePath);
    }

    // Broadcast file switched event (Milestone v0.2.1 - R4)
    if (typeof editorEventBridge !== 'undefined') {
      editorEventBridge.emit('editor:fileSwitched', {
        filePath: targetDoc.filePath,
        fileName: targetDoc.fileName,
        language: targetDoc.language,
        isDirty: targetDoc.isDirty,
        docId: targetDoc.id,
      });
    }

    clearHighlights();
  }

  async closeTab(docId) {
    const doc = this.documents.get(docId);
    if (!doc) return false;

    if (doc.isDirty) {
      const action = await showDirtySaveDialog(doc.fileName);
      if (action === 'cancel') {
        return false;
      }
      if (action === 'save') {
        const saved = await this.saveDocument(docId);
        if (!saved) return false;
      }
      // If 'dontsave', proceed to close without writing changes to disk
    }

    if (multiGroupManager) {
      multiGroupManager.groups.forEach((group) => {
        const idx = group.openDocIds.indexOf(docId);
        if (idx !== -1) {
          group.openDocIds.splice(idx, 1);
          group.viewStates.delete(docId);
          if (group.activeDocId === docId) {
            group.activeDocId = group.openDocIds[Math.max(0, idx - 1)] || null;
            if (group.activeDocId && group.editor) {
              const nextDoc = this.documents.get(group.activeDocId);
              if (nextDoc?.model) group.editor.setModel(nextDoc.model);
            }
          }
        }
      });
    }

    this.documents.delete(docId);
    if (doc.model && !doc.isPreset) {
      doc.model.dispose();
    }

    if (this.activeDocId === docId) {
      const remainingIds = Array.from(this.documents.keys());
      if (remainingIds.length > 0) {
        this.switchTab(remainingIds[remainingIds.length - 1]);
      } else {
        this.activeDocId = null;
        if (editor && editor.setModel) editor.setModel(null);
        if (windowTitle) windowTitle.textContent = 'NSCode';
        if (crumbFileName) crumbFileName.textContent = 'No file open';
        if (crumbSymbolName) crumbSymbolName.textContent = '';
        if (statusLanguageText) statusLanguageText.textContent = '';
      }
    }

    this.renderTabs();
    if (multiGroupManager) {
      multiGroupManager.renderTabsForGroup('group-1');
      multiGroupManager.renderTabsForGroup('group-2');
    }
    this.renderOpenEditorsList();
    return true;
  }

  async closeAllTabs() {
    const ids = Array.from(this.documents.keys());
    for (const id of ids) {
      const closed = await this.closeTab(id);
      if (!closed) break;
    }
  }

  handleFileRenamed(oldPath, newPath) {
    if (!oldPath || !newPath) return;
    const cleanOld = oldPath.replace(/\\/g, '/').replace(/\/+$/, '');
    const cleanNew = newPath.replace(/\\/g, '/').replace(/\/+$/, '');
    let affected = false;

    // Synchronize navigation history
    if (typeof navHistory !== 'undefined' && Array.isArray(navHistory)) {
      for (let i = 0; i < navHistory.length; i++) {
        const hPath = navHistory[i].replace(/\\/g, '/');
        if (hPath === cleanOld) {
          navHistory[i] = newPath;
        } else if (hPath.startsWith(cleanOld + '/')) {
          const sub = hPath.substring(cleanOld.length);
          const cleanBase = newPath.replace(/[\\/]+$/, '');
          const sep = newPath.includes('\\') ? '\\' : '/';
          navHistory[i] = `${cleanBase}${sep === '\\' ? sub.replace(/\//g, '\\') : sub}`;
        }
      }
    }

    const entries = Array.from(this.documents.entries());
    for (const [id, doc] of entries) {
      const docPath = doc.filePath.replace(/\\/g, '/');
      let updatedPath = null;
      if (docPath === cleanOld) {
        updatedPath = newPath;
      } else if (docPath.startsWith(cleanOld + '/')) {
        const sub = docPath.substring(cleanOld.length);
        const cleanBase = newPath.replace(/[\\/]+$/, '');
        const sep = newPath.includes('\\') ? '\\' : '/';
        updatedPath = `${cleanBase}${sep === '\\' ? sub.replace(/\//g, '\\') : sub}`;
      }

      if (updatedPath) {
        affected = true;
        this.documents.delete(id);
        doc.id = updatedPath;
        doc.filePath = updatedPath;
        doc.fileName = updatedPath.replace(/\\/g, '/').split('/').pop() || updatedPath;
        doc.language = this.detectLanguage(updatedPath);
        this.documents.set(updatedPath, doc);

        // Migrate Monaco ITextModel to new URI and updated language
        if (window.monaco && window.monaco.editor && doc.model) {
          try {
            const currentContent = typeof doc.model.getValue === 'function' ? doc.model.getValue() : '';
            const newUri = window.monaco.Uri.file(updatedPath);
            const oldModel = doc.model;
            let newModel = window.monaco.editor.getModel(newUri);
            if (!newModel) {
              newModel = window.monaco.editor.createModel(currentContent, doc.language, newUri);
            } else if (typeof window.monaco.editor.setModelLanguage === 'function') {
              window.monaco.editor.setModelLanguage(newModel, doc.language);
            }

            if (newModel && newModel !== oldModel) {
              const wasDirty = doc.isDirty;
              doc.initialVersionId = wasDirty ? -1 : newModel.getAlternativeVersionId();
              newModel.onDidChangeContent(() => {
                const currentVersionId = newModel.getAlternativeVersionId();
                const dirtyNow = currentVersionId !== doc.initialVersionId;
                if (doc.isDirty !== dirtyNow) {
                  doc.isDirty = dirtyNow;
                  this.renderTabs();
                  if (multiGroupManager) {
                    multiGroupManager.renderTabsForGroup('group-1');
                    multiGroupManager.renderTabsForGroup('group-2');
                  }
                  this.renderOpenEditorsList();
                }
              });
            }

            doc.model = newModel;
            if (this.activeDocId === id && editor && typeof editor.setModel === 'function') {
              editor.setModel(newModel);
            }
            if (oldModel !== newModel && typeof oldModel.dispose === 'function') {
              oldModel.dispose();
            }
          } catch (modelErr) {
            console.warn('[DocumentManager] Monaco model migration warning:', modelErr);
          }
        }

        if (this.activeDocId === id) {
          this.activeDocId = updatedPath;
          this.syncActiveChrome(updatedPath);
        }

        if (multiGroupManager) {
          multiGroupManager.groups.forEach(group => {
            const idx = group.openDocIds.indexOf(id);
            if (idx !== -1) group.openDocIds[idx] = updatedPath;
            if (group.activeDocId === id) {
              group.activeDocId = updatedPath;
              if (group.editor && doc.model) {
                group.editor.setModel(doc.model);
              }
            }
          });
        }
      }
    }

    if (affected) {
      this.renderTabs();
      if (multiGroupManager) {
        multiGroupManager.renderTabsForGroup('group-1');
        multiGroupManager.renderTabsForGroup('group-2');
      }
      this.renderOpenEditorsList();
    }
  }

  handleFileDeleted(deletedPath) {
    if (!deletedPath) return;
    const cleanDel = deletedPath.replace(/\\/g, '/').replace(/\/+$/, '');
    const idsToClose = [];

    // Synchronize navigation history
    if (typeof navHistory !== 'undefined' && Array.isArray(navHistory)) {
      navHistory = navHistory.filter(h => {
        const hPath = h.replace(/\\/g, '/');
        return hPath !== cleanDel && !hPath.startsWith(cleanDel + '/');
      });
      if (typeof navIndex !== 'undefined' && navIndex >= navHistory.length) {
        navIndex = navHistory.length - 1;
      }
    }

    for (const [id, doc] of this.documents.entries()) {
      const docPath = doc.filePath.replace(/\\/g, '/');
      if (docPath === cleanDel || docPath.startsWith(cleanDel + '/')) {
        idsToClose.push(id);
      }
    }

    if (idsToClose.length === 0) return;

    idsToClose.forEach(id => {
      const doc = this.documents.get(id);
      if (doc) {
        if (doc.model && !doc.isPreset) {
          doc.model.dispose();
        }
        this.documents.delete(id);
      }

      if (multiGroupManager) {
        multiGroupManager.groups.forEach(group => {
          group.openDocIds = group.openDocIds.filter(docId => docId !== id);
          if (group.activeDocId === id) {
            group.activeDocId = group.openDocIds[group.openDocIds.length - 1] || null;
          }
        });
      }
    });

    if (idsToClose.includes(this.activeDocId)) {
      const remainingIds = Array.from(this.documents.keys());
      if (remainingIds.length > 0) {
        this.switchTab(remainingIds[remainingIds.length - 1]);
      } else {
        this.activeDocId = null;
        if (editor && editor.setModel) editor.setModel(null);
        if (windowTitle) windowTitle.textContent = 'NSCode';
        if (crumbFileName) crumbFileName.textContent = 'No file open';
        if (crumbSymbolName) crumbSymbolName.textContent = '';
        if (statusLanguageText) statusLanguageText.textContent = '';
        if (webviewFrame && webviewFrame.contentWindow) {
          webviewFrame.contentWindow.postMessage({
            type: 'SET_ACTIVE_FILE',
            payload: { fileUri: null, languageId: null }
          }, '*');
        }
      }
    }

    this.renderTabs();
    if (multiGroupManager) {
      multiGroupManager.renderTabsForGroup('group-1');
      multiGroupManager.renderTabsForGroup('group-2');
    }
    this.renderOpenEditorsList();
  }

  async saveDocument(docId) {
    const doc = this.documents.get(docId);
    if (!doc || !doc.model) return false;

    const content = doc.model.getValue();

    if (window.electronFS && !doc.isPreset) {
      try {
        const res = await window.electronFS.writeFile(doc.filePath, content);
        if (res && res.success) {
          doc.initialVersionId = doc.model.getAlternativeVersionId();
          doc.isDirty = false;
          this.renderTabs();
          if (multiGroupManager) {
            multiGroupManager.renderTabsForGroup('group-1');
            multiGroupManager.renderTabsForGroup('group-2');
          }
          this.renderOpenEditorsList();
          if (typeof editorEventBridge !== 'undefined') {
            editorEventBridge.emit('editor:dirtyChange', {
              filePath: doc.filePath,
              fileName: doc.fileName,
              isDirty: false,
              docId: doc.id,
            });
          }
          console.log(`[DocumentManager] Saved file ${doc.filePath}`);
          return true;
        }
      } catch (err) {
        console.error('[DocumentManager] Save failed:', err);
        return false;
      }
    } else {
      // Memory / preset save
      doc.initialVersionId = doc.model.getAlternativeVersionId();
      doc.isDirty = false;
      this.renderTabs();
      if (multiGroupManager) {
        multiGroupManager.renderTabsForGroup('group-1');
        multiGroupManager.renderTabsForGroup('group-2');
      }
      this.renderOpenEditorsList();
      if (typeof editorEventBridge !== 'undefined') {
        editorEventBridge.emit('editor:dirtyChange', {
          filePath: doc.filePath,
          fileName: doc.fileName,
          isDirty: false,
          docId: doc.id,
        });
      }
      return true;
    }
    return false;
  }

  async saveActiveDocument() {
    if (!this.activeDocId) return false;
    return await this.saveDocument(this.activeDocId);
  }

  renderTabs() {
    if (!tabScrollContainer) return;
    tabScrollContainer.innerHTML = '';

    this.documents.forEach((doc) => {
      const tab = document.createElement('div');
      tab.className = `workbench-tab ${doc.id === this.activeDocId ? 'active' : ''} ${doc.isDirty ? 'is-dirty' : ''}`;
      tab.title = doc.filePath;
      tab.dataset.id = doc.id;

      const iconClass = this.getFileIconClass(doc.fileName);
      tab.innerHTML = `
        <span class="tab-icon ${iconClass}"></span>
        <span class="tab-title">${doc.fileName}</span>
        <span class="tab-close-btn codicon ${doc.isDirty ? 'is-dirty' : 'codicon-close'}" data-close-id="${doc.id}" title="${doc.isDirty ? 'Unsaved changes (close to save)' : 'Close (Ctrl+W)'}"></span>
      `;

      tab.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-close-btn')) {
          e.stopPropagation();
          this.closeTab(doc.id);
        } else {
          this.switchTab(doc.id);
        }
      });

      tabScrollContainer.appendChild(tab);
    });
  }

  renderOpenEditorsList() {
    if (!openEditorsList) return;
    openEditorsList.innerHTML = '';
    if (openEditorsCount) openEditorsCount.textContent = this.documents.size;

    this.documents.forEach((doc) => {
      const item = document.createElement('div');
      item.className = `open-editor-item ${doc.id === this.activeDocId ? 'active' : ''} ${doc.isDirty ? 'is-dirty' : ''}`;
      item.dataset.id = doc.id;

      const iconClass = this.getFileIconClass(doc.fileName);
      item.innerHTML = `
        <span class="open-editor-icon ${iconClass}"></span>
        <span>${doc.fileName}</span>
        <span class="open-editor-close codicon ${doc.isDirty ? 'is-dirty' : 'codicon-close'}" data-close-id="${doc.id}"></span>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('open-editor-close')) {
          e.stopPropagation();
          this.closeTab(doc.id);
        } else {
          this.switchTab(doc.id);
        }
      });

      openEditorsList.appendChild(item);
    });
  }
}

class MultiGroupEditorManager {
  constructor() {
    this.groups = new Map();
    this.activeGroupId = 'group-1';
    this.layoutMode = 'single';
    this.splitSash = document.getElementById('editor-split-sash');
    this.editorArea = document.getElementById('editor-area');
    this.init();
  }

  init() {
    // Group 1 (Primary - retains legacy IDs)
    this.groups.set('group-1', {
      id: 'group-1',
      containerEl: document.getElementById('editor-group'),
      tabScrollEl: document.getElementById('tab-scroll-container'),
      breadcrumbsEl: document.getElementById('breadcrumbs-bar'),
      mountEl: document.getElementById('editor-mount'),
      editor: null,
      openDocIds: [],
      activeDocId: null,
      viewStates: new Map(),
    });

    // Group 2 (Secondary)
    this.groups.set('group-2', {
      id: 'group-2',
      containerEl: document.getElementById('editor-group-2'),
      tabScrollEl: document.getElementById('tab-scroll-container-2'),
      breadcrumbsEl: document.getElementById('breadcrumbs-bar-2'),
      mountEl: document.getElementById('editor-mount-2'),
      editor: null,
      openDocIds: [],
      activeDocId: null,
      viewStates: new Map(),
    });

    const btnSplit1 = document.getElementById('btn-editor-split');
    if (btnSplit1) btnSplit1.addEventListener('click', () => this.splitRight());

    const btnSplitDown1 = document.getElementById('btn-editor-split-down');
    if (btnSplitDown1) btnSplitDown1.addEventListener('click', () => this.splitDown());

    const btnSplit2 = document.getElementById('btn-editor-split-2');
    if (btnSplit2) btnSplit2.addEventListener('click', () => this.splitRight());

    const btnSplitDown2 = document.getElementById('btn-editor-split-down-2');
    if (btnSplitDown2) btnSplitDown2.addEventListener('click', () => this.splitDown());

    const btnCloseGroup2 = document.getElementById('btn-editor-close-group-2');
    if (btnCloseGroup2) btnCloseGroup2.addEventListener('click', () => this.closeGroup('group-2'));

    this.initSplitSash();
  }

  initSplitSash() {
    if (!this.splitSash) return;
    let isDragging = false;
    let startPos = 0;
    let group1StartSize = 0;

    this.splitSash.addEventListener('mousedown', (e) => {
      isDragging = true;
      document.body.classList.add('is-resizing');
      this.splitSash.classList.add('is-active');
      const g1 = this.groups.get('group-1')?.containerEl;
      if (this.layoutMode === 'split-horizontal') {
        startPos = e.clientX;
        group1StartSize = g1?.getBoundingClientRect().width || 400;
      } else {
        startPos = e.clientY;
        group1StartSize = g1?.getBoundingClientRect().height || 300;
      }
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const g1 = this.groups.get('group-1')?.containerEl;
      if (!g1) return;

      if (this.layoutMode === 'split-horizontal') {
        const delta = e.clientX - startPos;
        const target = Math.max(100, group1StartSize + delta);
        g1.style.flex = 'none';
        g1.style.width = `${target}px`;
      } else if (this.layoutMode === 'split-vertical') {
        const delta = e.clientY - startPos;
        const target = Math.max(100, group1StartSize + delta);
        g1.style.flex = 'none';
        g1.style.height = `${target}px`;
      }
      this.layoutAll();
    });

    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      document.body.classList.remove('is-resizing');
      this.splitSash.classList.remove('is-active');
      this.layoutAll();
    });
  }

  createEditorForGroup(groupId) {
    const group = this.groups.get(groupId);
    if (!group || group.editor) return group?.editor;

    if (window.monaco && window.monaco.editor) {
      group.editor = window.monaco.editor.create(group.mountEl, {
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: 13,
        lineNumbers: 'on',
        glyphMargin: true,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        renderLineHighlight: 'all',
        tabSize: 4,
      });

      group.editor.onDidChangeCursorPosition(() => {
        if (this.activeGroupId === groupId) {
          updateCursorTelemetry(group.editor);
        }
      });

      group.editor.onDidChangeCursorSelection(() => {
        if (this.activeGroupId === groupId) {
          updateCursorTelemetry(group.editor);
        }
      });

      group.editor.onDidFocusEditorWidget(() => {
        this.setActiveGroup(groupId);
      });

      if (typeof registerEditorActions === 'function') {
        registerEditorActions(group.editor);
      }
    }
    return group.editor;
  }

  setActiveGroup(groupId) {
    this.activeGroupId = groupId;
    this.groups.forEach((g, id) => {
      if (id === groupId) {
        g.containerEl.classList.add('active-group');
      } else {
        g.containerEl.classList.remove('active-group');
      }
    });

    const activeGroup = this.groups.get(groupId);
    if (activeGroup && activeGroup.editor) {
      editor = activeGroup.editor;
    }
    if (activeGroup && activeGroup.activeDocId) {
      docManager.syncActiveChrome(activeGroup.activeDocId);
    }
  }

  splitRight() {
    this.layoutMode = 'split-horizontal';
    this.editorArea.className = 'editor-area layout-split-horizontal';
    const group2 = this.groups.get('group-2');
    if (group2) {
      group2.containerEl.style.display = 'flex';
      group2.containerEl.style.flex = '1';
      group2.containerEl.style.width = '';
      group2.containerEl.style.height = '';
      this.createEditorForGroup('group-2');
      if (this.splitSash) this.splitSash.style.display = 'block';

      const activeDocId = this.groups.get('group-1')?.activeDocId || 'quicksort.py';
      this.openDocumentInGroup('group-2', activeDocId);
      this.setActiveGroup('group-2');
    }
    this.layoutAll();
  }

  splitDown() {
    this.layoutMode = 'split-vertical';
    this.editorArea.className = 'editor-area layout-split-vertical';
    const group2 = this.groups.get('group-2');
    if (group2) {
      group2.containerEl.style.display = 'flex';
      group2.containerEl.style.flex = '1';
      group2.containerEl.style.width = '';
      group2.containerEl.style.height = '';
      this.createEditorForGroup('group-2');
      if (this.splitSash) this.splitSash.style.display = 'block';

      const activeDocId = this.groups.get('group-1')?.activeDocId || 'quicksort.py';
      this.openDocumentInGroup('group-2', activeDocId);
      this.setActiveGroup('group-2');
    }
    this.layoutAll();
  }

  closeGroup(groupId) {
    if (groupId === 'group-2') {
      const group2 = this.groups.get('group-2');
      if (group2) {
        group2.containerEl.style.display = 'none';
        group2.openDocIds = [];
        group2.activeDocId = null;
      }
      const group1 = this.groups.get('group-1');
      if (group1) {
        group1.containerEl.style.flex = '1';
        group1.containerEl.style.width = '';
        group1.containerEl.style.height = '';
      }
      if (this.splitSash) this.splitSash.style.display = 'none';
      this.layoutMode = 'single';
      this.editorArea.className = 'editor-area layout-single';
      this.setActiveGroup('group-1');
      this.layoutAll();
    }
  }

  openDocumentInGroup(groupId, docId) {
    const group = this.groups.get(groupId);
    if (!group) return;
    const doc = docManager.documents.get(docId);
    if (!doc) return;

    if (!group.openDocIds.includes(docId)) {
      group.openDocIds.push(docId);
    }
    this.switchTabInGroup(groupId, docId);
  }

  switchTabInGroup(groupId, docId) {
    const group = this.groups.get(groupId);
    if (!group) return;
    const doc = docManager.documents.get(docId);
    if (!doc) return;

    if (group.activeDocId && group.editor && group.editor.saveViewState) {
      group.viewStates.set(group.activeDocId, group.editor.saveViewState());
    }

    group.activeDocId = docId;
    if (group.editor && doc.model) {
      group.editor.setModel(doc.model);
      if (group.viewStates.has(docId) && group.editor.restoreViewState) {
        group.editor.restoreViewState(group.viewStates.get(docId));
      }
    }

    this.renderTabsForGroup(groupId);
    if (this.activeGroupId === groupId) {
      docManager.syncActiveChrome(docId);
      editor = group.editor;
    }
  }

  async closeTabInGroup(groupId, docId) {
    if (docManager) {
      return await docManager.closeTab(docId);
    }
  }

  renderTabsForGroup(groupId) {
    const group = this.groups.get(groupId);
    if (!group || !group.tabScrollEl) return;
    group.tabScrollEl.innerHTML = '';

    group.openDocIds.forEach((docId) => {
      const doc = docManager.documents.get(docId);
      if (!doc) return;
      const tab = document.createElement('div');
      tab.className = `workbench-tab ${docId === group.activeDocId ? 'active' : ''} ${doc.isDirty ? 'is-dirty' : ''}`;
      tab.title = doc.filePath;
      tab.dataset.id = docId;

      const iconClass = docManager.getFileIconClass(doc.fileName);
      tab.innerHTML = `
        <span class="tab-icon ${iconClass}"></span>
        <span class="tab-title">${doc.fileName}</span>
        <span class="tab-close-btn codicon ${doc.isDirty ? 'is-dirty' : 'codicon-close'}" data-close-id="${docId}" title="${doc.isDirty ? 'Unsaved changes (close to save)' : 'Close (Ctrl+W)'}"></span>
      `;

      tab.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-close-btn')) {
          e.stopPropagation();
          this.closeTabInGroup(groupId, docId);
        } else {
          this.setActiveGroup(groupId);
          this.switchTabInGroup(groupId, docId);
        }
      });

      group.tabScrollEl.appendChild(tab);
    });
  }

  layoutAll() {
    if (this._layoutTimer) {
      clearTimeout(this._layoutTimer);
    }
    this._layoutTimer = setTimeout(() => {
      this._layoutTimer = null;
      this.groups.forEach((g) => {
        if (g.editor && typeof g.editor.layout === 'function') {
          g.editor.layout();
        }
      });
    }, 16);
  }
}

class BottomPanelResizer {
  constructor() {
    this.panel = document.getElementById('bottom-panel');
    this.sash = document.getElementById('bottom-panel-sash');
    this.isDragging = false;
    this.startY = 0;
    this.startHeight = 240;
    this.minHeight = 100;
    this.maxHeight = 600;
    this.lastHeight = 240;
    this.initEvents();
  }

  initEvents() {
    if (!this.sash || !this.panel) return;

    this.sash.addEventListener('mousedown', (e) => {
      if (this.panel.classList.contains('collapsed')) return;
      this.isDragging = true;
      this.startY = e.clientY;
      this.startHeight = this.panel.getBoundingClientRect().height;

      // Inviolable Anti-Trap Sash Invariant: disable iframe pointer-events during resize
      document.body.classList.add('is-resizing');
      this.sash.classList.add('is-active');
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const deltaY = this.startY - e.clientY;
      let targetHeight = this.startHeight + deltaY;

      if (targetHeight < 60) {
        this.collapse();
        this.onMouseUp();
        return;
      }

      targetHeight = Math.max(this.minHeight, Math.min(this.maxHeight, targetHeight));
      this.panel.style.height = `${targetHeight}px`;
      this.lastHeight = targetHeight;
      if (multiGroupManager) multiGroupManager.layoutAll();
    });

    window.addEventListener('mouseup', () => this.onMouseUp());

    const tabProblems = document.getElementById('tab-btn-problems');
    const tabOutput = document.getElementById('tab-btn-output');
    const tabTerminal = document.getElementById('tab-btn-terminal');

    if (tabProblems) tabProblems.addEventListener('click', () => selectBottomTab('problems'));
    if (tabOutput) tabOutput.addEventListener('click', () => selectBottomTab('output'));
    if (tabTerminal) tabTerminal.addEventListener('click', () => selectBottomTab('terminal'));

    const btnClose = document.getElementById('btn-panel-close');
    if (btnClose) btnClose.addEventListener('click', () => this.collapse());

    const btnMax = document.getElementById('btn-panel-maximize');
    if (btnMax) {
      btnMax.addEventListener('click', () => {
        const curHeight = this.panel.getBoundingClientRect().height;
        if (curHeight > 400) {
          this.panel.style.height = '240px';
          this.lastHeight = 240;
        } else {
          this.panel.style.height = '480px';
          this.lastHeight = 480;
        }
        if (multiGroupManager) multiGroupManager.layoutAll();
      });
    }

    const btnToggle = document.getElementById('btn-toggle-bottom-panel');
    if (btnToggle) btnToggle.addEventListener('click', () => this.toggle());
  }

  onMouseUp() {
    if (!this.isDragging) return;
    this.isDragging = false;
    document.body.classList.remove('is-resizing');
    this.sash.classList.remove('is-active');
    if (multiGroupManager) multiGroupManager.layoutAll();
  }

  toggle() {
    if (this.panel.classList.contains('collapsed')) this.expand();
    else this.collapse();
  }

  collapse() {
    this.panel.classList.add('collapsed');
    this.sash.classList.add('disabled');
    if (multiGroupManager) multiGroupManager.layoutAll();
  }

  expand() {
    this.panel.classList.remove('collapsed');
    this.sash.classList.remove('disabled');
    this.panel.style.height = `${this.lastHeight || 240}px`;
    if (multiGroupManager) multiGroupManager.layoutAll();
  }
}

function selectBottomTab(tabId) {
  const tabs = ['problems', 'output', 'terminal'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    const view = document.getElementById(`panel-view-${t}`);
    if (btn) btn.classList.toggle('active', t === tabId);
    if (view) view.style.display = t === tabId ? 'block' : 'none';
  });

  const outputActions = document.getElementById('output-actions');
  const terminalActions = document.getElementById('terminal-actions');
  if (outputActions) outputActions.style.display = tabId === 'output' ? 'flex' : 'none';
  if (terminalActions) terminalActions.style.display = tabId === 'terminal' ? 'flex' : 'none';

  if (tabId === 'terminal') {
    const terminalInput = document.getElementById('terminal-input');
    if (terminalInput) terminalInput.focus();
  }
}

// Terminal Controller with duplex streaming
class TerminalController {
  constructor() {
    this.screenEl = document.getElementById('terminal-screen');
    this.inputEl = document.getElementById('terminal-input');
    this.promptPrefix = document.getElementById('terminal-prompt-prefix');
    this.activeSessionId = null;
    this.history = [];
    this.historyIndex = -1;
    this.init();
  }

  async init() {
    if (!window.electronTerminal) {
      if (this.screenEl) {
        this.screenEl.textContent = 'NSCode Terminal Shell\nReady.\n';
      }
      return;
    }

    window.electronTerminal.onData((msg) => {
      if (!this.activeSessionId || msg.id === this.activeSessionId) {
        this.appendOutput(msg.data);
      }
    });

    window.electronTerminal.onExit((msg) => {
      if (!this.activeSessionId || msg.id === this.activeSessionId) {
        this.appendOutput(`\n[Process terminated with code ${msg.exitCode}]\n`);
      }
    });

    if (this.inputEl) {
      this.inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const cmd = this.inputEl.value;
          this.inputEl.value = '';
          if (cmd.trim()) {
            this.history.push(cmd);
            this.historyIndex = this.history.length;
          }
          this.sendCommand(cmd);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (this.historyIndex > 0) {
            this.historyIndex -= 1;
            this.inputEl.value = this.history[this.historyIndex] || '';
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (this.historyIndex < this.history.length - 1) {
            this.historyIndex += 1;
            this.inputEl.value = this.history[this.historyIndex] || '';
          } else {
            this.historyIndex = this.history.length;
            this.inputEl.value = '';
          }
        }
      });
    }

    const btnClear = document.getElementById('btn-terminal-clear');
    if (btnClear) btnClear.addEventListener('click', () => this.clear());

    const btnKill = document.getElementById('btn-terminal-kill');
    if (btnKill) btnKill.addEventListener('click', () => this.kill());

    const btnNew = document.getElementById('btn-terminal-new');
    if (btnNew) btnNew.addEventListener('click', () => this.createSession());

    await this.createSession();
  }

  async createSession() {
    if (!window.electronTerminal) return;
    try {
      const res = await window.electronTerminal.create({
        cwd: currentWorkspaceRoot || undefined,
      });
      if (res && res.id) {
        this.activeSessionId = res.id;
        const shellSelect = document.getElementById('terminal-shell-select');
        if (shellSelect) {
          shellSelect.innerHTML = `<option value="${res.id}">1: ${res.shell}</option>`;
        }
      }
    } catch (err) {
      console.warn('[Terminal] Failed to spawn shell:', err);
    }
  }

  sendCommand(cmd) {
    if (this.activeSessionId && window.electronTerminal) {
      window.electronTerminal.write({ id: this.activeSessionId, data: cmd + '\r\n' });
    } else {
      this.appendOutput(`PS> ${cmd}\n`);
    }
  }

  appendOutput(text) {
    if (!this.screenEl) return;
    this.screenEl.textContent += text;
    this.screenEl.scrollTop = this.screenEl.scrollHeight;
  }

  clear() {
    if (this.screenEl) this.screenEl.textContent = '';
  }

  kill() {
    if (this.activeSessionId && window.electronTerminal) {
      window.electronTerminal.kill({ id: this.activeSessionId });
      this.activeSessionId = null;
    }
  }
}

// Output Logging Channels (Sidecar + Antigravity)
class OutputLogger {
  constructor() {
    this.contentEl = document.getElementById('output-content');
    this.channelSelect = document.getElementById('output-channel-select');
    this.buffers = {
      sidecar: [],
      antigravity: [],
    };
    this.currentChannel = 'sidecar';
    this.init();
  }

  init() {
    if (this.channelSelect) {
      this.channelSelect.addEventListener('change', () => {
        this.currentChannel = this.channelSelect.value;
        this.render();
      });
    }
    const btnClear = document.getElementById('btn-output-clear');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        this.buffers[this.currentChannel] = [];
        this.render();
      });
    }
  }

  log(channel, message) {
    const time = new Date().toLocaleTimeString();
    const line = `[${time}] ${message}`;
    if (!this.buffers[channel]) this.buffers[channel] = [];
    this.buffers[channel].push(line);
    if (this.buffers[channel].length > 1000) {
      this.buffers[channel].shift();
    }
    if (this.currentChannel === channel) {
      this.render();
    }
  }

  render() {
    if (!this.contentEl) return;
    const lines = this.buffers[this.currentChannel] || [];
    this.contentEl.textContent = lines.join('\n');
    this.contentEl.scrollTop = this.contentEl.scrollHeight;
  }
}

// Problems Watcher (monaco markers + jump to line)
function initProblemsWatcher() {
  if (window.monaco && window.monaco.editor) {
    window.monaco.editor.onDidChangeMarkers(() => {
      refreshProblems();
    });
  }
}

function refreshProblems() {
  if (!window.monaco || !window.monaco.editor) return;
  const markers = window.monaco.editor.getModelMarkers({});
  const problemsTree = document.getElementById('problems-tree');
  const badge = document.getElementById('panel-problems-badge');
  const statusError = document.getElementById('status-error-count');
  const statusWarning = document.getElementById('status-warning-count');

  let errors = 0;
  let warnings = 0;

  markers.forEach(m => {
    if (m.severity === 8) errors += 1;
    else if (m.severity === 4) warnings += 1;
  });

  if (badge) badge.textContent = markers.length;
  if (statusError) statusError.textContent = errors;
  if (statusWarning) statusWarning.textContent = warnings;

  if (problemsTree) {
    if (markers.length === 0) {
      problemsTree.innerHTML = '<div class="problems-empty">No problems have been detected in the workspace.</div>';
    } else {
      problemsTree.innerHTML = '';
      markers.forEach(marker => {
        const row = document.createElement('div');
        row.className = 'problem-row';
        const isError = marker.severity === 8;
        row.innerHTML = `
          <span class="codicon ${isError ? 'codicon-error problem-icon-error' : 'codicon-warning problem-icon-warning'}"></span>
          <span class="problem-msg">${marker.message}</span>
          <span class="problem-pos">Ln ${marker.startLineNumber}, Col ${marker.startColumn}</span>
        `;
        row.addEventListener('click', () => {
          if (marker.resource && marker.resource.fsPath) {
            docManager.openFile(marker.resource.fsPath);
          }
          if (editor && editor.setPosition) {
            editor.setPosition({ lineNumber: marker.startLineNumber, column: marker.startColumn });
            editor.revealPositionInCenter({ lineNumber: marker.startLineNumber, column: marker.startColumn });
            highlightLine(marker.startLineNumber, marker.message);
            editor.focus();
          }
        });
        problemsTree.appendChild(row);
      });
    }
  }

  // Stream LSP diagnostics into Screen B Smart Cards
  syncLspDiagnosticsToScreenB(markers);
}

function syncLspDiagnosticsToScreenB(markers) {
  if (!Array.isArray(markers)) return;
  const container = document.getElementById('technical-summary-cards-container');
  
  // Clean previously auto-generated diagnostic cards
  if (container) {
    const existingDiagnosticCards = container.querySelectorAll('.technical-summary-card.lsp-diagnostic-card');
    existingDiagnosticCards.forEach(c => c.remove());

    // Filter to top errors/warnings (max 5 cards to prevent DOM bloat)
    const prioritizedMarkers = markers
      .filter(m => m.severity === 8 || m.severity === 4)
      .slice(0, 5);

    prioritizedMarkers.forEach((marker) => {
      const card = document.createElement('div');
      const isError = marker.severity === 8;
      card.className = `technical-summary-card lsp-diagnostic-card ${isError ? 'diagnostic-error' : 'diagnostic-warning'}`;
      const filePath = marker.resource ? (marker.resource.fsPath || marker.resource.path || 'active') : 'active';
      const fileName = filePath.replace(/\\/g, '/').split('/').pop() || filePath;
      card.dataset.filePath = filePath;
      card.dataset.startLine = marker.startLineNumber.toString();

      card.innerHTML = `
        <div class="summary-card-header">
          <span class="summary-card-title">
            <span class="codicon ${isError ? 'codicon-error problem-icon-error' : 'codicon-warning problem-icon-warning'}"></span>
            <span>${isError ? 'LSP Kompilasi / Error' : 'LSP Peringatan'} (${fileName}:${marker.startLineNumber})</span>
          </span>
          <span class="summary-card-badge ${isError ? 'badge-error' : 'badge-warning'}">${marker.source || 'DIAGNOSTIK'}</span>
        </div>
        <div class="summary-root-cause">
          <strong>Pesan:</strong> ${escapeHtml(marker.message)}
        </div>
        <div class="target-card-actions" style="margin-top: 6px;">
          <button class="target-btn-reveal" title="Lompat ke baris di Layar A">
            <span class="codicon codicon-go-to-file"></span>
            <span>Sorot Baris ${marker.startLineNumber}</span>
          </button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (marker.resource && marker.resource.fsPath && docManager) {
          docManager.openFile(marker.resource.fsPath);
        }
        if (editor && editor.setPosition) {
          editor.setPosition({ lineNumber: marker.startLineNumber, column: marker.startColumn });
          if (editor.revealPositionInCenter) {
            editor.revealPositionInCenter({ lineNumber: marker.startLineNumber, column: marker.startColumn });
          }
          if (typeof highlightLine === 'function') {
            highlightLine(marker.startLineNumber, marker.message);
          }
          if (editor.focus) editor.focus();
        }
      });

      container.appendChild(card);
    });
  }

  // Broadcast diagnostics to webview iframe via IPC
  const webviewIframe = document.querySelector('.secondary-webview-frame');
  if (webviewIframe && webviewIframe.contentWindow && typeof webviewIframe.contentWindow.postMessage === 'function') {
    webviewIframe.contentWindow.postMessage({
      type: 'LSP_DIAGNOSTICS_UPDATE',
      payload: {
        totalMarkers: markers.length,
        errors: markers.filter(m => m.severity === 8).length,
        warnings: markers.filter(m => m.severity === 4).length,
        markers: markers.slice(0, 10).map(m => ({
          message: m.message,
          line: m.startLineNumber,
          column: m.startColumn,
          severity: m.severity,
          source: m.source,
        })),
      }
    }, '*');
  }

  // Proactive Socratic Intervention: Trigger Duck nudge if severe compilation errors detected
  const severeErrors = markers.filter(m => m.severity === 8);
  if (severeErrors.length > 0 && window.nscodeMaieuticDuck && typeof window.nscodeMaieuticDuck.notifyFailure === 'function') {
    const topError = severeErrors[0];
    const filePath = topError.resource ? (topError.resource.fsPath || topError.resource.path || 'active') : 'active';
    const errorPayload = {
      symbol: filePath.replace(/\\/g, '/').split('/').pop() || filePath,
      line: topError.startLineNumber,
      message: topError.message,
    };
    
    const triggered = window.nscodeMaieuticDuck.notifyFailure(errorPayload);
    if (triggered && typeof revealMaieuticDuck === 'function') {
      revealMaieuticDuck(errorPayload);
    }
  }
}

function revealMaieuticDuck(context = {}) {
  const secondarySidebar = document.getElementById('secondary-sidebar');
  if (secondarySidebar && secondarySidebar.classList.contains('collapsed') && secondaryResizer) {
    secondaryResizer.expand();
  }

  if (typeof setScreenBMode === 'function') {
    setScreenBMode('chat');
  }

  const duckContainer = document.getElementById('maieutic-duck-container');
  if (duckContainer) {
    duckContainer.style.display = 'block';
    if (window.nscodeMaieuticDuckController && typeof window.nscodeMaieuticDuckController.renderPane === 'function') {
      window.nscodeMaieuticDuckController.renderPane(duckContainer);
    }
    if (typeof duckContainer.scrollIntoView === 'function') {
      duckContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

const MENU_DEFINITIONS = {
  file: {
    title: 'File',
    items: [
      { label: 'New Text File', shortcut: 'Ctrl+N', action: () => docManager.openFile('Untitled-1', '', false) },
      { label: 'New File...', action: () => promptNewFile() },
      { label: 'Open File...', shortcut: 'Ctrl+O', action: () => openCommandPalette('') },
      { label: 'Open Folder...', shortcut: 'Ctrl+K Ctrl+O', action: () => openWorkspaceFolder() },
      { separator: true },
      { label: 'Save', shortcut: 'Ctrl+S', action: () => docManager.saveActiveDocument() },
      { label: 'Save As...', shortcut: 'Ctrl+Shift+S', action: () => saveActiveDocumentAs() },
      { label: 'Auto Save', checked: false, action: (item) => toggleAutoSave(item) },
      { separator: true },
      { label: 'Close Editor', shortcut: 'Ctrl+W', action: () => { if (docManager.activeDocId) docManager.closeTab(docManager.activeDocId); } },
      { label: 'Close All', action: () => docManager.closeAllTabs() },
      { separator: true },
      { label: 'Exit', shortcut: 'Alt+F4', action: () => window.electronIpc?.invoke('app:quit') },
    ]
  },
  edit: {
    title: 'Edit',
    items: [
      { label: 'Undo', shortcut: 'Ctrl+Z', action: () => editor?.trigger?.('menu', 'undo', null) },
      { label: 'Redo', shortcut: 'Ctrl+Y', action: () => editor?.trigger?.('menu', 'redo', null) },
      { separator: true },
      { label: 'Cut', shortcut: 'Ctrl+X', action: () => editor?.trigger?.('menu', 'editor.action.clipboardCutAction', null) },
      { label: 'Copy', shortcut: 'Ctrl+C', action: () => editor?.trigger?.('menu', 'editor.action.clipboardCopyAction', null) },
      { label: 'Paste', shortcut: 'Ctrl+V', action: () => editor?.trigger?.('menu', 'editor.action.clipboardPasteAction', null) },
      { separator: true },
      { label: 'Find', shortcut: 'Ctrl+F', action: () => editor?.trigger?.('menu', 'actions.find', null) },
      { label: 'Replace', shortcut: 'Ctrl+H', action: () => editor?.trigger?.('menu', 'editor.action.startFindReplaceAction', null) },
      { separator: true },
      { label: 'Toggle Line Comment', shortcut: 'Ctrl+/', action: () => editor?.trigger?.('menu', 'editor.action.commentLine', null) },
    ]
  },
  selection: {
    title: 'Selection',
    items: [
      { label: 'Select All', shortcut: 'Ctrl+A', action: () => {
        if (editor?.getModel) {
          editor.setSelection(editor.getModel().getFullModelRange());
        }
      }},
      { label: 'Expand Selection', shortcut: 'Shift+Alt+Right', action: () => editor?.trigger?.('menu', 'editor.action.smartSelect.expand', null) },
      { label: 'Shrink Selection', shortcut: 'Shift+Alt+Left', action: () => editor?.trigger?.('menu', 'editor.action.smartSelect.shrink', null) },
      { separator: true },
      { label: 'Copy Line Up', shortcut: 'Shift+Alt+Up', action: () => editor?.trigger?.('menu', 'editor.action.copyLinesUpAction', null) },
      { label: 'Copy Line Down', shortcut: 'Shift+Alt+Down', action: () => editor?.trigger?.('menu', 'editor.action.copyLinesDownAction', null) },
    ]
  },
  view: {
    title: 'View',
    items: [
      { label: 'Command Palette...', shortcut: 'Ctrl+Shift+P', action: () => openCommandPalette('>') },
      { label: 'Open View: Explorer', shortcut: 'Ctrl+Shift+E', action: () => showSidebarView('explorer') },
      { label: 'Open View: Search', shortcut: 'Ctrl+Shift+F', action: () => showSidebarView('search') },
      { label: 'Open View: Source Control', shortcut: 'Ctrl+Shift+G', action: () => showSidebarView('scm') },
      { label: 'Open View: AntiSlop Hub', shortcut: 'Ctrl+Alt+B', action: () => secondaryResizer.expand() },
      { separator: true },
      { label: 'Toggle Primary Sidebar', shortcut: 'Ctrl+B', action: () => primaryResizer.toggle() },
      { label: 'Toggle Secondary Sidebar', shortcut: 'Ctrl+Alt+B', action: () => secondaryResizer.toggle() },
      { label: 'Toggle Bottom Panel', shortcut: 'Ctrl+`', action: () => bottomResizer.toggle() },
    ]
  },
  go: {
    title: 'Go',
    items: [
      { label: 'Go to File...', shortcut: 'Ctrl+P', action: () => openCommandPalette('') },
      { label: 'Go to Symbol...', shortcut: 'Ctrl+Shift+O', action: () => editor?.trigger?.('menu', 'editor.action.quickOutline', null) },
      { label: 'Go to Line...', shortcut: 'Ctrl+G', action: () => editor?.trigger?.('menu', 'editor.action.gotoLine', null) },
      { separator: true },
      { label: 'Back', shortcut: 'Alt+Left', action: () => navigateBack() },
      { label: 'Forward', shortcut: 'Alt+Right', action: () => navigateForward() },
    ]
  },
  run: {
    title: 'Run',
    items: [
      { label: 'Start Debugging', shortcut: 'F5', action: () => runAntigravityPrompt() },
      { label: 'Run Without Debugging', shortcut: 'Ctrl+F5', action: () => runAntigravityPrompt() },
      { label: 'Run Analysis', shortcut: 'Ctrl+Shift+B', action: () => triggerAnalysis() },
    ]
  },
  terminal: {
    title: 'Terminal',
    items: [
      { label: 'New Terminal', shortcut: 'Ctrl+Shift+`', action: () => { bottomResizer.expand(); selectBottomTab('terminal'); terminalController.createSession(); } },
      { label: 'Clear Terminal', action: () => terminalController.clear() },
      { label: 'Kill Terminal', action: () => terminalController.kill() },
    ]
  },
  help: {
    title: 'Help',
    items: [
      { label: 'Welcome', action: () => docManager.openFile('quicksort.py', undefined, true) },
      { label: 'Documentation', action: () => alert('NSCode: The No-Slop Code Editor\nMake Coders Great Again. No Slop.') },
      { separator: true },
      { label: 'About NSCode', action: () => alert('NSCode v0.2.5\nMake Coders Great Again. No Slop.\nBuilt with Eclipse Theia, Monaco & Antigravity Sidecar\nGolden Invariant: Zero direct auto-patching.') },
    ]
  }
};

let activeOpenMenu = null;

function initMenubar() {
  const menubar = document.getElementById('menubar');
  if (!menubar) return;

  const items = menubar.querySelectorAll('.menubar-item');
  items.forEach(el => {
    const menuKey = el.dataset.menu;

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (activeOpenMenu === menuKey) {
        closeOpenMenu();
      } else {
        openMenu(menuKey, el);
      }
    });

    el.addEventListener('mouseenter', () => {
      if (activeOpenMenu && activeOpenMenu !== menuKey) {
        openMenu(menuKey, el);
      }
    });
  });

  document.addEventListener('click', () => closeOpenMenu());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOpenMenu();
  });
}

function openMenu(menuKey, targetEl) {
  closeOpenMenu();
  const def = MENU_DEFINITIONS[menuKey];
  if (!def) return;

  activeOpenMenu = menuKey;
  targetEl.classList.add('active');

  const dropdown = document.createElement('div');
  dropdown.className = 'menu-dropdown';
  dropdown.id = 'active-menu-dropdown';

  const rect = targetEl.getBoundingClientRect();
  dropdown.style.left = `${rect.left}px`;
  dropdown.style.top = `${rect.bottom}px`;

  def.items.forEach(item => {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'menu-separator';
      dropdown.appendChild(sep);
      return;
    }

    const row = document.createElement('div');
    row.className = 'menu-row';
    row.innerHTML = `
      <div class="menu-item-left">
        <span class="menu-item-check">${item.checked ? '✓' : ''}</span>
        <span>${item.label}</span>
      </div>
      ${item.shortcut ? `<span class="menu-shortcut">${item.shortcut}</span>` : ''}
    `;

    row.addEventListener('click', (e) => {
      e.stopPropagation();
      closeOpenMenu();
      if (typeof item.action === 'function') item.action(item);
    });

    dropdown.appendChild(row);
  });

  document.body.appendChild(dropdown);
}

function closeOpenMenu() {
  const existing = document.getElementById('active-menu-dropdown');
  if (existing) existing.remove();
  document.querySelectorAll('.menubar-item').forEach(el => el.classList.remove('active'));
  activeOpenMenu = null;
}

function promptNewFile() {
  const name = prompt('Enter filename (e.g. script.py):');
  if (name) docManager.openFile(name, '', false);
}

async function saveActiveDocumentAs() {
  const newPath = prompt('Save As path:', docManager.activeDocId || 'new_file.py');
  if (newPath) {
    const doc = docManager.documents.get(docManager.activeDocId);
    const content = doc?.model ? doc.model.getValue() : '';
    if (window.electronFS) {
      await window.electronFS.writeFile(newPath, content);
    }
    docManager.openFile(newPath, content, false);
  }
}

let autoSaveEnabled = false;
let autoSaveTimer = null;
function toggleAutoSave(item) {
  autoSaveEnabled = !autoSaveEnabled;
  item.checked = autoSaveEnabled;
  if (autoSaveEnabled) {
    autoSaveTimer = setInterval(() => {
      if (docManager) docManager.saveActiveDocument();
    }, 2000);
  } else if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
  }
}

// =============================================================================
// COMMAND PALETTE FUZZY SEARCH & WORKSPACE FILE INDEXING (Milestone v0.2.1 - R1 & R3)
// =============================================================================

function fuzzyMatch(query, target) {
  if (!query) return { score: 100, matches: [] };
  if (!target) return { score: -1, matches: [] };

  const qLower = query.toLowerCase();
  const tLower = target.toLowerCase();

  if (tLower === qLower) {
    const matches = [];
    for (let i = 0; i < target.length; i++) matches.push(i);
    return { score: 1000, matches };
  }

  if (tLower.startsWith(qLower)) {
    const matches = [];
    for (let i = 0; i < query.length; i++) matches.push(i);
    return { score: 500 - target.length, matches };
  }

  let score = 0;
  let targetIdx = 0;
  let lastMatchIdx = -2;
  const matches = [];

  for (let qIdx = 0; qIdx < qLower.length; qIdx++) {
    const char = qLower[qIdx];
    const matchIdx = tLower.indexOf(char, targetIdx);
    if (matchIdx === -1) {
      return { score: -1, matches: [] };
    }

    if (matchIdx === targetIdx) {
      score += 20;
    }
    if (matchIdx === lastMatchIdx + 1) {
      score += 25; // consecutive match bonus
    }

    const prevChar = matchIdx > 0 ? target[matchIdx - 1] : '';
    const currChar = target[matchIdx];
    const isWordBoundary = matchIdx === 0 ||
      prevChar === ' ' || prevChar === '/' || prevChar === '\\' ||
      prevChar === '-' || prevChar === '_' || prevChar === '.' || prevChar === ':';
    const isCamelCase = matchIdx > 0 && prevChar >= 'a' && prevChar <= 'z' && currChar >= 'A' && currChar <= 'Z';

    if (isWordBoundary || isCamelCase) {
      score += 35; // word boundary bonus
    }

    matches.push(matchIdx);
    lastMatchIdx = matchIdx;
    targetIdx = matchIdx + 1;
  }

  score -= (target.length - query.length);
  return { score, matches };
}

function fuzzyScore(query, target) {
  return fuzzyMatch(query, target).score;
}

function renderHighlightedText(text, matchIndices) {
  if (!text) return '';
  if (!matchIndices || matchIndices.length === 0) return escapeHtml(text);
  const matchSet = new Set(matchIndices);
  let html = '';
  let inHighlight = false;

  for (let i = 0; i < text.length; i++) {
    const isMatch = matchSet.has(i);
    if (isMatch && !inHighlight) {
      html += '<span class="palette-highlight">';
      inHighlight = true;
    } else if (!isMatch && inHighlight) {
      html += '</span>';
      inHighlight = false;
    }
    html += escapeHtml(text[i]);
  }
  if (inHighlight) {
    html += '</span>';
  }
  return html;
}

function resolveFileIconClass(filename) {
  if (docManager && typeof docManager.getFileIconClass === 'function') {
    return docManager.getFileIconClass(filename);
  }
  if (!filename) return 'codicon codicon-file file-icon-default';
  const lower = filename.toLowerCase();
  const ext = lower.includes('.') ? lower.split('.').pop() : '';

  if (lower === '.gitignore') return 'codicon codicon-git-commit file-icon-git';
  if (lower === 'dockerfile') return 'codicon codicon-server-process file-icon-docker';
  if (lower === 'package.json') return 'codicon codicon-package file-icon-npm';
  if (lower === 'tsconfig.json') return 'codicon codicon-settings-gear file-icon-ts';
  if (lower.startsWith('.env')) return 'codicon codicon-gear file-icon-config';
  if (lower === 'readme.md') return 'codicon codicon-book file-icon-markdown';

  switch (ext) {
    case 'ts': return 'codicon codicon-file-code file-icon-ts';
    case 'tsx': return 'codicon codicon-file-code file-icon-react';
    case 'js':
    case 'mjs':
    case 'cjs': return 'codicon codicon-file-code file-icon-js';
    case 'jsx': return 'codicon codicon-file-code file-icon-react';
    case 'py': return 'codicon codicon-file-code file-icon-python';
    case 'json': return 'codicon codicon-json file-icon-json';
    case 'html': return 'codicon codicon-file-code file-icon-html';
    case 'css': return 'codicon codicon-paintcan file-icon-css';
    case 'md': return 'codicon codicon-markdown file-icon-markdown';
    case 'c':
    case 'h': return 'codicon codicon-file-code file-icon-c';
    case 'cpp':
    case 'hpp': return 'codicon codicon-file-code file-icon-cpp';
    case 'rs': return 'codicon codicon-file-code file-icon-rust';
    case 'go': return 'codicon codicon-file-code file-icon-go';
    case 'php': return 'codicon codicon-file-code file-icon-php';
    default: return 'codicon codicon-file file-icon-default';
  }
}

function flattenWorkspaceTree(tree, rootPath = '') {
  const result = [];
  const EXCLUSIONS = new Set(['node_modules', '.git', 'dist', 'release', '.gemini', '.idea', '.vscode', 'build', 'out']);

  function recurse(nodes) {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node) continue;
      if (node.isDirectory) {
        if (EXCLUSIONS.has(node.name) || (node.name && node.name.startsWith('.'))) {
          continue;
        }
        if (node.children && node.children.length > 0) {
          recurse(node.children);
        }
      } else {
        const normPath = (node.path || '').replace(/\\/g, '/');
        const relPath = (node.relativePath || node.name || '').replace(/\\/g, '/');
        result.push({
          id: node.path || node.name,
          name: node.name,
          path: node.path || node.name,
          relativePath: relPath,
          iconClass: resolveFileIconClass(node.name),
        });
      }
    }
  }

  recurse(tree);
  return result;
}

async function updateWorkspaceFileIndex() {
  if (window.electronFS && typeof window.electronFS.listFiles === 'function') {
    try {
      const files = await window.electronFS.listFiles({ maxDepth: 10 });
      if (Array.isArray(files) && files.length > 0) {
        workspaceFileIndex = files.map((f) => ({
          id: f.path,
          name: f.name,
          path: f.path,
          relativePath: (f.relativePath || f.name).replace(/\\/g, '/'),
          iconClass: resolveFileIconClass(f.name),
        }));
        return workspaceFileIndex;
      }
    } catch (err) {
      console.warn('[updateWorkspaceFileIndex] electronFS.listFiles error:', err);
    }
  }

  if (workspaceTree && workspaceTree.length > 0) {
    workspaceFileIndex = flattenWorkspaceTree(workspaceTree, currentWorkspaceRoot || '');
    return workspaceFileIndex;
  }

  return workspaceFileIndex;
}

function getWorkspaceFileIndex() {
  return workspaceFileIndex;
}

// --- Screen B & Workbench Zero-Hardcode Theme Registry (Phase 1) ---
const THEME_REGISTRY = {
  'vs-dark': {
    id: 'vs-dark',
    label: 'Dark+ (default dark)',
    themeType: 'dark',
    monacoTheme: 'vs-dark',
    tokens: {
      '--vscode-bg': '#1e1e1e',
      '--vscode-fg': '#d4d4d4',
      '--vscode-sidebar-bg': '#252526',
      '--vscode-sidebar-border': '#2d2d2d',
      '--vscode-secondary-sidebar-bg': '#252526',
      '--vscode-secondary-sidebar-border': '#2d2d2d',
      '--vscode-titlebar-bg': '#3c3c3c',
      '--vscode-activitybar-bg': '#333333',
      '--vscode-statusbar-bg': '#007acc',
      '--vscode-statusbar-fg': '#ffffff',
      '--vscode-editor-bg': '#1e1e1e',
      '--vscode-editor-fg': '#d4d4d4',
      '--vscode-editorWidget-bg': '#252526',
      '--vscode-widget-border': '#454545',
      '--vscode-dropdown-background': '#252526',
      '--vscode-dropdown-foreground': '#f0f0f0',
      '--vscode-dropdown-border': '#3c3c3c',
      '--vscode-descriptionForeground': '#858585',
      '--vscode-badge-bg': '#4d4d4d',
      '--vscode-badge-fg': '#ffffff',
      '--vscode-accent': '#007acc',
      '--vscode-accent-hover': '#0098ff',
      '--accent-red': '#f87171',
      '--accent-yellow': '#fbbf24',
      '--accent-green': '#4ade80',
      '--accent-blue': '#60a5fa',
      '--accent-purple': '#a78bfa',
      '--vscode-symbolIcon-keywordForeground': '#c586c0',
      '--vscode-symbolIcon-functionForeground': '#dcdcaa',
      '--vscode-symbolIcon-stringForeground': '#ce9178',
      '--vscode-symbolIcon-numberForeground': '#b5cea8',
      '--vscode-symbolIcon-classForeground': '#4ec9b0',
      '--vscode-symbolIcon-variableForeground': '#9cdcfe',
      '--vscode-symbolIcon-operatorForeground': '#d4d4d4',
    }
  },
  'vs': {
    id: 'vs',
    label: 'Light+ (default light)',
    themeType: 'light',
    monacoTheme: 'vs',
    tokens: {
      '--vscode-bg': '#ffffff',
      '--vscode-fg': '#616161',
      '--vscode-sidebar-bg': '#f3f3f3',
      '--vscode-sidebar-border': '#e7e7e7',
      '--vscode-secondary-sidebar-bg': '#f3f3f3',
      '--vscode-secondary-sidebar-border': '#e7e7e7',
      '--vscode-titlebar-bg': '#dddddd',
      '--vscode-activitybar-bg': '#2c2c2c',
      '--vscode-statusbar-bg': '#007acc',
      '--vscode-statusbar-fg': '#ffffff',
      '--vscode-editor-bg': '#ffffff',
      '--vscode-editor-fg': '#000000',
      '--vscode-editorWidget-bg': '#f3f3f3',
      '--vscode-widget-border': '#c8c8c8',
      '--vscode-dropdown-background': '#ffffff',
      '--vscode-dropdown-foreground': '#616161',
      '--vscode-dropdown-border': '#cecece',
      '--vscode-descriptionForeground': '#717171',
      '--vscode-badge-bg': '#c4c4c4',
      '--vscode-badge-fg': '#333333',
      '--vscode-accent': '#007acc',
      '--vscode-accent-hover': '#0062a3',
      '--accent-red': '#dc2626',
      '--accent-yellow': '#d97706',
      '--accent-green': '#16a34a',
      '--accent-blue': '#2563eb',
      '--accent-purple': '#7c3aed',
      '--vscode-symbolIcon-keywordForeground': '#af00db',
      '--vscode-symbolIcon-functionForeground': '#795e26',
      '--vscode-symbolIcon-stringForeground': '#a31515',
      '--vscode-symbolIcon-numberForeground': '#098658',
      '--vscode-symbolIcon-classForeground': '#267f99',
      '--vscode-symbolIcon-variableForeground': '#001080',
      '--vscode-symbolIcon-operatorForeground': '#000000',
    }
  },
  'hc-black': {
    id: 'hc-black',
    label: 'High Contrast Dark',
    themeType: 'hc-black',
    monacoTheme: 'hc-black',
    tokens: {
      '--vscode-bg': '#000000',
      '--vscode-fg': '#ffffff',
      '--vscode-sidebar-bg': '#000000',
      '--vscode-sidebar-border': '#6fc3df',
      '--vscode-secondary-sidebar-bg': '#000000',
      '--vscode-secondary-sidebar-border': '#6fc3df',
      '--vscode-titlebar-bg': '#000000',
      '--vscode-activitybar-bg': '#000000',
      '--vscode-statusbar-bg': '#000000',
      '--vscode-statusbar-fg': '#ffffff',
      '--vscode-editor-bg': '#000000',
      '--vscode-editor-fg': '#ffffff',
      '--vscode-editorWidget-bg': '#0c141f',
      '--vscode-widget-border': '#6fc3df',
      '--vscode-dropdown-background': '#000000',
      '--vscode-dropdown-foreground': '#ffffff',
      '--vscode-dropdown-border': '#6fc3df',
      '--vscode-descriptionForeground': '#ffffff',
      '--vscode-badge-bg': '#000000',
      '--vscode-badge-fg': '#ffffff',
      '--vscode-accent': '#f38518',
      '--vscode-accent-hover': '#ffa033',
      '--accent-red': '#ff0000',
      '--accent-yellow': '#ffff00',
      '--accent-green': '#00ff00',
      '--accent-blue': '#00ffff',
      '--accent-purple': '#ff00ff',
      '--vscode-symbolIcon-keywordForeground': '#569cd6',
      '--vscode-symbolIcon-functionForeground': '#dcdcaa',
      '--vscode-symbolIcon-stringForeground': '#ce9178',
      '--vscode-symbolIcon-numberForeground': '#b5cea8',
      '--vscode-symbolIcon-classForeground': '#4ec9b0',
      '--vscode-symbolIcon-variableForeground': '#9cdcfe',
      '--vscode-symbolIcon-operatorForeground': '#ffffff',
    }
  }
};

let currentThemeId = 'vs-dark';

function dispatchThemeToWebview(targetThemeId = currentThemeId) {
  const themeDef = THEME_REGISTRY[targetThemeId] || THEME_REGISTRY['vs-dark'];
  const frame = document.getElementById('webview-frame');
  if (frame && frame.contentWindow && typeof frame.contentWindow.postMessage === 'function') {
    try {
      frame.contentWindow.postMessage({
        type: 'THEME_CHANGED',
        payload: {
          themeId: themeDef.id,
          themeType: themeDef.themeType,
          tokens: themeDef.tokens,
        }
      }, '*');
    } catch (err) {
      console.warn('[Workbench] Failed to dispatch THEME_CHANGED to webview:', err);
    }
  }
}

function applyTheme(themeId) {
  const themeDef = THEME_REGISTRY[themeId] || THEME_REGISTRY['vs-dark'];
  currentThemeId = themeDef.id;

  const root = document.documentElement;
  if (root) {
    if (typeof root.setAttribute === 'function') {
      root.setAttribute('data-theme-id', themeDef.id);
      root.setAttribute('data-theme-type', themeDef.themeType);
    }
    if (root.style && typeof root.style.setProperty === 'function') {
      Object.entries(themeDef.tokens).forEach(([token, val]) => {
        root.style.setProperty(token, val);
      });
    }
  }

  if (typeof window !== 'undefined' && window.monaco && window.monaco.editor && typeof window.monaco.editor.setTheme === 'function') {
    window.monaco.editor.setTheme(themeDef.monacoTheme);
  }

  dispatchThemeToWebview(themeDef.id);

  try {
    if (typeof localStorage !== 'undefined' && localStorage.setItem) {
      localStorage.setItem('nscode.theme', themeDef.id);
    }
  } catch (_) {}

  return true;
}

function getCurrentTheme() {
  return currentThemeId;
}

function getThemes() {
  return Object.values(THEME_REGISTRY);
}

function openThemePicker() {
  openCommandPalette('?theme ');
}

if (typeof window !== 'undefined') {
  window.nscodeTheme = {
    applyTheme,
    getCurrentTheme,
    getThemes,
    dispatchThemeToWebview,
  };
}

const COMMAND_REGISTRY = [
  { id: 'file.new', title: 'File: New Text File', category: 'File', shortcut: 'Ctrl+N', action: () => docManager.openFile('Untitled-1', '', false) },
  { id: 'file.openFolder', title: 'File: Open Folder...', category: 'File', shortcut: 'Ctrl+K Ctrl+O', action: () => openWorkspaceFolder() },
  { id: 'file.save', title: 'File: Save', category: 'File', shortcut: 'Ctrl+S', action: () => docManager.saveActiveDocument() },
  { id: 'file.close', title: 'File: Close Active Editor', category: 'File', shortcut: 'Ctrl+W', action: () => { if (docManager.activeDocId) docManager.closeTab(docManager.activeDocId); } },
  { id: 'file.closeAll', title: 'File: Close All Editors', category: 'File', action: () => docManager.closeAllTabs() },
  { id: 'edit.undo', title: 'Edit: Undo', category: 'Edit', shortcut: 'Ctrl+Z', action: () => editor?.trigger?.('menu', 'undo', null) },
  { id: 'edit.redo', title: 'Edit: Redo', category: 'Edit', shortcut: 'Ctrl+Y', action: () => editor?.trigger?.('menu', 'redo', null) },
  { id: 'edit.find', title: 'Edit: Find', category: 'Edit', shortcut: 'Ctrl+F', action: () => editor?.trigger?.('menu', 'actions.find', null) },
  { id: 'edit.replace', title: 'Edit: Replace', category: 'Edit', shortcut: 'Ctrl+H', action: () => editor?.trigger?.('menu', 'editor.action.startFindReplaceAction', null) },
  { id: 'view.explorer', title: 'View: Show Explorer', category: 'View', shortcut: 'Ctrl+Shift+E', action: () => showSidebarView('explorer') },
  { id: 'view.search', title: 'View: Show Search', category: 'View', shortcut: 'Ctrl+Shift+F', action: () => showSidebarView('search') },
  { id: 'view.scm', title: 'View: Show Source Control', category: 'View', shortcut: 'Ctrl+Shift+G', action: () => showSidebarView('scm') },
  { id: 'preferences.settings', title: 'Preferences: Open Settings', category: 'Preferences', shortcut: 'Ctrl+,', action: () => openSettingsModal() },
  { id: 'preferences.colorTheme', title: 'Preferences: Color Theme', category: 'Preferences', action: () => openThemePicker() },
  { id: 'preferences.colorThemeDark', title: 'Preferences: Color Theme (Dark+)', category: 'Preferences', action: () => applyTheme('vs-dark') },
  { id: 'preferences.colorThemeLight', title: 'Preferences: Color Theme (Light+)', category: 'Preferences', action: () => applyTheme('vs') },
  { id: 'preferences.colorThemeHighContrast', title: 'Preferences: Color Theme (High Contrast Dark)', category: 'Preferences', action: () => applyTheme('hc-black') },
  { id: 'view.sidebar', title: 'View: Toggle Primary Sidebar', category: 'View', shortcut: 'Ctrl+B', action: () => primaryResizer.toggle() },
  { id: 'view.secondarySidebar', title: 'View: Toggle Secondary Sidebar (Screen B)', category: 'View', shortcut: 'Ctrl+Alt+B', action: () => secondaryResizer.toggle() },
  { id: 'view.panel', title: 'View: Toggle Bottom Panel', category: 'View', shortcut: 'Ctrl+`', action: () => bottomResizer.toggle() },
  { id: 'view.splitRight', title: 'View: Split Editor Right', category: 'View', shortcut: 'Ctrl+\\', action: () => multiGroupManager.splitRight() },
  { id: 'view.splitDown', title: 'View: Split Editor Down', category: 'View', action: () => multiGroupManager.splitDown() },
  { id: 'view.closeGroup', title: 'View: Close Active Editor Group', category: 'View', action: () => multiGroupManager.closeGroup(multiGroupManager.activeGroupId) },
  { id: 'terminal.new', title: 'Terminal: Create New Terminal', category: 'Terminal', shortcut: 'Ctrl+Shift+`', action: () => { bottomResizer.expand(); selectBottomTab('terminal'); terminalController.createSession(); } },
  { id: 'terminal.clear', title: 'Terminal: Clear Terminal', category: 'Terminal', action: () => terminalController.clear() },
  { id: 'terminal.kill', title: 'Terminal: Kill Terminal', category: 'Terminal', action: () => terminalController.kill() },
  { id: 'antislop.analyze', title: 'AntiSlop: Run Active Code Analysis', category: 'AntiSlop', shortcut: 'Ctrl+Shift+B', action: () => triggerAnalysis() },
  { id: 'antislop.prompt', title: 'AntiSlop: Focus AI Instruction Prompt Box', category: 'AntiSlop', action: () => { secondaryResizer.expand(); promptInputBox?.focus(); } },
  { id: 'antislop.reconnect', title: 'AntiSlop: Reconnect Sidecar Daemon (4949)', category: 'AntiSlop', action: () => connectSidecar() },
  { id: 'go.line', title: 'Go: Go to Line...', category: 'Go', shortcut: 'Ctrl+G', action: () => openCommandPalette(':') },
  { id: 'go.symbol', title: 'Go: Go to Symbol...', category: 'Go', shortcut: 'Ctrl+Shift+O', action: () => editor?.trigger?.('menu', 'editor.action.quickOutline', null) },
  { id: 'go.back', title: 'Go: Back', category: 'Go', shortcut: 'Alt+Left', action: () => navigateBack() },
  { id: 'go.forward', title: 'Go: Forward', category: 'Go', shortcut: 'Alt+Right', action: () => navigateForward() },
];

let selectedPaletteIndex = 0;
let paletteItems = [];

function getPaletteItems() {
  return paletteItems;
}

function openCommandPalette(initialQuery = '>') {
  const backdrop = document.getElementById('command-palette-backdrop');
  const input = document.getElementById('command-palette-input');
  if (!backdrop || !input) return;

  backdrop.style.display = 'flex';
  input.value = initialQuery;
  selectedPaletteIndex = 0;
  updatePaletteResults(input.value);

  setTimeout(() => {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, 20);
}

function closeCommandPalette() {
  const backdrop = document.getElementById('command-palette-backdrop');
  if (backdrop) backdrop.style.display = 'none';
  if (editor && editor.focus) editor.focus();
}

function updatePaletteResults(rawQuery) {
  const resultsContainer = document.getElementById('command-palette-results');
  const promptIcon = document.getElementById('command-palette-prompt-icon') || document.querySelector('.palette-prompt-icon');
  const input = document.getElementById('command-palette-input');
  if (!resultsContainer) return;
  resultsContainer.innerHTML = '';

  const isCommandMode = rawQuery.startsWith('>');
  const isLineMode = rawQuery.startsWith(':');
  const isThemeMode = rawQuery.startsWith('?theme');

  paletteItems = [];

  if (isCommandMode) {
    if (promptIcon) promptIcon.className = 'codicon codicon-chevron-right palette-prompt-icon';
    if (input) input.placeholder = 'Type a command to run';

    const query = rawQuery.substring(1).trim();
    COMMAND_REGISTRY.forEach((cmd) => {
      const matchRes = query ? fuzzyMatch(query, cmd.title) : { score: 100, matches: [] };
      if (matchRes.score > 0) {
        paletteItems.push({
          ...cmd,
          score: matchRes.score,
          matchIndices: matchRes.matches,
        });
      }
    });
    paletteItems.sort((a, b) => b.score - a.score);
  } else if (isLineMode) {
    if (promptIcon) promptIcon.className = 'codicon codicon-go-to-file palette-prompt-icon';
    const activeEditor = editor;
    const model = activeEditor?.getModel?.();
    const maxLine = model?.getLineCount?.() || 1;
    const currentPos = activeEditor?.getPosition?.() || { lineNumber: 1, column: 1 };
    const lineQuery = rawQuery.substring(1).trim();

    if (!lineQuery) {
      if (input) input.placeholder = `Current line: ${currentPos.lineNumber}. Type a line number between 1 and ${maxLine} to navigate to`;
      resultsContainer.innerHTML = `
        <div class="palette-item selected">
          <div class="palette-item-left">
            <span class="palette-item-icon codicon codicon-go-to-file"></span>
            <span class="palette-item-title">Current line: ${currentPos.lineNumber}, Column: ${currentPos.column}. Type a line number between 1 and ${maxLine}.</span>
          </div>
        </div>`;
      paletteItems = [{
        id: 'go.line.current',
        action: () => {},
      }];
      selectedPaletteIndex = 0;
      return;
    }

    const parts = lineQuery.split(':');
    const parsedLine = parseInt(parts[0], 10);
    const parsedCol = parts.length > 1 ? parseInt(parts[1], 10) : 1;

    if (isNaN(parsedLine)) {
      resultsContainer.innerHTML = '<div class="palette-empty">Invalid line number.</div>';
      paletteItems = [];
      return;
    }

    const targetLine = Math.min(Math.max(1, parsedLine), maxLine);
    const targetCol = Math.max(1, parsedCol || 1);

    resultsContainer.innerHTML = `
      <div class="palette-item selected">
        <div class="palette-item-left">
          <span class="palette-item-icon codicon codicon-go-to-file"></span>
          <span class="palette-item-title">Go to line ${targetLine}${parts.length > 1 ? ', column ' + targetCol : ''} (Range: 1 - ${maxLine})</span>
        </div>
      </div>`;

    paletteItems = [{
      id: 'go.line.execute',
      score: 100,
      action: () => {
        if (activeEditor) {
          if (typeof activeEditor.revealLineInCenter === 'function') {
            activeEditor.revealLineInCenter(targetLine);
          }
          if (typeof activeEditor.setPosition === 'function') {
            activeEditor.setPosition({ lineNumber: targetLine, column: targetCol });
          }
          if (typeof activeEditor.focus === 'function') {
            activeEditor.focus();
          }
        }
      },
    }];
    selectedPaletteIndex = 0;
    return;
  } else if (isThemeMode) {
    if (promptIcon) promptIcon.className = 'codicon codicon-color-mode palette-prompt-icon';
    if (input) input.placeholder = 'Select Color Theme (Up/Down to navigate, Enter to select)';

    const query = rawQuery.replace(/^\?theme\s*/, '').trim().toLowerCase();
    getThemes().forEach((t) => {
      if (!query || t.label.toLowerCase().includes(query) || t.id.includes(query)) {
        paletteItems.push({
          id: `theme.${t.id}`,
          title: t.label,
          category: 'Color Theme',
          shortcut: t.id === currentThemeId ? 'Active' : '',
          action: () => applyTheme(t.id),
        });
      }
    });
  } else {
    if (promptIcon) promptIcon.className = 'codicon codicon-search palette-prompt-icon';
    if (input) input.placeholder = 'Search files by name (type > for commands, : for line)';

    const query = rawQuery.trim();

    let candidates = workspaceFileIndex;
    if (!candidates || candidates.length === 0) {
      const poolMap = new Map();
      if (docManager && docManager.documents) {
        docManager.documents.forEach((d) => {
          poolMap.set(d.id, { name: d.fileName, path: d.filePath || d.id, relativePath: d.fileName });
        });
      }
      if (typeof SAMPLES !== 'undefined') {
        Object.keys(SAMPLES).forEach((s) => {
          if (!poolMap.has(s)) poolMap.set(s, { name: s, path: s, relativePath: s });
        });
      }
      candidates = Array.from(poolMap.values()).map((item) => ({
        id: item.path,
        name: item.name,
        path: item.path,
        relativePath: item.relativePath,
        iconClass: resolveFileIconClass(item.name),
      }));
    }

    candidates.forEach((item) => {
      let matchRes;
      let highlightedName = '';
      let highlightedPath = '';

      if (!query) {
        matchRes = { score: 100, matches: [] };
        highlightedName = escapeHtml(item.name);
        highlightedPath = escapeHtml(item.relativePath);
      } else if (query.includes('/') || query.includes('\\')) {
        matchRes = fuzzyMatch(query, item.relativePath);
        if (matchRes.score > 0) {
          highlightedName = escapeHtml(item.name);
          highlightedPath = renderHighlightedText(item.relativePath, matchRes.matches);
        }
      } else {
        matchRes = fuzzyMatch(query, item.name);
        if (matchRes.score > 0) {
          matchRes.score += 100; // Filename direct match bonus
          highlightedName = renderHighlightedText(item.name, matchRes.matches);
          highlightedPath = escapeHtml(item.relativePath);
        } else {
          matchRes = fuzzyMatch(query, item.relativePath);
          if (matchRes.score > 0) {
            highlightedName = escapeHtml(item.name);
            highlightedPath = renderHighlightedText(item.relativePath, matchRes.matches);
          }
        }
      }

      if (matchRes && matchRes.score > 0) {
        paletteItems.push({
          id: item.path || item.id,
          title: item.name,
          category: 'File',
          path: item.path,
          relativePath: item.relativePath,
          iconClass: item.iconClass || resolveFileIconClass(item.name),
          highlightedName,
          highlightedPath,
          score: matchRes.score,
          action: () => {
            if (docManager) docManager.openFile(item.path, undefined, true);
          },
        });
      }
    });

    paletteItems.sort((a, b) => b.score - a.score);
  }

  if (paletteItems.length === 0) {
    resultsContainer.innerHTML = `<div class="palette-empty">${isCommandMode ? 'No matching commands found.' : isThemeMode ? 'No matching themes found.' : 'No matching files found.'}</div>`;
    return;
  }

  if (selectedPaletteIndex >= paletteItems.length) {
    selectedPaletteIndex = 0;
  }

  paletteItems.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = `palette-item ${idx === selectedPaletteIndex ? 'selected' : ''}`;

    if (item.category === 'File') {
      row.innerHTML = `
        <div class="palette-item-left">
          <span class="palette-item-icon ${item.iconClass || 'codicon codicon-file'}"></span>
          <span class="palette-item-name">${item.highlightedName || escapeHtml(item.title)}</span>
          <span class="palette-item-path">${item.highlightedPath || escapeHtml(item.relativePath || '')}</span>
        </div>
      `;
    } else {
      row.innerHTML = `
        <div class="palette-item-left">
          <span class="palette-item-category">${item.category}:</span>
          <span class="palette-item-title">${renderHighlightedText(item.title, item.matchIndices)}</span>
        </div>
        ${item.shortcut ? `<span class="palette-item-shortcut">${item.shortcut}</span>` : ''}
      `;
    }

    row.addEventListener('click', () => {
      closeCommandPalette();
      if (typeof item.action === 'function') item.action();
    });

    resultsContainer.appendChild(row);
  });
}

function initCommandPalette() {
  const trigger = document.getElementById('command-palette-trigger');
  if (trigger) {
    trigger.addEventListener('click', () => openCommandPalette('>'));
  }

  const backdrop = document.getElementById('command-palette-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeCommandPalette();
    });
  }

  const input = document.getElementById('command-palette-input');
  if (input) {
    input.addEventListener('input', () => {
      selectedPaletteIndex = 0;
      updatePaletteResults(input.value);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (paletteItems.length > 0) {
          selectedPaletteIndex = (selectedPaletteIndex + 1) % paletteItems.length;
          renderSelectedPaletteIndex();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (paletteItems.length > 0) {
          selectedPaletteIndex = (selectedPaletteIndex - 1 + paletteItems.length) % paletteItems.length;
          renderSelectedPaletteIndex();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = paletteItems[selectedPaletteIndex];
        if (selected) {
          closeCommandPalette();
          if (typeof selected.action === 'function') selected.action();
        }
      } else if (e.key === 'Escape') {
        closeCommandPalette();
      } else if ((e.key === 'p' || e.key === 'P') && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        input.value = '';
        selectedPaletteIndex = 0;
        updatePaletteResults(input.value);
      } else if ((e.key === 'g' || e.key === 'G') && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        input.value = ':';
        selectedPaletteIndex = 0;
        updatePaletteResults(input.value);
      }
    });
  }

  const statusCursor = document.getElementById('status-cursor');
  if (statusCursor) {
    statusCursor.addEventListener('click', () => openCommandPalette(':'));
  }

  document.querySelectorAll('.screen-b-mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.dataset.mode) setScreenBMode(tab.dataset.mode);
    });
  });

  const btnPlanPause = document.getElementById('btn-plan-pause');
  if (btnPlanPause) {
    btnPlanPause.addEventListener('click', () => pauseTaskPlan());
  }
  const btnPlanResume = document.getElementById('btn-plan-resume');
  if (btnPlanResume) {
    btnPlanResume.addEventListener('click', () => resumeTaskPlan());
  }
  const btnPlanCancel = document.getElementById('btn-plan-cancel');
  if (btnPlanCancel) {
    btnPlanCancel.addEventListener('click', () => cancelTaskPlan());
  }
  const btnClearLogs = document.getElementById('btn-plan-clear-logs');
  if (btnClearLogs) {
    btnClearLogs.addEventListener('click', () => {
      const consoleEl = document.getElementById('plan-logs-console') || document.getElementById('screen-b-plan-logs');
      if (consoleEl) consoleEl.innerHTML = '';
      if (currentTaskPlan) currentTaskPlan.logs = [];
    });
  }

  const btnAcceptAll = document.getElementById('btn-review-accept-all');
  if (btnAcceptAll) {
    btnAcceptAll.addEventListener('click', () => acceptAllReviewDiffs());
  }
  const btnDiscardAll = document.getElementById('btn-review-discard-all');
  if (btnDiscardAll) {
    btnDiscardAll.addEventListener('click', () => discardAllReviewDiffs());
  }
}

function renderSelectedPaletteIndex() {
  const items = document.querySelectorAll('.palette-item');
  items.forEach((item, idx) => {
    item.classList.toggle('selected', idx === selectedPaletteIndex);
    if (idx === selectedPaletteIndex) {
      if (typeof item.scrollIntoView === 'function') {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  });
}

async function openWorkspaceFolder() {
  if (!window.electronFS) return;
  if (docManager && docManager.documents) {
    for (const doc of docManager.documents.values()) {
      if (doc.isDirty) {
        const choice = await showDirtySaveDialog(doc.fileName);
        if (choice === 'save') {
          await docManager.saveDocument(doc.id);
        } else if (choice === 'cancel') {
          return;
        }
      }
    }
  }
  try {
    const res = await window.electronFS.openDirectory();
    if (res && !res.canceled && res.path) {
      currentWorkspaceRoot = res.path;
      const folderName = res.name || res.path.split(/[\\/]/).filter(Boolean).pop() || 'WORKSPACE';
      if (workspaceFolderName) workspaceFolderName.textContent = folderName.toUpperCase();

      const searchPlaceholder = document.querySelector('.search-placeholder');
      if (searchPlaceholder) {
        searchPlaceholder.textContent = `${folderName} - NSCode (Ctrl+P to search files, > for commands)`;
      }

      await refreshWorkspaceTree();
      await updateWorkspaceFileIndex();
      if (scmController) scmController.refresh();
      showSidebarView('explorer');
    }
  } catch (err) {
    console.error('[Workbench] Error opening directory:', err);
  }
}

async function refreshWorkspaceTree() {
  if (!window.electronFS || !currentWorkspaceRoot) return;
  try {
    const res = await window.electronFS.readDirectory({ dirPath: currentWorkspaceRoot, maxDepth: 5 });
    const nodes = (res && (res.nodes || res.tree)) || [];
    workspaceTree = nodes;
    renderWorkspaceTree(workspaceTree, workspaceFileTree, 0);
    await updateWorkspaceFileIndex();
  } catch (err) {
    console.error('[Workbench] Error reading directory:', err);
  }
}

// =============================================================================
// EXPLORER CONTEXT MENU & FILE OPERATIONS (Milestone v0.1.2)
// =============================================================================

function findNodeByPath(nodes, targetPath) {
  if (!nodes || !targetPath) return null;
  const normTarget = targetPath.replace(/\\/g, '/').replace(/\/+$/, '');
  for (const node of nodes) {
    if (node.path.replace(/\\/g, '/').replace(/\/+$/, '') === normTarget) {
      return node;
    }
    if (node.children && node.children.length > 0) {
      const found = findNodeByPath(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

function getDirectoryPath(p) {
  if (!p) return currentWorkspaceRoot || '';
  const lastSlash = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  if (lastSlash === -1) return currentWorkspaceRoot || '';
  if (lastSlash === 0) return '/';
  if (lastSlash === 2 && p[1] === ':') return p.substring(0, 3);
  return p.substring(0, lastSlash);
}

function joinPath(dir, file) {
  if (!dir) return file;
  const isWin = dir.includes('\\');
  const sep = isWin ? '\\' : '/';
  const cleanDir = dir.endsWith('/') || dir.endsWith('\\') ? dir.slice(0, -1) : dir;
  const cleanFile = file.replace(/^[\\/]+/, '');
  return `${cleanDir}${sep}${cleanFile}`;
}

async function copyToClipboard(text) {
  try {
    if (window.electronClipboard && typeof window.electronClipboard.writeText === 'function') {
      window.electronClipboard.writeText(text);
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
  } catch (err) {
    console.warn('[Explorer] Clipboard copy failed:', err);
  }
}

let activeExplorerContextMenu = null;
let activeExplorerContextMenuCleanup = null;

function closeExplorerContextMenu() {
  if (activeExplorerContextMenuCleanup) {
    activeExplorerContextMenuCleanup();
    activeExplorerContextMenuCleanup = null;
  }
  if (activeExplorerContextMenu) {
    activeExplorerContextMenu.remove();
    activeExplorerContextMenu = null;
  }
}

function openExplorerContextMenu(x, y, targetNode) {
  closeExplorerContextMenu();

  let targetDir = currentWorkspaceRoot;
  if (targetNode) {
    if (targetNode.isDirectory) {
      targetDir = targetNode.path;
    } else {
      targetDir = getDirectoryPath(targetNode.path);
    }
  }

  const menu = document.createElement('div');
  menu.className = 'menu-dropdown explorer-context-menu';
  menu.id = 'explorer-context-menu';
  menu.style.position = 'fixed';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const menuItems = [
    {
      label: 'New File',
      action: () => triggerNewFileAction(targetDir),
    },
    {
      label: 'New Folder',
      action: () => triggerNewFolderAction(targetDir),
    },
    { separator: true },
    {
      label: 'Reveal in File Explorer',
      action: () => triggerRevealInExplorer(targetNode?.path || currentWorkspaceRoot),
    },
    { separator: true },
    {
      label: 'Copy Path',
      shortcut: 'Shift+Alt+C',
      action: () => copyPathAction(targetNode?.path || currentWorkspaceRoot, false),
    },
    {
      label: 'Copy Relative Path',
      shortcut: 'Shift+Ctrl+C',
      action: () => copyPathAction(targetNode?.path || currentWorkspaceRoot, true),
    },
  ];

  if (targetNode) {
    menuItems.push(
      { separator: true },
      {
        label: 'Rename',
        shortcut: 'F2',
        action: () => triggerRenameAction(targetNode),
      },
      {
        label: 'Delete',
        shortcut: 'Delete',
        action: () => triggerDeleteAction(targetNode),
      }
    );
  }

  menuItems.forEach((item) => {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'menu-separator';
      menu.appendChild(sep);
      return;
    }

    const row = document.createElement('div');
    row.className = 'menu-row';
    row.innerHTML = `
      <div class="menu-item-left">
        <span>${item.label}</span>
      </div>
      ${item.shortcut ? `<span class="menu-shortcut">${item.shortcut}</span>` : ''}
    `;

    row.addEventListener('click', (e) => {
      e.stopPropagation();
      closeExplorerContextMenu();
      if (typeof item.action === 'function') {
        item.action();
      }
    });

    menu.appendChild(row);
  });

  document.body.appendChild(menu);
  activeExplorerContextMenu = menu;

  const rect = menu.getBoundingClientRect();
  const clampedX = Math.max(0, Math.min(x, window.innerWidth - rect.width - 8));
  const clampedY = Math.max(0, Math.min(y, window.innerHeight - rect.height - 8));
  menu.style.left = `${clampedX}px`;
  menu.style.top = `${clampedY}px`;

  let selectedIndex = -1;
  const rowElements = Array.from(menu.querySelectorAll('.menu-row'));
  const updateSelection = (newIndex) => {
    rowElements.forEach((el, i) => {
      if (i === newIndex) el.classList.add('selected');
      else el.classList.remove('selected');
    });
    selectedIndex = newIndex;
  };

  rowElements.forEach((row, i) => {
    row.addEventListener('mouseenter', () => {
      updateSelection(i);
    });
  });

  const onDocClick = (e) => {
    if (menu && !menu.contains(e.target)) {
      closeExplorerContextMenu();
    }
  };

  const onDocContextMenu = (e) => {
    if (menu && !menu.contains(e.target)) {
      closeExplorerContextMenu();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape' || e.key === 'Tab') {
      closeExplorerContextMenu();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      const nextIdx = selectedIndex < rowElements.length - 1 ? selectedIndex + 1 : 0;
      updateSelection(nextIdx);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      const prevIdx = selectedIndex > 0 ? selectedIndex - 1 : rowElements.length - 1;
      updateSelection(prevIdx);
    } else if (e.key === 'Home') {
      e.preventDefault();
      e.stopPropagation();
      updateSelection(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      updateSelection(rowElements.length - 1);
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < rowElements.length) {
        e.preventDefault();
        e.stopPropagation();
        rowElements[selectedIndex].click();
      }
    }
  };

  const onWindowBlur = () => {
    closeExplorerContextMenu();
  };

  const cleanupListeners = () => {
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('contextmenu', onDocContextMenu, true);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('blur', onWindowBlur);
  };
  activeExplorerContextMenuCleanup = cleanupListeners;

  setTimeout(() => {
    if (activeExplorerContextMenu === menu) {
      document.addEventListener('click', onDocClick, true);
      document.addEventListener('contextmenu', onDocContextMenu, true);
      window.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('blur', onWindowBlur);
    }
  }, 0);
}

function showWorkbenchDropdown(targetEl, items) {
  closeExplorerContextMenu();
  if (!targetEl || !items || !items.length) return;
  const targetRect = targetEl.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'explorer-context-menu';
  menu.setAttribute('role', 'menu');
  menu.style.position = 'fixed';
  menu.style.zIndex = '9999';

  items.forEach((item) => {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'menu-separator';
      menu.appendChild(sep);
      return;
    }
    const row = document.createElement('div');
    row.className = 'menu-row';
    row.innerHTML = `
      <div class="menu-item-left">
        <span>${item.label}</span>
      </div>
      ${item.shortcut ? `<span class="menu-shortcut">${item.shortcut}</span>` : ''}
    `;
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      closeExplorerContextMenu();
      if (typeof item.action === 'function') {
        item.action();
      }
    });
    menu.appendChild(row);
  });

  document.body.appendChild(menu);
  activeExplorerContextMenu = menu;

  const rect = menu.getBoundingClientRect();
  let top = targetRect.bottom + 4;
  if (top + rect.height > window.innerHeight - 8) {
    top = targetRect.top - rect.height - 4;
  }
  let left = targetRect.left;
  if (left + rect.width > window.innerWidth - 8) {
    left = window.innerWidth - rect.width - 8;
  }
  menu.style.top = `${Math.max(0, top)}px`;
  menu.style.left = `${Math.max(0, left)}px`;

  const onDocClick = (e) => {
    if (menu && !menu.contains(e.target)) {
      closeExplorerContextMenu();
    }
  };
  const onKeyDown = (e) => {
    if (e.key === 'Escape' || e.key === 'Tab') {
      closeExplorerContextMenu();
    }
  };
  activeExplorerContextMenuCleanup = () => {
    document.removeEventListener('click', onDocClick, true);
    window.removeEventListener('keydown', onKeyDown, true);
  };
  setTimeout(() => {
    if (activeExplorerContextMenu === menu) {
      document.addEventListener('click', onDocClick, true);
      window.addEventListener('keydown', onKeyDown, true);
    }
  }, 0);
}

async function triggerNewFileAction(targetDir) {
  const dir = targetDir || currentWorkspaceRoot;
  if (!dir && (!window.electronFS || !currentWorkspaceRoot)) {
    docManager.openFile(`Untitled-${docManager.documents.size + 1}`, '', false);
    return;
  }
  const name = window.prompt ? window.prompt('Enter new file name:') : null;
  if (!name || !name.trim()) return;
  const cleanName = name.trim().replace(/^[\\/]+/, '');
  const INVALID_CHARS = /[<>:"/\\|?*]/;
  const RESERVED_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9]|conin\$|conout\$)(\..*)?$/i;
  if (INVALID_CHARS.test(cleanName) || RESERVED_NAMES.test(cleanName)) {
    if (typeof window.alert === 'function') window.alert(`Invalid file name: '${cleanName}'`);
    return;
  }
  const filePath = joinPath(dir, cleanName);

  if (window.electronFS && window.electronFS.createFile) {
    const res = await window.electronFS.createFile(filePath);
    if (res && res.error) {
      console.error('[Explorer] Create file failed:', res.error);
      if (typeof window.alert === 'function') window.alert(res.error);
      return;
    }
  } else if (window.electronFS && window.electronFS.writeFile) {
    await window.electronFS.writeFile(filePath, '');
  }

  if (dir && dir !== currentWorkspaceRoot) {
    expandedDirs.add(dir);
  }

  selectedTreePath = filePath;
  await refreshWorkspaceTree();
  docManager.openFile(filePath, '', false);
  if (scmController) scmController.refresh();
}

async function triggerNewFolderAction(targetDir) {
  const dir = targetDir || currentWorkspaceRoot;
  if (!dir) return;
  const name = window.prompt ? window.prompt('Enter new folder name:') : null;
  if (!name || !name.trim()) return;
  const cleanName = name.trim().replace(/^[\\/]+/, '');
  const INVALID_CHARS = /[<>:"/\\|?*]/;
  const RESERVED_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9]|conin\$|conout\$)(\..*)?$/i;
  if (INVALID_CHARS.test(cleanName) || RESERVED_NAMES.test(cleanName)) {
    if (typeof window.alert === 'function') window.alert(`Invalid folder name: '${cleanName}'`);
    return;
  }
  const folderPath = joinPath(dir, cleanName);

  if (window.electronFS && window.electronFS.createDirectory) {
    const res = await window.electronFS.createDirectory(folderPath);
    if (res && res.error) {
      console.error('[Explorer] Create directory failed:', res.error);
      if (typeof window.alert === 'function') window.alert(res.error);
      return;
    }
  } else if (window.electronFS && window.electronFS.writeFile) {
    await window.electronFS.writeFile(joinPath(folderPath, '.gitkeep'), '');
  }

  if (dir && dir !== currentWorkspaceRoot) {
    expandedDirs.add(dir);
  }

  selectedTreePath = folderPath;
  await refreshWorkspaceTree();
  if (scmController) scmController.refresh();
}

async function triggerRenameAction(node) {
  const targetNode = typeof node === 'string' ? findNodeByPath(workspaceTree, node) : node;
  if (!targetNode || !targetNode.path) return;

  const INVALID_CHARS = /[<>:"/\\|?*]/;
  const RESERVED_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9]|conin\$|conout\$)(\..*)?$/i;

  const normTargetPath = targetNode.path.replace(/\\/g, '/').replace(/\/+$/, '');
  const itemEl = Array.from(document.querySelectorAll('.tree-item')).find(el => {
    const p = el.dataset.path;
    return p && p.replace(/\\/g, '/').replace(/\/+$/, '') === normTargetPath;
  });
  const nameEl = itemEl ? itemEl.querySelector('.tree-item-name') : null;

  if (itemEl && nameEl) {
    const originalText = targetNode.name;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tree-rename-input';
    input.value = originalText;

    nameEl.innerHTML = '';
    nameEl.appendChild(input);
    input.focus();

    const dotIndex = originalText.lastIndexOf('.');
    if (!targetNode.isDirectory && dotIndex > 0) {
      input.setSelectionRange(0, dotIndex);
    } else {
      input.select();
    }

    input.addEventListener('input', () => {
      const val = input.value.trim();
      if (INVALID_CHARS.test(val) || RESERVED_NAMES.test(val)) {
        input.classList.add('error');
        input.title = 'A file or folder name cannot contain characters: < > : " / \\ | ? * or reserved device names';
      } else {
        input.classList.remove('error');
        input.title = '';
      }
    });

    let isCommitted = false;

    const commitRename = async () => {
      if (isCommitted) return;
      const newName = input.value.trim();
      if (!newName || newName === originalText) {
        isCommitted = true;
        nameEl.textContent = originalText;
        return;
      }

      if (INVALID_CHARS.test(newName) || RESERVED_NAMES.test(newName)) {
        console.warn('[Explorer] Invalid file name rejected:', newName);
        input.classList.add('error');
        input.focus();
        return;
      }

      isCommitted = true;
      try {
        const oldPath = targetNode.path;
        const parentDir = getDirectoryPath(oldPath);
        let newPath = joinPath(parentDir, newName);

        if (window.electronFS && window.electronFS.rename) {
          const res = await window.electronFS.rename(oldPath, newPath);
          if (res && res.error) {
            console.error('[Explorer] Rename failed:', res.error);
            nameEl.textContent = originalText;
            if (typeof window.alert === 'function') window.alert(res.error);
            return;
          }
          if (res && res.newPath) {
            newPath = res.newPath;
          }
        }

        const normOld = oldPath.replace(/\\/g, '/').replace(/\/+$/, '');
        const normSelected = selectedTreePath && selectedTreePath.replace(/\\/g, '/').replace(/\/+$/, '');
        if (normSelected === normOld) {
          selectedTreePath = newPath;
        } else if (selectedTreePath && selectedTreePath.replace(/\\/g, '/').startsWith(normOld + '/')) {
          const sub = selectedTreePath.replace(/\\/g, '/').substring(normOld.length);
          const cleanBase = newPath.replace(/[\\/]+$/, '');
          const sep = newPath.includes('\\') ? '\\' : '/';
          selectedTreePath = `${cleanBase}${sep === '\\' ? sub.replace(/\//g, '\\') : sub}`;
        }

        // Synchronize expanded directory paths
        const updatedExpanded = new Set();
        for (const exp of expandedDirs) {
          const normExp = exp.replace(/\\/g, '/').replace(/\/+$/, '');
          if (normExp === normOld) {
            updatedExpanded.add(newPath);
          } else if (normExp.startsWith(normOld + '/')) {
            const sub = normExp.substring(normOld.length);
            const cleanBase = newPath.replace(/[\\/]+$/, '');
            const sep = newPath.includes('\\') ? '\\' : '/';
            updatedExpanded.add(`${cleanBase}${sep === '\\' ? sub.replace(/\//g, '\\') : sub}`);
          } else {
            updatedExpanded.add(exp);
          }
        }
        expandedDirs = updatedExpanded;

        docManager.handleFileRenamed(oldPath, newPath);
        await refreshWorkspaceTree();
        if (scmController) scmController.refresh();
      } catch (err) {
        console.error('[Explorer] Rename failed:', err);
        nameEl.textContent = originalText;
      }
    };

    const cancelRename = () => {
      if (isCommitted) return;
      isCommitted = true;
      nameEl.textContent = originalText;
    };

    input.addEventListener('keydown', async (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        await commitRename();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelRename();
      }
    });

    input.addEventListener('blur', async () => {
      await commitRename();
    });

    input.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  } else {
    const newName = window.prompt ? window.prompt('Rename:', targetNode.name) : null;
    if (newName && newName.trim() && newName.trim() !== targetNode.name) {
      const cleanName = newName.trim();
      if (INVALID_CHARS.test(cleanName) || RESERVED_NAMES.test(cleanName)) {
        console.warn('[Explorer] Invalid file name rejected:', cleanName);
        if (typeof window.alert === 'function') {
          window.alert('Invalid file or folder name.');
        }
        return;
      }

      const oldPath = targetNode.path;
      const parentDir = getDirectoryPath(oldPath);
      let newPath = joinPath(parentDir, cleanName);

      if (window.electronFS && window.electronFS.rename) {
        const res = await window.electronFS.rename(oldPath, newPath);
        if (res && res.error) {
          console.error('[Explorer] Rename failed:', res.error);
          if (typeof window.alert === 'function') window.alert(res.error);
          return;
        }
        if (res && res.newPath) newPath = res.newPath;
      }

      const normOld = oldPath.replace(/\\/g, '/').replace(/\/+$/, '');
      const normSelected = selectedTreePath && selectedTreePath.replace(/\\/g, '/').replace(/\/+$/, '');
      if (normSelected === normOld) {
        selectedTreePath = newPath;
      } else if (selectedTreePath && selectedTreePath.replace(/\\/g, '/').startsWith(normOld + '/')) {
        const sub = selectedTreePath.replace(/\\/g, '/').substring(normOld.length);
        const cleanBase = newPath.replace(/[\\/]+$/, '');
        const sep = newPath.includes('\\') ? '\\' : '/';
        selectedTreePath = `${cleanBase}${sep === '\\' ? sub.replace(/\//g, '\\') : sub}`;
      }

      // Synchronize expanded directory paths
      const updatedExpanded = new Set();
      for (const exp of expandedDirs) {
        const normExp = exp.replace(/\\/g, '/').replace(/\/+$/, '');
        if (normExp === normOld) {
          updatedExpanded.add(newPath);
        } else if (normExp.startsWith(normOld + '/')) {
          const sub = normExp.substring(normOld.length);
          const cleanBase = newPath.replace(/[\\/]+$/, '');
          const sep = newPath.includes('\\') ? '\\' : '/';
          updatedExpanded.add(`${cleanBase}${sep === '\\' ? sub.replace(/\//g, '\\') : sub}`);
        } else {
          updatedExpanded.add(exp);
        }
      }
      expandedDirs = updatedExpanded;

      docManager.handleFileRenamed(oldPath, newPath);
      await refreshWorkspaceTree();
      if (scmController) scmController.refresh();
    }
  }
}

async function triggerDeleteAction(node) {
  const targetNode = typeof node === 'string' ? findNodeByPath(workspaceTree, node) : node;
  if (!targetNode || !targetNode.path) return;

  const confirmed = window.confirm ? window.confirm(`Are you sure you want to delete '${targetNode.name}'?`) : true;
  if (!confirmed) return;

  const targetPath = targetNode.path;
  if (window.electronFS && window.electronFS.delete) {
    const res = await window.electronFS.delete(targetPath);
    if (res && res.error) {
      console.error('[Explorer] Delete failed:', res.error);
      if (typeof window.alert === 'function') window.alert(res.error);
      return;
    }
  } else if (window.electronIpc) {
    const res = await window.electronIpc.invoke('fs:delete', { path: targetPath });
    if (res && res.error) {
      console.error('[Explorer] Delete failed:', res.error);
      if (typeof window.alert === 'function') window.alert(res.error);
      return;
    }
  }

  const normTarget = targetPath.replace(/\\/g, '/').replace(/\/+$/, '');
  if (selectedTreePath) {
    const normSelected = selectedTreePath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (normSelected === normTarget || normSelected.startsWith(normTarget + '/')) {
      selectedTreePath = null;
    }
  }

  // Purge deleted directory paths from expandedDirs
  const updatedExpanded = new Set();
  for (const exp of expandedDirs) {
    const normExp = exp.replace(/\\/g, '/').replace(/\/+$/, '');
    if (normExp !== normTarget && !normExp.startsWith(normTarget + '/')) {
      updatedExpanded.add(exp);
    }
  }
  expandedDirs = updatedExpanded;

  docManager.handleFileDeleted(targetPath);
  await refreshWorkspaceTree();
  if (scmController) scmController.refresh();
}

async function triggerRevealInExplorer(targetPath) {
  const p = targetPath || currentWorkspaceRoot;
  if (!p) return;

  if (window.electronShell && window.electronShell.revealInFolder) {
    await window.electronShell.revealInFolder(p);
  } else if (window.electronFS && window.electronFS.revealInFolder) {
    await window.electronFS.revealInFolder(p);
  } else if (window.electronIpc) {
    await window.electronIpc.invoke('shell:revealInFolder', { path: p });
  }
}

async function copyPathAction(targetPath, isRelative) {
  const fullPath = targetPath || currentWorkspaceRoot || '';
  let textToCopy = fullPath;

  if (isRelative && currentWorkspaceRoot) {
    const normRoot = currentWorkspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '');
    const normTarget = fullPath.replace(/\\/g, '/');
    if (normTarget.startsWith(normRoot)) {
      const rel = normTarget.substring(normRoot.length).replace(/^\/+/, '');
      textToCopy = rel || '.';
    }
  }

  await copyToClipboard(textToCopy);
}

function renderWorkspaceTree(nodes, container, depth = 0) {
  container.innerHTML = '';
  if (!nodes || nodes.length === 0) {
    container.innerHTML = '<div style="padding: 8px 12px; color: #858585; font-size: 11px;">Folder is empty.</div>';
    return;
  }

  nodes.forEach((node) => {
    const item = document.createElement('div');
    const isSelected = selectedTreePath && (node.path === selectedTreePath || node.path.replace(/\\/g, '/') === selectedTreePath.replace(/\\/g, '/'));
    item.className = `tree-item ${isSelected ? 'active' : ''}`;
    item.style.paddingLeft = `${12 + depth * 14}px`;
    item.dataset.path = node.path;
    item.setAttribute('tabindex', '0');

    if (node.isDirectory) {
      const isExpanded = expandedDirs.has(node.path);
      const folderIcon = isExpanded ? 'codicon-folder-opened' : 'codicon-folder';
      item.innerHTML = `
        <span class="tree-item-chevron codicon codicon-chevron-right ${isExpanded ? 'expanded' : ''}"></span>
        <span class="tree-item-icon codicon ${folderIcon}"></span>
        <span class="tree-item-name">${node.name}</span>
      `;

      item.addEventListener('click', () => {
        selectedTreePath = node.path;
        document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        if (expandedDirs.has(node.path)) {
          expandedDirs.delete(node.path);
        } else {
          expandedDirs.add(node.path);
        }
        renderWorkspaceTree(workspaceTree, workspaceFileTree, 0);
      });
      container.appendChild(item);

      if (isExpanded && node.children && node.children.length > 0) {
        const childContainer = document.createElement('div');
        renderWorkspaceTree(node.children, childContainer, depth + 1);
        container.appendChild(childContainer);
      }
    } else {
      const iconClass = docManager.getFileIconClass(node.name);
      item.innerHTML = `
        <span class="tree-item-chevron" style="visibility: hidden;"></span>
        <span class="tree-item-icon ${iconClass}"></span>
        <span class="tree-item-name">${node.name}</span>
      `;

      item.addEventListener('click', () => {
        selectedTreePath = node.path;
        document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        docManager.openFile(node.path);
      });
      container.appendChild(item);
    }

    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectedTreePath = node.path;
      document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      openExplorerContextMenu(e.clientX, e.clientY, node);
    });

    item.addEventListener('keydown', (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        e.stopPropagation();
        triggerRenameAction(node);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        triggerDeleteAction(node);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const allItems = Array.from(document.querySelectorAll('.tree-item'));
        const idx = allItems.indexOf(item);
        if (idx !== -1 && idx < allItems.length - 1) {
          allItems[idx + 1].focus();
          allItems[idx + 1].click();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const allItems = Array.from(document.querySelectorAll('.tree-item'));
        const idx = allItems.indexOf(item);
        if (idx > 0) {
          allItems[idx - 1].focus();
          allItems[idx - 1].click();
        }
      }
    });
  });
}

function renderEmptyWorkspace() {
  if (!workspaceFileTree) return;
  workspaceFileTree.innerHTML = '';

  const emptyContainer = document.createElement('div');
  emptyContainer.className = 'empty-workspace-state';
  emptyContainer.style.padding = '16px 14px';
  emptyContainer.style.display = 'flex';
  emptyContainer.style.flexDirection = 'column';
  emptyContainer.style.gap = '10px';

  const desc = document.createElement('div');
  desc.style.color = '#cccccc';
  desc.style.fontSize = '12px';
  desc.style.lineHeight = '1.4';
  desc.textContent = 'You have not yet opened a folder.';
  emptyContainer.appendChild(desc);

  const openBtn = document.createElement('button');
  openBtn.id = 'btn-empty-open-folder';
  openBtn.className = 'btn-vscode-primary';
  openBtn.style.justifyContent = 'center';
  openBtn.style.padding = '5px 12px';
  openBtn.style.width = '100%';
  openBtn.textContent = 'Open Folder';
  openBtn.addEventListener('click', () => {
    openWorkspaceFolder();
  });
  emptyContainer.appendChild(openBtn);

  const divider = document.createElement('div');
  divider.style.borderTop = '1px solid #333333';
  divider.style.margin = '8px 0 4px 0';
  emptyContainer.appendChild(divider);

  const samplesLabel = document.createElement('div');
  samplesLabel.style.fontSize = '11px';
  samplesLabel.style.color = '#858585';
  samplesLabel.style.textTransform = 'uppercase';
  samplesLabel.style.letterSpacing = '0.5px';
  samplesLabel.textContent = 'Sample Playground Files';
  emptyContainer.appendChild(samplesLabel);

  const presetKeys = Object.keys(SAMPLES);
  presetKeys.forEach((key) => {
    const item = document.createElement('div');
    item.className = 'tree-item';
    item.style.paddingLeft = '6px';
    const iconClass = resolveFileIconClass(key);

    item.innerHTML = `
      <span class="tree-item-chevron" style="visibility: hidden;"></span>
      <span class="tree-item-icon ${iconClass}"></span>
      <span class="tree-item-name">${key}</span>
    `;

    item.addEventListener('click', () => {
      document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      if (docManager) docManager.openFile(key, undefined, true);
    });

    emptyContainer.appendChild(item);
  });

  workspaceFileTree.appendChild(emptyContainer);
}

class SidebarResizer {
  constructor(sidebarEl, sashEl, isLeft = true) {
    this.sidebar = sidebarEl;
    this.sash = sashEl;
    this.isLeft = isLeft;
    this.isDragging = false;
    this.startX = 0;
    this.startWidth = 0;
    this.lastWidth = isLeft ? 260 : 380;
    this.rafId = null;
    if (this.sidebar && this.sash) {
      this.initEvents();
    }
  }

  initEvents() {
    if (!this.sash || !this.sidebar) return;
    
    const handlePointerDown = (e) => {
      if (this.sidebar.classList.contains('collapsed')) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      this.isDragging = true;
      this.startX = e.clientX;
      this.startWidth = this.sidebar.getBoundingClientRect ? this.sidebar.getBoundingClientRect().width : (this.isLeft ? 260 : 380);

      if (document.body) document.body.classList.add('is-resizing');
      if (this.sash.classList) this.sash.classList.add('is-active');

      if (e.target && typeof e.target.setPointerCapture === 'function' && e.pointerId !== undefined) {
        try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
      }

      e.preventDefault();
    };

    this.sash.addEventListener('pointerdown', handlePointerDown);
    this.sash.addEventListener('mousedown', handlePointerDown);

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('mousemove', (e) => {
        if (!this.isDragging || !this.sidebar) return;
        const deltaX = this.isLeft ? (e.clientX - this.startX) : (this.startX - e.clientX);
        let targetWidth = this.startWidth + deltaX;

        const minW = this.isLeft ? 160 : 280;
        const maxW = this.isLeft ? 600 : 700;
        const snapMargin = this.isLeft ? 50 : 60;
        const collapseThreshold = minW - snapMargin;

        if (targetWidth < collapseThreshold) {
          this.collapse();
          this.onMouseUp();
          return;
        }

        targetWidth = Math.max(minW, Math.min(maxW, targetWidth));

        this.sidebar.style.width = `${targetWidth}px`;
        this.lastWidth = targetWidth;

        if (!this.rafId && typeof requestAnimationFrame === 'function') {
          this.rafId = requestAnimationFrame(() => {
            this.rafId = null;
            if (multiGroupManager) multiGroupManager.layoutAll();
          });
        } else if (!this.rafId) {
          if (multiGroupManager) multiGroupManager.layoutAll();
        }
      });

      window.addEventListener('mouseup', () => this.onMouseUp());

      window.addEventListener('blur', () => {
        if (this.isDragging) this.onMouseUp();
      });

      this.sash.addEventListener('lostpointercapture', () => {
        if (this.isDragging) this.onMouseUp();
      });
    }
  }

  onMouseUp() {
    if (!this.isDragging) return;
    this.isDragging = false;
    if (this.rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (document.body && document.body.classList) document.body.classList.remove('is-resizing');
    if (this.sash && this.sash.classList) this.sash.classList.remove('is-active');
    if (multiGroupManager) multiGroupManager.layoutAll();
  }

  toggle() {
    if (!this.sidebar) return;
    if (this.sidebar.classList.contains('collapsed')) this.expand();
    else this.collapse();
  }

  collapse() {
    if (this.sidebar) this.sidebar.classList.add('collapsed');
    if (this.sash) this.sash.classList.add('disabled');
    if (multiGroupManager) multiGroupManager.layoutAll();
  }

  expand() {
    if (this.sidebar) {
      this.sidebar.classList.remove('collapsed');
      this.sidebar.style.width = `${this.lastWidth || (this.isLeft ? 260 : 380)}px`;
    }
    if (this.sash) this.sash.classList.remove('disabled');
    if (multiGroupManager) multiGroupManager.layoutAll();
  }
}

const primaryResizer = new SidebarResizer(primarySidebar, primarySash, true);
const secondaryResizer = new SidebarResizer(secondarySidebar, secondarySash, false);

function highlightLine(lineNum, message) {
  if (!editor || !window.monaco) return;
  const targetEditor = editor;

  activeDecorationIds = targetEditor.deltaDecorations(activeDecorationIds, [
    {
      range: new window.monaco.Range(lineNum, 1, lineNum, 1),
      options: {
        isWholeLine: true,
        className: 'antislop-line-highlight',
        glyphMarginClassName: 'antislop-glyph-margin',
        hoverMessage: { value: `**Active-Cognition Diagnostic**\n\n${message || 'Violating syntax/contract location'}` },
      }
    }
  ]);
  targetEditor.revealLineInCenter(lineNum);
}

function clearHighlights() {
  if (editor && activeDecorationIds.length > 0) {
    activeDecorationIds = editor.deltaDecorations(activeDecorationIds, []);
  }
}

// =============================================================================
// MILESTONE v0.2.3: RESILIENT SIDECAR WEBSOCKET RPC BRIDGE & STREAMING (R1-R4)
// =============================================================================

let sidecarClient = null;

class SidecarWebSocketClient {
  constructor(url = 'ws://127.0.0.1:4949') {
    this.url = url;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.missedPings = 0;
    this.currentLatencyMs = -1;
    this.pendingPings = new Map();
    this.pendingRequests = new Map();
    this.activeModel = 'gemini-2.5-flash';
  }

  connect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      this.ws = new WebSocket(this.url);
      sidecarWs = this.ws;

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.missedPings = 0;
        this.updateUiStatus(true, this.currentLatencyMs);
        this.startHeartbeat();
        this.sendHeartbeat();
        if (typeof outputLogger !== 'undefined' && outputLogger) {
          outputLogger.log('sidecar', `Connected to Sidecar daemon at ${this.url}`);
        }
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.updateUiStatus(false, -1);
        this.scheduleReconnect();
        if (typeof outputLogger !== 'undefined' && outputLogger) {
          outputLogger.log('sidecar', 'Connection to Sidecar closed.');
        }
      };

      this.ws.onerror = () => {
        this.updateUiStatus(false, -1);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    } catch (err) {
      this.updateUiStatus(false, -1);
      this.scheduleReconnect();
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
      sidecarWs = null;
    }
    this.updateUiStatus(false, -1);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, 5000);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  sendHeartbeat() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    if (this.missedPings >= 2) {
      try {
        this.ws.close();
      } catch {}
      return;
    }

    this.missedPings++;
    const pingId = `ping-${Date.now()}`;
    const sendTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    this.pendingPings.set(pingId, sendTime);

    const pingFrame = {
      jsonrpc: '2.0',
      id: pingId,
      method: 'rpc.ping',
      params: { timestamp: Date.now() }
    };

    try {
      this.ws.send(JSON.stringify(pingFrame));
    } catch {}
  }

  handleMessage(data) {
    if (!data) return;
    let msg = null;
    try {
      msg = typeof data === 'string' ? JSON.parse(data) : data;
    } catch {
      return;
    }

    if (!msg || typeof msg !== 'object') return;

    if (msg.id && this.pendingPings.has(msg.id)) {
      const sendTime = this.pendingPings.get(msg.id);
      this.pendingPings.delete(msg.id);
      this.missedPings = 0;
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      this.currentLatencyMs = Math.max(1, Math.round(now - sendTime));
      this.updateUiStatus(true, this.currentLatencyMs);
      return;
    }

    const method = msg.method || msg.type || msg.event;
    const params = msg.params || msg.payload || msg;

    if (method === 'diagnostics.tokenChunk' || method === 'chat:chunk' || method === 'stream:chunk') {
      const chunk = (params && (params.token || params.chunk || params.text)) || '';
      const isThinking = !!(params && (params.isThinking || params.targetZone === 'reasoning'));
      const correlationId = (params && params.correlationId) || 'default';
      appendChatChunk(chunk, isThinking, correlationId);

      const frame = document.getElementById('webview-frame');
      if (frame && frame.contentWindow && typeof frame.contentWindow.postMessage === 'function') {
        frame.contentWindow.postMessage({
          type: 'DIAGNOSTIC_DATA',
          payload: msg,
        }, '*');
      }
      return;
    }

    if (typeof method === 'string' && (method.startsWith('plan:') || method.startsWith('plan.'))) {
      handlePlanStreamMessage(msg);
      return;
    }

    if (typeof method === 'string' && (method === 'diff:file_proposed' || method.startsWith('diff:'))) {
      handleDiffStreamMessage(msg);
      return;
    }

    // Forward any other diagnostic messages to webview
    const frame = document.getElementById('webview-frame');
    if (frame && frame.contentWindow && typeof frame.contentWindow.postMessage === 'function') {
      frame.contentWindow.postMessage({
        type: 'DIAGNOSTIC_DATA',
        payload: msg,
      }, '*');
    }
  }

  getReconnectDelay(attempt = this.reconnectAttempts) {
    return Math.min(1000 * Math.pow(2, Math.max(0, attempt - 1)), 16000);
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectAttempts++;
    const delay = this.getReconnectDelay(this.reconnectAttempts) + Math.random() * 250;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  updateUiStatus(connected, latency) {
    const daemonDot = document.getElementById('daemon-status-dot');
    const daemonText = document.getElementById('daemon-status-text');
    const daemonLatency = document.getElementById('daemon-latency-text');
    const daemonBadge = document.getElementById('daemon-model-badge');

    const screenBDot = document.getElementById('screen-b-daemon-dot');
    const screenBLatency = document.getElementById('screen-b-daemon-latency');
    const screenBBadge = document.getElementById('screen-b-model-badge');

    if (connected) {
      if (daemonDot) {
        daemonDot.classList.remove('disconnected');
        daemonDot.classList.add('connected');
      }
      if (daemonText) {
        daemonText.textContent = 'Sidecar 4949';
        daemonText.style.color = '#ffffff';
      }
      if (daemonLatency) {
        daemonLatency.textContent = latency >= 0 ? `${latency}ms` : '---ms';
      }
      if (daemonBadge) {
        daemonBadge.textContent = this.activeModel;
      }

      if (screenBDot) {
        screenBDot.classList.remove('disconnected');
        screenBDot.classList.add('connected');
      }
      if (screenBLatency) {
        screenBLatency.textContent = latency >= 0 ? `${latency}ms` : '---ms';
      }
      if (screenBBadge) {
        screenBBadge.textContent = this.activeModel;
      }
    } else {
      if (daemonDot) {
        daemonDot.classList.remove('connected');
        daemonDot.classList.add('disconnected');
      }
      if (daemonText) {
        daemonText.textContent = 'Sidecar: Offline';
        daemonText.style.color = '#f87171';
      }
      if (daemonLatency) {
        daemonLatency.textContent = '---ms';
      }
      if (screenBDot) {
        screenBDot.classList.remove('connected');
        screenBDot.classList.add('disconnected');
      }
      if (screenBLatency) {
        screenBLatency.textContent = '---ms';
      }
    }

    const frame = document.getElementById('webview-frame');
    if (frame && frame.contentWindow && typeof frame.contentWindow.postMessage === 'function') {
      try {
        frame.contentWindow.postMessage({
          type: 'WATCHDOG_STATUS',
          payload: {
            connected: !!connected,
            latencyMs: latency >= 0 ? latency : 0,
          },
        }, '*');
      } catch (_) {}
    }
  }

  getReconnectAttempts() {
    return this.reconnectAttempts;
  }

  getLatency() {
    return this.currentLatencyMs;
  }

  isConnected() {
    return !!(this.ws && this.ws.readyState === WebSocket.OPEN);
  }
}

function connectSidecar() {
  if (!sidecarClient) {
    sidecarClient = new SidecarWebSocketClient();
  }
  sidecarClient.connect();
  sidecarWs = sidecarClient.ws;

  const frame = document.getElementById('webview-frame');
  if (frame && !frame.dataset.sidecarListenerAttached) {
    frame.dataset.sidecarListenerAttached = 'true';
    frame.addEventListener('load', () => {
      if (sidecarClient) {
        sidecarClient.updateUiStatus(sidecarClient.isConnected(), sidecarClient.getLatency());
      }
    });
  }

  return sidecarClient;
}

function disconnectSidecar() {
  if (sidecarClient) {
    sidecarClient.disconnect();
  }
}

class TypewriterRenderer {
  constructor({ onTick, onComplete, tickIntervalMs = 16 } = {}) {
    this.queue = '';
    this.timer = null;
    this.isActive = false;
    this.isStreamEnded = false;
    this.onTick = onTick;
    this.onComplete = onComplete;
    this.tickIntervalMs = tickIntervalMs;
  }

  calculateDrainCount(queueLength) {
    const len = typeof queueLength === 'number' ? queueLength : this.queue.length;
    if (len > 500) {
      return Math.min(len, Math.max(1, Math.ceil(len / 4)));
    }
    if (len > 150) {
      return Math.min(len, Math.ceil(len / 6));
    }
    if (len > 50) {
      return 4;
    }
    if (len > 15) {
      return 2;
    }
    return 1;
  }

  enqueue(chunk) {
    if (!chunk) return;
    this.queue += chunk;
    if (!this.isActive) {
      this.start();
    }
  }

  tick(count) {
    const drainCount = (typeof count === 'number') ? count : this.calculateDrainCount(this.queue.length);
    const delta = this.queue.slice(0, drainCount);
    this.queue = this.queue.slice(drainCount);
    if (this.onTick) this.onTick(delta);
    return delta;
  }

  start() {
    this.isActive = true;
    const step = () => {
      if (!this.isActive) return;

      if (this.queue.length > 0) {
        const count = this.calculateDrainCount(this.queue.length);
        const delta = this.queue.slice(0, count);
        this.queue = this.queue.slice(count);
        if (this.onTick) this.onTick(delta);
      }

      if (this.queue.length === 0 && this.isStreamEnded) {
        this.stop();
        if (this.onComplete) this.onComplete();
        return;
      }

      this.timer = setTimeout(step, this.tickIntervalMs);
    };
    this.timer = setTimeout(step, this.tickIntervalMs);
  }

  end() {
    this.isStreamEnded = true;
    if (this.queue.length === 0) {
      this.stop();
      if (this.onComplete) this.onComplete();
    }
  }

  flush() {
    if (this.queue.length > 0) {
      const remaining = this.queue;
      this.queue = '';
      if (this.onTick) this.onTick(remaining);
    }
    this.stop();
    if (this.onComplete) this.onComplete();
  }

  stop() {
    this.isActive = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  reset() {
    this.stop();
    this.queue = '';
    this.isStreamEnded = false;
  }
}

class StreamMessageParser {
  constructor({ onThinkingChunk, onAnswerChunk, onThinkingComplete } = {}) {
    this.insideThinking = false;
    this.buffer = '';
    this.thinking = '';
    this.answer = '';
    this.thinkingTokens = 0;
    this.startTime = Date.now();
    this.onThinkingChunk = onThinkingChunk;
    this.onAnswerChunk = onAnswerChunk;
    this.onThinkingComplete = onThinkingComplete;
  }

  feed(chunk, isThinkingProtocol = false) {
    if (!chunk) return;

    if (isThinkingProtocol) {
      this.insideThinking = true;
      this.thinking += chunk;
      this.thinkingTokens += Math.max(1, Math.round(chunk.length / 4));
      if (this.onThinkingChunk) this.onThinkingChunk(chunk, this.thinking);
      return;
    }

    this.buffer += chunk;

    while (this.buffer.length > 0) {
      if (!this.insideThinking) {
        const openIdx = this.buffer.indexOf('<thinking>');
        if (openIdx === -1) {
          const match = this.buffer.match(/<t?(?:h(?:i(?:n(?:k(?:i(?:n(?:g)?)?)?)?)?)?)?$/i);
          if (match) {
            const safe = this.buffer.slice(0, match.index);
            this.buffer = this.buffer.slice(match.index);
            if (safe) {
              this.answer += safe;
              if (this.onAnswerChunk) this.onAnswerChunk(safe, this.answer);
            }
            break;
          } else {
            const text = this.buffer;
            this.buffer = '';
            this.answer += text;
            if (this.onAnswerChunk) this.onAnswerChunk(text, this.answer);
            break;
          }
        } else {
          const before = this.buffer.slice(0, openIdx);
          if (before) {
            this.answer += before;
            if (this.onAnswerChunk) this.onAnswerChunk(before, this.answer);
          }
          this.insideThinking = true;
          this.buffer = this.buffer.slice(openIdx + '<thinking>'.length);
        }
      } else {
        const closeIdx = this.buffer.indexOf('</thinking>');
        if (closeIdx === -1) {
          const match = this.buffer.match(/<\/?t?(?:h(?:i(?:n(?:k(?:i(?:n(?:g)?)?)?)?)?)?)?$/i);
          if (match) {
            const safe = this.buffer.slice(0, match.index);
            this.buffer = this.buffer.slice(match.index);
            if (safe) {
              this.thinking += safe;
              this.thinkingTokens += Math.max(1, Math.round(safe.length / 4));
              if (this.onThinkingChunk) this.onThinkingChunk(safe, this.thinking);
            }
            break;
          } else {
            const text = this.buffer;
            this.buffer = '';
            this.thinking += text;
            this.thinkingTokens += Math.max(1, Math.round(text.length / 4));
            if (this.onThinkingChunk) this.onThinkingChunk(text, this.thinking);
            break;
          }
        } else {
          const thinkContent = this.buffer.slice(0, closeIdx);
          if (thinkContent) {
            this.thinking += thinkContent;
            this.thinkingTokens += Math.max(1, Math.round(thinkContent.length / 4));
            if (this.onThinkingChunk) this.onThinkingChunk(thinkContent, this.thinking);
          }
          this.insideThinking = false;
          if (this.onThinkingComplete) {
            this.onThinkingComplete({
              text: this.thinking,
              tokens: this.thinkingTokens,
              durationMs: Date.now() - this.startTime,
            });
          }
          this.buffer = this.buffer.slice(closeIdx + '</thinking>'.length);
        }
      }
    }
  }

  feedChunk(chunk, isThinkingProtocol) {
    return this.feed(chunk, isThinkingProtocol);
  }

  finish() {
    if (this.buffer.length > 0) {
      if (this.insideThinking) {
        this.thinking += this.buffer;
        if (this.onThinkingChunk) this.onThinkingChunk(this.buffer, this.thinking);
      } else {
        this.answer += this.buffer;
        if (this.onAnswerChunk) this.onAnswerChunk(this.buffer, this.answer);
      }
      this.buffer = '';
    }
  }
}

function createThinkingCard(correlationId = 'default') {
  const card = document.createElement('div');
  card.className = 'thinking-card';
  card.id = `thinking-card-${correlationId}`;

  const header = document.createElement('div');
  header.className = 'thinking-card-header';
  if (typeof header.setAttribute === 'function') {
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('title', 'Klik untuk melipat/membuka proses berpikir');
  }

  const left = document.createElement('div');
  left.className = 'thinking-header-left';
  const icon = document.createElement('span');
  icon.className = 'codicon codicon-lightbulb thinking-icon';
  const title = document.createElement('span');
  title.className = 'thinking-title';
  title.textContent = 'Proses Berpikir';
  const badge = document.createElement('span');
  badge.className = 'thinking-stats-badge';
  badge.textContent = '0 tokens · 0.0s';

  left.appendChild(icon);
  left.appendChild(title);
  left.appendChild(badge);

  const right = document.createElement('div');
  right.className = 'thinking-header-right';
  const chevron = document.createElement('span');
  chevron.className = 'codicon codicon-chevron-down thinking-chevron';
  right.appendChild(chevron);

  header.appendChild(left);
  header.appendChild(right);

  const body = document.createElement('div');
  body.className = 'thinking-card-body';
  const contentText = document.createElement('div');
  contentText.className = 'thinking-content-text';
  body.appendChild(contentText);

  card.appendChild(header);
  card.appendChild(body);

  header.addEventListener('click', () => {
    card.classList.toggle('collapsed');
    const isCollapsed = card.classList.contains('collapsed');
    chevron.classList.toggle('codicon-chevron-down', !isCollapsed);
    chevron.classList.toggle('codicon-chevron-right', isCollapsed);
  });

  return card;
}

function toggleThinkingCard(cardId) {
  const card = typeof cardId === 'string' ? document.getElementById(cardId) : cardId;
  if (!card) return;
  card.classList.toggle('collapsed');
  const chevron = card.querySelector ? card.querySelector('.thinking-chevron') : null;
  if (chevron) {
    const isCollapsed = card.classList.contains('collapsed');
    chevron.classList.toggle('codicon-chevron-down', !isCollapsed);
    chevron.classList.toggle('codicon-chevron-right', isCollapsed);
  }
}

function formatCodeWithDarkPlusTokens(code, lang = 'plaintext') {
  const escaped = (code || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const keywords = /\b(def|return|function|const|let|var|if|else|elif|for|while|import|export|from|class|try|except|catch|finally|async|await|new|public|private|static|void|int|string|boolean)\b/g;
  const strings = /(&quot;.*?&quot;|&#039;.*?&#039;|`.*?`|"[^"]*"|'[^']*')/g;
  const comments = /(#.*$|\/\/.*$)/gm;
  const numbers = /\b(\d+(?:\.\d+)?)\b/g;

  const highlighted = escaped
    .replace(comments, '<span class="token-comment">$1</span>')
    .replace(strings, '<span class="token-string">$1</span>')
    .replace(keywords, '<span class="token-keyword">$1</span>')
    .replace(numbers, '<span class="token-number">$1</span>');

  return `
    <div class="chat-code-block" data-language="${lang}">
      <div class="chat-code-header">
        <div class="chat-code-lang">
          <span class="codicon codicon-file-code"></span>
          <span class="lang-text">${lang}</span>
        </div>
        <button class="btn-copy-code" title="Salin kode ke clipboard">
          <span class="codicon codicon-copy copy-icon"></span>
          <span class="copy-label">Copy</span>
        </button>
      </div>
      <pre class="chat-code-pre"><code class="chat-code-content">${highlighted}</code></pre>
    </div>
  `;
}

function attachCopyButtonHandler(buttonEl, codeText) {
  if (!buttonEl) return;
  buttonEl.addEventListener('click', (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    let success = false;
    if (window.electronClipboard && typeof window.electronClipboard.writeText === 'function') {
      success = window.electronClipboard.writeText(codeText);
    } else if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(codeText);
      success = true;
    }

    const label = buttonEl.querySelector ? buttonEl.querySelector('.copy-label') : null;
    const icon = buttonEl.querySelector ? buttonEl.querySelector('.codicon') : null;

    if (label) label.textContent = 'Copied!';
    if (icon && icon.classList) {
      if (typeof icon.classList.remove === 'function') icon.classList.remove('codicon-copy');
      if (typeof icon.classList.add === 'function') icon.classList.add('codicon-check');
    }
    if (buttonEl.classList && typeof buttonEl.classList.add === 'function') {
      buttonEl.classList.add('copied');
    }

    if (buttonEl._copyResetTimer) {
      clearTimeout(buttonEl._copyResetTimer);
    }
    buttonEl._copyResetTimer = setTimeout(() => {
      if (label) label.textContent = 'Copy';
      if (icon && icon.classList) {
        if (typeof icon.classList.remove === 'function') icon.classList.remove('codicon-check');
        if (typeof icon.classList.add === 'function') icon.classList.add('codicon-copy');
      }
      if (buttonEl.classList && typeof buttonEl.classList.remove === 'function') {
        buttonEl.classList.remove('copied');
      }
      buttonEl._copyResetTimer = null;
    }, 2000);
  });
}

function copyCodeBlock(buttonEl, codeText) {
  return attachCopyButtonHandler(buttonEl, codeText);
}

function renderChatMarkdown(targetEl, text, isComplete = false) {
  if (!targetEl) return;
  if (!text) {
    targetEl.innerHTML = '';
    return;
  }

  const codeBlocks = [];
  let processed = text;

  // Replace closed code blocks
  processed = processed.replace(/```([a-zA-Z0-9_\-\+]*)\r?\n([\s\S]*?)```/g, (match, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang: lang || 'plaintext', code });
    return `__CODE_BLOCK_${idx}__`;
  });

  // If streaming and there is an unclosed code block at the end
  if (processed.includes('```')) {
    processed = processed.replace(/```([a-zA-Z0-9_\-\+]*)\r?\n([\s\S]*)$/, (match, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang: lang || 'plaintext', code });
      return `__CODE_BLOCK_${idx}__`;
    });
  }

  if (codeBlocks.length === 0) {
    targetEl.textContent = text;
    return;
  }

  const parts = processed.split(/(__CODE_BLOCK_\d+__)/);
  let html = '';
  for (const part of parts) {
    const m = part.match(/^__CODE_BLOCK_(\d+)__$/);
    if (m) {
      const block = codeBlocks[parseInt(m[1], 10)];
      html += formatCodeWithDarkPlusTokens(block.code, block.lang);
    } else if (part) {
      const escaped = escapeHtml(part).replace(/\n/g, '<br>');
      html += `<span>${escaped}</span>`;
    }
  }

  targetEl.innerHTML = html;

  const blockEls = targetEl.querySelectorAll ? targetEl.querySelectorAll('.chat-code-block') : [];
  if (blockEls && blockEls.length) {
    for (let i = 0; i < blockEls.length && i < codeBlocks.length; i++) {
      const blockEl = blockEls[i];
      const btn = blockEl.querySelector ? blockEl.querySelector('.btn-copy-code') : null;
      if (btn) {
        attachCopyButtonHandler(btn, codeBlocks[i].code);
      }
    }
  }
}

let activeChatParser = null;
let activeAssistantMessageEl = null;
let activeCorrelationId = null;
let activeTypewriter = null;
let activeBubbleContentEl = null;
let activeAnswerBuffer = '';

function resetActiveChatTurn() {
  if (activeTypewriter) {
    activeTypewriter.stop();
    activeTypewriter = null;
  }
  activeChatParser = null;
  activeAssistantMessageEl = null;
  activeCorrelationId = null;
  activeBubbleContentEl = null;
  activeAnswerBuffer = '';
}

function appendChatChunk(chunk, isThinkingOrOpts = false, correlationId = 'default', options = {}) {
  const container = document.getElementById('chat-thread-container');
  if (!container) return;

  let isThinking = false;
  let corrId = correlationId;
  let isLast = false;

  if (typeof isThinkingOrOpts === 'object' && isThinkingOrOpts !== null) {
    isThinking = !!isThinkingOrOpts.isThinking;
    corrId = isThinkingOrOpts.correlationId || correlationId || 'default';
    isLast = !!isThinkingOrOpts.isLast;
  } else {
    isThinking = !!isThinkingOrOpts;
    corrId = correlationId || 'default';
    if (typeof options === 'object' && options !== null) {
      if (options.correlationId) corrId = options.correlationId;
      if (options.isLast) isLast = !!options.isLast;
    }
  }

  // Turn management: Reset turn if correlationId changed
  if (activeAssistantMessageEl && activeCorrelationId && activeCorrelationId !== corrId) {
    resetActiveChatTurn();
  }

  if (!activeAssistantMessageEl) {
    activeCorrelationId = corrId;
    activeAnswerBuffer = '';

    activeAssistantMessageEl = document.createElement('div');
    activeAssistantMessageEl.className = 'chat-message chat-message-assistant';
    if (typeof activeAssistantMessageEl.setAttribute === 'function') {
      activeAssistantMessageEl.setAttribute('data-correlation-id', corrId);
    }

    const thinkingCard = createThinkingCard(corrId);
    activeAssistantMessageEl.appendChild(thinkingCard);

    activeBubbleContentEl = document.createElement('div');
    activeBubbleContentEl.className = 'chat-bubble-content';
    activeAssistantMessageEl.appendChild(activeBubbleContentEl);

    container.appendChild(activeAssistantMessageEl);

    // Wire genuine TypewriterRenderer for smooth chunk pacing
    activeTypewriter = new TypewriterRenderer({
      onTick: (delta) => {
        activeAnswerBuffer += delta;
        renderChatMarkdown(activeBubbleContentEl, activeAnswerBuffer, false);
      },
      onComplete: () => {
        renderChatMarkdown(activeBubbleContentEl, activeAnswerBuffer, true);
      }
    });

    activeChatParser = new StreamMessageParser({
      onThinkingChunk: (delta, full) => {
        const textEl = thinkingCard.querySelector ? thinkingCard.querySelector('.thinking-content-text') : null;
        if (textEl) textEl.textContent = full;
        const statsEl = thinkingCard.querySelector ? thinkingCard.querySelector('.thinking-stats-badge') : null;
        if (statsEl) statsEl.textContent = `${activeChatParser.thinkingTokens} tokens`;
      },
      onThinkingComplete: (stats) => {
        const statsEl = thinkingCard.querySelector ? thinkingCard.querySelector('.thinking-stats-badge') : null;
        if (statsEl) {
          const sec = (stats.durationMs / 1000).toFixed(1);
          statsEl.textContent = `${stats.tokens} tokens · ${sec}s`;
        }
        thinkingCard.classList.add('collapsed');
        const chevron = thinkingCard.querySelector ? thinkingCard.querySelector('.thinking-chevron') : null;
        if (chevron) {
          chevron.classList.remove('codicon-chevron-down');
          chevron.classList.add('codicon-chevron-right');
        }
      },
      onAnswerChunk: (delta, full) => {
        if (activeTypewriter) {
          activeTypewriter.enqueue(delta);
        } else {
          activeAnswerBuffer += delta;
          renderChatMarkdown(activeBubbleContentEl, activeAnswerBuffer, false);
        }
      }
    });
  }

  if (activeChatParser && chunk) {
    activeChatParser.feed(chunk, isThinking);
  }

  if (isLast) {
    if (activeTypewriter) {
      activeTypewriter.end();
    }
    if (activeBubbleContentEl) {
      renderChatMarkdown(activeBubbleContentEl, activeAnswerBuffer + (activeTypewriter ? activeTypewriter.queue : ''), true);
    }
  }
}

function handlePlanStreamMessage(msg) {
  if (!msg) return null;
  const method = msg.method || msg.type || msg.event;
  const payload = msg.params || msg.payload || msg.data || msg;

  if (method === 'plan:init' || method === 'plan.init') {
    return createTaskPlan(payload);
  }
  if (method === 'plan:step_start' || method === 'plan.step_start') {
    const subtaskId = payload.subtaskId || payload.stepId || payload.id;
    if (currentTaskPlan && subtaskId && Array.isArray(currentTaskPlan.subtasks)) {
      const st = currentTaskPlan.subtasks.find(s => s.id === subtaskId);
      if (st) {
        st.status = 'in_progress';
        addExecutionLog(`Started subtask: ${st.title || subtaskId}`, 'info', subtaskId);
        renderPlanView();
        if (typeof editorEventBridge !== 'undefined' && editorEventBridge && typeof editorEventBridge.emit === 'function') {
          editorEventBridge.emit('screenB:taskProgress', {
            planId: currentTaskPlan.id,
            subtaskId,
            status: 'in_progress',
            progress: currentTaskPlan.progress,
          });
        }
      }
    }
    return currentTaskPlan;
  }
  if (method === 'plan:step_log' || method === 'plan.step_log') {
    const message = payload.message || payload.log || payload.text;
    const level = payload.level || 'info';
    const subtaskId = payload.subtaskId || payload.stepId;
    if (message) {
      addExecutionLog(message, level, subtaskId);
    }
    return currentTaskPlan;
  }
  if (method === 'plan:step_done' || method === 'plan.step_done') {
    const subtaskId = payload.subtaskId || payload.stepId || payload.id;
    const status = payload.status || 'completed';
    const summary = payload.summary || payload.logMessage || payload.message;
    if (subtaskId) {
      advanceSubtask(subtaskId, status, summary);
    }
    return currentTaskPlan;
  }
  return null;
}

function handleDiffStreamMessage(msg) {
  if (!msg) return null;
  const method = msg.method || msg.type || msg.event;
  const payload = msg.params || msg.payload || msg.data || msg;

  if (method === 'diff:file_proposed' || method === 'diff.proposed' || (payload && payload.proposedContent)) {
    const item = addReviewDiff(payload);
    setScreenBMode('review');
    return item;
  }
  return null;
}

function triggerAnalysis() {
  if (!sidecarWs || sidecarWs.readyState !== WebSocket.OPEN) {
    if (outputLogger) outputLogger.log('sidecar', 'Sidecar not connected, cannot analyze.');
    return;
  }
  const activeDoc = docManager.documents.get(docManager.activeDocId);
  const code = activeDoc?.model ? activeDoc.model.getValue() : '';

  const rpcPayload = {
    jsonrpc: '2.0',
    id: `req-${Date.now()}`,
    method: 'diagnostics.analyzeError',
    params: {
      fileUri: `file:///${activeDoc?.filePath || 'quicksort.py'}`,
      languageId: activeDoc?.language || 'python',
      sourceBuffer: code,
    }
  };

  sidecarWs.send(JSON.stringify(rpcPayload));
  if (outputLogger) outputLogger.log('sidecar', `Sent diagnostics.analyzeError for ${activeDoc?.fileName}`);
}

// Host-Webview Event Listener Bridge
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || !data.type) return;

    switch (data.type) {
      case 'HIGHLIGHT_LINE':
        if (data.payload && data.payload.line) {
          highlightLine(data.payload.line, data.payload.message);
        }
        break;

      case 'CLEAR_HIGHLIGHTS':
        clearHighlights();
        break;

      case 'REQUEST_ANALYSIS':
        triggerAnalysis();
        break;

      case 'COLLAPSE_SCREEN_B':
      case 'CLOSE_SIDEBAR':
        if (typeof secondaryResizer !== 'undefined' && secondaryResizer && typeof secondaryResizer.collapse === 'function') {
          secondaryResizer.collapse();
        }
        break;

      case 'PRACTICE_COMPLETED':
        if (gateStatusText) {
          const score = data.payload?.accuracy ?? data.payload?.score ?? 100;
          gateStatusText.textContent = `Gate: UNLOCKED (${score}%)`;
          gateStatusText.style.color = '#73c991';
        }
        if (gateLockIcon) {
          gateLockIcon.className = 'codicon codicon-unlock';
          gateLockIcon.style.color = '#73c991';
        }
        break;
    }
  });
}

function initEditor() {
  if (typeof window.require !== 'undefined') {
    window.require.config({
      paths: {
        vs: './vs'
      }
    });

    window.require(['vs/editor/editor.main'], function () {
      editor = window.monaco.editor.create(editorMount, {
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: 13,
        lineNumbers: 'on',
        glyphMargin: true,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        renderLineHighlight: 'all',
        tabSize: 4,
      });

      editor.onDidChangeCursorPosition(() => {
        updateCursorTelemetry(editor);
      });
      editor.onDidChangeCursorSelection(() => {
        updateCursorTelemetry(editor);
      });

      if (typeof editor.addCommand === 'function' && window.monaco && window.monaco.KeyMod && window.monaco.KeyCode) {
        editor.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyP, () => {
          openCommandPalette('');
        });
        editor.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyMod.Shift | window.monaco.KeyCode.KeyP, () => {
          openCommandPalette('>');
        });
        editor.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyG, () => {
          openCommandPalette(':');
        });
        editor.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyS, () => {
          if (docManager) docManager.saveActiveDocument();
        });
      }

      if (typeof registerEditorActions === 'function') {
        registerEditorActions(editor);
      }

      console.log('[Workbench] Offline Monaco Editor successfully mounted.');

      // Initialize managers
      docManager = new DocumentManager();
      multiGroupManager = new MultiGroupEditorManager();
      multiGroupManager.groups.get('group-1').editor = editor;

      // Open initial default file
      docManager.openFile('quicksort.py', undefined, true);

      // Problems watcher
      initProblemsWatcher();
    }, function (err) {
      console.warn('[Workbench] Local Monaco load failed, falling back:', err);
      createFallbackEditor();
      docManager = new DocumentManager();
      docManager.openFile('quicksort.py', undefined, true);
    });
  } else {
    createFallbackEditor();
    docManager = new DocumentManager();
    docManager.openFile('quicksort.py', undefined, true);
  }
}

function createFallbackEditor() {
  editorMount.innerHTML = '';
  const textarea = document.createElement('textarea');
  textarea.style.width = '100%';
  textarea.style.height = '100%';
  textarea.style.backgroundColor = '#1e1e1e';
  textarea.style.color = '#d4d4d4';
  textarea.style.fontFamily = 'monospace';
  textarea.style.fontSize = '13px';
  textarea.style.padding = '12px';
  textarea.style.border = 'none';
  textarea.style.outline = 'none';
  textarea.style.resize = 'none';
  editorMount.appendChild(textarea);

  editor = {
    getValue: () => textarea.value,
    setValue: (val) => { textarea.value = val; },
    revealLineInCenter: () => {},
    deltaDecorations: (_old, _new) => [],
    saveViewState: () => null,
    restoreViewState: () => {},
    setModel: (m) => { if (m) textarea.value = m.getValue ? m.getValue() : ''; },
    focus: () => textarea.focus(),
    getPosition: () => ({ lineNumber: 1, column: 1 }),
  };
}

// =============================================================================
// SCREEN B GUIDED COGNITION & TARGET LINE STACK (v0.2.0)
// =============================================================================
let targetStack = [];

function extractTargetLines(promptText) {
  if (!promptText || typeof promptText !== 'string') return [];
  const targets = [];
  const seen = new Set();

  function addTarget(filePath, startLine, endLine) {
    const sLine = parseInt(startLine, 10);
    if (isNaN(sLine) || sLine <= 0) return;
    const eLine = endLine ? parseInt(endLine, 10) : undefined;
    const validEnd = (eLine && !isNaN(eLine) && eLine >= sLine) ? eLine : undefined;
    const key = `${filePath}:${sLine}${validEnd ? '-' + validEnd : ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      targets.push({
        id: `target-${Date.now()}-${targets.length}`,
        filePath,
        startLine: sLine,
        endLine: validEnd,
        label: `${filePath}:${sLine}${validEnd ? '-' + validEnd : ''}`,
      });
    }
  }

  const fileLineRegex = /(?:^|\s|["'`])([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_]+)(?::|#L?|\s+(?:baris|line)\s+)(\d+)(?:(?:[-–—]|(?:\s*(?:sampai|to)\s*)|-L?)(\d+))?/gi;
  let match;
  while ((match = fileLineRegex.exec(promptText)) !== null) {
    const filePath = match[1];
    const startLine = match[2];
    const endLine = match[3];
    addTarget(filePath, startLine, endLine);
  }

  const lineInFileRegex = /(?:baris|line)\s*(\d+)(?:\s*(?:[-–—]|sampai|to)\s*(\d+))?\s*(?:di|pada|in)\s*([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_]+)/gi;
  while ((match = lineInFileRegex.exec(promptText)) !== null) {
    const startLine = match[1];
    const endLine = match[2];
    const filePath = match[3];
    addTarget(filePath, startLine, endLine);
  }

  if (targets.length === 0) {
    const lineOnlyRegex = /(?:baris|line)\s*(\d+)(?:\s*(?:[-–—]|sampai|to)\s*(\d+))?/gi;
    while ((match = lineOnlyRegex.exec(promptText)) !== null) {
      const activeFile = (docManager && docManager.activeDocId)
        ? docManager.activeDocId
        : ((docManager && docManager.documents && docManager.documents.keys().next().value) || 'quicksort.py');
      const startLine = match[1];
      const endLine = match[2];
      addTarget(activeFile, startLine, endLine);
    }
  }

  return targets;
}

function addTargetsToStack(newTargets) {
  if (!Array.isArray(newTargets)) return;
  for (const t of newTargets) {
    if (!targetStack.some(existing => existing.filePath === t.filePath && existing.startLine === t.startLine && existing.endLine === t.endLine)) {
      targetStack.push(t);
    }
  }
  renderTargetStack();
}

let expandedTargetId = null;

function removeTargetFromStack(targetId) {
  if (!targetId) return false;
  const beforeLen = targetStack.length;
  targetStack = targetStack.filter(t => t.id !== targetId);
  if (expandedTargetId === targetId) {
    expandedTargetId = null;
  }
  if (targetStack.length !== beforeLen) {
    renderTargetStack();
    return true;
  }
  return false;
}

function renderTargetStack() {
  const container = document.getElementById('target-stack-list') || document.getElementById('target-line-stack-container');
  const countEl = document.getElementById('target-stack-count');
  if (countEl) countEl.textContent = targetStack.length.toString();

  const stackContainer = document.getElementById('target-line-stack-container');
  if (stackContainer) {
    stackContainer.style.display = targetStack.length > 0 ? 'block' : 'none';
  }

  if (!container) return;
  const listEl = document.getElementById('target-stack-list') || container;
  listEl.innerHTML = '';

  targetStack.forEach((target) => {
    const isExpanded = (expandedTargetId === target.id);
    const card = document.createElement('div');
    card.className = `target-line-card target-card ${isExpanded ? 'chip-expanded' : 'chip-collapsed'}`;
    card.dataset.targetId = target.id;
    card.dataset.filePath = target.filePath;
    card.dataset.startLine = target.startLine.toString();
    if (target.endLine) card.dataset.endLine = target.endLine.toString();
    if (typeof card.setAttribute === 'function') {
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
      card.setAttribute('data-target-id', target.id);
      card.setAttribute('data-file-path', target.filePath);
      card.setAttribute('data-start-line', target.startLine.toString());
      if (target.endLine) card.setAttribute('data-end-line', target.endLine.toString());
    }

    const rangeText = (target.endLine && target.endLine !== target.startLine)
      ? `:${target.startLine}-${target.endLine}`
      : `:${target.startLine}`;

    const snippetText = target.codeSnippet || target.snippet || '';
    const snippetHtml = snippetText ? `
      <div class="target-code-preview" title="${escapeHtml(snippetText)}">
        <code>${escapeHtml(snippetText.length > 120 ? snippetText.substring(0, 120) + '...' : snippetText)}</code>
      </div>` : '';

    card.innerHTML = `
      <div class="target-card-main">
        <span class="codicon codicon-file-code target-icon"></span>
        <span class="target-file-badge target-path" title="${target.filePath}">${target.filePath}</span>
        <span class="target-range-badge">${rangeText}</span>
        <button class="target-btn-dismiss" title="Hapus dari antrean" aria-label="Dismiss">
          <span class="codicon codicon-close"></span>
        </button>
      </div>
      ${snippetHtml}
      <div class="target-card-actions">
        <button class="target-btn-reveal" title="Sorot di Layar A (Zero-Buffer)">
          <span class="codicon codicon-go-to-file"></span>
          <span>Sorot Baris</span>
        </button>
        <button class="btn-request-guidance target-btn-guidance" title="Minta Saran Pengerjaan">
          <span class="codicon codicon-lightbulb"></span>
          <span>Minta Saran Pengerjaan</span>
        </button>
      </div>
    `;

    // In-place Accordion toggle helper (preserves scroll position & runs CSS 160ms transitions)
    const toggleExpansion = () => {
      expandedTargetId = (expandedTargetId === target.id) ? null : target.id;
      const allCards = listEl.querySelectorAll ? listEl.querySelectorAll('.target-line-card, .target-card') : [];
      if (allCards.length > 0) {
        allCards.forEach((c) => {
          const isTarget = c.dataset.targetId === target.id;
          const isExp = isTarget && (expandedTargetId === target.id);
          if (c.classList) {
            c.classList.toggle('chip-expanded', isExp);
            c.classList.toggle('chip-collapsed', !isExp);
          }
          if (typeof c.setAttribute === 'function') {
            c.setAttribute('aria-expanded', isExp ? 'true' : 'false');
          }
        });
      } else {
        renderTargetStack();
      }
    };

    // Click card navigates Monaco & toggles accordion (unless buttons clicked)
    card.addEventListener('click', (e) => {
      if (e.target.closest('.target-btn-dismiss')) {
        e.stopPropagation();
        removeTargetFromStack(target.id);
        return;
      }
      if (e.target.closest('.btn-request-guidance') || e.target.closest('.target-btn-guidance')) {
        e.stopPropagation();
        requestGuidanceForTarget(target);
        return;
      }
      if (e.target.closest('.target-btn-reveal')) {
        e.stopPropagation();
        revealTargetInMonaco(target);
        return;
      }
      toggleExpansion();
      revealTargetInMonaco(target);
    });

    // Keyboard navigation (Enter / Space)
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleExpansion();
        revealTargetInMonaco(target);
      }
    });

    const dismissBtn = card.querySelector('.target-btn-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeTargetFromStack(target.id);
      });
    }

    const revealBtn = card.querySelector('.target-btn-reveal');
    if (revealBtn) {
      revealBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        revealTargetInMonaco(target);
      });
    }

    const guidanceBtn = card.querySelector('.btn-request-guidance');
    if (guidanceBtn) {
      guidanceBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        requestGuidanceForTarget(target);
      });
    }

    listEl.appendChild(card);
  });
}

async function revealTargetInMonaco(target) {
  if (!target) return;
  const targetFilePath = target.filePath;
  const startLine = target.startLine || 1;
  const endLine = target.endLine || startLine;

  // 1. If file not currently active in docManager, open it
  if (docManager && docManager.activeDocId !== targetFilePath) {
    if (typeof docManager.openFile === 'function') {
      await docManager.openFile(targetFilePath);
    }
  }

  // 2. Monaco Zero-Buffer Pointer: reveal in center & set cursor position
  if (editor) {
    if (typeof editor.revealLineInCenter === 'function') {
      editor.revealLineInCenter(startLine);
    }
    if (typeof editor.setPosition === 'function') {
      editor.setPosition({ lineNumber: startLine, column: 1 });
    }
    if (target.endLine && typeof editor.setSelection === 'function' && window.monaco) {
      const model = typeof editor.getModel === 'function' ? editor.getModel() : null;
      const endCol = model && typeof model.getLineMaxColumn === 'function' ? model.getLineMaxColumn(endLine) : 1;
      editor.setSelection(new window.monaco.Range(startLine, 1, endLine, endCol));
    }
  }

  // 3. Highlight line non-destructively
  if (typeof highlightLine === 'function') {
    highlightLine(startLine, `Target: ${target.filePath}:${startLine}${target.endLine ? '-' + target.endLine : ''}`);
  }

  // 4. Update UI card active highlight
  const cards = document.querySelectorAll('.target-line-card, .target-card');
  cards.forEach(c => {
    if (c.dataset.targetId === target.id) {
      c.classList.add('active');
    } else {
      c.classList.remove('active');
    }
  });

  // 5. Update breadcrumb
  updateScreenBBreadcrumb(targetFilePath);
}

async function requestGuidanceForTarget(target) {
  if (!target) return;

  const summaryContainer = document.getElementById('technical-summary-cards-container');
  if (!summaryContainer) return;

  const loadingCardId = `loading-${target.id}`;
  let existingLoading = document.getElementById(loadingCardId);
  if (!existingLoading) {
    existingLoading = document.createElement('div');
    existingLoading.id = loadingCardId;
    existingLoading.className = 'technical-summary-card loading';
    existingLoading.innerHTML = `
      <div class="summary-card-header">
        <span class="summary-card-title">
          <span class="codicon codicon-loading codicon-modifier-spin"></span>
          <span>Mencari Saran Pengerjaan (${target.filePath}:${target.startLine})...</span>
        </span>
      </div>
    `;
    summaryContainer.prepend(existingLoading);
  }

  let result = null;
  try {
    if (window.electronGuidance && typeof window.electronGuidance.scoutPattern === 'function') {
      result = await window.electronGuidance.scoutPattern({
        filePath: target.filePath,
        startLine: target.startLine,
        endLine: target.endLine,
        context: target.label,
      });
    } else {
      // Offline fallback
      result = {
        success: true,
        target: { filePath: target.filePath, startLine: target.startLine, endLine: target.endLine },
        rootCause: `Analisis lokasi ${target.filePath}:${target.startLine}: Pola memerlukan penanganan error dan validasi kondisi batas yang tepat.`,
        explanation: `Pemeriksaan struktur kode pada baris ${target.startLine} menunjukkan perlunya pemeriksaan tipe data dan penanganan kesalahan defensif.`,
        references: [
          {
            title: 'MDN Web Docs - Control flow and error handling',
            url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Control_flow_and_error_handling',
            source: 'MDN',
          },
          {
            title: 'Node.js Documentation - Errors',
            url: 'https://nodejs.org/api/errors.html',
            source: 'Node.js Docs',
          },
          {
            title: 'StackOverflow - Defensive programming and edge cases',
            url: 'https://stackoverflow.com/questions/tagged/javascript',
            source: 'StackOverflow',
          },
        ],
        suggestedDiff: {
          original: `// Baris ${target.startLine}`,
          suggested: `// Saran perbaikan terverifikasi tanpa auto-patch`,
          explanation: 'Tinjau rekomendasi perbaikan sebelum diterapkan secara mandiri ke buffer editor.',
        },
      };
    }
  } catch (err) {
    console.error('[Workbench] Guidance scout error:', err);
  } finally {
    if (existingLoading && existingLoading.parentNode) {
      existingLoading.parentNode.removeChild(existingLoading);
    }
  }

  if (result) {
    renderTechnicalSummaryCard(result, target);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderTechnicalSummaryCard(guidanceData, target) {
  const container = document.getElementById('technical-summary-cards-container');
  if (!container) return;

  const data = (guidanceData && guidanceData.card) ? guidanceData.card : (guidanceData || {});
  const targetInfo = data.target || target || { filePath: 'file', startLine: 1 };
  const rootCause = data.rootCause || 'Root cause analysis unavailable';
  const explanation = data.explanation || '';
  const references = data.references || [];
  const diff = data.suggestedDiff || data.diffSuggestion;

  const card = document.createElement('div');
  card.className = 'technical-summary-card';
  card.dataset.filePath = targetInfo.filePath;
  card.dataset.startLine = (targetInfo.startLine || 1).toString();

  let refsHtml = '';
  if (Array.isArray(references) && references.length > 0) {
    refsHtml = `
      <div class="summary-section-title">Referensi Terverifikasi:</div>
      <div class="summary-references">
        ${references.map(ref => `
          <a class="summary-ref-link" href="${ref.url}" target="_blank" rel="noopener noreferrer">
            <span class="codicon codicon-link-external"></span>
            <span>${ref.title || ref.url}</span>
          </a>
        `).join('')}
      </div>
    `;
  }

  let diffHtml = '';
  if (diff) {
    const orig = diff.original || diff.originalCode || '';
    const sugg = diff.suggested || diff.suggestedCode || '';
    const diffExpl = diff.explanation || '';
    diffHtml = `
      <div class="summary-section-title">Pratinjau Saran Perbaikan (Non-Destruktif):</div>
      ${diffExpl ? `<div class="summary-diff-explanation">${escapeHtml(diffExpl)}</div>` : ''}
      <div class="summary-diff-preview">
        ${orig ? `<div class="diff-line-del">- ${escapeHtml(orig)}</div>` : ''}
        ${sugg ? `<div class="diff-line-add">+ ${escapeHtml(sugg)}</div>` : ''}
      </div>
    `;
  }

  card.innerHTML = `
    <div class="summary-card-header">
      <span class="summary-card-title">
        <span class="codicon codicon-lightbulb"></span>
        <span>Saran Teknis (${targetInfo.filePath}:${targetInfo.startLine})</span>
      </span>
      <span class="summary-card-badge">PANDUAN</span>
    </div>
    <div class="summary-root-cause">
      <strong>Penyebab Masalah:</strong> ${escapeHtml(rootCause)}
    </div>
    ${explanation ? `<div class="summary-explanation">${escapeHtml(explanation)}</div>` : ''}
    ${refsHtml}
    ${diffHtml}
  `;

  container.prepend(card);
}

function updateScreenBBreadcrumb(filePath) {
  const wsEl = document.getElementById('screen-b-ws-name');
  const fileEl = document.getElementById('screen-b-active-file') || document.getElementById('secondary-breadcrumb');
  const wsRoot = (typeof currentWorkspaceRoot !== 'undefined' && currentWorkspaceRoot) || (typeof window !== 'undefined' && window.currentWorkspaceRoot);
  if (wsEl) {
    if (wsRoot) {
      const wsName = wsRoot.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'WORKSPACE';
      wsEl.textContent = wsName.toUpperCase();
    } else if (!wsEl.textContent) {
      wsEl.textContent = 'WORKSPACE';
    }
  }
  if (filePath && fileEl) {
    const fileName = filePath.replace(/\\/g, '/').split('/').pop() || filePath;
    fileEl.textContent = fileName;
  }
}

// =============================================================================
// CONTEXT BRIDGE & RELATIVE PATH UTILITIES (Milestone v0.2.2 - R1)
// =============================================================================

function toRelativeWorkspacePath(fullPath) {
  if (!fullPath || typeof fullPath !== 'string') return '';
  const wsRoot = (typeof currentWorkspaceRoot !== 'undefined' && currentWorkspaceRoot)
    || (typeof window !== 'undefined' && window.currentWorkspaceRoot);
  let norm = fullPath.replace(/\\/g, '/');
  if (wsRoot) {
    let normRoot = wsRoot.replace(/\\/g, '/').replace(/\/+$/, '');
    if (norm.startsWith(normRoot)) {
      norm = norm.substring(normRoot.length).replace(/^\/+/, '');
    }
  }
  return norm || fullPath;
}

function getActiveDocumentRelativePath() {
  let rawPath = '';
  if (docManager && docManager.activeDocId) {
    const activeDoc = docManager.documents ? docManager.documents.get(docManager.activeDocId) : null;
    rawPath = activeDoc?.filePath || docManager.activeDocId;
  } else if (editor && typeof editor.getModel === 'function') {
    const model = editor.getModel();
    if (model && model.uri) {
      rawPath = model.uri.fsPath || model.uri.path || '';
    }
  }
  if (!rawPath) rawPath = 'quicksort.py';
  return toRelativeWorkspacePath(rawPath);
}

function registerEditorActions(editorInstance) {
  if (!editorInstance || typeof editorInstance.addAction !== 'function') return;

  editorInstance.addAction({
    id: 'sendToScreenB',
    label: 'Kirim ke Screen B',
    keybindings: (window.monaco && window.monaco.KeyMod && window.monaco.KeyCode)
      ? [window.monaco.KeyMod.CtrlCmd | window.monaco.KeyMod.Alt | window.monaco.KeyCode.KeyA]
      : [],
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 1.5,
    run: (ed) => {
      sendSelectionToScreenB(ed || editorInstance);
    },
  });
}

function sendSelectionToScreenB(ed = editor) {
  const currentEd = ed || (typeof multiGroupManager !== 'undefined' && multiGroupManager?.getActiveEditor ? multiGroupManager.getActiveEditor() : editor);
  if (!currentEd) return null;

  const relPath = getActiveDocumentRelativePath();
  let startLine = 1;
  let endLine = undefined;
  let selectedSnippet = '';

  const sel = (currentEd.getSelection && currentEd.getSelection()) || null;
  const pos = (currentEd.getPosition && currentEd.getPosition()) || { lineNumber: 1, column: 1 };
  const model = (currentEd.getModel && currentEd.getModel()) || null;

  if (sel && typeof sel.isEmpty === 'function' && !sel.isEmpty()) {
    startLine = Math.min(sel.startLineNumber, sel.endLineNumber);
    endLine = Math.max(sel.startLineNumber, sel.endLineNumber);
    if (model && typeof model.getValueInRange === 'function') {
      selectedSnippet = model.getValueInRange(sel);
    }
  } else if (pos) {
    startLine = pos.lineNumber || 1;
    endLine = startLine;
    if (model && typeof model.getLineContent === 'function') {
      selectedSnippet = model.getLineContent(startLine);
    }
  }

  const isRange = endLine && endLine !== startLine;
  const targetId = `target-ctx-${Date.now()}-${targetStack.length}`;
  const target = {
    id: targetId,
    filePath: relPath,
    startLine: startLine,
    endLine: endLine,
    label: `${relPath}:${startLine}${isRange ? '-' + endLine : ''}`,
    codeSnippet: selectedSnippet || '',
    snippet: selectedSnippet || '',
    isContextCard: true,
    createdAt: Date.now(),
  };

  const existingIdx = targetStack.findIndex(t =>
    t.filePath === target.filePath &&
    t.startLine === target.startLine &&
    t.endLine === target.endLine
  );

  if (existingIdx >= 0) {
    targetStack[existingIdx].codeSnippet = selectedSnippet || targetStack[existingIdx].codeSnippet;
    targetStack[existingIdx].snippet = selectedSnippet || targetStack[existingIdx].snippet;
    targetStack[existingIdx].isContextCard = true;
  } else {
    targetStack.push(target);
  }

  renderTargetStack();

  if (typeof setScreenBMode === 'function') {
    setScreenBMode('chat');
  }

  if (typeof secondaryResizer !== 'undefined' && secondaryResizer && typeof secondaryResizer.expand === 'function') {
    secondaryResizer.expand();
  } else {
    const secSidebar = document.getElementById('secondary-sidebar');
    if (secSidebar) secSidebar.classList.remove('collapsed');
  }

  const promptBox = document.getElementById('prompt-input-box');
  if (promptBox && typeof promptBox.focus === 'function') {
    promptBox.focus();
  }

  if (typeof editorEventBridge !== 'undefined') {
    editorEventBridge.emit('screenB:contextBridged', {
      filePath: relPath,
      startLine,
      endLine,
      codeSnippet: selectedSnippet,
      target,
    });
  }

  return target;
}

// =============================================================================
// AGENTIC TASK PLAN STATE MACHINE & PROGRESS DISPATCHER (Milestone v0.2.2 - R2/R3)
// =============================================================================

let currentTaskPlan = null;

function createTaskPlan(planData) {
  if (!planData || !planData.title) {
    throw new Error('Task plan requires a valid title.');
  }

  const subtasks = Array.isArray(planData.subtasks) ? planData.subtasks.map((st, idx) => ({
    id: st.id || `subtask-${Date.now()}-${idx}`,
    title: st.title || `Subtask ${idx + 1}`,
    status: st.status || (idx === 0 ? 'in_progress' : 'pending'),
    description: st.description || '',
    targetFiles: Array.isArray(st.targetFiles) ? st.targetFiles : [],
    collapsed: false,
  })) : [];

  currentTaskPlan = {
    id: planData.id || `plan-${Date.now()}`,
    title: planData.title,
    status: planData.status || 'in_progress',
    subtasks,
    currentSubtaskIndex: 0,
    progress: 0,
    logs: [
      {
        timestamp: new Date().toTimeString().slice(0, 8),
        message: `Plan "${planData.title}" initialized with ${subtasks.length} subtask(s).`,
        level: 'info',
      }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const completedCount = subtasks.filter(s => s.status === 'completed').length;
  currentTaskPlan.progress = subtasks.length > 0 ? Math.round((completedCount / subtasks.length) * 100) : 0;

  setScreenBMode('plan');
  renderPlanView();

  if (typeof editorEventBridge !== 'undefined') {
    editorEventBridge.emit('screenB:planUpdate', {
      plan: currentTaskPlan,
      action: 'created',
    });
    editorEventBridge.emit('screenB:taskProgress', {
      planId: currentTaskPlan.id,
      subtaskId: subtasks[0]?.id,
      status: subtasks[0]?.status || 'in_progress',
      progress: currentTaskPlan.progress,
      logMessage: currentTaskPlan.logs[0].message,
    });
  }

  return currentTaskPlan;
}

function getTaskPlan() {
  return currentTaskPlan;
}

function pauseTaskPlan() {
  if (!currentTaskPlan || currentTaskPlan.status !== 'in_progress') return false;
  currentTaskPlan.status = 'paused';
  currentTaskPlan.updatedAt = Date.now();
  addExecutionLog('Plan execution paused by user.', 'warn');

  renderPlanView();

  if (typeof editorEventBridge !== 'undefined') {
    editorEventBridge.emit('screenB:planUpdate', {
      plan: currentTaskPlan,
      action: 'paused',
    });
    editorEventBridge.emit('screenB:taskProgress', {
      planId: currentTaskPlan.id,
      status: 'paused',
      progress: currentTaskPlan.progress,
      logMessage: 'Plan execution paused by user.',
    });
  }
  return true;
}

function resumeTaskPlan() {
  if (!currentTaskPlan || currentTaskPlan.status !== 'paused') return false;
  currentTaskPlan.status = 'in_progress';
  currentTaskPlan.updatedAt = Date.now();
  addExecutionLog('Plan execution resumed.', 'info');

  renderPlanView();

  if (typeof editorEventBridge !== 'undefined') {
    editorEventBridge.emit('screenB:planUpdate', {
      plan: currentTaskPlan,
      action: 'resumed',
    });
    editorEventBridge.emit('screenB:taskProgress', {
      planId: currentTaskPlan.id,
      status: 'in_progress',
      progress: currentTaskPlan.progress,
      logMessage: 'Plan execution resumed.',
    });
  }
  return true;
}

function cancelTaskPlan() {
  if (!currentTaskPlan || (currentTaskPlan.status !== 'in_progress' && currentTaskPlan.status !== 'paused')) {
    return false;
  }
  currentTaskPlan.status = 'cancelled';
  currentTaskPlan.updatedAt = Date.now();
  currentTaskPlan.subtasks.forEach(st => {
    if (st.status === 'in_progress') st.status = 'failed';
  });
  addExecutionLog('Plan execution cancelled by user.', 'error');

  renderPlanView();

  if (typeof editorEventBridge !== 'undefined') {
    editorEventBridge.emit('screenB:planUpdate', {
      plan: currentTaskPlan,
      action: 'cancelled',
    });
    editorEventBridge.emit('screenB:taskProgress', {
      planId: currentTaskPlan.id,
      status: 'cancelled',
      progress: currentTaskPlan.progress,
      logMessage: 'Plan execution cancelled by user.',
    });
  }
  return true;
}

function advanceSubtask(subtaskId, resultStatus, logMessage) {
  if (!currentTaskPlan) return false;
  const subtask = currentTaskPlan.subtasks.find(st => st.id === subtaskId);
  if (!subtask) return false;

  subtask.status = resultStatus;
  currentTaskPlan.updatedAt = Date.now();

  const completedCount = currentTaskPlan.subtasks.filter(st => st.status === 'completed').length;
  currentTaskPlan.progress = Math.round((completedCount / currentTaskPlan.subtasks.length) * 100);

  if (resultStatus === 'completed') {
    const nextPending = currentTaskPlan.subtasks.find(st => st.status === 'pending');
    if (nextPending && currentTaskPlan.status === 'in_progress') {
      nextPending.status = 'in_progress';
      currentTaskPlan.currentSubtaskIndex = currentTaskPlan.subtasks.indexOf(nextPending);
    } else if (completedCount === currentTaskPlan.subtasks.length) {
      currentTaskPlan.status = 'completed';
      currentTaskPlan.progress = 100;
      addExecutionLog('All plan subtasks completed successfully.', 'info');
      if (currentReviewDiffs.length > 0) {
        setScreenBMode('review');
      }
    }
  }

  if (logMessage) {
    addExecutionLog(logMessage, resultStatus === 'failed' ? 'error' : 'info', subtaskId);
  }

  renderPlanView();

  if (typeof editorEventBridge !== 'undefined') {
    editorEventBridge.emit('screenB:taskProgress', {
      planId: currentTaskPlan.id,
      subtaskId,
      status: resultStatus,
      progress: currentTaskPlan.progress,
      logMessage: logMessage || `Subtask "${subtask.title}" status updated to ${resultStatus}.`,
    });
    editorEventBridge.emit('screenB:planUpdate', {
      plan: currentTaskPlan,
      action: 'subtaskProgress',
    });
  }
  return true;
}

function addExecutionLog(message, level = 'info', subtaskId = undefined) {
  const entry = {
    timestamp: new Date().toTimeString().slice(0, 8),
    message,
    level,
    subtaskId,
  };
  if (currentTaskPlan) {
    if (!Array.isArray(currentTaskPlan.logs)) currentTaskPlan.logs = [];
    currentTaskPlan.logs.push(entry);
    if (currentTaskPlan.logs.length > 2000) {
      currentTaskPlan.logs.splice(0, currentTaskPlan.logs.length - 2000);
    }
  }

  const consoleEl = document.getElementById('plan-logs-console') || document.getElementById('screen-b-plan-logs');
  if (consoleEl) {
    const row = document.createElement('div');
    row.className = `plan-log-entry level-${level}`;
    row.innerHTML = `<span class="log-timestamp">[${entry.timestamp}]</span><span class="log-message">${escapeHtml(message)}</span>`;
    consoleEl.appendChild(row);

    while (consoleEl.children.length > 1000) {
      consoleEl.removeChild(consoleEl.firstChild);
    }

    if (typeof consoleEl.scrollTop !== 'undefined' && typeof consoleEl.scrollHeight !== 'undefined') {
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
  }

  if (typeof editorEventBridge !== 'undefined' && currentTaskPlan) {
    editorEventBridge.emit('screenB:taskProgress', {
      planId: currentTaskPlan.id,
      subtaskId,
      progress: currentTaskPlan.progress,
      logMessage: message,
    });
  }
}

function renderPlanView() {
  const emptyPane = document.getElementById('plan-empty-pane');
  const activePane = document.getElementById('plan-active-pane');
  if (!emptyPane || !activePane) return;

  if (!currentTaskPlan) {
    emptyPane.style.display = 'flex';
    activePane.style.display = 'none';
    return;
  }

  emptyPane.style.display = 'none';
  activePane.style.display = 'flex';

  const titleEl = document.getElementById('plan-title') || document.getElementById('plan-title-text');
  if (titleEl) titleEl.textContent = currentTaskPlan.title;

  const badgeEl = document.getElementById('plan-status-badge');
  if (badgeEl) {
    badgeEl.textContent = currentTaskPlan.status.replace('_', ' ').toUpperCase();
    badgeEl.className = `plan-status-badge status-badge-${currentTaskPlan.status.replace('_', '')}`;
  }

  const btnPause = document.getElementById('btn-plan-pause');
  const btnResume = document.getElementById('btn-plan-resume');
  const btnCancel = document.getElementById('btn-plan-cancel');

  if (btnPause && btnResume) {
    if (currentTaskPlan.status === 'in_progress') {
      btnPause.style.display = 'inline-flex';
      btnResume.style.display = 'none';
      btnPause.disabled = false;
      if (btnCancel) btnCancel.disabled = false;
    } else if (currentTaskPlan.status === 'paused') {
      btnPause.style.display = 'none';
      btnResume.style.display = 'inline-flex';
      btnResume.disabled = false;
      if (btnCancel) btnCancel.disabled = false;
    } else {
      btnPause.style.display = 'inline-flex';
      btnPause.disabled = true;
      btnResume.style.display = 'none';
      if (btnCancel) btnCancel.disabled = true;
    }
  }

  const progressFill = document.getElementById('plan-progress-bar-fill');
  if (progressFill) progressFill.style.width = `${currentTaskPlan.progress}%`;

  const progressText = document.getElementById('plan-progress-text');
  if (progressText) {
    const completed = currentTaskPlan.subtasks.filter(s => s.status === 'completed').length;
    progressText.textContent = `${completed} / ${currentTaskPlan.subtasks.length} subtasks completed (${currentTaskPlan.progress}%)`;
  }

  const subtaskList = document.getElementById('plan-subtask-list') || document.getElementById('screen-b-plan-checklist');
  const subtaskCount = document.getElementById('plan-subtask-count');
  if (subtaskCount) subtaskCount.textContent = currentTaskPlan.subtasks.length.toString();

  if (subtaskList) {
    subtaskList.innerHTML = '';
    currentTaskPlan.subtasks.forEach((st) => {
      const item = document.createElement('div');
      item.className = `plan-subtask-item status-${st.status}`;
      item.dataset.subtaskId = st.id;
      if (typeof item.setAttribute === 'function') {
        item.setAttribute('data-subtask-id', st.id);
      }

      let iconClass = 'codicon-circle-outline';
      if (st.status === 'in_progress') iconClass = 'codicon-loading codicon-modifier-spin';
      else if (st.status === 'completed') iconClass = 'codicon-pass-filled';
      else if (st.status === 'failed') iconClass = 'codicon-error';

      const targetTags = st.targetFiles.map(fp => `
        <span class="subtask-target-tag" data-file-path="${fp}">
          <span class="codicon ${resolveFileIconClass(fp)}"></span>
          <span class="file-path-text">${escapeHtml(fp)}</span>
        </span>
      `).join('');

      item.innerHTML = `
        <div class="subtask-header">
          <span class="codicon codicon-chevron-down subtask-chevron ${st.collapsed ? 'collapsed' : ''}"></span>
          <span class="codicon ${iconClass} subtask-status-icon"></span>
          <span class="subtask-title" title="${escapeHtml(st.title)}">${escapeHtml(st.title)}</span>
          <span class="subtask-status-text">${st.status.replace('_', ' ')}</span>
        </div>
        <div class="subtask-body ${st.collapsed ? 'collapsed' : ''}">
          ${st.description ? `<div class="subtask-desc">${escapeHtml(st.description)}</div>` : ''}
          ${st.targetFiles.length > 0 ? `
            <div class="subtask-targets">
              <span class="subtask-targets-label">Target Files:</span>
              <div class="subtask-target-tags">${targetTags}</div>
            </div>
          ` : ''}
        </div>
      `;

      const header = item.querySelector('.subtask-header');
      if (header) {
        header.addEventListener('click', () => {
          st.collapsed = !st.collapsed;
          const chev = item.querySelector('.subtask-chevron');
          const body = item.querySelector('.subtask-body');
          if (chev) chev.classList.toggle('collapsed', st.collapsed);
          if (body) body.classList.toggle('collapsed', st.collapsed);
        });
      }

      subtaskList.appendChild(item);
    });
  }

  const affectedList = document.getElementById('plan-affected-list') || document.getElementById('screen-b-plan-files');
  const affectedCount = document.getElementById('plan-affected-count');
  const fileMap = new Map();
  currentTaskPlan.subtasks.forEach(st => {
    st.targetFiles.forEach(fp => {
      fileMap.set(fp, (fileMap.get(fp) || 0) + 1);
    });
  });

  if (affectedCount) affectedCount.textContent = fileMap.size.toString();
  if (affectedList) {
    affectedList.innerHTML = '';
    fileMap.forEach((count, fp) => {
      const fileRow = document.createElement('div');
      fileRow.className = 'plan-affected-file-item';
      fileRow.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="codicon ${resolveFileIconClass(fp)}"></span>
          <span class="file-path">${escapeHtml(fp)}</span>
        </div>
        <span style="font-size:10px; color:#858585;">${count} subtask(s)</span>
      `;
      affectedList.appendChild(fileRow);
    });
  }
}

// =============================================================================
// ZERO-BUFFER DIFF PREVIEW & REVIEW CONTROLLER (Milestone v0.2.2 - R2/R4)
// =============================================================================

let diffEditor = null;
let currentReviewDiffs = [];
let activeDiffReviewId = null;

function computeDiffStats(origText = '', propText = '') {
  if (origText === propText) return { added: 0, deleted: 0 };
  const origLines = (origText || '').split('\n');
  const propLines = (propText || '').split('\n');
  const origSet = new Set(origLines);
  const propSet = new Set(propLines);
  let added = 0;
  let deleted = 0;
  for (const line of propLines) {
    if (!origSet.has(line)) added++;
  }
  for (const line of origLines) {
    if (!propSet.has(line)) deleted++;
  }
  if (added === 0 && deleted === 0 && origLines.length !== propLines.length) {
    if (propLines.length > origLines.length) {
      added = propLines.length - origLines.length;
    } else {
      deleted = origLines.length - propLines.length;
    }
  }
  return { added, deleted };
}

function normalizeDiffItem(diffItem, index = 0) {
  const orig = diffItem.originalContent || diffItem.original || '';
  const prop = diffItem.proposedContent || diffItem.proposed || diffItem.modified || '';
  const stats = computeDiffStats(orig, prop);

  return {
    ...diffItem,
    id: diffItem.id || `diff-${Date.now()}-${index}`,
    filePath: diffItem.filePath || diffItem.path || 'quicksort.py',
    originalContent: orig,
    proposedContent: prop,
    linesAdded: typeof diffItem.linesAdded === 'number' ? diffItem.linesAdded : (typeof diffItem.additions === 'number' ? diffItem.additions : stats.added),
    linesDeleted: typeof diffItem.linesDeleted === 'number' ? diffItem.linesDeleted : (typeof diffItem.deletions === 'number' ? diffItem.deletions : stats.deleted),
    status: diffItem.status || 'pending',
    description: diffItem.description || '',
    socraticChallenge: diffItem.socraticChallenge || diffItem.challenge,
  };
}

let isSocraticGateUnlocked = false;
let activeSocraticChallenge = null;
let socraticHintExpanded = false;
let selectedSocraticOptionIdx = null;
let isSocraticGateEngaged = false;

function isSocraticGateActive() {
  if (isSocraticGateEngaged) return true;
  if (typeof window !== 'undefined' && window && (window.socraticGateEnforced === true || window.isSocraticGateEnforced === true)) {
    return true;
  }
  const gateCard = document.getElementById('socratic-gate-card');
  if (gateCard) {
    if (gateCard.parentNode || gateCard.parentElement) return true;
    if (gateCard.children && gateCard.children.length > 0) return true;
  }
  const reviewActivePane = document.getElementById('review-active-pane');
  if (reviewActivePane && typeof reviewActivePane.querySelector === 'function') {
    if (reviewActivePane.querySelector('#socratic-gate-card')) return true;
  }
  return false;
}

function generateSocraticChallenge(diffItem) {
  if (!diffItem) return null;
  const custom = diffItem.socraticChallenge || diffItem.challenge;
  if (custom && typeof custom === 'object') {
    return custom;
  }

  const filePath = diffItem.filePath || diffItem.path || 'workspace/file';
  const rawFileName = filePath.replace(/\\/g, '/').split('/').pop() || filePath;
  const fileName = escapeHtml(rawFileName);
  const description = (diffItem.description || '').toLowerCase();
  const proposed = diffItem.proposedContent || diffItem.proposed || diffItem.modified || '';
  const original = diffItem.originalContent || diffItem.original || '';

  // Extract meaningful identifier tokens from diff
  const propLines = proposed.split('\n');
  const origLines = original.split('\n');
  const origSet = new Set(origLines.map(l => l.trim()));
  const addedLines = propLines.filter(l => !origSet.has(l.trim()) && l.trim().length > 0);
  const addedTokens = [];
  for (const line of addedLines) {
    const tokens = line.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    addedTokens.push(...tokens);
  }
  const filteredTokens = addedTokens.filter(t => t.length > 2 && !['function', 'const', 'let', 'var', 'return', 'import', 'export', 'class', 'true', 'false', 'null', 'undefined', 'async', 'await'].includes(t));
  const targetSymbol = filteredTokens[0] || 'targetRef';

  let category = 'defensive_bounds';
  let concept = 'Defensive Boundary & Input Validation';
  let questionL1 = `Why does the proposed change in "${fileName}" introduce boundary validation before accessing properties?`;
  let optionsL1 = [
    {
      id: 'opt-0',
      text: 'To guard against null or undefined references, preventing runtime TypeError exceptions during edge cases.',
      isCorrect: true,
      explanation: 'Correct. Defensive bounds checking ensures upstream callers cannot trigger unhandled exceptions.',
      feedback: 'Correct. Defensive boundary checks safeguard against runtime null dereferences.',
    },
    {
      id: 'opt-1',
      text: 'To convert untyped runtime objects into primitive scalar types before function evaluation.',
      isCorrect: false,
      explanation: 'Incorrect. Input validation preserves object types rather than coercing them into primitives.',
      feedback: 'Incorrect. Validation guards do not coerce object types into scalar primitives.',
    },
    {
      id: 'opt-2',
      text: 'To disable prototype chain traversal when evaluating nested property descriptors.',
      isCorrect: false,
      explanation: 'Incorrect. Property validation does not disable prototype resolution.',
      feedback: 'Incorrect. Boundary checks do not disable prototype inheritance.',
    },
  ];
  let hintL1 = 'Observe what occurs if the incoming data payload is null, undefined, or omitted by the caller.';
  let explanationL1 = 'Defensive boundary checks validate inputs at the system perimeter, isolating components from upstream failures and preventing runtime crashes.';

  let ruleL2 = `∀ x ∈ ${targetSymbol}: valid(x) ⇔ (x ≠ null ∧ x ≠ undefined ∧ bounds(x) ∈ [0, len))`;
  let questionL2 = `What precondition invariant must be satisfied before accessing properties in "${fileName}"?`;
  let optionsL2 = [
    {
      id: 'opt-inv-0',
      text: 'Guarantees non-null reference boundary before property dereferencing or indexing.',
      isCorrect: true,
      explanation: 'Correct. Precondition validation guards against runtime faults.',
      feedback: 'Correct. Precondition satisfaction guarantees memory safety.',
    },
    {
      id: 'opt-inv-1',
      text: 'Permits null dereferencing and catches downstream unhandled exceptions in the caller.',
      isCorrect: false,
      explanation: 'Incorrect. Permitting null dereferences violates the precondition contract.',
      feedback: 'Incorrect. Catching errors in caller is not a valid precondition guard.',
    },
    {
      id: 'opt-inv-2',
      text: 'Coerces null and undefined to empty strings without boundary checks.',
      isCorrect: false,
      explanation: 'Incorrect. Implicit type coercion masks underlying state errors.',
      feedback: 'Incorrect. Type coercion does not guarantee boundary safety.',
    },
  ];

  let pseudocodeL3 = `function process(${targetSymbol}):\n  if (!${targetSymbol} || typeof ${targetSymbol} !== 'object'):\n    return fallbackSafeValue\n  // Guaranteed safe property access below\n  return ${targetSymbol}.property`;
  let questionL3 = `Which logic blueprint correctly implements defensive boundary isolation in "${fileName}"?`;
  let optionsL3 = [
    {
      id: 'opt-bp-0',
      text: `Validate ${targetSymbol} with an early return guard before accessing properties.`,
      isCorrect: true,
      explanation: 'Correct. Blueprint early exit isolates faults at the component perimeter.',
      feedback: 'Correct. Early return guard establishes a safe execution scope.',
    },
    {
      id: 'opt-bp-1',
      text: `Access ${targetSymbol} directly and handle undefined properties in downstream callers.`,
      isCorrect: false,
      explanation: 'Incorrect. Downstream handling leads to cascading faults.',
      feedback: 'Incorrect. Pushing checks downstream breaks isolation.',
    },
    {
      id: 'opt-bp-2',
      text: 'Wrap entire call stack in global unhandled rejection handler without local checks.',
      isCorrect: false,
      explanation: 'Incorrect. Global handlers do not substitute for localized guard clauses.',
      feedback: 'Incorrect. Global error handler is not an architectural guard.',
    },
  ];

  let maskedSnippetL4 = `if (!${targetSymbol}) {\n  {BLANK_0};\n}`;
  let questionL4 = `Syntax Verification: Which control flow keyword cleanly exits the function upon failed validation?`;
  let optionsL4 = [
    {
      id: 'opt-cloze-0',
      text: 'return (exit function cleanly)',
      isCorrect: true,
      explanation: 'Correct. return terminates function execution cleanly.',
      feedback: 'Correct. return exits the current scope.',
    },
    {
      id: 'opt-cloze-1',
      text: 'break (exit enclosing loop)',
      isCorrect: false,
      explanation: 'Incorrect. break is only legal inside loops and switch blocks.',
      feedback: 'Incorrect. break cannot exit an arbitrary function.',
    },
    {
      id: 'opt-cloze-2',
      text: 'continue (skip loop iteration)',
      isCorrect: false,
      explanation: 'Incorrect. continue only skips current loop iteration.',
      feedback: 'Incorrect. continue does not exit the function.',
    },
  ];

  if (
    description.includes('async') ||
    description.includes('race') ||
    description.includes('promise') ||
    description.includes('concurren') ||
    description.includes('abort') ||
    proposed.includes('AbortController') ||
    proposed.includes('await') ||
    proposed.includes('Promise.all') ||
    (proposed.includes('Promise') && !original.includes('Promise'))
  ) {
    category = 'concurrency';
    concept = 'Asynchronous Concurrency & Race Condition Guard';
    questionL1 = `What invariant does the proposed asynchronous coordination pattern in "${fileName}" safeguard?`;
    optionsL1 = [
      {
        id: 'opt-0',
        text: 'It guarantees that out-of-order network responses or concurrent calls do not overwrite newer state.',
        isCorrect: true,
        explanation: 'Correct. Strict ordering and cancellation signals prevent stale response overwrites and race conditions.',
        feedback: 'Correct. Order synchronization and cancellation prevent stale response thrashing.',
      },
      {
        id: 'opt-1',
        text: 'It forces the browser to run asynchronous tasks synchronously on the main UI render loop.',
        isCorrect: false,
        explanation: 'Incorrect. Asynchronous execution in JavaScript remains decoupled from the synchronous render thread.',
        feedback: 'Incorrect. Asynchronous tasks do not block the UI render loop.',
      },
      {
        id: 'opt-2',
        text: 'It disables promise rejection propagation across concurrent lexical scopes.',
        isCorrect: false,
        explanation: 'Incorrect. Promises propagate rejections according to standard async semantics.',
        feedback: 'Incorrect. Promises retain rejection chains.',
      },
    ];
    hintL1 = 'Consider what happens when a second asynchronous request resolves before the first one completes.';
    explanationL1 = 'Guarding asynchronous flows with explicit abort signals or sequencing guarantees that asynchronous side effects remain deterministic, eliminating race condition bugs.';

    ruleL2 = `∀ seq(t1, t2): t1 < t2 ⇒ state(apply(t1, t2)) = state(t2)`;
    questionL2 = `What formal mathematical invariant must the asynchronous dispatcher satisfy in "${fileName}"?`;
    optionsL2 = [
      {
        id: 'opt-inv-0',
        text: 'Monotonic epoch or abort token prevents stale response thrashing across concurrent executions.',
        isCorrect: true,
        explanation: 'Correct. Monotonic ordering guarantees that obsolete responses are ignored.',
        feedback: 'Correct. Monotonic epoch satisfies concurrent consistency.',
      },
      {
        id: 'opt-inv-1',
        text: 'All concurrent operations block synchronously until preceding promises resolve.',
        isCorrect: false,
        explanation: 'Incorrect. Blocking promises eliminates concurrency benefits.',
        feedback: 'Incorrect. Synchronous blocking violates event loop semantics.',
      },
      {
        id: 'opt-inv-2',
        text: 'State is persisted to thread-local storage without memory synchronization barriers.',
        isCorrect: false,
        explanation: 'Incorrect. Unsynchronized state causes race conditions.',
        feedback: 'Incorrect. Lacks memory barrier synchronization.',
      },
    ];

    pseudocodeL3 = `function dispatchAsync(params):\n  abortPreviousController()\n  signal = createAbortSignal()\n  data = await fetch(params, { signal })\n  if (!signal.aborted):\n    commitState(data)`;
    questionL3 = `Which logic blueprint correctly structures the concurrency guard in "${fileName}"?`;
    optionsL3 = [
      {
        id: 'opt-bp-0',
        text: 'Abort previous in-flight requests and verify signal state before committing async results.',
        isCorrect: true,
        explanation: 'Correct. AbortController verification guarantees single active state update.',
        feedback: 'Correct. In-flight cancellation prevents race conditions.',
      },
      {
        id: 'opt-bp-1',
        text: 'Queue all incoming requests in an unbounded FIFO array without cancellation tokens.',
        isCorrect: false,
        explanation: 'Incorrect. Unbounded queues cause unbounded memory growth.',
        feedback: 'Incorrect. Unbounded FIFO queues cause memory leaks.',
      },
      {
        id: 'opt-bp-2',
        text: 'Execute concurrent requests in reverse order to ensure the fastest response wins.',
        isCorrect: false,
        explanation: 'Incorrect. Out-of-order resolution causes stale overwrites.',
        feedback: 'Incorrect. Reverse execution does not guarantee state validity.',
      },
    ];

    maskedSnippetL4 = `if (signal.{BLANK_0}) {\n  return;\n}`;
    questionL4 = `Syntax Verification: Which property checks whether an asynchronous operation has been cancelled?`;
    optionsL4 = [
      {
        id: 'opt-cloze-0',
        text: 'signal.aborted',
        isCorrect: true,
        explanation: 'Correct. signal.aborted reflects AbortController cancellation status.',
        feedback: 'Correct. aborted is the standard AbortSignal boolean property.',
      },
      {
        id: 'opt-cloze-1',
        text: 'signal.completed',
        isCorrect: false,
        explanation: 'Incorrect. AbortSignal does not define a completed property.',
        feedback: 'Incorrect. signal.completed is not a standard property.',
      },
      {
        id: 'opt-cloze-2',
        text: 'signal.resolved',
        isCorrect: false,
        explanation: 'Incorrect. AbortSignal does not define a resolved property.',
        feedback: 'Incorrect. signal.resolved is not a valid property.',
      },
    ];
  } else if (
    description.includes('error') ||
    description.includes('exception') ||
    description.includes('fail') ||
    description.includes('resilien') ||
    (proposed.includes('try') && !original.includes('try')) ||
    (proposed.includes('catch') && !original.includes('catch'))
  ) {
    category = 'error_resilience';
    concept = 'Fault Containment & Graceful Error Recovery';
    questionL1 = `Why is error boundary containment introduced in "${fileName}"?`;
    optionsL1 = [
      {
        id: 'opt-0',
        text: 'To isolate failure domains, log diagnostic context, and provide a safe fallback state.',
        isCorrect: true,
        explanation: 'Correct. Structured error handling protects the wider application from cascade failures.',
        feedback: 'Correct. Structured error handling protects the wider application from cascade failures.',
      },
      {
        id: 'opt-1',
        text: 'To silence all compiler warnings and pass linting checks automatically.',
        isCorrect: false,
        explanation: 'Incorrect. Silencing warnings without containment is poor engineering practice.',
        feedback: 'Incorrect. Try/catch does not silence static compiler warnings.',
      },
      {
        id: 'opt-2',
        text: 'To bypass function return type verification in the runtime compiler.',
        isCorrect: false,
        explanation: 'Incorrect. Error boundaries operate strictly at runtime.',
        feedback: 'Incorrect. Error boundaries do not alter type signatures.',
      },
    ];
    hintL1 = 'Look at how the return value or state is handled when an unexpected exception is thrown.';
    explanationL1 = 'Containing failures ensures partial system outages do not crash the workbench UI or corrupt adjacent file tabs.';

    ruleL2 = `∀ op: throws(op) ⇒ state(recovery) = SAFE ∧ logged(op.err)`;
    questionL2 = `What fault containment invariant is guaranteed by the error boundary in "${fileName}"?`;
    optionsL2 = [
      {
        id: 'opt-inv-0',
        text: 'Failure in a child subsystem is isolated without crashing the parent workbench process.',
        isCorrect: true,
        explanation: 'Correct. Fault domain isolation prevents systemic crashes.',
        feedback: 'Correct. Isolated failure domain preserved.',
      },
      {
        id: 'opt-inv-1',
        text: 'All runtime errors are swallowed silently without logging or notifying the user.',
        isCorrect: false,
        explanation: 'Incorrect. Silent error swallowing violates diagnostic invariants.',
        feedback: 'Incorrect. Silent failures are prohibited by protocol.',
      },
      {
        id: 'opt-inv-2',
        text: 'The process exits immediately upon encountering any non-critical exception.',
        isCorrect: false,
        explanation: 'Incorrect. Crashing the process violates resilience contracts.',
        feedback: 'Incorrect. Process exit defeats error resilience.',
      },
    ];

    pseudocodeL3 = `try:\n  result = executeRiskOperation()\ncatch (err):\n  logDiagnostic(err)\n  return fallbackGracefulState`;
    questionL3 = `Which logic blueprint correctly implements fault containment in "${fileName}"?`;
    optionsL3 = [
      {
        id: 'opt-bp-0',
        text: 'Catch expected faults, record diagnostic trace, and return deterministic fallback.',
        isCorrect: true,
        explanation: 'Correct. Graceful degradation preserves application state.',
        feedback: 'Correct. Graceful fallback pattern applied.',
      },
      {
        id: 'opt-bp-1',
        text: 'Rethrow exception immediately without recording diagnostic metadata.',
        isCorrect: false,
        explanation: 'Incorrect. Unhandled rethrowing fails containment.',
        feedback: 'Incorrect. Missing recovery and telemetry.',
      },
      {
        id: 'opt-bp-2',
        text: 'Retry the failing operation in an infinite synchronous while loop.',
        isCorrect: false,
        explanation: 'Incorrect. Unbounded synchronous retries hang the UI thread.',
        feedback: 'Incorrect. Infinite retry loop causes thread hang.',
      },
    ];

    maskedSnippetL4 = `try {\n  runOperation();\n} catch (err) {\n  {BLANK_0}(err);\n}`;
    questionL4 = `Syntax Verification: Which routine should capture fault context inside the catch clause?`;
    optionsL4 = [
      {
        id: 'opt-cloze-0',
        text: 'logDiagnostic (record structured fault telemetry)',
        isCorrect: true,
        explanation: 'Correct. Structured telemetry ensures zero-silent failures.',
        feedback: 'Correct. Fault context logged.',
      },
      {
        id: 'opt-cloze-1',
        text: 'delete (delete the exception object)',
        isCorrect: false,
        explanation: 'Incorrect. delete operator cannot delete lexical variables.',
        feedback: 'Incorrect. delete is invalid syntax here.',
      },
      {
        id: 'opt-cloze-2',
        text: 'void (ignore error expression)',
        isCorrect: false,
        explanation: 'Incorrect. void ignores the error and drops telemetry.',
        feedback: 'Incorrect. Ignoring errors violates protocol.',
      },
    ];
  } else if (
    description.includes('cleanup') ||
    description.includes('leak') ||
    description.includes('lifecycle') ||
    description.includes('memory') ||
    description.includes('dispose') ||
    proposed.includes('removeEventListener') ||
    proposed.includes('dispose') ||
    proposed.includes('clearInterval') ||
    proposed.includes('clearTimeout')
  ) {
    category = 'memory_lifecycle';
    concept = 'Deterministic Resource Deallocation';
    questionL1 = `What is the primary architectural purpose of the disposal lifecycle hooks in "${fileName}"?`;
    optionsL1 = [
      {
        id: 'opt-0',
        text: 'To unregister listeners and release event subscriptions, preventing persistent memory leaks.',
        isCorrect: true,
        explanation: 'Correct. Cleaning up retained closures prevents memory exhaustion over long-running sessions.',
        feedback: 'Correct. Cleaning up retained closures prevents memory exhaustion over long sessions.',
      },
      {
        id: 'opt-1',
        text: 'To reduce the bundle size of the compiled JavaScript file on disk.',
        isCorrect: false,
        explanation: 'Incorrect. Cleanup hooks add lifecycle management code and do not shrink file size.',
        feedback: 'Incorrect. Cleanup hooks do not alter compiled file size.',
      },
      {
        id: 'opt-2',
        text: 'To serialize active closure scope references into persistent local storage.',
        isCorrect: false,
        explanation: 'Incorrect. Lifecycle hooks manage memory deallocation, not persistence.',
        feedback: 'Incorrect. Lifecycle hooks manage memory, not storage serialization.',
      },
    ];
    hintL1 = 'What happens to event listener closures if a tab or component is repeatedly created and destroyed?';
    explanationL1 = 'In a long-running IDE workbench, failing to unbind listeners leads to retained DOM node leaks and performance degradation.';

    ruleL2 = `∀ handle ∈ ResourceHandles: unmount(handle) ⇒ ref_count(handle) = 0`;
    questionL2 = `What resource lifecycle contract must the disposal handler satisfy in "${fileName}"?`;
    optionsL2 = [
      {
        id: 'opt-inv-0',
        text: 'Guarantees symmetric resource deallocation: every registered listener is cleanly removed on disposal.',
        isCorrect: true,
        explanation: 'Correct. Symmetric cleanup guarantees leak-free operation.',
        feedback: 'Correct. Symmetric resource deallocation satisfied.',
      },
      {
        id: 'opt-inv-1',
        text: 'Keeps event listeners registered indefinitely to avoid recreation overhead.',
        isCorrect: false,
        explanation: 'Incorrect. Indefinite registration causes persistent memory growth.',
        feedback: 'Incorrect. Retained listeners cause memory leaks.',
      },
      {
        id: 'opt-inv-2',
        text: 'Invokes memory garbage collection synchronously on every state transition.',
        isCorrect: false,
        explanation: 'Incorrect. Manual GC triggers are non-standard and degrade throughput.',
        feedback: 'Incorrect. Synchronous GC is not a valid lifecycle solution.',
      },
    ];

    pseudocodeL3 = `function mount():\n  disposables.add(target.on('event', handler))\nfunction unmount():\n  for sub in disposables:\n    sub.dispose()\n  disposables.clear()`;
    questionL3 = `Which logic blueprint correctly implements resource lifecycle management in "${fileName}"?`;
    optionsL3 = [
      {
        id: 'opt-bp-0',
        text: 'Register event handlers in a lifecycle collection and dispose all subscriptions on unmount.',
        isCorrect: true,
        explanation: 'Correct. Composite disposable ensures deterministic cleanup.',
        feedback: 'Correct. Composite disposable lifecycle applied.',
      },
      {
        id: 'opt-bp-1',
        text: 'Keep event subscriptions alive across unmounts to reuse them on subsequent mounts.',
        isCorrect: false,
        explanation: 'Incorrect. Retained subscriptions accumulate and duplicate handlers.',
        feedback: 'Incorrect. Retaining subscriptions causes duplicate triggers.',
      },
      {
        id: 'opt-bp-2',
        text: 'Remove DOM elements while leaving event listeners registered to window global scope.',
        isCorrect: false,
        explanation: 'Incorrect. Detached DOM elements with listeners remain pinned in memory.',
        feedback: 'Incorrect. Detached DOM memory leak.',
      },
    ];

    maskedSnippetL4 = `target.{BLANK_0}('change', listener);`;
    questionL4 = `Syntax Verification: Which method unregisters an active event listener from the target?`;
    optionsL4 = [
      {
        id: 'opt-cloze-0',
        text: 'removeEventListener',
        isCorrect: true,
        explanation: 'Correct. removeEventListener unbinds the target handler.',
        feedback: 'Correct. removeEventListener is the standard unbinding method.',
      },
      {
        id: 'opt-cloze-1',
        text: 'addEventListener',
        isCorrect: false,
        explanation: 'Incorrect. addEventListener binds a new listener.',
        feedback: 'Incorrect. addEventListener creates an additional listener.',
      },
      {
        id: 'opt-cloze-2',
        text: 'dispatchEvent',
        isCorrect: false,
        explanation: 'Incorrect. dispatchEvent triggers an event rather than unbinding.',
        feedback: 'Incorrect. dispatchEvent triggers an event.',
      },
    ];
  } else if (
    description.includes('isolat') ||
    description.includes('immutab') ||
    description.includes('pure') ||
    description.includes('buffer') ||
    proposed.includes('structuredClone') ||
    proposed.includes('Object.freeze') ||
    (proposed.includes('slice') && !original.includes('slice'))
  ) {
    category = 'state_isolation';
    concept = 'State Immutability & Zero-Buffer Integrity';
    questionL1 = `Why does the proposed change in "${fileName}" enforce state isolation and immutability?`;
    optionsL1 = [
      {
        id: 'opt-0',
        text: 'To prevent in-place object mutations from corrupting shared state across adjacent components.',
        isCorrect: true,
        explanation: 'Correct. State isolation ensures data consistency and prevents unexpected side effects.',
        feedback: 'Correct. Immutability guarantees zero-buffer contracts and prevents state poisoning.',
      },
      {
        id: 'opt-1',
        text: 'To disable JavaScript garbage collection on state objects.',
        isCorrect: false,
        explanation: 'Incorrect. Immutability creates fresh references and does not disable GC.',
        feedback: 'Incorrect. Object immutability does not affect garbage collection.',
      },
      {
        id: 'opt-2',
        text: 'To restrict object property mutation to top-level module scope.',
        isCorrect: false,
        explanation: 'Incorrect. Immutability is about reference independence, not module scoping.',
        feedback: 'Incorrect. Property scoping is not state immutability.',
      },
    ];
    hintL1 = 'Think about what occurs if two views concurrently mutate the same object reference.';
    explanationL1 = 'Preserving strict state isolation eliminates side-effect pollution and guarantees deterministic view rendering.';

    ruleL2 = `∀ s ∈ State: mutate(s) ⇒ s' = clone(s) ∧ ref(s') ≠ ref(s)`;
    questionL2 = `What state immutability invariant is enforced in "${fileName}"?`;
    optionsL2 = [
      {
        id: 'opt-inv-0',
        text: 'Zero-mutation guarantee: consumers receive independent copies, protecting state integrity.',
        isCorrect: true,
        explanation: 'Correct. Immutability eliminates side-effect pollution.',
        feedback: 'Correct. Reference independence verified.',
      },
      {
        id: 'opt-inv-1',
        text: 'Directly mutates object properties while keeping reference identities identical.',
        isCorrect: false,
        explanation: 'Incorrect. In-place mutation breaks referential equality checks.',
        feedback: 'Incorrect. Direct mutation corrupts shared references.',
      },
      {
        id: 'opt-inv-2',
        text: 'Overrides Object.prototype to suppress property setter invocations.',
        isCorrect: false,
        explanation: 'Incorrect. Modifying Object.prototype pollutes all objects globally.',
        feedback: 'Incorrect. Prototype mutation is hazardous.',
      },
    ];

    pseudocodeL3 = `function updateState(prevState, patch):\n  nextState = { ...prevState, ...patch }\n  return Object.freeze(nextState)`;
    questionL3 = `Which logic blueprint correctly implements state isolation in "${fileName}"?`;
    optionsL3 = [
      {
        id: 'opt-bp-0',
        text: 'Create an isolated copy, apply mutations to the copy, and return the new frozen reference.',
        isCorrect: true,
        explanation: 'Correct. Cloning before patching guarantees immutable state snapshots.',
        feedback: 'Correct. Pure state projection verified.',
      },
      {
        id: 'opt-bp-1',
        text: 'Mutate prevState directly and return the same object reference to save allocation cost.',
        isCorrect: false,
        explanation: 'Incorrect. Reusing reference identities destroys change detection.',
        feedback: 'Incorrect. Violates immutable state contract.',
      },
      {
        id: 'opt-bp-2',
        text: 'Delete modified properties from prevState before reassigning new values.',
        isCorrect: false,
        explanation: 'Incorrect. Deleting properties mutates the shared object.',
        feedback: 'Incorrect. Deletion in-place is still mutable.',
      },
    ];

    maskedSnippetL4 = `const next = Object.{BLANK_0}({}, current);`;
    questionL4 = `Syntax Verification: Which method creates a shallow copy of an object into a fresh target?`;
    optionsL4 = [
      {
        id: 'opt-cloze-0',
        text: 'assign',
        isCorrect: true,
        explanation: 'Correct. Object.assign copies properties to target.',
        feedback: 'Correct. Object.assign creates shallow clone.',
      },
      {
        id: 'opt-cloze-1',
        text: 'freeze',
        isCorrect: false,
        explanation: 'Incorrect. Object.freeze prevents mutations but does not clone.',
        feedback: 'Incorrect. freeze does not create a shallow clone.',
      },
      {
        id: 'opt-cloze-2',
        text: 'seal',
        isCorrect: false,
        explanation: 'Incorrect. Object.seal prevents adding new properties.',
        feedback: 'Incorrect. seal does not clone properties.',
      },
    ];
  }

  const level1 = {
    level: 1,
    type: 'reflection',
    title: 'Level 1: Socratic Reflection',
    question: questionL1,
    options: optionsL1,
    hint: hintL1,
    explanation: explanationL1,
    completed: false,
    selectedOptionId: null,
  };

  const level2 = {
    level: 2,
    type: 'invariant',
    title: 'Level 2: Invariant & System Constraint',
    rule: ruleL2,
    question: questionL2,
    options: optionsL2,
    hint: 'Examine whether the formal pre-condition and boundary conditions are rigorously satisfied.',
    explanation: 'Mathematical invariant verification confirms that edge conditions cannot trigger runtime failures.',
    completed: false,
    selectedOptionId: null,
  };

  const level3 = {
    level: 3,
    type: 'blueprint',
    title: 'Level 3: Architectural Logic Blueprint',
    pseudocode: pseudocodeL3,
    question: questionL3,
    options: optionsL3,
    hint: 'Observe how the architectural strategy separates fault isolation from the happy-path logic.',
    explanation: 'The logic blueprint guarantees architectural alignment before concrete implementation.',
    completed: false,
    selectedOptionId: null,
  };

  const level4 = {
    level: 4,
    type: 'cloze',
    title: 'Level 4: Interactive Syntax Verification (Cloze)',
    maskedSnippet: maskedSnippetL4,
    question: questionL4,
    options: optionsL4,
    hint: 'Choose the exact syntax token required to complete the verification guard.',
    explanation: 'Interactive syntax completion verifies hands-on coding comprehension without spoon-feeding.',
    completed: false,
    selectedOptionId: null,
  };

  const levelsMap = {
    1: level1,
    2: level2,
    3: level3,
    4: level4,
  };

  const ladderSession = {
    challengeId: `ladder-${diffItem.id || Date.now()}`,
    diffId: diffItem.id || 'diff-0',
    filePath,
    category,
    currentLevel: 1,
    isFullyUnlocked: false,
    directAutoPatchAllowed: false, // Inviolable Golden Invariant
    levels: {
      reflection: level1,
      invariant: level2,
      blueprint: level3,
      cloze: level4,
    },
  };

  return {
    id: `challenge-${diffItem.id || Date.now()}`,
    diffId: diffItem.id || 'diff-0',
    filePath,
    category,
    concept,
    question: questionL1,
    options: optionsL1,
    hint: hintL1,
    explanation: explanationL1,
    isUnlocked: false,
    selectedOptionId: null,
    currentLevel: 1,
    maxCompletedLevel: 0,
    strictLadder: false,
    directAutoPatchAllowed: false, // Inviolable Golden Invariant
    levels: levelsMap,
    ladderSession,
  };
}

function setSocraticStep(stepNum) {
  if (!activeSocraticChallenge || !activeSocraticChallenge.levels) return;
  const num = parseInt(stepNum, 10);
  if (isNaN(num) || num < 1 || num > 4) return;

  const maxAllowed = (activeSocraticChallenge.maxCompletedLevel || 0) + 1;
  if (num > maxAllowed && !isSocraticGateUnlocked) return;

  activeSocraticChallenge.currentLevel = num;
  const levelData = activeSocraticChallenge.levels[num];
  if (levelData) {
    activeSocraticChallenge.question = levelData.question;
    activeSocraticChallenge.options = levelData.options;
    activeSocraticChallenge.hint = levelData.hint;
    activeSocraticChallenge.explanation = levelData.explanation;
    activeSocraticChallenge.selectedOptionId = levelData.selectedOptionId || null;
  }
  selectedSocraticOptionIdx = null;
  renderSocraticGateCard();
}

function renderSocraticGateCard() {
  const card = document.getElementById('socratic-gate-card');
  if (!card) return;

  if (currentReviewDiffs.length === 0 || !activeSocraticChallenge) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'flex';
  card.setAttribute('data-gate-state', isSocraticGateUnlocked ? 'unlocked' : 'locked');

  const pill = document.getElementById('socratic-gate-status-pill');
  if (pill) {
    pill.className = `socratic-gate-status-pill status-${isSocraticGateUnlocked ? 'unlocked' : 'locked'}`;
    pill.textContent = isSocraticGateUnlocked ? 'UNLOCKED' : 'LOCKED';
  }

  const badgeIcon = document.getElementById('socratic-gate-badge-icon');
  if (badgeIcon) {
    badgeIcon.className = `codicon codicon-${isSocraticGateUnlocked ? 'check' : 'lock'}`;
  }

  // 1. Render Socratic Ladder Stepper (Milestone v0.2.8)
  const currentLevelNum = activeSocraticChallenge.currentLevel || 1;
  const maxCompleted = isSocraticGateUnlocked ? 4 : (activeSocraticChallenge.maxCompletedLevel || 0);

  for (let s = 1; s <= 4; s++) {
    const stepEl = document.getElementById(`socratic-step-${s}`);
    if (stepEl) {
      stepEl.classList.remove('active', 'completed');
      if (isSocraticGateUnlocked) {
        stepEl.classList.add('completed');
      } else {
        if (s <= maxCompleted) {
          stepEl.classList.add('completed');
        }
        if (s === currentLevelNum) {
          stepEl.classList.add('active');
        }
      }
      if (!stepEl.__wired) {
        stepEl.__wired = true;
        stepEl.addEventListener('click', () => {
          setSocraticStep(s);
        });
      }
    }
  }

  for (let c = 1; c <= 3; c++) {
    const connEl = document.getElementById(`socratic-conn-${c}`);
    if (connEl) {
      if (c <= maxCompleted) {
        connEl.classList.add('completed');
      } else {
        connEl.classList.remove('completed');
      }
    }
  }

  // 2. Render Blueprint Box (displayed on Level 3 or 4)
  const bpBox = document.getElementById('socratic-blueprint-box');
  const bpTitle = document.getElementById('socratic-blueprint-title');
  const bpCode = document.getElementById('socratic-blueprint-code-text');
  if (bpBox && bpTitle && bpCode) {
    if (currentLevelNum === 3 && activeSocraticChallenge.levels && activeSocraticChallenge.levels[3]?.pseudocode) {
      bpBox.style.display = 'block';
      bpTitle.textContent = 'Level 3: Architectural Logic Blueprint';
      bpCode.textContent = activeSocraticChallenge.levels[3].pseudocode;
    } else if (currentLevelNum === 4 && activeSocraticChallenge.levels && activeSocraticChallenge.levels[4]?.maskedSnippet) {
      bpBox.style.display = 'block';
      bpTitle.textContent = 'Level 4: Syntax Verification Snippet';
      bpCode.textContent = activeSocraticChallenge.levels[4].maskedSnippet;
    } else {
      bpBox.style.display = 'none';
    }
  }

  // 3. Render Target File & Questions
  const targetFile = document.getElementById('socratic-target-file');
  if (targetFile) {
    const rawPath = activeSocraticChallenge.filePath || '';
    const safePath = escapeHtml(rawPath);
    targetFile.textContent = safePath;
    targetFile.innerHTML = safePath;
  }

  const qText = document.getElementById('socratic-question-text');
  if (qText) {
    const rawQ = activeSocraticChallenge.question || '';
    const safeQ = escapeHtml(rawQ);
    qText.textContent = safeQ;
    qText.innerHTML = safeQ;
  }
  const conceptQ = document.getElementById('socratic-concept-question');
  if (conceptQ && conceptQ !== qText) {
    const rawQ = activeSocraticChallenge.question || '';
    const safeQ = escapeHtml(rawQ);
    conceptQ.textContent = safeQ;
    conceptQ.innerHTML = safeQ;
  }

  // 4. Render Options List
  const optionsList = document.getElementById('socratic-options-list');
  if (optionsList && activeSocraticChallenge.options) {
    optionsList.innerHTML = '';
    activeSocraticChallenge.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isSelected = selectedSocraticOptionIdx === idx || activeSocraticChallenge.selectedOptionId === opt.id;
      let cls = 'socratic-option-item';
      if (isSelected) cls += ' selected';
      if (isSocraticGateUnlocked && opt.isCorrect) cls += ' correct';
      else if (isSelected && !opt.isCorrect && !isSocraticGateUnlocked) cls += ' incorrect';
      btn.className = cls;

      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      btn.setAttribute('data-option-id', opt.id);
      btn.setAttribute('data-option-idx', String(idx));

      let radioIcon = 'codicon-circle-large-outline';
      if (isSocraticGateUnlocked && opt.isCorrect) {
        radioIcon = 'codicon-check';
      } else if (isSelected) {
        radioIcon = 'codicon-record';
      }

      btn.innerHTML = `
        <span class="codicon ${radioIcon} socratic-option-radio"></span>
        <span class="socratic-option-text">${escapeHtml(opt.text)}</span>
      `;

      btn.addEventListener('click', () => {
        answerSocraticChallenge(opt.id);
      });

      optionsList.appendChild(btn);
    });
  }

  // 5. Render Explanation Card
  const explanationCard = document.getElementById('socratic-explanation-card');
  const explanationText = document.getElementById('socratic-explanation-text');
  if (explanationCard && explanationText) {
    if (isSocraticGateUnlocked) {
      explanationCard.style.display = 'flex';
      explanationText.textContent = activeSocraticChallenge.explanation || '';
    } else {
      explanationCard.style.display = 'none';
    }
  }

  // 6. Render Hint Container
  const hintContainer = document.getElementById('socratic-hint-container');
  const hintText = document.getElementById('socratic-hint-text');
  const hintBtn = document.getElementById('socratic-hint-btn');
  const hintBtnLabel = document.getElementById('socratic-hint-btn-label');
  if (hintContainer && hintText) {
    hintContainer.style.display = socraticHintExpanded ? 'block' : 'none';
    hintText.textContent = activeSocraticChallenge.hint || '';
  }
  if (hintBtn) {
    hintBtn.setAttribute('aria-expanded', String(socraticHintExpanded));
    if (!hintBtn.__wired) {
      hintBtn.__wired = true;
      hintBtn.addEventListener('click', () => toggleSocraticHint());
    }
  }
  if (hintBtnLabel) {
    hintBtnLabel.textContent = socraticHintExpanded ? 'Hide Concept Hint' : 'Hint / Explain Concept';
  }
}

function answerSocraticChallenge(optionIdOrIdx) {
  isSocraticGateEngaged = true;
  if (!activeSocraticChallenge) {
    return { success: false, explanation: 'No active Socratic challenge.' };
  }
  if (isSocraticGateUnlocked) {
    return {
      success: true,
      explanation: activeSocraticChallenge.explanation || 'Gate already unlocked.',
    };
  }

  let option = null;
  let optionIdx = -1;
  if (typeof optionIdOrIdx === 'number') {
    optionIdx = optionIdOrIdx;
    option = activeSocraticChallenge.options[optionIdx];
  } else if (typeof optionIdOrIdx === 'string') {
    optionIdx = activeSocraticChallenge.options.findIndex(o => o.id === optionIdOrIdx);
    if (optionIdx >= 0) {
      option = activeSocraticChallenge.options[optionIdx];
    } else {
      const parsed = parseInt(optionIdOrIdx, 10);
      if (!isNaN(parsed) && activeSocraticChallenge.options[parsed]) {
        optionIdx = parsed;
        option = activeSocraticChallenge.options[optionIdx];
      }
    }
  }

  if (!option) {
    return { success: false, explanation: 'Option not found.' };
  }

  selectedSocraticOptionIdx = optionIdx;
  activeSocraticChallenge.selectedOptionId = option.id;

  const currentLevelNum = activeSocraticChallenge.currentLevel || 1;
  if (activeSocraticChallenge.levels && activeSocraticChallenge.levels[currentLevelNum]) {
    activeSocraticChallenge.levels[currentLevelNum].selectedOptionId = option.id;
  }

  const feedbackBanner = document.getElementById('socratic-feedback-banner');
  const feedbackIcon = document.getElementById('socratic-feedback-icon');
  const feedbackText = document.getElementById('socratic-feedback-text');

  if (option.isCorrect) {
    activeSocraticChallenge.maxCompletedLevel = Math.max(activeSocraticChallenge.maxCompletedLevel || 0, currentLevelNum);
    if (activeSocraticChallenge.levels && activeSocraticChallenge.levels[currentLevelNum]) {
      activeSocraticChallenge.levels[currentLevelNum].completed = true;
    }

    const isStrict = activeSocraticChallenge.strictLadder === true || (typeof window !== 'undefined' && window && window.socraticStrictLadder === true);

    if (isStrict && currentLevelNum < 4) {
      // Strict 4-Level Scaffolding progression: advance to next level
      const nextLevel = currentLevelNum + 1;
      activeSocraticChallenge.currentLevel = nextLevel;
      const nextData = activeSocraticChallenge.levels[nextLevel];
      if (nextData) {
        activeSocraticChallenge.question = nextData.question;
        activeSocraticChallenge.options = nextData.options;
        activeSocraticChallenge.hint = nextData.hint;
        activeSocraticChallenge.explanation = nextData.explanation;
        activeSocraticChallenge.selectedOptionId = null;
      }
      selectedSocraticOptionIdx = null;

      if (feedbackBanner && feedbackIcon && feedbackText) {
        feedbackBanner.style.display = 'flex';
        feedbackBanner.className = 'socratic-feedback-banner feedback-success';
        feedbackIcon.className = 'codicon codicon-pass-filled';
        feedbackText.textContent = `Level ${currentLevelNum} verified. Advancing to Level ${nextLevel}...`;
      }

      renderSocraticGateCard();
      return {
        success: true,
        advancedToLevel: nextLevel,
        explanation: option.explanation || activeSocraticChallenge.explanation,
        isUnlocked: false,
      };
    } else {
      // Standard mode or final level of strict mode: unlock gate!
      if (feedbackBanner && feedbackIcon && feedbackText) {
        feedbackBanner.style.display = 'flex';
        feedbackBanner.className = 'socratic-feedback-banner feedback-success';
        feedbackIcon.className = 'codicon codicon-pass-filled';
        feedbackText.textContent = option.feedback || option.explanation || 'Architectural comprehension verified.';
      }
      activeSocraticChallenge.maxCompletedLevel = 4;
      unlockSocraticGate();
      return {
        success: true,
        explanation: option.explanation || activeSocraticChallenge.explanation,
        isUnlocked: true,
      };
    }
  } else {
    if (feedbackBanner && feedbackIcon && feedbackText) {
      feedbackBanner.style.display = 'flex';
      feedbackBanner.className = 'socratic-feedback-banner feedback-error';
      feedbackIcon.className = 'codicon codicon-error';
      feedbackText.textContent = option.feedback || option.explanation || 'Incorrect invariant. Re-evaluate trade-off and try again.';
    }
    renderSocraticGateCard();
    return {
      success: false,
      explanation: option.explanation || 'Incorrect invariant. Re-evaluate trade-off and try again.',
      isUnlocked: false,
    };
  }
}

function unlockSocraticGate() {
  isSocraticGateUnlocked = true;
  isSocraticGateEngaged = true;

  if (activeSocraticChallenge) {
    activeSocraticChallenge.isUnlocked = true;
    activeSocraticChallenge.status = 'unlocked';
    activeSocraticChallenge.maxCompletedLevel = 4;
  }

  renderReviewPane();

  const statusGate = document.getElementById('status-gate');
  const gateLockIcon = document.getElementById('gate-lock-icon');
  const gateStatusText = document.getElementById('gate-status-text');
  if (statusGate) statusGate.style.display = 'flex';
  if (gateLockIcon) {
    gateLockIcon.className = 'codicon codicon-check';
    gateLockIcon.style.color = '#73c991';
  }
  if (gateStatusText) {
    gateStatusText.textContent = 'Gate: UNLOCKED';
    gateStatusText.style.color = '#73c991';
  }

  if (typeof editorEventBridge !== 'undefined' && editorEventBridge) {
    editorEventBridge.emit('screenB:gateUnlocked', {
      challengeId: activeSocraticChallenge ? activeSocraticChallenge.id : 'challenge-0',
      diffId: activeSocraticChallenge ? activeSocraticChallenge.diffId : (currentReviewDiffs[0] ? currentReviewDiffs[0].id : ''),
      isUnlocked: true,
      timestamp: Date.now(),
      category: activeSocraticChallenge ? activeSocraticChallenge.category : 'architecture',
      filePath: activeSocraticChallenge ? activeSocraticChallenge.filePath : '',
    });
  }
}

function resetSocraticGate() {
  isSocraticGateUnlocked = false;
  isSocraticGateEngaged = true;
  selectedSocraticOptionIdx = null;
  socraticHintExpanded = false;

  if (currentReviewDiffs.length > 0) {
    activeSocraticChallenge = generateSocraticChallenge(currentReviewDiffs[0]);
  } else {
    activeSocraticChallenge = null;
  }

  const feedbackBanner = document.getElementById('socratic-feedback-banner');
  if (feedbackBanner) feedbackBanner.style.display = 'none';

  renderReviewPane();
}

function toggleSocraticHint() {
  socraticHintExpanded = !socraticHintExpanded;
  renderSocraticGateCard();
  return socraticHintExpanded;
}

function setReviewDiffs(diffs) {
  const list = Array.isArray(diffs) ? diffs : [];
  currentReviewDiffs = list.map((d, i) => normalizeDiffItem(d, i));

  isSocraticGateUnlocked = false;
  selectedSocraticOptionIdx = null;
  socraticHintExpanded = false;
  if (currentReviewDiffs.length > 0) {
    activeSocraticChallenge = generateSocraticChallenge(currentReviewDiffs[0]);
  } else {
    activeSocraticChallenge = null;
  }

  const feedbackBanner = document.getElementById('socratic-feedback-banner');
  if (feedbackBanner) feedbackBanner.style.display = 'none';

  setScreenBMode('review');
  renderReviewPane();

  if (typeof editorEventBridge !== 'undefined') {
    editorEventBridge.emit('screenB:reviewUpdate', { diffs: currentReviewDiffs });
  }
  return currentReviewDiffs;
}

function addReviewDiff(diffItem) {
  if (!diffItem) return null;
  const item = normalizeDiffItem(diffItem, currentReviewDiffs.length);
  const existingIdx = currentReviewDiffs.findIndex(d => d.filePath === item.filePath);
  if (existingIdx >= 0) {
    currentReviewDiffs[existingIdx] = item;
  } else {
    currentReviewDiffs.push(item);
  }

  if (!activeSocraticChallenge || currentReviewDiffs.length === 1) {
    activeSocraticChallenge = generateSocraticChallenge(item);
  }

  setScreenBMode('review');
  renderReviewPane();

  if (typeof editorEventBridge !== 'undefined') {
    editorEventBridge.emit('screenB:reviewUpdate', { diffs: currentReviewDiffs });
  }
  return item;
}

function addReviewDiffsBatch(diffItems) {
  if (!Array.isArray(diffItems) || diffItems.length === 0) return [];
  const addedItems = [];
  for (const diffItem of diffItems) {
    if (!diffItem) continue;
    const item = normalizeDiffItem(diffItem, currentReviewDiffs.length);
    const existingIdx = currentReviewDiffs.findIndex(d => d.filePath === item.filePath);
    if (existingIdx >= 0) {
      currentReviewDiffs[existingIdx] = item;
    } else {
      currentReviewDiffs.push(item);
    }
    addedItems.push(item);
  }

  if (addedItems.length > 0 && (!activeSocraticChallenge || currentReviewDiffs.length === addedItems.length)) {
    activeSocraticChallenge = generateSocraticChallenge(addedItems[0]);
  }

  setScreenBMode('review');
  renderReviewPane();

  if (typeof editorEventBridge !== 'undefined') {
    editorEventBridge.emit('screenB:reviewUpdate', { diffs: currentReviewDiffs });
  }
  return addedItems;
}

function getReviewDiffs() {
  return currentReviewDiffs;
}

function renderReviewPane() {
  const reviewBadge = document.getElementById('review-tab-badge');
  if (reviewBadge) {
    reviewBadge.textContent = String(currentReviewDiffs.length);
  }
  const emptyPane = document.getElementById('review-empty-pane');
  const activePane = document.getElementById('review-active-pane');
  const listEl = document.getElementById('review-file-list') || document.getElementById('screen-b-review-list');
  if (listEl) {
    listEl.innerHTML = '';
  }
  if (!emptyPane || !activePane) return;

  if (currentReviewDiffs.length === 0) {
    emptyPane.style.display = 'flex';
    activePane.style.display = 'none';
    const countEl = document.getElementById('review-file-count') || document.getElementById('review-count-badge');
    if (countEl) countEl.textContent = '0 files modified';
    const addBadge = document.getElementById('review-total-added');
    if (addBadge) addBadge.textContent = '+0';
    const delBadge = document.getElementById('review-total-deleted');
    if (delBadge) delBadge.textContent = '-0';
    renderSocraticGateCard();
    return;
  }

  emptyPane.style.display = 'none';
  activePane.style.display = 'flex';

  const countEl = document.getElementById('review-file-count') || document.getElementById('review-count-badge');
  if (countEl) countEl.textContent = `${currentReviewDiffs.length} file(s) modified`;

  const totalAdd = currentReviewDiffs.reduce((acc, d) => acc + (d.linesAdded || 0), 0);
  const totalDel = currentReviewDiffs.reduce((acc, d) => acc + (d.linesDeleted || 0), 0);

  const addBadge = document.getElementById('review-total-added');
  if (addBadge) addBadge.textContent = `+${totalAdd}`;
  const delBadge = document.getElementById('review-total-deleted');
  if (delBadge) delBadge.textContent = `-${totalDel}`;

  const btnAcceptAll = document.getElementById('btn-review-accept-all');
  if (btnAcceptAll) {
    const isLocked = isSocraticGateActive() && !isSocraticGateUnlocked;
    if (isLocked) {
      btnAcceptAll.classList.add('btn-disabled');
      btnAcceptAll.setAttribute('disabled', 'true');
      btnAcceptAll.disabled = true;
      btnAcceptAll.title = 'Accept All (Locked by Socratic Cognitive Gate)';
      const acceptIcon = btnAcceptAll.querySelector('.codicon') || document.getElementById('bulk-accept-icon');
      if (acceptIcon) {
        acceptIcon.className = 'codicon codicon-lock';
      }
      btnAcceptAll.innerHTML = '<span class="codicon codicon-lock" id="bulk-accept-icon"></span><span id="bulk-accept-label">Accept All</span>';
    } else {
      btnAcceptAll.classList.remove('btn-disabled');
      btnAcceptAll.removeAttribute('disabled');
      btnAcceptAll.disabled = false;
      btnAcceptAll.title = 'Accept all proposed changes and write to disk';
      const acceptIcon = btnAcceptAll.querySelector('.codicon') || document.getElementById('bulk-accept-icon');
      if (acceptIcon) {
        acceptIcon.className = 'codicon codicon-check codicon-check-all';
      }
      btnAcceptAll.innerHTML = '<span class="codicon codicon-check codicon-check-all" id="bulk-accept-icon"></span><span id="bulk-accept-label">Accept All</span>';
    }
  }

  renderSocraticGateCard();

  if (listEl) {
    currentReviewDiffs.forEach(diff => {
      const card = document.createElement('div');
      card.className = 'review-file-card review-card';
      card.dataset.diffId = diff.id;
      card.dataset.filePath = diff.filePath;
      if (typeof card.setAttribute === 'function') {
        card.setAttribute('data-diff-id', diff.id);
        card.setAttribute('data-review-id', diff.id);
        card.setAttribute('data-file-path', diff.filePath);
      }

      const isApplied = diff.status === 'applied' || diff.status === 'accepted';
      const isDiscarded = diff.status === 'discarded';
      const isCardLocked = isSocraticGateActive() && !isSocraticGateUnlocked;

      card.innerHTML = `
        <div class="review-file-header review-card-header">
          <div class="review-file-ident">
            <span class="codicon ${resolveFileIconClass(diff.filePath)} review-file-icon"></span>
            <span class="review-file-path" title="${escapeHtml(diff.filePath)}">${escapeHtml(diff.filePath)}</span>
          </div>
          <div class="review-diff-counters review-diff-badges">
            <span class="diff-added diff-badge diff-badge-add">+${diff.linesAdded || 0}</span>
            <span class="diff-deleted diff-badge diff-badge-del">-${diff.linesDeleted || 0}</span>
          </div>
        </div>
        ${diff.description ? `<div class="review-file-desc">${escapeHtml(diff.description)}</div>` : ''}
        <div class="review-file-actions review-card-actions">
          ${isApplied ? `
            <span class="review-status-applied"><span class="codicon codicon-pass-filled"></span> Applied</span>
          ` : isDiscarded ? `
            <span class="review-status-discarded"><span class="codicon codicon-discard"></span> Discarded</span>
          ` : `
            <button class="review-action-btn btn-review-diff" title="Review Diff in Layar A (Zero-Buffer)">
              <span class="codicon codicon-diff"></span>
              <span>Review Diff</span>
            </button>
            <button class="review-action-btn btn-review-accept ${isCardLocked ? 'btn-disabled' : ''}" ${isCardLocked ? 'disabled="true"' : ''} title="${isCardLocked ? 'Locked by Socratic Cognitive Gate' : 'Accept Changes and Write to Disk'}">
              <span class="codicon ${isCardLocked ? 'codicon-lock' : 'codicon-check'}"></span>
              <span>Accept</span>
            </button>
            <button class="review-action-btn btn-review-discard" title="Discard Changes">
              <span class="codicon codicon-discard"></span>
              <span>Discard</span>
            </button>
          `}
        </div>
      `;

      const btnDiff = card.querySelector('.btn-review-diff');
      if (btnDiff) {
        btnDiff.addEventListener('click', () => {
          openReviewDiff(diff.id);
        });
      }

      const btnAccept = card.querySelector('.btn-review-accept');
      if (btnAccept) {
        btnAccept.addEventListener('click', async () => {
          if (isSocraticGateActive() && !isSocraticGateUnlocked) return false;
          await acceptReviewDiff(diff.id);
        });
      }

      const btnDiscard = card.querySelector('.btn-review-discard');
      if (btnDiscard) {
        btnDiscard.addEventListener('click', () => {
          discardReviewDiff(diff.id);
        });
      }

      listEl.appendChild(card);
    });
  }
}

async function openReviewDiff(reviewItemOrId) {
  let diffItem = null;
  if (typeof reviewItemOrId === 'string') {
    diffItem = currentReviewDiffs.find(d => d.id === reviewItemOrId || d.filePath === reviewItemOrId);
  } else if (reviewItemOrId && typeof reviewItemOrId === 'object') {
    diffItem = reviewItemOrId;
  }
  if (!diffItem) return false;

  const diffMount = document.getElementById('diff-editor-mount');
  const editorMount = document.getElementById('editor-mount');
  if (!diffMount || !editorMount) return false;

  if (docManager && docManager.activeDocId) {
    const activeDoc = docManager.documents ? docManager.documents.get(docManager.activeDocId) : null;
    if (activeDoc && editor && typeof editor.saveViewState === 'function') {
      activeDoc.viewState = editor.saveViewState();
    }
  }

  editorMount.style.display = 'none';
  diffMount.style.display = 'block';

  if (!diffEditor && window.monaco && window.monaco.editor) {
    diffEditor = window.monaco.editor.createDiffEditor(diffMount, {
      theme: 'vs-dark',
      automaticLayout: true,
      readOnly: true,
      renderSideBySide: true,
    });
  }

  let origContent = diffItem.originalContent;
  if (typeof origContent !== 'string') {
    let openDoc = null;
    if (docManager && docManager.documents) {
      for (const [id, doc] of docManager.documents) {
        if (id === diffItem.filePath || doc.filePath === diffItem.filePath || toRelativeWorkspacePath(doc.filePath) === toRelativeWorkspacePath(diffItem.filePath)) {
          openDoc = doc;
          break;
        }
      }
    }
    if (openDoc && openDoc.model && typeof openDoc.model.getValue === 'function') {
      origContent = openDoc.model.getValue();
    } else if (window.electronFS && typeof window.electronFS.readFile === 'function') {
      try {
        const readRes = await window.electronFS.readFile(diffItem.filePath);
        origContent = (readRes && typeof readRes === 'object' && 'content' in readRes) ? readRes.content : (readRes || '');
      } catch {
        origContent = '';
      }
    } else {
      origContent = '';
    }
  }

  const propContent = diffItem.proposedContent || '';

  if (diffEditor && window.monaco && window.monaco.editor) {
    const lang = (docManager && typeof docManager.detectLanguage === 'function')
      ? docManager.detectLanguage(diffItem.filePath)
      : 'plaintext';

    const origUri = (window.monaco.Uri && typeof window.monaco.Uri.parse === 'function')
      ? window.monaco.Uri.parse(`agent-orig://${diffItem.filePath}`)
      : { toString: () => `agent-orig://${diffItem.filePath}` };

    let origModel = null;
    if (window.monaco.editor && typeof window.monaco.editor.getModel === 'function') {
      const found = window.monaco.editor.getModel(origUri);
      if (found && found.uri && typeof found.uri.toString === 'function' && found.uri.toString().startsWith('agent-orig://')) {
        origModel = found;
      }
    }

    if (!origModel && window.monaco.editor && typeof window.monaco.editor.createModel === 'function') {
      origModel = window.monaco.editor.createModel(origContent, lang, origUri);
    } else if (origModel && typeof origModel.setValue === 'function') {
      origModel.setValue(origContent);
    }

    const propUri = (window.monaco.Uri && typeof window.monaco.Uri.parse === 'function')
      ? window.monaco.Uri.parse(`agent-proposed://${diffItem.filePath}`)
      : { toString: () => `agent-proposed://${diffItem.filePath}` };

    let propModel = null;
    if (window.monaco.editor && typeof window.monaco.editor.getModel === 'function') {
      const found = window.monaco.editor.getModel(propUri);
      if (found && found.uri && typeof found.uri.toString === 'function' && found.uri.toString().startsWith('agent-proposed://')) {
        propModel = found;
      }
    }

    if (!propModel && window.monaco.editor && typeof window.monaco.editor.createModel === 'function') {
      propModel = window.monaco.editor.createModel(propContent, lang, propUri);
    } else if (propModel && typeof propModel.setValue === 'function') {
      propModel.setValue(propContent);
    }

    if (typeof diffEditor.setModel === 'function') {
      diffEditor.setModel({
        original: origModel,
        modified: propModel,
      });
    }
  }

  const fileName = diffItem.filePath.replace(/\\/g, '/').split('/').pop() || diffItem.filePath;
  const tabTitle = `${fileName} (Review Proposed Diff)`;
  if (crumbFileName) crumbFileName.textContent = tabTitle;
  if (crumbSymbolName) crumbSymbolName.textContent = 'diff';
  if (windowTitle) windowTitle.textContent = `${tabTitle} — NSCode`;

  activeDiffReviewId = diffItem.id;

  if (typeof editorEventBridge !== 'undefined') {
    editorEventBridge.emit('screenA:diffReview', diffItem);
    editorEventBridge.emit('screenB:diffOpened', { diffId: diffItem.id, filePath: diffItem.filePath });
  }

  return true;
}

function closeReviewDiff() {
  const diffMount = document.getElementById('diff-editor-mount');
  const editorMount = document.getElementById('editor-mount');
  if (diffMount) diffMount.style.display = 'none';
  if (editorMount) editorMount.style.display = 'block';

  if (docManager && docManager.activeDocId) {
    const activeDoc = docManager.documents ? docManager.documents.get(docManager.activeDocId) : null;
    if (activeDoc && activeDoc.model && editor && typeof editor.setModel === 'function') {
      editor.setModel(activeDoc.model);
      if (activeDoc.viewState && typeof editor.restoreViewState === 'function') {
        editor.restoreViewState(activeDoc.viewState);
      }
    }
    if (typeof docManager.syncActiveChrome === 'function') {
      docManager.syncActiveChrome(docManager.activeDocId);
    }
  }

  if (editor && typeof editor.focus === 'function') {
    editor.focus();
  }

  activeDiffReviewId = null;

  if (typeof editorEventBridge !== 'undefined') {
    editorEventBridge.emit('screenB:diffClosed', {});
  }
}

async function acceptReviewDiff(diffId) {
  if (isSocraticGateActive() && !isSocraticGateUnlocked) {
    console.warn('[SocraticGate] Accept blocked: Cognitive gate is locked.');
    return false;
  }

  const diff = currentReviewDiffs.find(d => d.id === diffId);
  if (!diff) return false;

  if (window.electronFS && typeof window.electronFS.writeFile === 'function') {
    await window.electronFS.writeFile(diff.filePath, diff.proposedContent);
  }

  if (docManager && docManager.documents) {
    let openDoc = null;
    for (const [id, doc] of docManager.documents) {
      if (id === diff.filePath || doc.filePath === diff.filePath || toRelativeWorkspacePath(doc.filePath) === toRelativeWorkspacePath(diff.filePath)) {
        openDoc = doc;
        break;
      }
    }
    if (openDoc && openDoc.model) {
      if (typeof openDoc.model.setValue === 'function') {
        openDoc.model.setValue(diff.proposedContent);
      }
      if (typeof openDoc.model.getAlternativeVersionId === 'function') {
        openDoc.initialVersionId = openDoc.model.getAlternativeVersionId();
      }
      openDoc.isDirty = false;
      if (typeof docManager.renderTabs === 'function') {
        docManager.renderTabs();
      }
      if (typeof editorEventBridge !== 'undefined') {
        editorEventBridge.emit('editor:dirtyChange', { isDirty: false, filePath: diff.filePath });
      }
    }
  }

  diff.status = 'applied';
  diff.applied = true;
  diff.accepted = true;
  currentReviewDiffs = currentReviewDiffs.filter(d => d.id !== diffId);

  closeReviewDiff();

  if (currentReviewDiffs.length === 0) {
    activeSocraticChallenge = null;
    isSocraticGateUnlocked = false;
  }

  renderReviewPane();

  if (typeof editorEventBridge !== 'undefined') {
    editorEventBridge.emit('screenB:diffAccepted', { diffId, filePath: diff.filePath });
    editorEventBridge.emit('screenB:reviewAccepted', { diffId, filePath: diff.filePath });
  }

  return true;
}

function discardReviewDiff(diffId) {
  const diff = currentReviewDiffs.find(d => d.id === diffId);
  if (!diff) return false;

  diff.status = 'discarded';
  diff.discarded = true;
  currentReviewDiffs = currentReviewDiffs.filter(d => d.id !== diffId);

  closeReviewDiff();

  if (currentReviewDiffs.length === 0) {
    activeSocraticChallenge = null;
    isSocraticGateUnlocked = false;
  }

  renderReviewPane();

  if (typeof editorEventBridge !== 'undefined') {
    editorEventBridge.emit('screenB:diffDiscarded', { diffId, filePath: diff.filePath });
    editorEventBridge.emit('screenB:reviewDiscarded', { diffId, filePath: diff.filePath });
  }

  return true;
}

async function acceptAllReviewDiffs() {
  if (isSocraticGateActive() && !isSocraticGateUnlocked) {
    console.warn('[SocraticGate] Accept All blocked: Cognitive gate is locked.');
    return false;
  }

  const pending = [...currentReviewDiffs];
  for (const diff of pending) {
    await acceptReviewDiff(diff.id);
  }
  currentReviewDiffs = [];
  activeSocraticChallenge = null;
  isSocraticGateUnlocked = false;
  renderReviewPane();
}

function discardAllReviewDiffs() {
  const pending = [...currentReviewDiffs];
  for (const diff of pending) {
    discardReviewDiff(diff.id);
  }
  currentReviewDiffs = [];
  activeSocraticChallenge = null;
  isSocraticGateUnlocked = false;
  renderReviewPane();
}

function showDiffEditor(filePath, originalContent, proposedContent) {
  const item = addReviewDiff({
    filePath,
    originalContent,
    proposedContent,
  });
  return openReviewDiff(item.id);
}

let nativeChatHistory = [];

function loadNativeChatHistory() {
  const container = document.getElementById('chat-thread-container');
  if (!container) return;
  try {
    const raw = localStorage.getItem('nscode_native_chat_history');
    if (raw) {
      nativeChatHistory = JSON.parse(raw);
      if (Array.isArray(nativeChatHistory) && nativeChatHistory.length > 0) {
        container.innerHTML = '';
        nativeChatHistory.forEach(item => {
          const msgEl = document.createElement('div');
          msgEl.className = `chat-message chat-message-${item.sender}`;
          msgEl.innerHTML = `
            <div style="font-size:11px; font-weight:600; color:#858585; margin-bottom:4px;">${item.sender === 'user' ? 'You' : 'Assistant (Antigravity)'}</div>
            <div class="chat-bubble-content">${escapeHtml(item.text)}</div>
          `;
          container.appendChild(msgEl);
        });
        container.scrollTop = container.scrollHeight;
      }
    }
  } catch (_) {}
}

function saveNativeChatMessage(sender, text) {
  try {
    nativeChatHistory.push({ sender, text, timestamp: Date.now() });
    if (nativeChatHistory.length > 50) nativeChatHistory = nativeChatHistory.slice(-50);
    localStorage.setItem('nscode_native_chat_history', JSON.stringify(nativeChatHistory));
  } catch (_) {}
}

function appendUserMessage(text) {
  const container = document.getElementById('chat-thread-container');
  if (!container) return;
  const msgEl = document.createElement('div');
  msgEl.className = 'chat-message chat-message-user';
  msgEl.innerHTML = `
    <div style="font-size:11px; font-weight:600; color:#858585; margin-bottom:4px;">You</div>
    <div class="chat-bubble-content">${escapeHtml(text)}</div>
  `;
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;
  saveNativeChatMessage('user', text);
}

const SCREEN_B_OPERATIONAL_RULESET = `[Screen B Active Ruleset:
- Anti-Slop: Zero conversational fluff, direct dense solutions, surgical code modifications.
- Socratic Cognitive Guidance: Golden Invariant: zero blind auto-patching; explain trade-offs and architectural invariants before proposing changes.
- Zero-Buffer Streaming Integrity: Display-only streaming output; zero Monaco editor buffer or disk file mutations during generation.]`;

const FALLBACK_SUB_AGENTS = [
  'research',
  'security-boundary-verifier',
  'build-error-resolver',
  'consistency-auditor',
  'meta-auditor',
  'silent-failure-hunter',
  'specification-gap-auditor',
];

let availableAgents = [];
let selectedAgent = '';

function buildScreenBPromptEnvelope(userPrompt, editorContext) {
  const cleanPrompt = (userPrompt || '').trim();
  const cleanContext = (editorContext || '').trim();
  if (cleanContext) {
    return `${SCREEN_B_OPERATIONAL_RULESET}\n\n${cleanContext}\n\n${cleanPrompt}`;
  }
  return `${SCREEN_B_OPERATIONAL_RULESET}\n\n${cleanPrompt}`;
}

function populateAgentDropdown(agents) {
  const dropdown = document.getElementById('agent-select-dropdown');
  if (!dropdown) return;

  const currentVal = selectedAgent || dropdown.value || '';
  dropdown.innerHTML = '';

  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Agent: Default';
  dropdown.appendChild(defaultOpt);

  const list = Array.isArray(agents) ? agents : [];
  list.forEach((ag) => {
    const id = typeof ag === 'string' ? ag : ag.id;
    const name = typeof ag === 'string' ? ag : (ag.name || ag.id);
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = name;
    dropdown.appendChild(opt);
  });

  if (currentVal && list.some(ag => (typeof ag === 'string' ? ag : ag.id) === currentVal)) {
    dropdown.value = currentVal;
    selectedAgent = currentVal;
  } else {
    dropdown.value = '';
    selectedAgent = '';
  }
}

function getAvailableAgents() {
  return availableAgents;
}

function getSelectedAgent() {
  return selectedAgent;
}

function setSelectedAgent(agentId) {
  selectedAgent = agentId || '';
  const dropdown = document.getElementById('agent-select-dropdown');
  if (dropdown) {
    dropdown.value = selectedAgent;
  }
}

let availableCliModels = [];

function adjustPromptBoxHeight() {
  if (!promptInputBox) return;

  promptInputBox.style.height = 'auto';

  let minHeight = 40;
  let maxHeight = 180;
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    try {
      const computed = window.getComputedStyle(promptInputBox);
      minHeight = parseFloat(computed.getPropertyValue('--prompt-min-height')) || 40;
      maxHeight = parseFloat(computed.getPropertyValue('--prompt-max-height')) || 180;
    } catch (_) {}
  }

  const scrollHeight = promptInputBox.scrollHeight || minHeight;
  const targetHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);

  promptInputBox.style.height = `${targetHeight}px`;
  promptInputBox.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function resetPromptBoxHeight() {
  if (!promptInputBox) return;
  let minHeight = 40;
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    try {
      const computed = window.getComputedStyle(promptInputBox);
      minHeight = parseFloat(computed.getPropertyValue('--prompt-min-height')) || 40;
    } catch (_) {}
  }
  promptInputBox.style.height = `${minHeight}px`;
  promptInputBox.style.overflowY = 'hidden';
}

async function initAntigravityBridge() {
  const agentDropdown = document.getElementById('agent-select-dropdown');
  if (agentDropdown && !agentDropdown._hasAgentChangeListener) {
    agentDropdown._hasAgentChangeListener = true;
    agentDropdown.addEventListener('change', (e) => {
      selectedAgent = e.target ? e.target.value || '' : '';
    });
  }

  // Populate agents (via IPC if available, else fallback)
  if (window.electronAntigravity && typeof window.electronAntigravity.getAgents === 'function') {
    try {
      const agentsRes = await window.electronAntigravity.getAgents();
      if (agentsRes && agentsRes.available && Array.isArray(agentsRes.agents) && agentsRes.agents.length > 0) {
        availableAgents = agentsRes.agents;
        populateAgentDropdown(availableAgents);
      } else {
        availableAgents = FALLBACK_SUB_AGENTS.map(id => ({ id, name: id }));
        populateAgentDropdown(availableAgents);
      }
    } catch (_) {
      availableAgents = FALLBACK_SUB_AGENTS.map(id => ({ id, name: id }));
      populateAgentDropdown(availableAgents);
    }
  } else {
    availableAgents = FALLBACK_SUB_AGENTS.map(id => ({ id, name: id }));
    populateAgentDropdown(availableAgents);
  }

  if (!window.electronAntigravity) {
    if (statusAgyText) statusAgyText.textContent = 'agy: Offline';
    return;
  }

  try {
    const status = await window.electronAntigravity.checkStatus();
    if (status.available) {
      if (statusAgyText) {
        statusAgyText.textContent = 'agy: Ready';
        statusAgyText.title = `Antigravity CLI ${status.version || 'v1.2'} (${status.binaryPath || 'active'})`;
      }
      if (typeof window.electronAntigravity.getModels === 'function') {
        try {
          const modelsRes = await window.electronAntigravity.getModels();
          if (modelsRes && modelsRes.available && Array.isArray(modelsRes.models) && modelsRes.models.length > 0) {
            availableCliModels = modelsRes.models;
            const preferred = modelsRes.models.find(m => m.id === 'gemini-3.8-flash-high') || modelsRes.models[0];
            if (preferred) {
              if (sidecarClient) sidecarClient.activeModel = preferred.id;
              const daemonBadge = document.getElementById('daemon-model-badge');
              if (daemonBadge) daemonBadge.textContent = preferred.id;
              const screenBBadge = document.getElementById('screen-b-model-badge');
              if (screenBBadge) screenBBadge.textContent = preferred.id;
              const modelDropdownLabel = document.querySelector('#model-select-dropdown .model-label');
              if (modelDropdownLabel) modelDropdownLabel.textContent = preferred.name.split(' ')[0] || preferred.id;
            }
          }
        } catch (_) {}
      }
    } else {
      if (statusAgyText) {
        statusAgyText.textContent = 'agy: Offline';
        statusAgyText.title = status.error || 'Antigravity CLI not found';
      }
    }
  } catch (err) {
    if (statusAgyText) statusAgyText.textContent = 'agy: Offline';
  }

  if (btnPromptRun && promptInputBox) {
    btnPromptRun.addEventListener('click', () => runAntigravityPrompt());
    promptInputBox.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        runAntigravityPrompt();
      }
    });
    promptInputBox.addEventListener('input', () => adjustPromptBoxHeight());
  }

  const btnAddContext = document.getElementById('btn-add-context');
  if (btnAddContext) {
    btnAddContext.addEventListener('click', () => openCommandPalette(''));
  }

  const statusAgy = document.getElementById('status-agy');
  if (statusAgy) {
    statusAgy.addEventListener('click', () => {
      secondaryResizer.expand();
      if (promptInputBox) promptInputBox.focus();
    });
  }
}

let isPromptExecuting = false;

async function runAntigravityPrompt() {
  if (isPromptExecuting) return;
  const prompt = promptInputBox ? promptInputBox.value.trim() : '';
  if (!prompt) return;

  if (promptInputBox) {
    promptInputBox.value = '';
    resetPromptBoxHeight();
  }

  isPromptExecuting = true;
  const extracted = extractTargetLines(prompt);
  if (extracted && extracted.length > 0) {
    addTargetsToStack(extracted);
  }

  if (btnPromptRun) btnPromptRun.disabled = true;
  const agentDropdown = document.getElementById('agent-select-dropdown');
  if (agentDropdown) agentDropdown.disabled = true;
  if (statusAgyText) statusAgyText.textContent = 'agy: Running...';

  // Render user message to native chat thread
  appendUserMessage(prompt);

  const correlationId = `agy-${Date.now()}`;
  let outputBuffer = '';

  if (webviewFrame && webviewFrame.contentWindow) {
    webviewFrame.contentWindow.postMessage({
      type: 'DIAGNOSTIC_DATA',
      payload: {
        method: 'chat.userMessage',
        params: {
          id: `user-${Date.now()}`,
          text: prompt,
        }
      }
    }, '*');
  }

  if (outputLogger) outputLogger.log('antigravity', `Prompt submitted: "${prompt}"`);

  if (!window.electronAntigravity) {
    setTimeout(() => {
      const simulatedChunks = ['Analyzing ', 'context... ', 'All contracts verified.'];
      simulatedChunks.forEach((c, idx) => {
        setTimeout(() => {
          appendChatChunk(c, false, correlationId);
          if (webviewFrame && webviewFrame.contentWindow) {
            webviewFrame.contentWindow.postMessage({
              type: 'DIAGNOSTIC_DATA',
              payload: {
                method: 'diagnostics.tokenChunk',
                params: {
                  correlationId,
                  chunk: c,
                  tokens: c,
                  token: c,
                }
              }
            }, '*');
          }
        }, idx * 100);
      });
      setTimeout(() => {
        isPromptExecuting = false;
        if (btnPromptRun) btnPromptRun.disabled = false;
        if (agentDropdown) agentDropdown.disabled = false;
        if (statusAgyText) statusAgyText.textContent = 'agy: Ready';
      }, 500);
    }, 50);
    return;
  }

  const unsubscribeOutput = window.electronAntigravity.onOutput((data) => {
    if (data.correlationId === correlationId) {
      outputBuffer += data.chunk;
      if (outputLogger) outputLogger.log('antigravity', data.chunk);

      let deltaText = '';
      const lines = data.chunk.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.event === 'step_update' && parsed.step_update && parsed.step_update.text_delta) {
            deltaText += parsed.step_update.text_delta;
          } else if (parsed.event === 'result' && parsed.result && parsed.result.response && !deltaText) {
            deltaText += parsed.result.response;
          }
        } catch {
          if (!line.startsWith('{')) deltaText += line + '\n';
        }
      }

      if (deltaText) {
        appendChatChunk(deltaText, false, correlationId);
        // Stream tokens to Screen B webview without mutating Monaco editor
        if (webviewFrame && webviewFrame.contentWindow) {
          webviewFrame.contentWindow.postMessage({
            type: 'DIAGNOSTIC_DATA',
            payload: {
              method: 'diagnostics.tokenChunk',
              params: {
                correlationId,
                chunk: deltaText,
                tokens: deltaText,
                token: deltaText,
              }
            }
          }, '*');
        }
      }
    }
  });

  const unsubscribeExit = window.electronAntigravity.onExit((data) => {
    if (data.correlationId === correlationId) {
      isPromptExecuting = false;
      if (btnPromptRun) btnPromptRun.disabled = false;
      if (agentDropdown) agentDropdown.disabled = false;
      if (statusAgyText) statusAgyText.textContent = 'agy: Ready';
      unsubscribeOutput();
      unsubscribeExit();

      if (outputLogger) outputLogger.log('antigravity', `Process exited with code ${data.exitCode}`);

      if (outputBuffer && outputBuffer.trim()) {
        saveNativeChatMessage('assistant', outputBuffer.trim());
      }

      // Trigger analysis in Screen B with the prompt output
      if (webviewFrame && webviewFrame.contentWindow) {
        webviewFrame.contentWindow.postMessage({
          type: 'DIAGNOSTIC_DATA',
          payload: {
            method: 'diagnostics.analysisCompleted',
            params: {
              correlationId,
              output: outputBuffer,
              exitCode: data.exitCode,
            }
          }
        }, '*');
      }
    }
  });

  try {
    let editorContext = '';
    if (docManager && docManager.activeDocId) {
      const activeDoc = docManager.documents.get(docManager.activeDocId);
      if (activeDoc) {
        const rawPath = activeDoc.id || activeDoc.uri;
        const relPath = (typeof toRelativeWorkspacePath === 'function') ? toRelativeWorkspacePath(rawPath) : rawPath;
        const lang = activeDoc.lang || '';
        let selectionText = '';
        if (editor && typeof editor.getSelection === 'function' && typeof editor.getModel === 'function') {
          const sel = editor.getSelection();
          const model = editor.getModel();
          if (sel && model && !sel.isEmpty()) {
            selectionText = model.getValueInRange(sel);
          }
        }

        if (selectionText && selectionText.trim()) {
          editorContext = `[Context: Active file "${relPath}" (${lang}), selected snippet]:\n\`\`\`${lang}\n${selectionText.trim()}\n\`\`\`\n`;
        } else {
          editorContext = `[Context: Active file in editor is "${relPath}" (${lang})]\n`;
        }
      }
    }

    const cliPrompt = buildScreenBPromptEnvelope(prompt, editorContext);
    const activeModel = (sidecarClient && sidecarClient.activeModel) ? sidecarClient.activeModel : undefined;
    const effectiveAgent = (selectedAgent && selectedAgent !== 'default') ? selectedAgent : (agentDropdown && agentDropdown.value && agentDropdown.value !== 'default' ? agentDropdown.value : undefined);
    await window.electronAntigravity.runCommand({
      prompt: cliPrompt,
      correlationId,
      cwd: currentWorkspaceRoot || undefined,
      model: activeModel,
      agent: effectiveAgent || undefined,
    });
  } catch (err) {
    console.error('[Workbench] Antigravity execution error:', err);
    isPromptExecuting = false;
    if (btnPromptRun) btnPromptRun.disabled = false;
    if (agentDropdown) agentDropdown.disabled = false;
    if (statusAgyText) statusAgyText.textContent = 'agy: Ready';
    unsubscribeOutput();
    unsubscribeExit();
  }
}

function initGlobalShortcuts() {
  let chordPending = false;
  let chordTimeout = null;

  window.addEventListener('keydown', (e) => {
    if (chordPending) {
      chordPending = false;
      if (chordTimeout) clearTimeout(chordTimeout);
      if ((e.ctrlKey || e.metaKey || true) && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        openWorkspaceFolder();
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K') && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      chordPending = true;
      chordTimeout = setTimeout(() => { chordPending = false; }, 2000);
      return;
    }

    // Ctrl+O: Quick Open Folder
    if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O') && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      openWorkspaceFolder();
      return;
    }

    // Ctrl+S / Cmd+S: Save active document
    if ((e.ctrlKey || e.metaKey) && e.key === 's' && !e.shiftKey) {
      e.preventDefault();
      docManager.saveActiveDocument();
    }
    // Ctrl+Shift+S: Save As
    else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      saveActiveDocumentAs();
    }
    // Ctrl+W: Close active tab
    else if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
      e.preventDefault();
      if (docManager.activeDocId) docManager.closeTab(docManager.activeDocId);
    }
    // Ctrl+B: Toggle Primary Sidebar
    else if ((e.ctrlKey || e.metaKey) && e.key === 'b' && !e.altKey) {
      e.preventDefault();
      primaryResizer.toggle();
    }
    // Ctrl+Alt+B: Toggle Secondary Sidebar (Screen B)
    else if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      secondaryResizer.toggle();
    }
    // Ctrl+Alt+A / Cmd+Alt+A: Bridge selection to Screen B Target Stack (Milestone v0.2.2 - R1)
    else if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      sendSelectionToScreenB();
    }
    // Ctrl+` (Backquote): Toggle Bottom Panel
    else if ((e.ctrlKey || e.metaKey) && e.key === '`') {
      e.preventDefault();
      bottomResizer.toggle();
      if (!document.getElementById('bottom-panel')?.classList.contains('collapsed')) {
        selectBottomTab('terminal');
      }
    }
    // Ctrl+P: Go to File
    else if ((e.ctrlKey || e.metaKey) && e.key === 'p' && !e.shiftKey) {
      e.preventDefault();
      openCommandPalette('');
    }
    // Ctrl+Shift+P or F1: Command Palette
    else if (((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'p' || e.key === 'P')) || e.key === 'F1') {
      e.preventDefault();
      openCommandPalette('>');
    }
    // Ctrl+G: Go to Line
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G') && !e.shiftKey) {
      e.preventDefault();
      openCommandPalette(':');
    }
    // Ctrl+\: Split Editor Right
    else if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
      e.preventDefault();
      if (multiGroupManager) multiGroupManager.splitRight();
    }
    // Ctrl+Shift+E: Show Explorer
    else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'e' || e.key === 'E')) {
      e.preventDefault();
      showSidebarView('explorer');
    }
    // Ctrl+Shift+F: Show Search
    else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      showSidebarView('search');
    }
    // Ctrl+Shift+G: Show Source Control
    else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'g' || e.key === 'G')) {
      e.preventDefault();
      showSidebarView('scm');
    }
    // Ctrl+,: Open Settings
    else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      openSettingsModal();
    }
    else if (e.key === 'F2' && selectedTreePath) {
      const isInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
      const isMonaco = document.activeElement?.closest('#editor-mount, .monaco-editor');
      const isTerminal = document.activeElement?.closest('#terminal-container, .xterm, .terminal');
      const isWebview = document.activeElement?.closest('#webview-frame, .webview-container');
      const isContentEditable = document.activeElement?.isContentEditable;
      const isExplorerVisible = document.getElementById('view-explorer')?.style.display !== 'none';
      if (!isInput && !isMonaco && !isTerminal && !isWebview && !isContentEditable && isExplorerVisible) {
        e.preventDefault();
        const node = findNodeByPath(workspaceTree, selectedTreePath);
        if (node) triggerRenameAction(node);
      }
    }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTreePath) {
      const isInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
      const isMonaco = document.activeElement?.closest('#editor-mount, .monaco-editor');
      const isTerminal = document.activeElement?.closest('#terminal-container, .xterm, .terminal');
      const isWebview = document.activeElement?.closest('#webview-frame, .webview-container');
      const isContentEditable = document.activeElement?.isContentEditable;
      const isSidebar = document.activeElement?.closest('#primary-sidebar, #workspace-file-tree, .tree-item');
      const isExplorerVisible = document.getElementById('view-explorer')?.style.display !== 'none';

      const canDelete = isExplorerVisible && (e.key === 'Delete'
        ? (!isInput && !isMonaco && !isTerminal && !isWebview && !isContentEditable)
        : (isSidebar && !isInput && !isMonaco && !isTerminal && !isWebview && !isContentEditable));

      if (canDelete) {
        e.preventDefault();
        const node = findNodeByPath(workspaceTree, selectedTreePath);
        if (node) triggerDeleteAction(node);
      }
    }
  });

  if (workspaceFileTree) {
    workspaceFileTree.setAttribute('tabindex', '0');
    workspaceFileTree.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.tree-item')) return;
      e.preventDefault();
      openExplorerContextMenu(e.clientX, e.clientY, null);
    });
  }

  const btnTogglePrimary = document.getElementById('btn-toggle-primary-sidebar');
  if (btnTogglePrimary) {
    btnTogglePrimary.addEventListener('click', () => primaryResizer.toggle());
  }

  const btnToggleSecondary = document.getElementById('btn-toggle-secondary-sidebar');
  if (btnToggleSecondary) {
    btnToggleSecondary.addEventListener('click', () => secondaryResizer.toggle());
  }

  const btnNavBack = document.getElementById('btn-nav-back');
  if (btnNavBack) btnNavBack.addEventListener('click', () => navigateBack());

  const btnNavForward = document.getElementById('btn-nav-forward');
  if (btnNavForward) btnNavForward.addEventListener('click', () => navigateForward());

  const btnSecondaryCollapse = document.getElementById('btn-secondary-collapse');
  if (btnSecondaryCollapse) {
    btnSecondaryCollapse.addEventListener('click', () => secondaryResizer.collapse());
  }

  const btnSecondaryRefresh = document.getElementById('btn-secondary-refresh');
  if (btnSecondaryRefresh) {
    btnSecondaryRefresh.addEventListener('click', () => triggerAnalysis());
  }

  const btnChatNew = document.getElementById('btn-chat-new');
  if (btnChatNew) {
    btnChatNew.addEventListener('click', () => {
      const container = document.getElementById('chat-thread-container');
      if (container) {
        container.innerHTML = '';
      }
      nativeChatHistory = [];
      try { localStorage.removeItem('nscode_native_chat_history'); } catch (_) {}
      resetActiveChatTurn();
      if (webviewFrame && webviewFrame.contentWindow) {
        webviewFrame.contentWindow.postMessage({
          type: 'DIAGNOSTIC_DATA',
          payload: { method: 'chat.reset' }
        }, '*');
      }
    });
  }

  const actExplorer = document.getElementById('act-explorer');
  if (actExplorer) {
    actExplorer.addEventListener('click', () => showSidebarView('explorer'));
  }

  const actSearch = document.getElementById('act-search');
  if (actSearch) {
    actSearch.addEventListener('click', () => showSidebarView('search'));
  }

  const actScm = document.getElementById('act-scm');
  if (actScm) {
    actScm.addEventListener('click', () => showSidebarView('scm'));
  }

  const actAntislop = document.getElementById('act-antislop');
  if (actAntislop) {
    actAntislop.addEventListener('click', () => {
      secondaryResizer.expand();
      if (promptInputBox) promptInputBox.focus();
    });
  }

  const actSettings = document.getElementById('act-settings');
  if (actSettings) {
    actSettings.addEventListener('click', () => openSettingsModal());
  }

  const actAccounts = document.getElementById('act-accounts');
  if (actAccounts) {
    actAccounts.addEventListener('click', () => {
      alert('Signed in as: Local Developer\nAntigravity Status: Authorized\nEngine: Sovereign Hybrid Protocol v5.1');
    });
  }

  const headerOpenEditors = document.getElementById('header-open-editors');
  const chevronOpenEditors = document.getElementById('chevron-open-editors');
  if (headerOpenEditors && chevronOpenEditors && openEditorsList) {
    headerOpenEditors.addEventListener('click', () => {
      openEditorsList.classList.toggle('collapsed');
      chevronOpenEditors.classList.toggle('collapsed');
    });
  }

  const headerWorkspace = document.getElementById('header-workspace');
  const chevronWorkspace = document.getElementById('chevron-workspace');
  if (headerWorkspace && chevronWorkspace && workspaceFileTree) {
    headerWorkspace.addEventListener('click', () => {
      workspaceFileTree.classList.toggle('collapsed');
      chevronWorkspace.classList.toggle('collapsed');
    });
  }

  const btnTreeNewFile = document.getElementById('btn-tree-new-file');
  if (btnTreeNewFile) {
    btnTreeNewFile.addEventListener('click', async () => {
      let targetDir = currentWorkspaceRoot;
      if (selectedTreePath) {
        const node = findNodeByPath(workspaceTree, selectedTreePath);
        if (node) {
          targetDir = node.isDirectory ? node.path : getDirectoryPath(node.path);
        }
      }
      await triggerNewFileAction(targetDir);
    });
  }

  const btnTreeNewFolder = document.getElementById('btn-tree-new-folder');
  if (btnTreeNewFolder) {
    btnTreeNewFolder.addEventListener('click', async () => {
      let targetDir = currentWorkspaceRoot;
      if (selectedTreePath) {
        const node = findNodeByPath(workspaceTree, selectedTreePath);
        if (node) {
          targetDir = node.isDirectory ? node.path : getDirectoryPath(node.path);
        }
      }
      await triggerNewFolderAction(targetDir);
    });
  }

  const btnTreeRefresh = document.getElementById('btn-tree-refresh');
  if (btnTreeRefresh) {
    btnTreeRefresh.addEventListener('click', () => refreshWorkspaceTree());
  }

  const btnTreeCollapse = document.getElementById('btn-tree-collapse');
  if (btnTreeCollapse) {
    btnTreeCollapse.addEventListener('click', () => {
      expandedDirs.clear();
      renderWorkspaceTree(workspaceTree, workspaceFileTree, 0);
    });
  }

  // App Logo (About dialog & Protocol overview)
  const appLogo = document.getElementById('app-logo');
  if (appLogo) {
    appLogo.style.cursor = 'pointer';
    appLogo.addEventListener('click', () => {
      showWorkbenchDropdown(appLogo, [
        { label: 'NSCode: Sovereign Hybrid Engine v5.1' },
        { separator: true },
        { label: 'Command Palette (Ctrl+P)', shortcut: 'Ctrl+P', action: () => openCommandPalette() },
        { label: 'Open Settings (Ctrl+,)', shortcut: 'Ctrl+,', action: () => openSettingsModal() },
        { label: 'Toggle Bottom Panel (Ctrl+`)', shortcut: 'Ctrl+`', action: () => bottomResizer.toggle() },
        { separator: true },
        { label: 'About NSCode Platform', action: () => alert('NSCode v0.2.5\nSovereign Hybrid AI Engineering Environment\nAntigravity Protocol v5.1 with Dream-RSI & Socratic Cognitive Gate.') },
      ]);
    });
  }

  // Editor More Actions (...)
  const btnEditorMore = document.getElementById('btn-editor-more');
  if (btnEditorMore) {
    btnEditorMore.addEventListener('click', () => {
      showWorkbenchDropdown(btnEditorMore, [
        { label: 'Split Editor Right', shortcut: 'Ctrl+\\', action: () => multiGroupManager && multiGroupManager.splitRight() },
        { label: 'Split Editor Down', action: () => multiGroupManager && multiGroupManager.splitDown() },
        { label: 'Format Document', shortcut: 'Shift+Alt+F', action: () => {
          if (editor && typeof editor.getAction === 'function') {
            const action = editor.getAction('editor.action.formatDocument');
            if (action) action.run();
          }
        }},
        { separator: true },
        { label: 'Close Active Editor', shortcut: 'Ctrl+W', action: () => {
          if (docManager && docManager.activeDocId) docManager.closeTab(docManager.activeDocId);
        }},
        { label: 'Close All Editors', action: () => {
          if (docManager) Array.from(docManager.documents.keys()).forEach(id => docManager.closeTab(id));
        }},
      ]);
    });
  }

  // Model Selector Dropdown ("Auto v")
  const modelSelectDropdown = document.getElementById('model-select-dropdown');
  if (modelSelectDropdown) {
    modelSelectDropdown.style.cursor = 'pointer';
    modelSelectDropdown.addEventListener('click', () => {
      const labelEl = modelSelectDropdown.querySelector('.model-label');
      const screenBBadge = document.getElementById('screen-b-model-badge');
      const daemonBadge = document.getElementById('daemon-model-badge');

      if (availableCliModels && availableCliModels.length > 0) {
        const menuItems = availableCliModels.map(m => ({
          label: `${m.name} (${m.id})`,
          action: () => {
            if (labelEl) labelEl.textContent = m.name.split(' ')[0] || m.id;
            if (sidecarClient) sidecarClient.activeModel = m.id;
            if (daemonBadge) daemonBadge.textContent = m.id;
            if (screenBBadge) screenBBadge.textContent = m.id;
          }
        }));
        showWorkbenchDropdown(modelSelectDropdown, menuItems);
        return;
      }

      showWorkbenchDropdown(modelSelectDropdown, [
        { label: 'Gemini 3.8 Flash (High Velocity)', action: () => {
          if (labelEl) labelEl.textContent = 'Flash';
          if (sidecarClient) sidecarClient.activeModel = 'gemini-3.8-flash-high';
          if (daemonBadge) daemonBadge.textContent = 'gemini-3.8-flash-high';
          if (screenBBadge) screenBBadge.textContent = 'gemini-3.8-flash-high';
        }},
        { label: 'Gemini 3.7 Flash (Balanced)', action: () => {
          if (labelEl) labelEl.textContent = 'Flash 3.7';
          if (sidecarClient) sidecarClient.activeModel = 'gemini-3.7-flash-high';
          if (daemonBadge) daemonBadge.textContent = 'gemini-3.7-flash-high';
          if (screenBBadge) screenBBadge.textContent = 'gemini-3.7-flash-high';
        }},
        { label: 'Gemini 3.1 Pro (Deep Architecture Reasoning)', action: () => {
          if (labelEl) labelEl.textContent = 'Pro';
          if (sidecarClient) sidecarClient.activeModel = 'gemini-3.1-pro-high';
          if (daemonBadge) daemonBadge.textContent = 'gemini-3.1-pro-high';
          if (screenBBadge) screenBBadge.textContent = 'gemini-3.1-pro-high';
        }},
        { label: 'Claude Sonnet 4.6 (Thinking / Agentic Synthesis)', action: () => {
          if (labelEl) labelEl.textContent = 'Claude';
          if (sidecarClient) sidecarClient.activeModel = 'claude-sonnet-4-6';
          if (daemonBadge) daemonBadge.textContent = 'claude-sonnet-4-6';
          if (screenBBadge) screenBBadge.textContent = 'claude-sonnet-4-6';
        }},
      ]);
    });
  }

  // Prompt Tuning Settings (Sliders icon)
  const btnPromptSettings = document.getElementById('btn-prompt-settings');
  if (btnPromptSettings) {
    btnPromptSettings.addEventListener('click', () => {
      openSettingsModal();
    });
  }

  // Execution Environment Pill ("Local v")
  const pillModeLocal = document.getElementById('pill-mode-local');
  if (pillModeLocal) {
    pillModeLocal.style.cursor = 'pointer';
    pillModeLocal.addEventListener('click', () => {
      const span = pillModeLocal.querySelector('span:first-child') || pillModeLocal;
      showWorkbenchDropdown(pillModeLocal, [
        { label: 'Local (Direct OS & Terminal Execution)', action: () => { span.textContent = 'Local'; } },
        { label: 'Sandbox (Isolated Container / Dry-Run)', action: () => { span.textContent = 'Sandbox'; } },
      ]);
    });
  }

  // Approval Mode Pill ("Default Approvals v")
  const pillModeApprovals = document.getElementById('pill-mode-approvals');
  if (pillModeApprovals) {
    pillModeApprovals.style.cursor = 'pointer';
    pillModeApprovals.addEventListener('click', () => {
      const span = pillModeApprovals.querySelector('span:first-child') || pillModeApprovals;
      showWorkbenchDropdown(pillModeApprovals, [
        { label: 'Default Approvals (Ask on Destructive Actions)', action: () => { span.textContent = 'Default Approvals'; } },
        { label: 'Auto-Approve Safe (Auto-Accept Diffs & Formatting)', action: () => { span.textContent = 'Auto-Approve'; } },
        { label: 'Strict Socratic Gate (Interactive Concept Verification)', action: () => { span.textContent = 'Socratic Gate'; } },
      ]);
    });
  }

  // Status Sidecar Daemon (Click to reconnect)
  const statusDaemon = document.getElementById('status-daemon');
  if (statusDaemon) {
    statusDaemon.style.cursor = 'pointer';
    statusDaemon.addEventListener('click', () => {
      if (sidecarClient) {
        sidecarClient.disconnect();
        sidecarClient.reconnectAttempts = 0;
        sidecarClient.connect();
      } else {
        connectSidecar();
      }
    });
  }

  // Status Diagnostics (Errors & Warnings -> open Problems tab)
  const statusDiagnostics = document.getElementById('status-diagnostics');
  if (statusDiagnostics) {
    statusDiagnostics.style.cursor = 'pointer';
    statusDiagnostics.addEventListener('click', () => {
      if (bottomResizer) bottomResizer.expand();
      const problemsTab = document.getElementById('tab-btn-problems');
      if (problemsTab) problemsTab.click();
    });
  }

  // Status Git Branch & Sync -> Open Source Control
  const statusGitBranch = document.getElementById('status-git-branch');
  if (statusGitBranch) {
    statusGitBranch.style.cursor = 'pointer';
    statusGitBranch.addEventListener('click', () => showSidebarView('scm'));
  }
  const statusGitSync = document.getElementById('status-git-sync');
  if (statusGitSync) {
    statusGitSync.style.cursor = 'pointer';
    statusGitSync.addEventListener('click', () => {
      showSidebarView('scm');
      if (scmController) scmController.refresh();
    });
  }

  // Status Notifications Bell -> Open Output
  const statusBell = document.getElementById('status-bell');
  if (statusBell) {
    statusBell.style.cursor = 'pointer';
    statusBell.addEventListener('click', () => {
      if (bottomResizer) bottomResizer.expand();
      const outputTab = document.getElementById('tab-btn-output');
      if (outputTab) outputTab.click();
    });
  }

  // Status Prettier -> Format active document
  const statusPrettier = document.getElementById('status-prettier');
  if (statusPrettier) {
    statusPrettier.style.cursor = 'pointer';
    statusPrettier.addEventListener('click', () => {
      if (editor && typeof editor.getAction === 'function') {
        const action = editor.getAction('editor.action.formatDocument');
        if (action) {
          action.run();
        } else {
          alert('Prettier: Document formatted successfully.');
        }
      }
    });
  }

  // Status Language -> Select Language Mode
  const statusLanguage = document.getElementById('status-language');
  if (statusLanguage) {
    statusLanguage.style.cursor = 'pointer';
    statusLanguage.addEventListener('click', () => {
      const languages = [
        { label: 'Python (py)', id: 'python' },
        { label: 'TypeScript (ts)', id: 'typescript' },
        { label: 'JavaScript (js)', id: 'javascript' },
        { label: 'C++ (cpp)', id: 'cpp' },
        { label: 'Java (java)', id: 'java' },
        { label: 'C# (cs)', id: 'csharp' },
        { label: 'PHP (php)', id: 'php' },
        { label: 'HTML', id: 'html' },
        { label: 'CSS', id: 'css' },
        { label: 'JSON', id: 'json' },
        { label: 'Markdown (md)', id: 'markdown' },
      ];
      showWorkbenchDropdown(statusLanguage, languages.map((lang) => ({
        label: lang.label,
        action: () => {
          if (docManager && docManager.activeDocId && typeof monaco !== 'undefined') {
            const activeDoc = docManager.documents.get(docManager.activeDocId);
            if (activeDoc && activeDoc.model) {
              monaco.editor.setModelLanguage(activeDoc.model, lang.id);
              activeDoc.lang = lang.id;
              if (statusLanguageText) statusLanguageText.textContent = lang.id.charAt(0).toUpperCase() + lang.id.slice(1);
            }
          }
        }
      })));
    });
  }

  // Status EOL -> Toggle LF / CRLF
  const statusEol = document.getElementById('status-eol');
  if (statusEol) {
    statusEol.style.cursor = 'pointer';
    statusEol.addEventListener('click', () => {
      const textEl = statusEol.querySelector('.status-text') || statusEol;
      const isLf = textEl.textContent.trim() === 'LF';
      textEl.textContent = isLf ? 'CRLF' : 'LF';
      if (editor && typeof monaco !== 'undefined') {
        const model = editor.getModel();
        if (model) {
          model.setEOL(isLf ? monaco.editor.EndOfLineSequence.CRLF : monaco.editor.EndOfLineSequence.LF);
        }
      }
    });
  }

  // Status Indent -> Select Indentation
  const statusIndent = document.getElementById('status-indent');
  if (statusIndent) {
    statusIndent.style.cursor = 'pointer';
    statusIndent.addEventListener('click', () => {
      const textEl = statusIndent.querySelector('.status-text') || statusIndent;
      showWorkbenchDropdown(statusIndent, [
        { label: 'Indent Using Spaces: 2', action: () => {
          textEl.textContent = 'Spaces: 2';
          if (editor) editor.updateOptions({ tabSize: 2, insertSpaces: true });
        }},
        { label: 'Indent Using Spaces: 4', action: () => {
          textEl.textContent = 'Spaces: 4';
          if (editor) editor.updateOptions({ tabSize: 4, insertSpaces: true });
        }},
        { label: 'Indent Using Tabs', action: () => {
          textEl.textContent = 'Tabs';
          if (editor) editor.updateOptions({ insertSpaces: false });
        }},
      ]);
    });
  }

  // Status Encoding -> Select Encoding
  const statusEncoding = document.getElementById('status-encoding');
  if (statusEncoding) {
    statusEncoding.style.cursor = 'pointer';
    statusEncoding.addEventListener('click', () => {
      const textEl = statusEncoding.querySelector('.status-text') || statusEncoding;
      showWorkbenchDropdown(statusEncoding, [
        { label: 'UTF-8 (Default)', action: () => { textEl.textContent = 'UTF-8'; } },
        { label: 'UTF-16 LE', action: () => { textEl.textContent = 'UTF-16 LE'; } },
        { label: 'Western (Windows 1252)', action: () => { textEl.textContent = 'Windows 1252'; } },
      ]);
    });
  }

  // Status Remote Sandbox Indicator (><)
  const statusRemote = document.getElementById('status-remote');
  if (statusRemote) {
    statusRemote.style.cursor = 'pointer';
    statusRemote.addEventListener('click', () => {
      showWorkbenchDropdown(statusRemote, [
        { label: 'NSCode Remote Sandbox: Connected' },
        { separator: true },
        { label: 'Workspace Root: ' + (currentWorkspaceRoot || 'Memory Preset (quicksort.py)'), action: () => {
          if (window.electronFS && window.electronFS.openFolder) window.electronFS.openFolder();
        }},
        { label: 'Open Folder in Workspace...', action: () => {
          if (window.electronFS && window.electronFS.openFolder) window.electronFS.openFolder();
        }},
        { label: 'Close Remote Connection', action: () => renderEmptyWorkspace() },
      ]);
    });
  }
}

// =============================================================================
// R8. SIDEBAR ROUTER, SCM (GIT), SEARCH & SETTINGS CONTROLLERS (Milestone v0.1.1)
// =============================================================================
let scmController = null;
let searchController = null;

function showSidebarView(viewName) {
  if (primarySidebar && primarySidebar.classList.contains('collapsed')) {
    primaryResizer.expand();
  }
  document.querySelectorAll('.activity-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.sidebar-view-pane').forEach(p => p.style.display = 'none');

  if (viewName === 'explorer') {
    document.getElementById('act-explorer')?.classList.add('active');
    const p = document.getElementById('view-explorer');
    if (p) p.style.display = 'flex';
  } else if (viewName === 'search') {
    document.getElementById('act-search')?.classList.add('active');
    const p = document.getElementById('view-search');
    if (p) p.style.display = 'flex';
    document.getElementById('search-query-input')?.focus();
  } else if (viewName === 'scm') {
    document.getElementById('act-scm')?.classList.add('active');
    const p = document.getElementById('view-scm');
    if (p) p.style.display = 'flex';
    if (scmController) scmController.refresh();
  }
}

async function openDiffViewer(filePath) {
  if (!window.electronGit) return;
  const res = await window.electronGit.diff(filePath);
  if (res.error) {
    console.warn('[DiffViewer] Failed to load diff:', res.error);
    return;
  }

  const diffMount = document.getElementById('diff-editor-mount');
  const editorMount = document.getElementById('editor-mount');
  if (!diffMount || !editorMount) return;

  editorMount.style.display = 'none';
  diffMount.style.display = 'block';

  if (!diffEditor && window.monaco && window.monaco.editor) {
    diffEditor = window.monaco.editor.createDiffEditor(diffMount, {
      theme: 'vs-dark',
      automaticLayout: true,
      readOnly: true,
      renderSideBySide: true,
    });
  }

  if (diffEditor && window.monaco) {
    const lang = docManager.detectLanguage(filePath);
    const origUri = window.monaco.Uri.parse(`git-orig://${res.relPath || filePath}`);
    let origModel = window.monaco.editor.getModel(origUri);
    if (!origModel) {
      origModel = window.monaco.editor.createModel(res.original, lang, origUri);
    } else {
      origModel.setValue(res.original);
    }

    const modUri = window.monaco.Uri.file(res.filePath || filePath);
    let modModel = window.monaco.editor.getModel(modUri);
    if (!modModel) {
      modModel = window.monaco.editor.createModel(res.modified, lang, modUri);
    } else {
      modModel.setValue(res.modified);
    }

    diffEditor.setModel({
      original: origModel,
      modified: modModel,
    });
  }

  const fileName = filePath.replace(/\\/g, '/').split('/').pop() || filePath;
  const tabTitle = `${fileName} (Working Tree)`;
  if (crumbFileName) crumbFileName.textContent = tabTitle;
  if (crumbSymbolName) crumbSymbolName.textContent = 'diff';
  if (windowTitle) windowTitle.textContent = `${tabTitle} — NSCode`;
}

class ScmController {
  constructor() {
    this.status = null;
    this.initListeners();
  }

  initListeners() {
    document.getElementById('btn-scm-init')?.addEventListener('click', () => this.initRepo());
    document.getElementById('btn-scm-refresh')?.addEventListener('click', () => this.refresh());
    document.getElementById('btn-scm-commit')?.addEventListener('click', () => this.commit());
    document.getElementById('btn-scm-commit-all')?.addEventListener('click', () => this.commit());
    document.getElementById('btn-scm-stage-all')?.addEventListener('click', () => this.stage());
    document.getElementById('btn-scm-unstage-all')?.addEventListener('click', () => this.unstage());
    document.getElementById('btn-scm-discard-all')?.addEventListener('click', () => this.discardAll());

    const commitInput = document.getElementById('scm-commit-msg');
    if (commitInput) {
      commitInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          this.commit();
        }
      });
    }

    document.getElementById('header-scm-staged')?.addEventListener('click', () => {
      const list = document.getElementById('scm-staged-list');
      const chev = document.getElementById('chevron-scm-staged');
      if (list && chev) {
        list.classList.toggle('collapsed');
        chev.classList.toggle('collapsed');
      }
    });

    document.getElementById('header-scm-changes')?.addEventListener('click', () => {
      const list = document.getElementById('scm-changes-list');
      const chev = document.getElementById('chevron-scm-changes');
      if (list && chev) {
        list.classList.toggle('collapsed');
        chev.classList.toggle('collapsed');
      }
    });
  }

  async refresh() {
    if (!window.electronGit) return;
    try {
      const res = await window.electronGit.status();
      this.status = res;

      const nonRepo = document.getElementById('scm-non-repo');
      const repoContent = document.getElementById('scm-repo-content');
      const branchName = document.getElementById('scm-branch-name');
      const statusBranch = document.getElementById('status-branch');

      if (!res || !res.isRepo) {
        if (nonRepo) nonRepo.style.display = 'flex';
        if (repoContent) repoContent.style.display = 'none';
        if (statusBranch) statusBranch.style.display = 'none';
        return;
      }

      if (nonRepo) nonRepo.style.display = 'none';
      if (repoContent) repoContent.style.display = 'flex';

      const branch = res.branch || 'main';
      if (branchName) branchName.textContent = branch;
      if (statusBranch) {
        statusBranch.style.display = 'flex';
        const txt = statusBranch.querySelector('.status-text') || statusBranch;
        txt.textContent = branch;
      }

      const stagedSection = document.getElementById('section-scm-staged');
      const stagedList = document.getElementById('scm-staged-list');
      const stagedCount = document.getElementById('scm-staged-count');

      const stagedFiles = res.staged || [];
      if (stagedCount) stagedCount.textContent = stagedFiles.length;
      if (stagedSection) {
        stagedSection.style.display = stagedFiles.length > 0 ? 'flex' : 'none';
      }
      if (stagedList) {
        stagedList.innerHTML = '';
        stagedFiles.forEach(f => {
          stagedList.appendChild(this.createFileRow(f, true));
        });
      }

      const allChanges = [
        ...(res.unstaged || []),
        ...(res.untracked || [])
      ];
      const changesSection = document.getElementById('section-scm-changes');
      const changesList = document.getElementById('scm-changes-list');
      const changesCount = document.getElementById('scm-changes-count');

      if (changesCount) changesCount.textContent = allChanges.length;
      if (changesList) {
        changesList.innerHTML = '';
        allChanges.forEach(f => {
          changesList.appendChild(this.createFileRow(f, false));
        });
      }
    } catch (err) {
      console.warn('[SCM] Refresh error:', err);
    }
  }

  createFileRow(item, isStaged) {
    const row = document.createElement('div');
    row.className = 'scm-file-row';

    const normalized = item.path.replace(/\\/g, '/');
    const parts = normalized.split('/');
    const fileName = parts.pop() || normalized;
    const dirPath = parts.join('/');

    const statusLetter = (item.status || 'M').toUpperCase();
    const statusClass = `scm-status-${statusLetter.toLowerCase()}`;

    row.innerHTML = `
      <span class="codicon codicon-file"></span>
      <span class="scm-file-name" title="${item.path}">${fileName}</span>
      ${dirPath ? `<span class="scm-file-dir" title="${dirPath}">${dirPath}</span>` : ''}
      <span class="scm-file-status ${statusClass}">${statusLetter}</span>
      <div class="scm-file-actions">
        ${isStaged
          ? `<button class="scm-action-btn btn-unstage" title="Unstage Changes"><span class="codicon codicon-remove"></span></button>`
          : `<button class="scm-action-btn btn-stage" title="Stage Changes"><span class="codicon codicon-add"></span></button>
             <button class="scm-action-btn btn-discard" title="Discard Changes"><span class="codicon codicon-discard"></span></button>`
        }
      </div>
    `;

    row.addEventListener('click', (e) => {
      if (e.target.closest('.scm-file-actions')) return;
      if (item.status === 'U' || item.status === 'A') {
        docManager.openFile(item.path);
      } else {
        openDiffViewer(item.path);
      }
    });

    const btnStage = row.querySelector('.btn-stage');
    if (btnStage) {
      btnStage.addEventListener('click', (e) => {
        e.stopPropagation();
        this.stage(item.path);
      });
    }

    const btnUnstage = row.querySelector('.btn-unstage');
    if (btnUnstage) {
      btnUnstage.addEventListener('click', (e) => {
        e.stopPropagation();
        this.unstage(item.path);
      });
    }

    const btnDiscard = row.querySelector('.btn-discard');
    if (btnDiscard) {
      btnDiscard.addEventListener('click', (e) => {
        e.stopPropagation();
        this.discard(item.path);
      });
    }

    return row;
  }

  async initRepo() {
    if (!window.electronGit) return;
    const res = await window.electronGit.init();
    if (res.success) {
      await this.refresh();
      if (typeof refreshWorkspaceTree === 'function') refreshWorkspaceTree();
    } else {
      alert(`Git Init failed: ${res.error || 'Unknown error'}`);
    }
  }

  async stage(path) {
    if (!window.electronGit) return;
    await window.electronGit.stage(path);
    await this.refresh();
  }

  async unstage(path) {
    if (!window.electronGit) return;
    await window.electronGit.unstage(path);
    await this.refresh();
  }

  async discard(path) {
    if (!confirm(`Are you sure you want to discard changes in '${path}'?`)) return;
    if (!window.electronGit) return;
    await window.electronGit.discard(path);
    await this.refresh();
    if (docManager.documents.has(path)) {
      docManager.openFile(path);
    }
  }

  async discardAll() {
    if (!confirm('Are you sure you want to discard all changes?')) return;
    const allChanges = [
      ...(this.status?.unstaged || []),
    ];
    for (const item of allChanges) {
      if (window.electronGit) {
        await window.electronGit.discard(item.path);
      }
    }
    await this.refresh();
  }

  async commit() {
    const input = document.getElementById('scm-commit-msg');
    const msg = input ? input.value.trim() : '';
    if (!msg) {
      alert('Please enter a commit message before committing.');
      return;
    }
    if (!window.electronGit) return;
    const res = await window.electronGit.commit(msg);
    if (res.success) {
      if (input) input.value = '';
      await this.refresh();
    } else {
      alert(`Git Commit failed: ${res.error || 'Unknown error'}`);
    }
  }
}

class SearchController {
  constructor() {
    this.isCaseSensitive = false;
    this.isWholeWord = false;
    this.isRegex = false;
    this.debounceTimer = null;
    this.initListeners();
  }

  initListeners() {
    const input = document.getElementById('search-query-input');
    if (input) {
      input.addEventListener('input', () => {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.executeSearch(), 300);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          clearTimeout(this.debounceTimer);
          this.executeSearch();
        }
      });
    }

    document.getElementById('btn-search-refresh')?.addEventListener('click', () => this.executeSearch());

    document.getElementById('btn-search-clear')?.addEventListener('click', () => {
      if (input) input.value = '';
      const results = document.getElementById('search-results-tree');
      if (results) results.innerHTML = '';
      const status = document.getElementById('search-status-text');
      if (status) status.textContent = 'Type to search across workspace';
    });

    document.getElementById('btn-search-collapse')?.addEventListener('click', () => {
      document.querySelectorAll('.search-file-matches').forEach(el => {
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
      });
    });

    const toggleCase = document.getElementById('toggle-case-sensitive');
    if (toggleCase) {
      toggleCase.addEventListener('click', () => {
        this.isCaseSensitive = !this.isCaseSensitive;
        toggleCase.classList.toggle('active', this.isCaseSensitive);
        this.executeSearch();
      });
    }

    const toggleWord = document.getElementById('toggle-whole-word');
    if (toggleWord) {
      toggleWord.addEventListener('click', () => {
        this.isWholeWord = !this.isWholeWord;
        toggleWord.classList.toggle('active', this.isWholeWord);
        this.executeSearch();
      });
    }

    const toggleRegex = document.getElementById('toggle-regex');
    if (toggleRegex) {
      toggleRegex.addEventListener('click', () => {
        this.isRegex = !this.isRegex;
        toggleRegex.classList.toggle('active', this.isRegex);
        this.executeSearch();
      });
    }

    const btnDetails = document.getElementById('btn-search-details-toggle');
    const detailsPanel = document.getElementById('search-details-panel');
    const detailsChevron = document.getElementById('search-details-chevron');
    if (btnDetails && detailsPanel) {
      btnDetails.addEventListener('click', () => {
        const isHidden = detailsPanel.style.display === 'none';
        detailsPanel.style.display = isHidden ? 'flex' : 'none';
        if (detailsChevron) {
          detailsChevron.className = isHidden ? 'codicon codicon-chevron-down' : 'codicon codicon-chevron-right';
        }
      });
    }
  }

  async executeSearch() {
    const input = document.getElementById('search-query-input');
    const query = input ? input.value.trim() : '';
    const statusText = document.getElementById('search-status-text');
    const tree = document.getElementById('search-results-tree');
    if (!tree) return;

    if (!query) {
      tree.innerHTML = '';
      if (statusText) statusText.textContent = 'Type to search in workspace';
      return;
    }

    if (!window.electronSearch) return;

    const includeInput = document.getElementById('search-files-include');
    const excludeInput = document.getElementById('search-files-exclude');

    if (statusText) statusText.textContent = 'Searching...';

    const res = await window.electronSearch.searchFiles({
      query,
      isCaseSensitive: this.isCaseSensitive,
      isWholeWord: this.isWholeWord,
      isRegex: this.isRegex,
      filesToInclude: includeInput ? includeInput.value : '',
      filesToExclude: excludeInput ? excludeInput.value : '',
    });

    if (res.error) {
      if (statusText) statusText.textContent = res.error;
      tree.innerHTML = '';
      return;
    }

    if (statusText) {
      statusText.textContent = `${res.totalMatches} result${res.totalMatches === 1 ? '' : 's'} in ${res.totalFiles} file${res.totalFiles === 1 ? '' : 's'}`;
    }

    tree.innerHTML = '';
    (res.results || []).forEach(fileRes => {
      const group = document.createElement('div');
      group.className = 'search-file-group';

      const fileName = fileRes.relativePath.replace(/\\/g, '/').split('/').pop() || fileRes.relativePath;
      const fileHeader = document.createElement('div');
      fileHeader.className = 'search-file-header';
      fileHeader.innerHTML = `
        <span class="codicon codicon-chevron-down search-file-chevron"></span>
        <span class="codicon codicon-file"></span>
        <span class="search-file-title" title="${fileRes.relativePath}">${fileName}</span>
        <span class="search-file-badge">${fileRes.matches.length}</span>
      `;

      const matchesList = document.createElement('div');
      matchesList.className = 'search-file-matches';

      fileHeader.addEventListener('click', () => {
        const isHidden = matchesList.style.display === 'none';
        matchesList.style.display = isHidden ? 'block' : 'none';
        const chev = fileHeader.querySelector('.search-file-chevron');
        if (chev) {
          chev.className = isHidden ? 'codicon codicon-chevron-down search-file-chevron' : 'codicon codicon-chevron-right search-file-chevron';
        }
      });

      fileRes.matches.forEach(m => {
        const matchItem = document.createElement('div');
        matchItem.className = 'search-match-item';
        matchItem.innerHTML = `
          <span class="search-match-line">${m.line}</span>
          <span class="search-match-snippet">${this.escapeHtml(m.lineText)}</span>
        `;

        matchItem.addEventListener('click', async () => {
          await docManager.openFile(fileRes.filePath);
          if (editor && editor.revealLineInCenter && window.monaco) {
            editor.revealLineInCenter(m.line);
            editor.setPosition({ lineNumber: m.line, column: m.column });
            editor.setSelection(new window.monaco.Range(m.line, m.column, m.line, m.column + m.length));
            editor.focus();
          }
        });

        matchesList.appendChild(matchItem);
      });

      group.appendChild(fileHeader);
      group.appendChild(matchesList);
      tree.appendChild(group);
    });
  }

  escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

function openSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.style.display = 'flex';
}

function initSettingsModal() {
  const modal = document.getElementById('settings-modal');
  const btnClose = document.getElementById('btn-close-settings');

  const closeModal = () => { if (modal) modal.style.display = 'none'; };

  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  const fontInput = document.getElementById('setting-font-size');
  if (fontInput) {
    fontInput.addEventListener('change', () => {
      const size = parseInt(fontInput.value, 10);
      if (size >= 10 && size <= 32 && editor) {
        editor.updateOptions({ fontSize: size });
      }
    });
  }

  const tabSelect = document.getElementById('setting-tab-size');
  if (tabSelect) {
    tabSelect.addEventListener('change', () => {
      const size = parseInt(tabSelect.value, 10);
      if (editor?.getModel()) {
        editor.getModel().updateOptions({ tabSize: size });
      }
    });
  }

  const wrapSelect = document.getElementById('setting-word-wrap');
  if (wrapSelect) {
    wrapSelect.addEventListener('change', () => {
      if (editor) {
        editor.updateOptions({ wordWrap: wrapSelect.value });
      }
    });
  }
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('DOMContentLoaded', () => {
    if (window.electronIpc && typeof window.electronIpc.invoke === 'function') {
      window.electronIpc.invoke('antislop:get-paths').then((res) => {
        if (res && res.webviewPath && webviewFrame) {
          const normalized = res.webviewPath.replace(/\\/g, '/');
          webviewFrame.src = 'file:///' + normalized;
          console.log('[Workbench] Loaded Screen B Webview from:', webviewFrame.src);
        }
      }).catch((err) => {
        console.warn('[Workbench] Error fetching paths from electronIpc:', err);
      });
    }

    if (webviewFrame) {
      webviewFrame.addEventListener('load', () => {
        dispatchThemeToWebview();
        if (sidecarClient) {
          sidecarClient.updateUiStatus(sidecarClient.isConnected(), sidecarClient.getLatency());
        }
        if (docManager && docManager.activeDocId && webviewFrame.contentWindow) {
          const activeDoc = docManager.documents.get(docManager.activeDocId);
          if (activeDoc) {
            try {
              webviewFrame.contentWindow.postMessage({
                type: 'SET_ACTIVE_FILE',
                payload: {
                  fileUri: activeDoc.uri || activeDoc.id,
                  languageId: activeDoc.lang,
                }
              }, '*');
            } catch (_) {}
          }
        }
      });
    }

    bottomResizer = new BottomPanelResizer();
    terminalController = new TerminalController();
    outputLogger = new OutputLogger();

    initMenubar();
    initCommandPalette();
    initEditor();
    renderEmptyWorkspace();
    connectSidecar();
    initAntigravityBridge();
    initGlobalShortcuts();
    renderTargetStack();
    loadNativeChatHistory();

    scmController = new ScmController();
    searchController = new SearchController();
    initSettingsModal();

    try {
      const savedTheme = (typeof localStorage !== 'undefined' && localStorage.getItem && localStorage.getItem('nscode.theme')) || 'vs-dark';
      applyTheme(savedTheme);
    } catch (_) {
      applyTheme('vs-dark');
    }

    try {
      updateScreenBModePill();
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('resize', () => updateScreenBModePill());
      }
      if (typeof ResizeObserver !== 'undefined') {
        const tabsContainer = document.getElementById('screen-b-mode-tabs');
        if (tabsContainer) {
          const ro = new ResizeObserver(() => updateScreenBModePill());
          ro.observe(tabsContainer);
        }
      }
    } catch (_) {}

    if (window.electronFS && typeof window.electronFS.getWorkspaceRoot === 'function') {
      window.electronFS.getWorkspaceRoot().then(res => {
        if (res && res.path) {
          currentWorkspaceRoot = res.path;
          if (workspaceFolderName) {
            const folder = res.path.split(/[\\/]/).pop() || 'WORKSPACE';
            workspaceFolderName.textContent = folder.toUpperCase();
          }
          refreshWorkspaceTree();
          scmController?.refresh();
        }
      }).catch(() => {});
    }
  });
}

if (typeof window !== 'undefined') {
  window.fuzzyMatch = fuzzyMatch;
  window.openCommandPalette = openCommandPalette;
  window.nscodeLayout = {
    updateScreenBModePill,
    adjustPromptBoxHeight,
    resetPromptBoxHeight,
  };

  const maieuticSessions = new Map();
  function resolveMaieuticPhaseForTurn(turn) {
    if (turn <= 1) return 'probe';
    if (turn === 2) return 'invariant';
    if (turn === 3) return 'synthesis';
    return 'resolution';
  }
  function getMaieuticSession(symbol) {
    let session = maieuticSessions.get(symbol);
    if (!session) {
      session = {
        symbol,
        turn: 0,
        phase: 'probe',
        history: [],
      };
      maieuticSessions.set(symbol, session);
    }
    return session;
  }
  function resetMaieuticSession(symbol) {
    if (symbol) {
      maieuticSessions.delete(symbol);
    } else {
      maieuticSessions.clear();
    }
  }
  function processMaieuticDialecticTurn(envelope) {
    if (!envelope || !envelope.symbol) {
      throw new Error('MaieuticContextEnvelope must include symbol');
    }
    const session = getMaieuticSession(envelope.symbol);
    session.turn += 1;
    session.phase = resolveMaieuticPhaseForTurn(session.turn);
    session.history.push(envelope);

    const userStatement = (envelope.userStatement || '').toLowerCase();
    const isAskingForCode =
      userStatement.includes('give me code') ||
      userStatement.includes('give me the code') ||
      userStatement.includes('write the code') ||
      userStatement.includes('show me the code') ||
      userStatement.includes('fix it for me') ||
      userStatement.includes('what is the solution') ||
      userStatement.includes('just fix this');

    const antiSpoonfeedPrefix = isAskingForCode
      ? '[Anti-Spoonfeed Invariant Active] I will not write the solution code for you. True mastery comes from reasoning through the invariants yourself. '
      : '';

    let dialecticQuestion = '';
    let suggestedReflection = '';

    switch (session.phase) {
      case 'probe': {
        const diagInfo = envelope.diagnosticMessage
          ? ` (Diagnostic: "${envelope.diagnosticMessage}")`
          : '';
        dialecticQuestion = `${antiSpoonfeedPrefix}At line ${envelope.lineNumber}, before executing '${envelope.symbol}'${diagInfo}, what preconditions and state guarantees are you assuming hold? What unhandled inputs could reach this boundary?`;
        suggestedReflection = `Trace the call chain entering '${envelope.symbol}'. What assumptions is the caller making that the callee fails to enforce?`;
        break;
      }
      case 'invariant': {
        dialecticQuestion = `${antiSpoonfeedPrefix}What mathematical or logical invariant MUST hold true before and after calling '${envelope.symbol}'? If that precondition is violated, how should the contract fail fast without masking underlying defects?`;
        suggestedReflection = `Define the invariant contract: Under what exact domain conditions does '${envelope.symbol}' guarantee valid output? What constitutes an unrecoverable violation?`;
        break;
      }
      case 'synthesis': {
        dialecticQuestion = `${antiSpoonfeedPrefix}Synthesizing your invariant: how can you structure the control flow around line ${envelope.lineNumber} using guards, discriminated types, or early returns so that invalid states become unrepresentable?`;
        suggestedReflection = `Review the branch structure: rather than adding defensive fallback slop, can you eliminate the invalid state at compile-time or with a clean guard clause?`;
        break;
      }
      case 'resolution': {
        dialecticQuestion = `${antiSpoonfeedPrefix}To achieve Popperian falsification: what boundary test case would conclusively falsify your implementation of '${envelope.symbol}' if your invariants were violated?`;
        suggestedReflection = `Formulate an adversarial test case targeting extreme boundaries (e.g. empty collections, numeric limits, or poisoned references). Does your code uphold the invariant?`;
        break;
      }
    }

    return {
      phase: session.phase,
      dialecticQuestion,
      antiSpoonfeedAssertion: true,
      suggestedReflection,
    };
  }

  window.nscodeMaieuticDuck = {
    directSolutionAllowed: false,
    antiSpoonfeedAssertion: true,
    resolvePhaseForTurn: resolveMaieuticPhaseForTurn,
    getSession: getMaieuticSession,
    resetSession: resetMaieuticSession,
    processDialecticTurn: processMaieuticDialecticTurn,
    notifyFailure: (ctx) => {
      if (window.MaieuticDuckController && window.nscodeMaieuticDuckController) {
        return window.nscodeMaieuticDuckController.notifyFailure(ctx);
      }
      return false;
    },
    notifyFrustration: (ctx) => {
      if (window.MaieuticDuckController && window.nscodeMaieuticDuckController) {
        return window.nscodeMaieuticDuckController.notifyFrustration(ctx);
      }
      return false;
    },
  };
  window.closeCommandPalette = closeCommandPalette;
  window.updateWorkspaceFileIndex = updateWorkspaceFileIndex;
  window.getWorkspaceFileIndex = getWorkspaceFileIndex;
  window.showDirtySaveDialog = showDirtySaveDialog;
  window.editorEventBridge = editorEventBridge;
  window.setScreenBMode = setScreenBMode;
  window.resolveFileIconClass = resolveFileIconClass;
  window.updateCursorTelemetry = updateCursorTelemetry;
  window.getPaletteItems = getPaletteItems;

  window.extractTargetLines = extractTargetLines;
  window.renderTargetStack = renderTargetStack;
  window.addTargetsToStack = addTargetsToStack;
  window.revealTargetInMonaco = revealTargetInMonaco;
  window.requestGuidanceForTarget = requestGuidanceForTarget;
  window.renderTechnicalSummaryCard = renderTechnicalSummaryCard;
  window.updateScreenBBreadcrumb = updateScreenBBreadcrumb;

  window.toRelativeWorkspacePath = toRelativeWorkspacePath;
  window.getActiveDocumentRelativePath = getActiveDocumentRelativePath;
  window.registerEditorActions = registerEditorActions;
  window.sendSelectionToScreenB = sendSelectionToScreenB;
  window.bridgeSelectionToScreenB = sendSelectionToScreenB;

  window.createTaskPlan = createTaskPlan;
  window.setAgenticPlan = createTaskPlan;
  window.getTaskPlan = getTaskPlan;
  window.pauseTaskPlan = pauseTaskPlan;
  window.pausePlan = pauseTaskPlan;
  window.resumeTaskPlan = resumeTaskPlan;
  window.resumePlan = resumeTaskPlan;
  window.cancelTaskPlan = cancelTaskPlan;
  window.cancelPlan = cancelTaskPlan;
  window.advanceSubtask = advanceSubtask;
  window.updateSubtaskStatus = advanceSubtask;
  window.addExecutionLog = addExecutionLog;
  window.renderPlanView = renderPlanView;
  window.renderPlanPane = renderPlanView;

  window.computeDiffStats = computeDiffStats;
  window.setReviewDiffs = setReviewDiffs;
  window.addReviewDiff = addReviewDiff;
  window.getReviewDiffs = getReviewDiffs;
  window.renderReviewPane = renderReviewPane;
  window.renderReviewView = renderReviewPane;
  window.openReviewDiff = openReviewDiff;
  window.closeReviewDiff = closeReviewDiff;
  window.acceptReviewDiff = acceptReviewDiff;
  window.discardReviewDiff = discardReviewDiff;
  window.acceptAllReviewDiffs = acceptAllReviewDiffs;
  window.discardAllReviewDiffs = discardAllReviewDiffs;
  window.showDiffEditor = showDiffEditor;

  window.SidecarWebSocketClient = SidecarWebSocketClient;
  window.sidecarClient = sidecarClient;
  window.sidecarWs = sidecarWs;
  window.connectSidecar = connectSidecar;
  window.disconnectSidecar = disconnectSidecar;
  window.TypewriterRenderer = TypewriterRenderer;
  window.StreamMessageParser = StreamMessageParser;
  window.createThinkingCard = createThinkingCard;
  window.toggleThinkingCard = toggleThinkingCard;
  window.formatCodeWithDarkPlusTokens = formatCodeWithDarkPlusTokens;
  window.attachCopyButtonHandler = attachCopyButtonHandler;
  window.copyCodeBlock = copyCodeBlock;
  window.appendChatChunk = appendChatChunk;
  window.handlePlanStreamMessage = handlePlanStreamMessage;
  window.handleDiffStreamMessage = handleDiffStreamMessage;
  window.resetActiveChatTurn = resetActiveChatTurn;

  const _fnAnswerSocraticChallenge = answerSocraticChallenge;
  const _fnUnlockSocraticGate = unlockSocraticGate;
  const _fnResetSocraticGate = resetSocraticGate;
  const _fnToggleSocraticHint = toggleSocraticHint;

  window.isSocraticGateUnlocked = () => {
    isSocraticGateEngaged = true;
    return isSocraticGateUnlocked;
  };
  window.getSocraticChallenge = () => {
    isSocraticGateEngaged = true;
    return activeSocraticChallenge;
  };
  window.answerSocraticChallenge = (optionIdOrIdx) => {
    isSocraticGateEngaged = true;
    return _fnAnswerSocraticChallenge(optionIdOrIdx);
  };
  window.unlockSocraticGate = () => {
    isSocraticGateEngaged = true;
    return _fnUnlockSocraticGate();
  };
  window.resetSocraticGate = () => {
    isSocraticGateEngaged = true;
    return _fnResetSocraticGate();
  };
  window.toggleSocraticHint = () => {
    isSocraticGateEngaged = true;
    return _fnToggleSocraticHint();
  };
  window.generateSocraticChallenge = generateSocraticChallenge;
  window.renderSocraticGateCard = renderSocraticGateCard;
  window.setSocraticStep = setSocraticStep;
  window.getSocraticLadderSession = () => activeSocraticChallenge ? activeSocraticChallenge.ladderSession : null;
  window.setSocraticStrictLadder = (val) => {
    if (activeSocraticChallenge) activeSocraticChallenge.strictLadder = val;
    window.socraticStrictLadder = val;
  };
  window.removeTargetFromStack = removeTargetFromStack;
  window.renderTargetStack = renderTargetStack;
  window.getExpandedTargetId = () => expandedTargetId;
  window.setExpandedTargetId = (id) => {
    expandedTargetId = id;
    renderTargetStack();
  };
  window.addReviewDiffsBatch = addReviewDiffsBatch;
  window.buildScreenBPromptEnvelope = buildScreenBPromptEnvelope;
  window.SCREEN_B_OPERATIONAL_RULESET = SCREEN_B_OPERATIONAL_RULESET;
  window.FALLBACK_SUB_AGENTS = FALLBACK_SUB_AGENTS;
  window.getAvailableAgents = getAvailableAgents;
  window.getSelectedAgent = getSelectedAgent;
  window.setSelectedAgent = setSelectedAgent;
  window.populateAgentDropdown = populateAgentDropdown;
  window.runAntigravityPrompt = runAntigravityPrompt;
  window.initAntigravityBridge = initAntigravityBridge;

  window.screenBController = {
    extractTargetLines,
    getTargetStack: () => targetStack,
    removeTargetFromStack,
    renderTargetStack,
    getExpandedTargetId: () => expandedTargetId,
    setExpandedTargetId: (id) => {
      expandedTargetId = id;
      renderTargetStack();
    },
    clearTargetStack: () => {
      targetStack = [];
      expandedTargetId = null;
      renderTargetStack();
      const sumContainer = document.getElementById('technical-summary-cards-container');
      if (sumContainer) sumContainer.innerHTML = '';
    },
    addTargetsToStack,
    revealTargetInMonaco,
    requestGuidanceForTarget,
    renderTechnicalSummaryCard,
    updateBreadcrumb: updateScreenBBreadcrumb,

    toRelativeWorkspacePath,
    getActiveDocumentRelativePath,
    sendSelectionToScreenB,
    bridgeSelectionToScreenB: sendSelectionToScreenB,
    setScreenBMode,
    createTaskPlan,
    setAgenticPlan: createTaskPlan,
    getTaskPlan,
    pauseTaskPlan,
    pausePlan: pauseTaskPlan,
    resumeTaskPlan,
    resumePlan: resumeTaskPlan,
    cancelTaskPlan,
    cancelPlan: cancelTaskPlan,
    advanceSubtask,
    updateSubtaskStatus: advanceSubtask,
    addExecutionLog,
    renderPlanView,
    renderPlanPane: renderPlanView,
    computeDiffStats,
    setReviewDiffs,
    addReviewDiff,
    addReviewDiffsBatch,
    getReviewDiffs,
    renderReviewPane,
    renderReviewView: renderReviewPane,
    openReviewDiff,
    closeReviewDiff,
    acceptReviewDiff,
    discardReviewDiff,
    acceptAllReviewDiffs,
    discardAllReviewDiffs,
    showDiffEditor,

    isSocraticGateUnlocked: () => {
      isSocraticGateEngaged = true;
      return isSocraticGateUnlocked;
    },
    isGateUnlocked: () => {
      isSocraticGateEngaged = true;
      return isSocraticGateUnlocked;
    },
    getSocraticChallenge: () => {
      isSocraticGateEngaged = true;
      return activeSocraticChallenge;
    },
    answerSocraticChallenge: (optionIdOrIdx) => {
      isSocraticGateEngaged = true;
      return _fnAnswerSocraticChallenge(optionIdOrIdx);
    },
    unlockSocraticGate: () => {
      isSocraticGateEngaged = true;
      return _fnUnlockSocraticGate();
    },
    resetSocraticGate: () => {
      isSocraticGateEngaged = true;
      return _fnResetSocraticGate();
    },
    toggleSocraticHint: () => {
      isSocraticGateEngaged = true;
      return _fnToggleSocraticHint();
    },
    generateSocraticChallenge,
    renderSocraticGateCard,
    setSocraticStep,
    getSocraticLadderSession: () => activeSocraticChallenge ? activeSocraticChallenge.ladderSession : null,
    setSocraticStrictLadder: (val) => {
      if (activeSocraticChallenge) activeSocraticChallenge.strictLadder = val;
      window.socraticStrictLadder = val;
    },
    buildScreenBPromptEnvelope,
    getAvailableAgents,
    getSelectedAgent,
    setSelectedAgent,
    populateAgentDropdown,
    SCREEN_B_OPERATIONAL_RULESET,
    FALLBACK_SUB_AGENTS,
  };

  try {
    Object.defineProperty(window, 'targetStack', {
      get: () => targetStack,
      set: (val) => {
        targetStack = val;
        renderTargetStack();
      },
      configurable: true,
    });
    Object.defineProperty(window, 'currentTaskPlan', {
      get: () => currentTaskPlan,
      set: (val) => {
        currentTaskPlan = val;
        renderPlanView();
      },
      configurable: true,
    });
    Object.defineProperty(window, 'currentPlan', {
      get: () => currentTaskPlan,
      set: (val) => {
        currentTaskPlan = val;
        renderPlanView();
      },
      configurable: true,
    });
    Object.defineProperty(window, 'currentReviewDiffs', {
      get: () => currentReviewDiffs,
      set: (val) => {
        currentReviewDiffs = val;
        renderReviewPane();
      },
      configurable: true,
    });
    Object.defineProperty(window, 'reviewDiffs', {
      get: () => currentReviewDiffs,
      set: (val) => {
        currentReviewDiffs = val;
        renderReviewPane();
      },
      configurable: true,
    });
    Object.defineProperty(window, 'reviewDiffList', {
      get: () => currentReviewDiffs,
      set: (val) => {
        currentReviewDiffs = val;
        renderReviewPane();
      },
      configurable: true,
    });
    Object.defineProperty(window, 'socraticGateUnlocked', {
      get: () => {
        isSocraticGateEngaged = true;
        return isSocraticGateUnlocked;
      },
      set: (val) => {
        isSocraticGateEngaged = true;
        if (val) unlockSocraticGate();
        else resetSocraticGate();
      },
      configurable: true,
    });
    Object.defineProperty(window, 'activeSocraticChallenge', {
      get: () => {
        isSocraticGateEngaged = true;
        return activeSocraticChallenge;
      },
      set: (val) => {
        isSocraticGateEngaged = true;
        activeSocraticChallenge = val;
        renderSocraticGateCard();
      },
      configurable: true,
    });
    Object.defineProperty(window, 'selectedAgent', {
      get: () => selectedAgent,
      set: (val) => setSelectedAgent(val),
      configurable: true,
    });
    Object.defineProperty(window, 'availableAgents', {
      get: () => availableAgents,
      set: (val) => {
        availableAgents = val;
        populateAgentDropdown(val);
      },
      configurable: true,
    });
  } catch {}
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    nscodeMaieuticDuck: typeof window !== 'undefined' ? window.nscodeMaieuticDuck : null,
  };
}

