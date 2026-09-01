import { listDecisions } from '@/db/store';

export const runtime = 'edge';

export async function GET() {
  try {
    return Response.json({ decisions: await listDecisions() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not load decisions.' }, { status: 500 });
  }
}
