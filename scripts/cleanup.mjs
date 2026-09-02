import { readFile } from 'node:fs/promises';

const defaultOrigin = 'https://squirrel-board-trish-dex.triput79.chatgpt.site';
const args = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function token() {
  if (process.env.SQUIRREL_BOARD_OPERATOR_TOKEN) return process.env.SQUIRREL_BOARD_OPERATOR_TOKEN.trim();
  try {
    return (await readFile(new URL('../.env.operator', import.meta.url), 'utf8')).trim();
  } catch {
    throw new Error('Set SQUIRREL_BOARD_OPERATOR_TOKEN or create .env.operator with the operator token.');
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${option('--origin') ?? defaultOrigin}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${await token()}`,
      'content-type': 'application/json',
      ...options.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Request failed with ${response.status}.`);
  return payload;
}

function show(ideas) {
  if (ideas.length === 0) {
    console.log('No matching ideas.');
    return;
  }
  console.table(ideas.map((idea) => ({
    id: idea.id,
    title: idea.title,
    ...('status' in idea ? { status: idea.status } : {}),
    ...('source' in idea ? { source: idea.source } : {}),
  })));
}

const prefix = option('--prefix');
const ids = option('--ids')?.split(',').map((id) => id.trim()).filter(Boolean);
const execute = args.includes('--execute');

if (!prefix && !ids?.length) {
  throw new Error('Use --prefix QA-0901 to preview test records, or --ids IDEA-004,IDEA-005 for explicit targets.');
}

let targets = ids;
if (prefix) {
  const preview = await request(`/api/operator/cleanup?prefix=${encodeURIComponent(prefix)}`);
  show(preview.ideas);
  targets = preview.ideas.map((idea) => idea.id);
}

if (!execute) {
  if (!prefix) console.log(`Would delete: ${targets.join(', ')}`);
  console.log('Preview only. Add --execute --confirm DELETE_SELECTED_IDEAS to delete these exact records.');
  process.exit(0);
}

if (option('--confirm') !== 'DELETE_SELECTED_IDEAS') {
  throw new Error('Deletion requires --confirm DELETE_SELECTED_IDEAS.');
}
if (!targets?.length) throw new Error('No matching ideas; nothing was deleted.');

const result = await request('/api/operator/cleanup', {
  method: 'POST',
  body: JSON.stringify({ ideaIds: targets, confirm: 'DELETE_SELECTED_IDEAS' }),
});
console.log(`Deleted ${result.count} idea(s), including their proposals and decision-log entries:`);
show(result.deleted);
