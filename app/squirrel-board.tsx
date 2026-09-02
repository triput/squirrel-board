'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type Idea = {
  id: string;
  title: string;
  why: string;
  status: string;
  nextAction: string | null;
  notes: string | null;
  source: 'Human' | 'Agent' | 'Shared';
  createdAt: number;
  updatedAt: number;
};

type Proposal = {
  id: string;
  ideaId: string;
  ideaTitle: string;
  field: 'status' | 'nextAction' | 'notes';
  proposedValue: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  createdAt: number;
};

type Decision = {
  id: string;
  ideaId: string | null;
  ideaTitle: string | null;
  decision: string;
  reason: string;
  source: 'Human' | 'Agent' | 'Shared';
  createdAt: number;
};

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool: (tool: ToolDefinition) => Promise<void>;
      unregisterTool?: (name: string) => Promise<void>;
    };
  }
}

const statusStyles: Record<string, string> = {
  Captured: 'border border-[#b78338]/35 bg-[#b78338]/15 text-[#f2c77f]',
  Exploring: 'border border-[#4d8da0]/40 bg-[#4d8da0]/15 text-[#8fd5dd]',
  'Decision needed': 'border border-[#8b70b3]/40 bg-[#8b70b3]/15 text-[#c9b0ee]',
  Active: 'border border-[#399884]/40 bg-[#399884]/15 text-[#84d8c2]',
  Parked: 'border border-[#67738a]/40 bg-[#67738a]/15 text-[#bbc3d1]',
  Done: 'border border-[#467f9f]/40 bg-[#467f9f]/15 text-[#91c8e2]',
  Dropped: 'border border-[#a8515d]/40 bg-[#a8515d]/15 text-[#e5a1ab]',
};

const statuses = ['Captured', 'Exploring', 'Decision needed', 'Active', 'Parked', 'Done', 'Dropped'];

async function readJson(response: Response) {
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(String(payload.error ?? 'The request failed.'));
  return payload;
}

