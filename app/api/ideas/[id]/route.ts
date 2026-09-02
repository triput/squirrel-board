import { getIdea, STATUSES, updateIdeaByHuman } from '@/db/store';

export const runtime = 'edge';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const idea = await getIdea(id);
    if (!idea) return Response.json({ error: 'Idea not found.' }, { status: 404 });
    return Response.json({ idea });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not load the idea.' }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const status = String(body.status ?? '').trim();
    const nextAction = String(body.nextAction ?? '').trim() || null;
    const notes = String(body.notes ?? '').trim() || null;
    const reason = String(body.reason ?? '').trim();

    if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
      return Response.json({ error: 'Choose a valid status.' }, { status: 400 });
    }
    if (nextAction && nextAction.length > 500) {
      return Response.json({ error: 'Next action must be 500 characters or fewer.' }, { status: 400 });
    }
    if (notes && notes.length > 5000) {
      return Response.json({ error: 'Notes must be 5,000 characters or fewer.' }, { status: 400 });
    }
    if (reason.length < 3 || reason.length > 500) {
      return Response.json({ error: 'Decision reason must be between 3 and 500 characters.' }, { status: 400 });
    }

    const idea = await updateIdeaByHuman({
      id,
      status: status as (typeof STATUSES)[number],
      nextAction,
      notes,
      reason,
    });
    return Response.json({ idea, message: `${idea.id} updated by human decision.` });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update the idea.';
    return Response.json({ error: message }, { status: message === 'Idea not found.' ? 404 : 400 });
  }
}
