import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// The web editor drops any field it doesn't know about when it saves a work, so its field list
// (public/admin/config.yml) must match the catalogue schema (src/content.config.ts).
test('web editor fields match the catalogue schema', () => {
  const schema = readFileSync('src/content.config.ts', 'utf8');
  const config = readFileSync('public/admin/config.yml', 'utf8');
  const schemaFields = [...schema.matchAll(/^ {6}(\w+): z\./gm)].map((m) => m[1]).sort();
  const start = config.indexOf('  - name: works');
  const end = config.indexOf('\n  - name: ', start + 1);
  const worksBlock = config.slice(start, end === -1 ? undefined : end);
  const configFields = [...worksBlock.matchAll(/^ {6}- name: (\w+)/gm)]
    .map((m) => m[1])
    .filter((n) => n !== 'body')
    .sort();
  expect(configFields).toEqual(schemaFields);
});
