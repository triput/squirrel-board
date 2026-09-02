import { env } from 'cloudflare:workers';

export const STATUSES = [
  'Captured',
  'Exploring',
  'Decision needed',
  'Active',
  'Parked',
  'Done',
  'Dropped',
] as const;

export type IdeaStatus = (typeof STATUSES)[number];

export type Idea = {
  id: string;
  title: string;
  why: string;
  status: IdeaStatus;
  nextAction: string | null;
  notes: string | null;
  source: 'Human' | 'Agent' | 'Shared';
  createdAt: number;
  updatedAt: number;
};

export type Proposal = {
  id: string;
  ideaId: string;
  ideaTitle: string;
  field: 'status' | 'nextAction' | 'notes';
  proposedValue: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  createdAt: number;
  resolvedAt: number | null;
};

export type Decision = {
  id: string;
  ideaId: string | null;
  ideaTitle: string | null;
  decision: string;
  reason: string;
  source: 'Human' | 'Agent' | 'Shared';
  createdAt: number;
};

const seedIdeas: Omit<Idea, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'IDEA-001',
    title: 'Write the Snippet Bank post',
    why: 'Show how useful language can be captured without derailing the work that produced it.',
    status: 'Captured',
    nextAction: null,
    notes: 'Practical first. The turn-boundary hypothesis can remain a separate squirrel.',
    source: 'Shared',
  },
  {
    id: 'IDEA-002',
    title: 'Test the keeper-sentence hypothesis',
    why: 'Turn an intriguing conversational pattern into a small, observable research question.',
    status: 'Exploring',
    nextAction: 'Code a small retrospective sample before building instrumentation.',
    notes: null,
    source: 'Agent',
  },
  {
    id: 'IDEA-003',
    title: 'Build Squirrel Board',
    why: 'Give people and their agents one inspectable place to preserve ideas and choose what becomes work.',
    status: 'Active',
    nextAction: 'Prove capture_idea end to end through WebMCP.',
    notes: 'One target. Ruthless scope. No rodent economy.',
    source: 'Human',
  },
];

function db() {
  if (!env.DB) throw new Error('Database binding is unavailable.');
  return env.DB;
}

