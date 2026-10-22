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
    const windowsWord = /^[a-z]:(?:$|[\\/])/i.test(word) || /(?:^|[\s"'])[a-z]:[^\s"']*$/i.test(word) || word.startsWith('\\') || (word.length === 0 && c === '\\' && source[i + 1] === '\\');
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

/** Executable name: basename without a Windows extension, lower-cased.
 * @param {string} word */
function exeName(word) {
  return (word.replace(/\\/g, '/').split('/').at(-1) ?? '').replace(/\.(?:exe|cmd|bat)$/i, '').toLowerCase();
}

/** Options that consume the following word, per wrapper.
 * @type {Record<string, RegExp>} */
const wrapperValueOptions = {
  sudo: /^-[ugCDhprRtTU]$/, doas: /^-[uC]$/, env: /^-[uCS]$/, nice: /^-n$/, ionice: /^-[cnp]$/,
  timeout: /^-[sk]$/, xargs: /^-[adEIiLnPs]$/, stdbuf: /^-[ioe]$/, setsid: /^$/, time: /^-[fo]$/,
};
const wrapperNames = new Set(['sudo', 'doas', 'env', 'command', 'exec', 'nohup', '&', 'call', 'builtin', 'nice', 'ionice', 'timeout', 'time', 'xargs', 'stdbuf', 'setsid']);

/** Strip leading assignments and wrapper executables together with their own
 * options, so `sudo -u root rm` and `timeout 5 rm` expose the real command.
 * Mutates and normalizes `words[0]`. @param {string[]} words */
function unwrap(words) {
  for (;;) {
    while (words.length && /^[a-z_]\w*=/i.test(words[0])) { words.shift(); }
    if (!words.length) { return; }
    const name = exeName(words[0]);
    if (!wrapperNames.has(name)) { words[0] = exeName(words[0]); return; }
    words.shift();
    for (;;) {
      const next = words[0];
      if (next === undefined) { return; }
      if (next === '--') { words.shift(); break; }
      if (!next.startsWith('-')) {
        if (name === 'env' && /^[a-z_]\w*=/i.test(next)) { words.shift(); continue; }
        break;
      }
      words.shift();
      if (wrapperValueOptions[name]?.test(next)) { words.shift(); }
    }
    // timeout takes a duration before the command.
    if (name === 'timeout' && words.length) { words.shift(); }
  }
}

/** Inline-script flag of a shell: -c, -lc, -xec, PowerShell -Command, cmd /c or /k.
 * @param {string} word */
function inlineFlag(word) {
  return (/^-[a-z]{1,4}$/i.test(word) && /c/i.test(word)) || /^-command$/i.test(word) || /^\/[ck]$/i.test(word);
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
    unwrap(words);
    if (!words.length) { continue; }
    if (/^eval$/i.test(words[0])) { result.push(...invocations(words.slice(1).join(' '), depth + 1)); continue; }
    if (/^(ba|da|z|k)?sh$|^(powershell|pwsh|cmd)$/i.test(words[0])) {
      const flag = words.findIndex((w, i) => i > 0 && inlineFlag(w));
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
