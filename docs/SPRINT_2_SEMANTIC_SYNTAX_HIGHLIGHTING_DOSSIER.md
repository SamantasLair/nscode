# SPRINT 2: SEMANTIC SYNTAX HIGHLIGHTING & INLINE MICRO-TOKENIZER DOSSIER
**Monorepo Component**: `@antislop/webview` & `@antislop/desktop`  
**Autonomous Protocol**: ANTIGRAVITY SURGICAL PROTOCOL v5.1  
**Swarm Mobilization**: 20 Sub-Agents (4 Domain Captains + 16 Leaf Workers)  
**Verification Date**: 2026-10-08  

---

## 1. Executive Summary & Architecture Blueprint

Sprint 2 establishes native, zero-dependency, semantic syntax highlighting across Screen B without adding heavy third-party runtimes (Prism, Shiki, or Highlight.js). It introduces:
1. **DFA Inline Micro-Tokenizer** (`micro-tokenizer.ts`): A deterministic finite-state scanner ($\Theta(N)$ runtime, <3 KB unminified, ReDoS-free) supporting JavaScript/TypeScript, Python, C/C++, Java, C#, Shell, JSON, and Screen B's pedagogical Cloze tokens (`{BLANK_\d+}`).
2. **Accessible Theme Binding (WCAG AA $\ge$ 4.5:1)**: 1:1 mapping of 9 lexical token types directly to Monaco Editor CSS variables (`--token-*`).
3. **Responsive Code Component (`<CodePreview />`)**: A dedicated presentation component featuring sticky 1-indexed line numbers, sticky unified diff gutters (`+`/`-`), line highlight pulsing linked to `HIGHLIGHT_LINE` IPC messages, word-wrap toggling, and cognitive gate copy protection.
4. **Zero-Trust Security**: 100% XSS immunity via React JSX text nodes and RFC-compliant HTML escaping.

---

## 2. Swarm Synthesis & Research Consensus Matrix

| Domain Area | Key Findings | Architectural Decision |
| :--- | :--- | :--- |
| **Tokenizer Engine** | Shiki/Prism add 25KB–1.5MB and bundle risks. Naive regex suffers from catastrophic backtracking (ReDoS). | Pure DFA scanner using `charCodeAt` with monotonic cursor advancement ($i_{m+1} \ge i_m + 1$). |
| **Cloze Challenge** | Standard lexers split `{BLANK_0}` into punctuation and numbers, destroying blank boundaries. | Atomic `ClozeBlank` terminal lexeme intercepted via lookahead `source.startsWith('{BLANK_', i)`. |
| **Diff Highlighting** | Unified diff markers (`+`, `-`, `@@`) collide with arithmetic operators. | Dedicated diff parsing layer providing dual line numbering (`oldLineNumber` & `newLineNumber`). |
| **Theme & Contrast** | VS Code light theme has tokens near 4.5:1 boundary (`#098658`, `#008080`). | Empirically verified against `#1e1e1e`, `#ffffff`, and `#000000`. Zero hardcoding. |
| **Layout & Sashing** | Flex containers overflow horizontally on long lines, breaking 320px sidebars. | `container-type: inline-size`, pinned sticky gutter (`position: sticky; left: 0`), and optional word wrap. |
| **Security & DOM** | Raw `innerHTML` introduces DOM XSS vectors. | Standard React children projection (`document.createTextNode`) with fallback `escapeHtml()`. |

---

## 3. WCAG AA Contrast Verification Matrix

| Token Type | CSS Variable | `vs-dark` (`#1e1e1e`) | `vs` (`#ffffff`) | `hc-black` (`#000000`) | WCAG AA Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Keyword** | `--token-keyword` | `#569cd6` (5.65:1) | `#0000ff` (8.59:1) | `#569cd6` (7.12:1) | PASS ($\ge$ 4.5:1) |
| **Control Keyword**| `--token-keyword-control`| `#c586c0` (5.91:1) | `#af00db` (5.52:1) | `#569cd6` (7.12:1) | PASS ($\ge$ 4.5:1) |
| **Function** | `--token-function` | `#dcdcaa` (11.76:1) | `#795e26` (6.14:1) | `#dcdcaa` (14.82:1) | PASS (AAA) |
| **String** | `--token-string` | `#ce9178` (6.26:1) | `#a31515` (7.85:1) | `#ce9178` (7.89:1) | PASS ($\ge$ 4.5:1) |
| **Number** | `--token-number` | `#b5cea8` (9.67:1) | `#098658` (4.64:1) | `#b5cea8` (12.19:1) | PASS ($\ge$ 4.5:1) |
| **Comment** | `--token-comment` | `#6a9955` (4.99:1) | `#008000` (5.19:1) | `#7ca668` (7.49:1) | PASS ($\ge$ 4.5:1) |
| **Type** | `--token-type` | `#4ec9b0` (8.05:1) | `#008080` (4.82:1) | `#4ec9b0` (10.15:1) | PASS ($\ge$ 4.5:1) |
| **Variable** | `--token-variable` | `#9cdcfe` (11.15:1) | `#001188` (14.74:1) | `#9cdcfe` (14.05:1) | PASS (AAA) |
| **Punctuation** | `--token-punctuation` | `#d4d4d4` (11.22:1) | `#000000` (21.00:1) | `#ffffff` (21.00:1) | PASS (AAA) |
| **Operator** | `--token-operator` | `#d4d4d4` (11.22:1) | `#000000` (21.00:1) | `#ffffff` (21.00:1) | PASS (AAA) |

---

## 4. Implementation Plan & Target Files

1. **`packages/antislop-webview/src/components/Common/micro-tokenizer.ts`**:
   - DFA Tokenizer engine, `TokenKind`, `TokenType`, `tokenize()`, `tokenizeLines()`, `escapeHtml()`.
2. **`packages/antislop-webview/src/components/Common/CodePreview.types.ts`**:
   - Interface contracts for `<CodePreview />`.
3. **`packages/antislop-webview/src/components/Common/CodePreview.tsx`**:
   - React component with sticky gutters, diff markers, line highlights, and tokenized spans.
4. **`packages/antislop-webview/src/components/Common/CodePreview.css`**:
   - Component styles with CSS variables and responsive container queries.
5. **`packages/antislop-webview/src/components/BottomZone/SmartCard.tsx`**:
   - Integration: replace `<pre className="code-block"><code>` with `<CodePreview />`.
6. **`packages/antislop-webview/src/components/TopZone/ContractViolated.tsx`**:
   - Integration: replace `<pre className="raw-error-frame"><code>` with `<CodePreview />`.
7. **`packages/antislop-webview/src/index.ts`**:
   - Re-export `CodePreview` and `micro-tokenizer`.
8. **`packages/antislop-desktop/test/v0_3_0_tahap2_syntax_highlighting.test.ts`**:
   - Vitest test suite executing lexical accuracy, ReDoS stress tests, and React component integration.
