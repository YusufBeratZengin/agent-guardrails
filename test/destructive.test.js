import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectDestructive } from '../src/guards/destructive.mjs';
import { config, context } from './helpers.mjs';

// Additional release coverage; existing .mjs regression cases remain unchanged.
const cases = [
  ['git-primary-branch-delete', 'git branch -D -- main', 'git branch -d feature'],
  ['git-recovery-delete', 'git reflog expire --expire=now --all && git gc --prune=now', 'git reflog expire --expire=now --help && git gc --prune=now'],
  ['git-recovery-delete', 'git gc --prune=now; git reflog expire --expire=now', 'git reflog expire --expire=now && git gc --prune=now --help'],
  ['git-update-ref-delete', 'git -c core.logAllRefUpdates=true update-ref -d refs/heads/synthetic', 'git update-ref --help'],
  ['docker-system-prune', 'sudo docker system prune -af', 'docker image ls'],
  ['docker-volume-prune', 'docker volume prune --force', 'docker volume prune --help'],
  ['disk-overwrite', 'dd if=image of=/dev/nvme0n1', 'dd if=image of=local.img'],
  ['filesystem-format', '/sbin/mkfs.ext4 /dev/sda', 'mkfs.ext4 --help'],
  ['file-shred', 'shred -uz local.img', 'shred --version'],
  ['external-truncate', 'truncate -s 0 -- /outside/log', 'truncate -s 0 -- ./local.log'],
  ['disk-redirection', 'echo --help > /dev/sda', 'echo --help > local.log'],
  ['disk-redirection', 'mkfs.ext4 --help >> /dev/sdb', 'mkfs.ext4 --help'],
];

for (const [code, denied, allowed] of cases) {
  test(`destructive release coverage: ${code}: ${denied}`, () => {
    assert.ok(inspectDestructive(denied, context(), config.rules.destructive).some(f => f.code === code));
    assert.deepEqual(inspectDestructive(allowed, context(), config.rules.destructive), []);
  });
}
