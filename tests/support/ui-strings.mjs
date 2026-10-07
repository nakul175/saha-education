// Extracts the text a person can read or hear from the TSX sources: JSX text, readable JSX attributes,
// descriptive object properties and message strings handed to state setters or Error constructors.
// It reads source only. It does not render pages, so strings built from data at run time are not seen.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

export const READABLE_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'alt', 'label', 'aria-description']);
const READABLE_PROPERTIES = new Set(['label', 'title', 'description', 'message', 'text', 'summary', 'help', 'hint', 'heading']);
const MESSAGE_CALLEE = /^(set[A-Z]\w*|toast(\.\w+)?|Error|AuthError|ValidationError)$/;

export function listSources(root, directories = ['app', 'components']) {
  const out = [];
  const walk = directory => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) { if (entry === 'ui' || entry === 'api') continue; walk(path); }
      else if (/\.tsx$/.test(entry)) out.push(path);
    }
  };
  // components/ui holds generic shadcn primitives with no product wording; app/api never renders pages.
  for (const directory of directories) walk(join(root, directory));
  return out.sort();
}

function clean(value) { return value.replace(/\s+/g, ' ').trim(); }
function looksLikeProse(value) {
  // Needs letters and either a space or a capitalised word; filters class names, ids, paths and enum values.
  if (!/[A-Za-z]{2}/.test(value)) return false;
  if (/^(\/|https?:)/.test(value)) return false;
  if (/^[\w:/.#@%[\]()-]+$/.test(value) && !/^[A-Z][a-z]+$/.test(value)) return false;
  return /\s/.test(value) || /^[A-Z][a-z]{3,}/.test(value);
}

/** Returns [{file, line, text, kind}] for every readable string in one source file. */
export function extractStrings(file, root) {
  const sourceText = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const found = [];
  const seen = new Set();
  const add = (node, text, kind) => {
    const value = clean(text);
    if (seen.has(node.getStart())) return;
    if (value && looksLikeProse(value)) { seen.add(node.getStart()); found.push({ file: relative(root, file), line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: value, kind }); }
  };
  // Any other sentence-like string (for example a role description inside an array of choices). It must be text
  // handed to the reader, not an import path, comparison, switch case, type, object key or non-readable attribute.
  const isSentenceLiteral = node => {
    if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node) && !ts.isTemplateExpression(node)) return false;
    const parent = node.parent;
    if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isCaseClause(parent) || ts.isLiteralTypeNode(parent) || ts.isElementAccessExpression(parent) || ts.isExternalModuleReference(parent)) return false;
    if (ts.isJsxAttribute(parent) || (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent))) return false;
    if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(parent.operatorToken.kind)) return false;
    if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
    if (ts.isCallExpression(parent) && /^(fetch|cn|clsx|cva|twMerge|require|import|getElementById|querySelector|URL|includes|startsWith|endsWith|has|get|set|redirect|revalidatePath|replace|match|test|split|join)$/.test(parent.expression.getText().split('.').pop())) return false;
    const value = clean(textOf(node) ?? '');
    return /^[A-Z][A-Za-z’'-]*\s+\S/.test(value) && /\s/.test(value);
  };
  const textOf = node => ts.isStringLiteralLike(node) ? node.text
    : ts.isTemplateExpression(node) ? node.head.text + node.templateSpans.map(span => ' ' + span.literal.text).join('') : null;
  const stringsIn = (node, kind) => {
    const visit = child => {
      const text = textOf(child);
      if (text !== null) add(child, text, kind);
      else if (ts.isConditionalExpression(child)) { visit(child.whenTrue); visit(child.whenFalse); }
      else if (ts.isBinaryExpression(child) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.PlusToken].includes(child.operatorToken.kind)) { visit(child.left); visit(child.right); }
      else if (ts.isParenthesizedExpression(child)) visit(child.expression);
      else if (ts.isJsxElement(child) || ts.isJsxFragment(child) || ts.isJsxSelfClosingElement(child)) { /* walked separately */ }
    };
    visit(node);
  };
  const walk = node => {
    if (ts.isJsxText(node)) add(node, node.text, 'jsx-text');
    else if (ts.isJsxAttribute(node) && READABLE_ATTRIBUTES.has(node.name.getText())) {
      const initializer = node.initializer;
      if (initializer && ts.isStringLiteral(initializer)) add(initializer, initializer.text, 'attribute');
      else if (initializer && ts.isJsxExpression(initializer) && initializer.expression) stringsIn(initializer.expression, 'attribute');
    } else if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      stringsIn(node.expression, 'jsx-expression');
    } else if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && READABLE_PROPERTIES.has(node.name.text)) {
      stringsIn(node.initializer, 'property');
    } else if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      if (MESSAGE_CALLEE.test(node.expression.getText())) for (const argument of node.arguments ?? []) stringsIn(argument, 'message');
    } else if (isSentenceLiteral(node)) add(node, textOf(node), 'literal');
    ts.forEachChild(node, walk);
  };
  walk(source);
  return found;
}

export function allStrings(root, directories) {
  return listSources(root, directories).flatMap(file => extractStrings(file, root));
}

export function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Flesch-Kincaid grade for running text, one sentence per supplied string unless it holds several. */
export function readingGrade(texts) {
  let words = 0, sentences = 0, syllables = 0;
  for (const text of texts) {
    const parts = text.split(/(?<=[.!?])\s+/).filter(part => /[A-Za-z]/.test(part));
    sentences += Math.max(1, parts.length);
    for (const word of text.match(/[A-Za-z’']+/g) ?? []) { words++; syllables += countSyllables(word); }
  }
  if (!words || !sentences) return 0;
  return 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
}
