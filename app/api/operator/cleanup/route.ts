import { env } from 'cloudflare:workers';
import { deleteIdeasForCleanup, listIdeasForCleanup } from '@/db/store';

export const runtime = 'edge';

const noStoreHeaders = { 'cache-control': 'no-store' };

function authorized(request: Request) {
  const configured = env.SQUIRREL_BOARD_OPERATOR_TOKEN;
  const supplied = request.headers.get('authorization');
  return Boolean(configured && supplied === `Bearer ${configured}`);
}

function unauthorized() {
  return Response.json({ error: 'Operator authorization required.' }, { status: 401, headers: noStoreHeaders });
}

export async function GET(request: Request) {
  if (!authorized(request)) return unauthorized();
  try {
    const prefix = new URL(request.url).searchParams.get('prefix') ?? '';
    const ideas = await listIdeasForCleanup(prefix);
    return Response.json({ count: ideas.length, ideas }, { headers: noStoreHeaders });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not preview cleanup targets.' },
      { status: 400, headers: noStoreHeaders },
    );
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return unauthorized();
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.confirm !== 'DELETE_SELECTED_IDEAS') {
      return Response.json(
        { error: 'Exact cleanup confirmation is required.' },
        { status: 400, headers: noStoreHeaders },
      );
    }
    const ids = Array.isArray(body.ideaIds) ? body.ideaIds.map(String) : [];
    const deleted = await deleteIdeasForCleanup(ids);
    return Response.json({ count: deleted.length, deleted }, { headers: noStoreHeaders });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not delete cleanup targets.' },
      { status: 400, headers: noStoreHeaders },
    );
  }
}
