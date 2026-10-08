import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import {
  tokenize,
  tokenizeLines,
  TokenKind,
  escapeHtml,
} from '../../antislop-webview/src/components/Common/micro-tokenizer.js';

describe('v0.3.0 Tahap 2 Semantic Syntax Highlighting Suite', () => {
  const smartCardTsxPath = path.resolve(__dirname, '../../antislop-webview/src/components/BottomZone/SmartCard.tsx');
  const contractViolatedTsxPath = path.resolve(__dirname, '../../antislop-webview/src/components/TopZone/ContractViolated.tsx');
  const codePreviewTsxPath = path.resolve(__dirname, '../../antislop-webview/src/components/Common/CodePreview.tsx');
  const codePreviewCssPath = path.resolve(__dirname, '../../antislop-webview/src/components/Common/CodePreview.css');

  describe('1. Micro-Tokenizer Lexical Correctness', () => {
    it('accurately tokenizes keywords, identifiers, types, and strings in TypeScript', () => {
      const code = 'const count: number = 42;\nfunction calculate(): string { return "hello"; }';
      const tokens = tokenize(code, { includeWhitespace: false });

      const types = tokens.map(t => t.type);
      const values = tokens.map(t => t.value);

      expect(values).toContain('const');
      expect(types[values.indexOf('const')]).toBe('token-keyword');

      expect(values).toContain('number');
      expect(types[values.indexOf('number')]).toBe('token-type');

      expect(values).toContain('42');
      expect(types[values.indexOf('42')]).toBe('token-number');

      expect(values).toContain('calculate');
      expect(types[values.indexOf('calculate')]).toBe('token-function');

      expect(values).toContain('"hello"');
      expect(types[values.indexOf('"hello"')]).toBe('token-string');
    });

    it('identifies pedagogical cloze tokens {BLANK_N} as atomic cloze-token', () => {
      const code = 'function solve() { return {BLANK_0} + {BLANK_1}; }';
      const tokens = tokenize(code, { includeWhitespace: false });

      const clozeTokens = tokens.filter(t => t.type === 'cloze-token');
      expect(clozeTokens).toHaveLength(2);
      expect(clozeTokens[0].value).toBe('{BLANK_0}');
      expect(clozeTokens[0].kind).toBe(TokenKind.ClozeBlank);
      expect(clozeTokens[1].value).toBe('{BLANK_1}');
    });

    it('disambiguates division operators from regex literals', () => {
      // 1. Division: a / b / c
      const divCode = 'const ratio = total / count / factor;';
      const divTokens = tokenize(divCode, { includeWhitespace: false });
      const slashTokens = divTokens.filter(t => t.value === '/');
      expect(slashTokens).toHaveLength(2);
      expect(slashTokens.every(t => t.type === 'token-operator')).toBe(true);

      // 2. Division after parenthesis
      const parenDiv = '(a + b) / 2;';
      const parenTokens = tokenize(parenDiv, { includeWhitespace: false });
      expect(parenTokens.find(t => t.value === '/')?.type).toBe('token-operator');

      // 3. Regex literal after assignment
      const regexCode = 'const pattern = /^[a-z]+$/gi;';
      const regexTokens = tokenize(regexCode, { includeWhitespace: false });
      const regToken = regexTokens.find(t => t.value.startsWith('/^'));
      expect(regToken).toBeDefined();
      expect(regToken?.type).toBe('token-string');
    });

    it('accurately tokenizes single-line, block, and Python-style comments', () => {
      const code = '// line comment\n/* block comment */\n# python comment';
      const tokens = tokenize(code, { includeWhitespace: false });
      const comments = tokens.filter(t => t.type === 'token-comment');

      expect(comments).toHaveLength(3);
      expect(comments[0].value).toBe('// line comment');
      expect(comments[1].value).toBe('/* block comment */');
      expect(comments[2].value).toBe('# python comment');
    });
  });

  describe('2. Adversarial Edge Cases & ReDoS Falsification', () => {
    it('handles unclosed single/double quotes without infinite loops', () => {
      const code = 'const bad = "unterminated string at EOF';
      const tokens = tokenize(code, { includeWhitespace: false });
      expect(tokens.length).toBeGreaterThan(0);
      const last = tokens[tokens.length - 1];
      expect(last.type).toBe('token-string');
      expect(last.value).toBe('"unterminated string at EOF');
    });

    it('handles unclosed multi-line comments at EOF gracefully', () => {
      const code = '/* unclosed multi-line block comment at EOF';
      const tokens = tokenize(code, { includeWhitespace: false });
      expect(tokens.length).toBe(1);
      expect(tokens[0].type).toBe('token-comment');
    });

    it('proves ReDoS immunity with linear O(N) performance on repeating slash sequences', () => {
      const slashBomb = '/'.repeat(10000);
      const t0 = performance.now();
      const tokens = tokenize(slashBomb);
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(50); // Must be <50ms for 10k characters
      expect(tokens.length).toBeGreaterThan(0);
    });

    it('correctly escapes HTML special characters in escapeHtml()', () => {
      const malicious = '<script>alert("XSS" & \'attack\')</script>';
      const escaped = escapeHtml(malicious);
      expect(escaped).toBe('&lt;script&gt;alert(&quot;XSS&quot; &amp; &#39;attack&#39;)&lt;/script&gt;');
      expect(escaped).not.toContain('<script>');
    });

    it('splits tokens into 1-indexed lines via tokenizeLines()', () => {
      const multiLine = 'const a = 1;\nconst b = 2;\nconst c = 3;';
      const lines = tokenizeLines(multiLine);
      expect(lines).toHaveLength(3);
      expect(lines[0][0].value).toBe('const');
      expect(lines[1][0].value).toBe('const');
      expect(lines[2][0].value).toBe('const');
    });
  });

  describe('3. Component Architecture & Integration Audit', () => {
    it('verifies CodePreview.tsx exists and implements sticky gutters, diff mode, and line highlight', () => {
      const tsx = fs.readFileSync(codePreviewTsxPath, 'utf-8');
      expect(tsx).toContain('export const CodePreview');
      expect(tsx).toContain('isDiffMode');
      expect(tsx).toContain('gutter-sticky-column');
      expect(tsx).toContain('row-highlighted');
      expect(tsx).toContain('vscodeApi.highlightLine');
      expect(tsx).toContain('wrapLines');
    });

    it('verifies CodePreview.css contains sticky positioning, container queries, and syntax token classes', () => {
      const css = fs.readFileSync(codePreviewCssPath, 'utf-8');
      expect(css).toContain('position: sticky');
      expect(css).toContain('container-type: inline-size');
      expect(css).toContain('.token-keyword');
      expect(css).toContain('.token-function');
      expect(css).toContain('.token-string');
      expect(css).toContain('.token-number');
      expect(css).toContain('.token-comment');
      expect(css).toContain('.token-type');
      expect(css).toContain('.cloze-token');
      expect(css).toContain('.row-highlighted');
    });

    it('verifies SmartCard.tsx uses <CodePreview /> for view mode instead of raw pre/code', () => {
      const tsx = fs.readFileSync(smartCardTsxPath, 'utf-8');
      expect(tsx).toContain("import { CodePreview } from '../Common/CodePreview.js'");
      expect(tsx).toContain('<CodePreview');
      expect(tsx).toContain('code={card.codeSnippet}');
      expect(tsx).toContain('languageId={card.languageBreakdown?.targetLanguage}');
    });

    it('verifies ContractViolated.tsx uses <CodePreview /> for error frame instead of raw pre/code', () => {
      const tsx = fs.readFileSync(contractViolatedTsxPath, 'utf-8');
      expect(tsx).toContain("import { CodePreview } from '../Common/CodePreview.js'");
      expect(tsx).toContain('<CodePreview');
      expect(tsx).toContain('code={rawError}');
      expect(tsx).toContain('fileUri={sourceLocation.fileUri}');
      expect(tsx).toContain('startLineNumber={sourceLocation.range.startLine}');
    });
  });
});
