import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { main } from '../bin/agent-guardrails.mjs';
import { demoCases } from '../examples/demo.mjs';
import { renderDemo } from '../scripts/make-demo.mjs';
import { fixture, payload } from './helpers.mjs';

const readmes = ['README.md', 'README.tr.md'].map(file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));

test('both README demo blocks equal real CLI test output', async t => {
  const cwd = fixture(t);
  fs.writeFileSync(`${cwd}/.agent-guardrails.json`, '{}');
  let actual = '';
  for (const [label, toolName, toolInput] of demoCases) {
    actual += `${label}\n`;
    const status = await main(['test', JSON.stringify(payload(toolName, toolInput, cwd))], {
      cwd: () => cwd, home: cwd, stdin: [],
      stdout: { write: text => { actual += text; } },
      stderr: { write: () => assert.fail('Demo must not emit an error') },
    });
    assert.equal(status, 0);
  }
  for (const readme of readmes) {
    const block = readme.match(/```text\n(git push\n[\s\S]*?)```/);
    assert.ok(block, 'README must contain the real three-case demo');
    assert.equal(block[1], actual);
  }
});

test('README sections stay aligned between English and Turkish', () => {
  const sections = [
    ['Why', 'Neden agent-guardrails?'],
    ['60-second quick start', 'Bir dakikada kurulum'],
    ['What a block looks like', 'Bir engelleme nasıl görünür?'],
    ['Rules', 'Hangi kurallar var?'],
    ['Why not just permissions.deny?', 'Neden yalnızca permissions.deny yeterli değil?'],
    ['Examples', 'Örnekler'], ['Configuration', 'Ayarlar'], ['CLI', 'Komutlar'],
    ['Threat model', 'Bilmeniz gereken sınırlar'], ['Agent support', 'Ajan desteği'],
    ['Audit log', 'Günlük'], ['Development', 'Geliştirme'], ['FAQ', 'Sık sorulanlar'],
    ['Contributing', 'Katkı'], ['License', 'Lisans'],
  ];
  for (const [index, readme] of readmes.entries()) {
    const headings = [...readme.matchAll(/^## (.+)$/gm)].map(match => match[1]);
    assert.deepEqual(headings, sections.map(pair => pair[index]));
  }
});

test('checked-in demo SVG matches real CLI output and is embedded in both READMEs', async () => {
  assert.equal(fs.readFileSync('docs/demo.svg', 'utf8').replace(/\r\n/g, '\n'), await renderDemo(), 'Run npm run demo after changing demo output');
  for (const readme of readmes) {
    assert.match(readme, /!\[[^\]]+\]\(docs\/demo\.svg\)/);
  }
});
