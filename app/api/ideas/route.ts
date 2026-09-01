import { createIdea, listIdeas } from '@/db/store';

export const runtime = 'edge';

export async function GET(request: Request) {
  try {
    const status = new URL(request.url).searchParams.get('status') ?? undefined;
    return Response.json({ ideas: await listIdeas(status) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not load ideas.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const title = String(body.title ?? '').trim();
    const why = String(body.why ?? '').trim();
    const notes = String(body.notes ?? '').trim() || null;
    const source = body.source === 'Agent' || body.source === 'Shared' ? body.source : 'Human';

    if (title.length < 3 || title.length > 120) {
      return Response.json({ error: 'Idea title must be between 3 and 120 characters.' }, { status: 400 });
    }
    if (why.length < 3 || why.length > 500) {
      return Response.json({ error: 'Why it matters must be between 3 and 500 characters.' }, { status: 400 });
    }

    const idea = await createIdea({ title, why, notes, source });
    return Response.json({ idea, message: `${idea.id} captured without becoming a commitment.` }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not capture the idea.' },
      { status: 500 },
    );
  }
}
