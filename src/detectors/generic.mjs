/** @param {string} digits */
export function luhn(digits) {
  if (!/^\d{13,19}$/.test(digits) || /^(\d)\1+$/.test(digits)) { return false; }
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double) { n *= 2; if (n > 9) { n -= 9; } }
    sum += n; double = !double;
  }
  return sum % 10 === 0;
}

/** Generic ISO 13616 shape + mod-97; country-specific lengths belong in locale plugins.
 * @param {string} value */
export function iban(value) {
  const compact = value.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) { return false; }
  const rotated = compact.slice(4) + compact.slice(0, 4);
  let remainder = 0;
  for (const c of rotated) {
    const digits = /[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c;
    for (const digit of digits) { remainder = (remainder * 10 + Number(digit)) % 97; }
  }
  return remainder === 1;
}

/** @type {import('../types.mjs').PiiDetector} */
export const generic = {
  id: 'generic',
  detect(text) {
    /** @type {import('../types.mjs').Detection[]} */
    const found = [];
    for (const m of text.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)) { found.push({ kind: 'email', index: m.index }); }
    for (const m of text.matchAll(/(?<!\w)(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?)?\d[\d .-]{7,16}\d(?!\w)/g)) {
      const digits = m[0].replace(/\D/g, '');
      if (digits.length >= 10 && digits.length <= 15 && !/^\d{4}-\d{2}-\d{2}$/.test(m[0])) { found.push({ kind: 'phone', index: m.index }); }
    }
    for (const m of text.matchAll(/(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g)) {
      if (luhn(m[0].replace(/\D/g, ''))) { found.push({ kind: 'credit-card', index: m.index }); }
    }
    for (const m of text.matchAll(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/gi)) {
      // A spaced match can consume following prose; trim whole trailing words.
      let candidate = m[0];
      while (candidate.length >= 15) {
        if (iban(candidate)) { found.push({ kind: 'iban', index: m.index }); break; }
        const end = candidate.lastIndexOf(' ');
        if (end < 0) { break; }
        candidate = candidate.slice(0, end);
      }
    }
    return found;
  },
};