export async function ensureDatabase() {
  const database = db();
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS ideas (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      why TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Captured',
      next_action TEXT,
      notes TEXT,
      source TEXT NOT NULL DEFAULT 'Human',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status)'),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_ideas_updated_at ON ideas(updated_at)'),
    database.prepare(`CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY,
      idea_id TEXT NOT NULL,
      field TEXT NOT NULL,
      proposed_value TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      created_at INTEGER NOT NULL,
      resolved_at INTEGER
    )`),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status)'),
    database.prepare(`CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      idea_id TEXT,
      decision TEXT NOT NULL,
      reason TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'Human',
      created_at INTEGER NOT NULL
    )`),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_decisions_created_at ON decisions(created_at)'),
  ]);

  const count = await database.prepare('SELECT COUNT(*) AS total FROM ideas').first<{ total: number }>();
  if (Number(count?.total ?? 0) === 0) {
    const now = Date.now();
    await database.batch(
      seedIdeas.map((idea, index) =>
        database
          .prepare(`INSERT INTO ideas
            (id, title, why, status, next_action, notes, source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            idea.id,
            idea.title,
            idea.why,
            idea.status,
            idea.nextAction,
            idea.notes,
            idea.source,
            now + index,
            now + index,
          ),
      ),
    );
  }
}

function mapIdea(row: Record<string, unknown>): Idea {
  return {
    id: String(row.id),
    title: String(row.title),
    why: String(row.why),
    status: String(row.status) as IdeaStatus,
    nextAction: row.next_action ? String(row.next_action) : null,
    notes: row.notes ? String(row.notes) : null,
    source: String(row.source) as Idea['source'],
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function listIdeas(status?: string) {
  await ensureDatabase();
  const database = db();
  const query = status && STATUSES.includes(status as IdeaStatus)
    ? database.prepare('SELECT * FROM ideas WHERE status = ? ORDER BY updated_at DESC').bind(status)
    : database.prepare('SELECT * FROM ideas ORDER BY updated_at DESC');
  const result = await query.all<Record<string, unknown>>();
  return result.results.map(mapIdea);
}

export async function createIdea(input: {
  title: string;
  why: string;
  notes?: string | null;
  source?: Idea['source'];
}) {
  await ensureDatabase();
  const database = db();
  const next = await database
    .prepare("SELECT MAX(CAST(SUBSTR(id, 6) AS INTEGER)) AS max_id FROM ideas WHERE id LIKE 'IDEA-%'")
    .first<{ max_id: number | null }>();
  const id = `IDEA-${String(Number(next?.max_id ?? 0) + 1).padStart(3, '0')}`;
  const now = Date.now();
  await database
    .prepare(`INSERT INTO ideas
      (id, title, why, status, next_action, notes, source, created_at, updated_at)
      VALUES (?, ?, ?, 'Captured', NULL, ?, ?, ?, ?)`)
    .bind(id, input.title, input.why, input.notes ?? null, input.source ?? 'Human', now, now)
    .run();
  const row = await database.prepare('SELECT * FROM ideas WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!row) throw new Error('The captured idea could not be read back.');
  return mapIdea(row);
}

export async function getIdea(id: string) {
  await ensureDatabase();
  const row = await db().prepare('SELECT * FROM ideas WHERE id = ?').bind(id).first<Record<string, unknown>>();
  return row ? mapIdea(row) : null;
}

export async function updateIdeaByHuman(input: {
  id: string;
  status: IdeaStatus;
  nextAction: string | null;
  notes: string | null;
  reason: string;
}) {
  await ensureDatabase();
  const database = db();
  const current = await getIdea(input.id);
  if (!current) throw new Error('Idea not found.');

  const changes: string[] = [];
  if (current.status !== input.status) changes.push(`status ${current.status} → ${input.status}`);
  if (current.nextAction !== input.nextAction) changes.push('next action updated');
  if (current.notes !== input.notes) changes.push('notes updated');
  if (changes.length === 0) throw new Error('Nothing changed.');

  const now = Date.now();
  const decisionId = `DEC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  await database.batch([
    database.prepare(`UPDATE ideas
      SET status = ?, next_action = ?, notes = ?, updated_at = ?
      WHERE id = ?`)
      .bind(input.status, input.nextAction, input.notes, now, input.id),
    database.prepare(`INSERT INTO decisions
      (id, idea_id, decision, reason, source, created_at)
      VALUES (?, ?, ?, ?, 'Human', ?)`)
      .bind(decisionId, input.id, `Human triage: ${changes.join('; ')}`, input.reason, now),
  ]);

  const updated = await getIdea(input.id);
  if (!updated) throw new Error('The updated idea could not be read back.');
  return updated;
}

function mapProposal(row: Record<string, unknown>): Proposal {
  return {
    id: String(row.id),
    ideaId: String(row.idea_id),
    ideaTitle: String(row.idea_title ?? ''),
    field: String(row.field) as Proposal['field'],
    proposedValue: String(row.proposed_value),
    reason: String(row.reason),
    status: String(row.status) as Proposal['status'],
    createdAt: Number(row.created_at),
    resolvedAt: row.resolved_at ? Number(row.resolved_at) : null,
  };
}

export async function listProposals(status = 'Pending') {
  await ensureDatabase();
  const result = await db()
    .prepare(`SELECT proposals.*, ideas.title AS idea_title
      FROM proposals JOIN ideas ON ideas.id = proposals.idea_id
      WHERE proposals.status = ? ORDER BY proposals.created_at DESC`)
    .bind(status)
    .all<Record<string, unknown>>();
  return result.results.map(mapProposal);
}

export async function createProposal(input: {
  ideaId: string;
  field: Proposal['field'];
  proposedValue: string;
  reason: string;
}) {
  await ensureDatabase();
  const idea = await getIdea(input.ideaId);
  if (!idea) throw new Error(`Idea ${input.ideaId} does not exist.`);
  if (!['status', 'nextAction', 'notes'].includes(input.field)) throw new Error('That field cannot be proposed.');
  if (input.field === 'status' && !STATUSES.includes(input.proposedValue as IdeaStatus)) {
    throw new Error('The proposed status is not valid.');
  }
  const id = `PROP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const now = Date.now();
  await db()
    .prepare(`INSERT INTO proposals
      (id, idea_id, field, proposed_value, reason, status, created_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, 'Pending', ?, NULL)`)
    .bind(id, input.ideaId, input.field, input.proposedValue, input.reason, now)
    .run();
  return {
    id,
    ideaId: input.ideaId,
    ideaTitle: idea.title,
    field: input.field,
    proposedValue: input.proposedValue,
    reason: input.reason,
    status: 'Pending',
    createdAt: now,
    resolvedAt: null,
  } satisfies Proposal;
}

export async function resolveProposal(id: string, resolution: 'Approved' | 'Rejected') {
  await ensureDatabase();
  const database = db();
  const row = await database
    .prepare(`SELECT proposals.*, ideas.title AS idea_title
      FROM proposals JOIN ideas ON ideas.id = proposals.idea_id
      WHERE proposals.id = ? AND proposals.status = 'Pending'`)
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) throw new Error('That pending proposal no longer exists.');
  const proposal = mapProposal(row);
  const now = Date.now();

  if (resolution === 'Approved') {
    const column = proposal.field === 'nextAction' ? 'next_action' : proposal.field;
    await database.prepare(`UPDATE ideas SET ${column} = ?, updated_at = ? WHERE id = ?`)
      .bind(proposal.proposedValue, now, proposal.ideaId)
      .run();
  }

  const decisionId = `DEC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  await database.batch([
    database.prepare('UPDATE proposals SET status = ?, resolved_at = ? WHERE id = ?')
      .bind(resolution, now, id),
    database.prepare(`INSERT INTO decisions
      (id, idea_id, decision, reason, source, created_at)
      VALUES (?, ?, ?, ?, 'Human', ?)`)
      .bind(
        decisionId,
        proposal.ideaId,
        `${resolution}: ${proposal.field} → ${proposal.proposedValue}`,
        proposal.reason,
        now,
      ),
  ]);
  return { ...proposal, status: resolution, resolvedAt: now };
}

function mapDecision(row: Record<string, unknown>): Decision {
  return {
    id: String(row.id),
    ideaId: row.idea_id ? String(row.idea_id) : null,
    ideaTitle: row.idea_title ? String(row.idea_title) : null,
    decision: String(row.decision),
    reason: String(row.reason),
    source: String(row.source) as Decision['source'],
    createdAt: Number(row.created_at),
  };
}

export async function listDecisions() {
  await ensureDatabase();
  const result = await db()
    .prepare(`SELECT decisions.*, ideas.title AS idea_title
      FROM decisions LEFT JOIN ideas ON ideas.id = decisions.idea_id
      ORDER BY decisions.created_at DESC LIMIT 20`)
    .all<Record<string, unknown>>();
  return result.results.map(mapDecision);
}

export async function listIdeasForCleanup(prefix: string) {
  await ensureDatabase();
  const normalized = prefix.trim();
  if (normalized.length < 3 || normalized.length > 40) {
    throw new Error('Cleanup prefix must be between 3 and 40 characters.');
  }
  const result = await db()
    .prepare(`SELECT * FROM ideas
      WHERE title LIKE ? ESCAPE '\\'
      ORDER BY created_at DESC
      LIMIT 50`)
    .bind(`${normalized.replace(/[\\%_]/g, '\\$&')}%`)
    .all<Record<string, unknown>>();
  return result.results.map(mapIdea);
}

export async function deleteIdeasForCleanup(ids: string[]) {
  await ensureDatabase();
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length < 1 || uniqueIds.length > 50) {
    throw new Error('Cleanup requires between 1 and 50 explicit idea IDs.');
  }
  if (uniqueIds.some((id) => !/^IDEA-[0-9]{3,}$/.test(id))) {
    throw new Error('Every cleanup target must be an IDEA-### identifier.');
  }

  const database = db();
  const placeholders = uniqueIds.map(() => '?').join(', ');
  const found = await database
    .prepare(`SELECT id, title FROM ideas WHERE id IN (${placeholders}) ORDER BY id`)
    .bind(...uniqueIds)
    .all<{ id: string; title: string }>();

  if (found.results.length !== uniqueIds.length) {
    const foundIds = new Set(found.results.map((idea) => idea.id));
    const missing = uniqueIds.filter((id) => !foundIds.has(id));
    throw new Error(`Cleanup stopped because these ideas do not exist: ${missing.join(', ')}.`);
  }

  await database.batch([
    database.prepare(`DELETE FROM proposals WHERE idea_id IN (${placeholders})`).bind(...uniqueIds),
    database.prepare(`DELETE FROM decisions WHERE idea_id IN (${placeholders})`).bind(...uniqueIds),
    database.prepare(`DELETE FROM ideas WHERE id IN (${placeholders})`).bind(...uniqueIds),
  ]);

  return found.results;
}
