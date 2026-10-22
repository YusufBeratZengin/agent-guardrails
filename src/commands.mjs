/** Small shell lexer, NOT an interpreter. Retains Windows backslashes, handles
 * quotes, separators, grouping and literal substitutions. See docs/threat-model.md.
 * @param {string} source @returns {string[][]} */
export function commands(source) {
  /** @type {string[][]} */
  const result = [];
  /** @type {string[]} */
  let words = [];
  let word = '';
  let quote = '';
  let started = false;
  const pushWord = () => { if (started) { words.push(word); word = ''; started = false; } };
  const pushCommand = () => { pushWord(); if (words.length) { result.push(words); words = []; } };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const windowsWord = /^[a-z]:(?:$|[\\/])/i.test(word) || word.startsWith('\\') || (word.length === 0 && c === '\\' && source[i + 1] === '\\');
    if (c === '\\' && !windowsWord && quote !== "'" && /[\s"';&|()$`\\]/.test(source[i + 1] ?? '') && source[i + 1] !== undefined) {
      // Preserve path separators before letters; unescape shell punctuation.
      word += source[++i]; started = true; continue;
    }
    if (quote) {
      if (c === quote) { quote = ''; } else { word += c; }
      started = true; continue;
    }
    if (c === '"' || c === "'") { quote = c; started = true; continue; }
    if (c === '#' && !started) {
      while (i < source.length && source[i] !== '\n') { i++; }
      pushCommand(); continue;
    }
    if (/\s/.test(c)) { if (c === '\n' || c === '\r') { pushCommand(); } else { pushWord(); } continue; }
    if (/[;&|(){}]/.test(c)) { pushCommand(); continue; }
    if (c === '>' || c === '<') { pushWord(); words.push(c); continue; }
    word += c; started = true;
  }
  pushCommand();
  return result;
}

/** Strip common executable wrappers and Git global options; inspect literal
 * sh -c / powershell -Command payloads and substitutions without executing them.
 * @param {string} source @param {number} [depth] @returns {string[][]} */
export function invocations(source, depth = 0) {
  if (depth > 8) { throw new Error('Command nesting limit exceeded'); }
  const parsed = commands(source);
  /** @type {string[][]} */
  const result = [];
  for (const raw of parsed) {
    const words = [...raw];
    while (words.length && (/^[a-z_][\w]*=/i.test(words[0]) || /^(sudo|env|command|exec|nohup|&|call)$/i.test(words[0]))) { words.shift(); }
    if (!words.length) { continue; }
    words[0] = words[0].replace(/\\/g, '/').split('/').at(-1)?.replace(/\.exe$/i, '') ?? '';
    if (/^(ba|da|z|k)?sh$|^(powershell|pwsh|cmd)$/i.test(words[0])) {
      const flag = words.findIndex(w => /^(-[clc]+|-command|\/c)$/i.test(w));
      if (flag >= 0) { result.push(...invocations(words.slice(flag + 1).join(' '), depth + 1)); }
    }
    if (/^git$/i.test(words[0])) {
      while (words[1]?.startsWith('-')) {
        const option = words.splice(1, 1)[0];
        if (/^(-C|-c|--git-dir|--work-tree)$/i.test(option)) { words.splice(1, 1); }
      }
    }
    result.push(words);
  }
  // Double-quoted substitutions still execute. Single-quoted ones cause safe,
  // conservative false positives here rather than silently missing a command.
  for (const match of source.matchAll(/\$\(([^()]*)\)|`([^`]+)`/g)) {
    result.push(...invocations(match[1] ?? match[2], depth + 1));
  }
  return result;
}
