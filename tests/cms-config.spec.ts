import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// The web editor drops any field it doesn't know about when it saves a work, so its field list
// (public/admin/config.yml) must match the catalogue schema (src/content.config.ts).
test('web editor fields match the catalogue schema', () => {
  const schema = readFileSync('src/content.config.ts', 'utf8');
  const config = readFileSync('public/admin/config.yml', 'utf8');
  const schemaFields = [...schema.matchAll(/^ {6}(\w+): z\./gm)].map((m) => m[1]).sort();
  const worksBlock = config.slice(config.indexOf('- name: works'));
  const configFields = [...worksBlock.matchAll(/name: (\w+)/g)]
    .map((m) => m[1])
    .filter((n) => n !== 'works' && n !== 'image' && n !== 'body')
    .sort();
  expect(configFields).toEqual(schemaFields);
});
