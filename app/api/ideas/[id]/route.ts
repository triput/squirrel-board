import { getIdea } from '@/db/store';

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