export default function SquirrelBoard() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [title, setTitle] = useState('');
  const [why, setWhy] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [siteToolsReady, setSiteToolsReady] = useState(false);
  const [editingIdea, setEditingIdea] = useState<Idea | null>(null);
  const [triageStatus, setTriageStatus] = useState('Captured');
  const [triageNextAction, setTriageNextAction] = useState('');
  const [triageNotes, setTriageNotes] = useState('');
  const [triageReason, setTriageReason] = useState('');
  const [triageSaving, setTriageSaving] = useState(false);

  const loadWorkspace = useCallback(async () => {
    const [ideasPayload, proposalsPayload, decisionsPayload] = await Promise.all([
      readJson(await fetch('/api/ideas', { cache: 'no-store' })),
      readJson(await fetch('/api/proposals', { cache: 'no-store' })),
      readJson(await fetch('/api/decisions', { cache: 'no-store' })),
    ]);
    setIdeas(ideasPayload.ideas as Idea[]);
    setProposals(proposalsPayload.proposals as Proposal[]);
    setDecisions(decisionsPayload.decisions as Decision[]);
  }, []);

  useEffect(() => {
    loadWorkspace()
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load ideas.'))
      .finally(() => setLoading(false));
  }, [loadWorkspace]);

  useEffect(() => {
    if (typeof document.modelContext?.registerTool !== 'function') return;

    const captureTool: ToolDefinition = {
      name: 'capture_idea',
      description: 'Capture a promising side idea in Squirrel Board without treating it as a commitment. Use when the human wants an idea preserved for later triage.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'A concise name for the idea, 3 to 120 characters.' },
          why: { type: 'string', description: 'Why the idea might matter, 3 to 500 characters.' },
          notes: { type: 'string', description: 'Optional links, boundaries, or useful context.' },
        },
        required: ['title', 'why'],
        additionalProperties: false,
      },
      execute: async (input) => {
        const payload = await readJson(await fetch('/api/ideas', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...input, source: 'Agent' }),
        }));
        await loadWorkspace();
        setNotice(String(payload.message));
        return {
          message: payload.message,
          idea: payload.idea,
          verification: 'The idea is now visible in the shared backlog. Its status is Captured, not Active.',
        };
      },
    };

    const listTool: ToolDefinition = {
      name: 'list_ideas',
      description: 'Read the current Squirrel Board backlog, optionally filtered by status. This does not change any idea.',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['Captured', 'Exploring', 'Decision needed', 'Active', 'Parked', 'Done', 'Dropped'],
            description: 'Optional status filter.',
          },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async (input) => {
        const query = input.status ? `?status=${encodeURIComponent(String(input.status))}` : '';
        const payload = await readJson(await fetch(`/api/ideas${query}`, { cache: 'no-store' }));
        return {
          count: (payload.ideas as Idea[]).length,
          ideas: payload.ideas,
          guidance: 'Listing ideas is not a request to promote or begin work on them.',
        };
      },
    };

    const getTool: ToolDefinition = {
      name: 'get_idea',
      description: 'Read one Squirrel Board idea by its IDEA-### identifier. This does not change the idea.',
      inputSchema: {
        type: 'object',
        properties: {
          ideaId: { type: 'string', pattern: '^IDEA-[0-9]{3,}$', description: 'The idea identifier, such as IDEA-005.' },
        },
        required: ['ideaId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async (input) => {
        const payload = await readJson(await fetch(`/api/ideas/${encodeURIComponent(String(input.ideaId))}`, { cache: 'no-store' }));
        return { idea: payload.idea, guidance: 'Reading an idea is not a request to begin work on it.' };
      },
    };

    const proposeTool: ToolDefinition = {
      name: 'propose_update',
      description: 'Propose a status, next action, or notes update for an existing idea. The proposal waits for human approval and does not alter the idea by itself.',
      inputSchema: {
        type: 'object',
        properties: {
          ideaId: { type: 'string', pattern: '^IDEA-[0-9]{3,}$', description: 'The existing idea identifier.' },
          field: { type: 'string', enum: ['status', 'nextAction', 'notes'], description: 'The field the agent proposes changing.' },
          proposedValue: { type: 'string', description: 'The proposed new value.' },
          reason: { type: 'string', description: 'Why this change may help the human during triage.' },
        },
        required: ['ideaId', 'field', 'proposedValue', 'reason'],
        additionalProperties: false,
      },
      execute: async (input) => {
        const payload = await readJson(await fetch('/api/proposals', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        }));
        await loadWorkspace();
        setNotice(String(payload.message));
        return {
          proposal: payload.proposal,
          message: payload.message,
          verification: 'The authoritative idea is unchanged until a human approves this proposal in Squirrel Board.',
        };
      },
    };

    Promise.all([
      document.modelContext.registerTool(captureTool),
      document.modelContext.registerTool(listTool),
      document.modelContext.registerTool(getTool),
      document.modelContext.registerTool(proposeTool),
    ]).then(() => setSiteToolsReady(true)).catch(() => setSiteToolsReady(false));

    return () => {
      document.modelContext?.unregisterTool?.('capture_idea').catch(() => undefined);
      document.modelContext?.unregisterTool?.('list_ideas').catch(() => undefined);
      document.modelContext?.unregisterTool?.('get_idea').catch(() => undefined);
      document.modelContext?.unregisterTool?.('propose_update').catch(() => undefined);
    };
  }, [loadWorkspace]);

  const counts = useMemo(() => ({
    active: ideas.filter((idea) => idea.status === 'Active').length,
    contained: ideas.filter((idea) => idea.status !== 'Active').length,
  }), [ideas]);

  async function capture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = await readJson(await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, why, source: 'Human' }),
      }));
      setTitle('');
      setWhy('');
      setNotice(String(payload.message));
      await loadWorkspace();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not capture the idea.');
    } finally {
      setSaving(false);
    }
  }

  async function resolveProposal(id: string, resolution: 'Approved' | 'Rejected') {
    setError('');
    setNotice('');
    try {
      const payload = await readJson(await fetch(`/api/proposals/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resolution }),
      }));
      setNotice(String(payload.message));
      await loadWorkspace();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not resolve the proposal.');
    }
  }

  function openTriage(idea: Idea) {
    setEditingIdea(idea);
    setTriageStatus(idea.status);
    setTriageNextAction(idea.nextAction ?? '');
    setTriageNotes(idea.notes ?? '');
    setTriageReason('');
    setError('');
    setNotice('');
  }

  async function saveTriage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingIdea) return;
    setTriageSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = await readJson(await fetch(`/api/ideas/${encodeURIComponent(editingIdea.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: triageStatus,
          nextAction: triageNextAction,
          notes: triageNotes,
          reason: triageReason,
        }),
      }));
      setEditingIdea(null);
      setNotice(String(payload.message));
      await loadWorkspace();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update the idea.');
    } finally {
      setTriageSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0d1320] text-[#eef1f7]">
      <header className="border-b border-[#33405a] bg-[#111827]/90 shadow-[0_1px_30px_rgba(3,7,18,0.35)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-2xl border border-[#d59b48]/40 bg-[#a55839]/25 text-2xl shadow-[0_0_28px_rgba(213,155,72,0.16)]">🐿️</span>
            <div>
              <p className="text-lg font-extrabold tracking-[-0.025em]">Squirrel Board</p>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9ba8c0]">Human judgment. Agent attention.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 text-xs font-bold">
            <span className={`rounded-full border px-3 py-1.5 ${siteToolsReady ? 'border-[#45ae99]/50 bg-[#45ae99]/15 text-[#8ad8c7]' : 'border-[#42506a] bg-[#192235] text-[#b8c1d1]'}`}>
              {siteToolsReady ? 'Agent tools ready' : 'Human mode'}
            </span>
            <span className="rounded-full border border-[#42506a] bg-[#192235] px-3 py-1.5 text-[#b8c1d1]">{counts.contained} safely contained · {counts.active} active</span>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:py-14">
        <div>
          <p className="mb-3 text-sm font-extrabold uppercase tracking-[0.18em] text-[#6ec9bb]">Capture first. Triage later.</p>
          <h1 className="max-w-3xl text-4xl font-black leading-[1.02] tracking-[-0.05em] sm:text-6xl">
            Keep the good ideas.
            <span className="block bg-gradient-to-r from-[#85b8df] via-[#a795d5] to-[#75c4b6] bg-clip-text text-transparent">Choose which ones get a life.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[#aeb8ca] sm:text-lg">
            A shared backlog where you and your agent can preserve emerging ideas without turning every squirrel into a project.
          </p>
          <div aria-live="polite" className="mt-5 min-h-7 text-sm font-bold">
            {notice && <p className="text-[#7fd0bf]">✓ {notice}</p>}
            {error && <p className="text-[#e39aa5]">{error}</p>}
          </div>
        </div>

        <form onSubmit={capture} className="rounded-[28px] border border-[#3b4964] bg-[#172033] p-5 shadow-[0_22px_80px_rgba(2,6,18,0.45),0_0_50px_rgba(94,75,148,0.08)] sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-[#9a8bd0]">Quick capture</p>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.03em]">What just appeared?</h2>
            </div>
            <span aria-hidden="true" className="text-2xl">✨</span>
          </div>
          <label className="block text-sm font-bold" htmlFor="idea-title">Idea</label>
          <input id="idea-title" value={title} onChange={(event) => setTitle(event.target.value)} minLength={3} maxLength={120} required className="mt-2 w-full rounded-xl border border-[#43516c] bg-[#0f1728] px-4 py-3 text-[#f2f4f8] outline-none transition placeholder:text-[#69758b] focus:border-[#6fb8c6] focus:ring-4 focus:ring-[#6fb8c6]/15" placeholder="Name the squirrel" />
          <label className="mt-4 block text-sm font-bold" htmlFor="idea-why">Why might it matter?</label>
          <textarea id="idea-why" value={why} onChange={(event) => setWhy(event.target.value)} minLength={3} maxLength={500} required className="mt-2 min-h-24 w-full resize-none rounded-xl border border-[#43516c] bg-[#0f1728] px-4 py-3 text-[#f2f4f8] outline-none transition placeholder:text-[#69758b] focus:border-[#6fb8c6] focus:ring-4 focus:ring-[#6fb8c6]/15" placeholder="One sentence is enough" />
          <button type="submit" disabled={saving} className="mt-4 w-full rounded-xl bg-[#5f5794] px-4 py-3 font-extrabold text-white shadow-[0_8px_30px_rgba(95,87,148,0.25)] transition hover:bg-[#7569ad] focus:outline-none focus:ring-4 focus:ring-[#8f80c7]/25 disabled:cursor-wait disabled:opacity-60">
            {saving ? 'Containing squirrel…' : 'Capture idea'}
          </button>
          <p className="mt-3 text-center text-xs leading-5 text-[#8f9ab0]">Capturing is not committing. That is the entire point.</p>
        </form>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-[#33405a] pb-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#8295b8]">Shared backlog</p>
            <h2 className="mt-1 text-2xl font-black tracking-[-0.035em]">Current residents</h2>
          </div>
          <p className="max-w-md text-sm text-[#9ba8c0]">Agents can capture and propose. Humans decide what becomes a commitment.</p>
        </div>

        {loading ? (
          <p className="rounded-2xl border border-[#3b4964] bg-[#172033] p-6 text-sm font-bold text-[#9ba8c0]">Opening the habitat…</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {ideas.map((idea) => (
              <article key={idea.id} className="group flex min-h-64 flex-col rounded-2xl border border-[#35445f] bg-[#151e30] p-5 shadow-[0_12px_35px_rgba(2,6,18,0.18)] transition hover:-translate-y-0.5 hover:border-[#63749a] hover:shadow-[0_18px_45px_rgba(2,6,18,0.38)]">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs font-bold text-[#8492ab]">{idea.id}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${statusStyles[idea.status] ?? statusStyles.Captured}`}>{idea.status}</span>
                </div>
                <h3 className="mt-5 text-xl font-black leading-tight tracking-[-0.025em]">{idea.title}</h3>
                <p className="mt-3 flex-1 text-sm leading-6 text-[#aeb8ca]">{idea.why}</p>
                {idea.nextAction && <p className="mt-4 rounded-xl border border-[#394761] bg-[#10192a] px-3 py-2 text-xs leading-5 text-[#aeb8ca]"><strong className="text-[#87c8bc]">Next:</strong> {idea.nextAction}</p>}
                {idea.notes && <p className="mt-3 line-clamp-3 text-xs leading-5 text-[#8f9ab0]"><strong className="text-[#b4a4dd]">Notes:</strong> {idea.notes}</p>}
                <div className="mt-6 flex items-center justify-between gap-3 border-t border-[#303c54] pt-4 text-xs font-bold text-[#8492ab]">
                  <span>Captured by {idea.source}</span>
                  <button type="button" onClick={() => openTriage(idea)} className="rounded-lg border border-[#5a6680] bg-[#202b41] px-3 py-1.5 font-extrabold text-[#d8deea] transition hover:border-[#8b70b3] hover:bg-[#2a3450] focus:outline-none focus:ring-4 focus:ring-[#8b70b3]/20">Triage</button>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mt-10 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[24px] border border-[#3b4964] bg-[#172033] p-5 sm:p-6" aria-labelledby="proposal-heading">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#a491d4]">Human review</p>
                <h2 id="proposal-heading" className="mt-1 text-2xl font-black tracking-[-0.035em]">Pending proposals</h2>
              </div>
              <span className="grid h-9 min-w-9 place-items-center rounded-full bg-[#655b9b] px-2 text-sm font-black text-white">{proposals.length}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#9ba8c0]">The agent may propose. Nothing changes here until a human decides.</p>

            <div className="mt-5 space-y-3">
              {proposals.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#465571] bg-[#111a2b] p-5 text-sm text-[#9ba8c0]">
                  No proposals are waiting. The humans remain firmly in charge.
                </div>
              ) : proposals.map((proposal) => (
                <article key={proposal.id} className="rounded-2xl border border-[#465571] bg-[#10192a] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-[#8492ab]">{proposal.id} · {proposal.ideaId}</span>
                    <span className="rounded-full border border-[#8b70b3]/40 bg-[#8b70b3]/15 px-2.5 py-1 text-xs font-extrabold text-[#c9b0ee]">Awaiting you</span>
                  </div>
                  <h3 className="mt-3 font-black">{proposal.ideaTitle}</h3>
                  <p className="mt-2 text-sm text-[#aeb8ca]">
                    Change <strong>{proposal.field}</strong> to <strong>{proposal.proposedValue}</strong>
                  </p>
                  <p className="mt-2 rounded-xl border border-[#35425b] bg-[#172238] px-3 py-2 text-xs leading-5 text-[#aeb8ca]">{proposal.reason}</p>
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => resolveProposal(proposal.id, 'Approved')} className="rounded-xl bg-[#377f74] px-4 py-2 text-sm font-extrabold text-white transition hover:bg-[#45988b] focus:outline-none focus:ring-4 focus:ring-[#55aa9c]/20">Approve</button>
                    <button onClick={() => resolveProposal(proposal.id, 'Rejected')} className="rounded-xl border border-[#6e4650] bg-[#271923] px-4 py-2 text-sm font-extrabold text-[#e5a1ab] transition hover:border-[#a8515d] hover:bg-[#351c28] focus:outline-none focus:ring-4 focus:ring-[#a8515d]/15">Reject</button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-[#4b4269] bg-[#171529] p-5 text-[#eef1f7] shadow-[0_20px_60px_rgba(31,20,65,0.22)] sm:p-6" aria-labelledby="decision-heading">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#a491d4]">Provenance</p>
            <h2 id="decision-heading" className="mt-1 text-2xl font-black tracking-[-0.035em]">Decision log</h2>
            <p className="mt-2 text-sm leading-6 text-[#aaa9c4]">Just enough history to avoid having the same argument twice.</p>
            <div className="mt-5 space-y-3">
              {decisions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#51496e] p-5 text-sm text-[#aaa9c4]">No decisions yet. Civilization remains provisionally intact.</div>
              ) : decisions.map((decision) => (
                <article key={decision.id} className="rounded-2xl border border-[#4b4565] bg-[#211e38] p-4">
                  <div className="flex items-center justify-between gap-3 font-mono text-xs text-[#9795b5]">
                    <span>{decision.ideaId ?? 'GENERAL'}</span>
                    <time>{new Date(decision.createdAt).toLocaleDateString()}</time>
                  </div>
                  <p className="mt-3 text-sm font-extrabold leading-5">{decision.decision}</p>
                  <p className="mt-2 text-xs leading-5 text-[#aaa9c4]">{decision.reason}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>

      {editingIdea && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#050812]/80 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingIdea(null); }}>
          <form onSubmit={saveTriage} role="dialog" aria-modal="true" aria-labelledby="triage-heading" className="my-6 w-full max-w-xl rounded-[28px] border border-[#4b5672] bg-[#172033] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.65)] sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs font-bold text-[#8492ab]">{editingIdea.id}</p>
                <h2 id="triage-heading" className="mt-1 text-2xl font-black tracking-[-0.03em]">Triage {editingIdea.title}</h2>
              </div>
              <button type="button" onClick={() => setEditingIdea(null)} aria-label="Close triage" className="grid h-9 w-9 place-items-center rounded-xl border border-[#465571] text-lg text-[#b8c1d1] hover:bg-[#242f47]">×</button>
            </div>

            <label className="mt-6 block text-sm font-bold" htmlFor="triage-status">Status</label>
            <select id="triage-status" value={triageStatus} onChange={(event) => setTriageStatus(event.target.value)} className="mt-2 w-full rounded-xl border border-[#43516c] bg-[#0f1728] px-4 py-3 text-[#f2f4f8] outline-none focus:border-[#6fb8c6] focus:ring-4 focus:ring-[#6fb8c6]/15">
              {statuses.map((status) => <option key={status}>{status}</option>)}
            </select>

            <label className="mt-4 block text-sm font-bold" htmlFor="triage-next">Next action <span className="font-normal text-[#8f9ab0]">(optional)</span></label>
            <textarea id="triage-next" value={triageNextAction} onChange={(event) => setTriageNextAction(event.target.value)} maxLength={500} className="mt-2 min-h-20 w-full resize-y rounded-xl border border-[#43516c] bg-[#0f1728] px-4 py-3 text-[#f2f4f8] outline-none focus:border-[#6fb8c6] focus:ring-4 focus:ring-[#6fb8c6]/15" />

            <label className="mt-4 block text-sm font-bold" htmlFor="triage-notes">Notes <span className="font-normal text-[#8f9ab0]">(optional)</span></label>
            <textarea id="triage-notes" value={triageNotes} onChange={(event) => setTriageNotes(event.target.value)} maxLength={5000} className="mt-2 min-h-28 w-full resize-y rounded-xl border border-[#43516c] bg-[#0f1728] px-4 py-3 text-[#f2f4f8] outline-none focus:border-[#6fb8c6] focus:ring-4 focus:ring-[#6fb8c6]/15" />

            <label className="mt-4 block text-sm font-bold" htmlFor="triage-reason">Why are you making this decision?</label>
            <textarea id="triage-reason" value={triageReason} onChange={(event) => setTriageReason(event.target.value)} minLength={3} maxLength={500} required className="mt-2 min-h-20 w-full resize-y rounded-xl border border-[#43516c] bg-[#0f1728] px-4 py-3 text-[#f2f4f8] outline-none focus:border-[#6fb8c6] focus:ring-4 focus:ring-[#6fb8c6]/15" placeholder="A short reason becomes part of the decision log." />

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setEditingIdea(null)} className="rounded-xl border border-[#4b5872] px-4 py-2.5 text-sm font-extrabold text-[#c4ccda] hover:bg-[#202b41]">Cancel</button>
              <button type="submit" disabled={triageSaving} className="rounded-xl bg-[#377f74] px-5 py-2.5 text-sm font-extrabold text-white hover:bg-[#45988b] disabled:cursor-wait disabled:opacity-60">{triageSaving ? 'Saving decision…' : 'Save human decision'}</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
