import { createProposal, listProposals } from '@/db/store';

export const runtime = 'edge';

export async function GET() {
  try {
    return Response.json({ proposals: await listProposals() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not load proposals.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const ideaId = String(body.ideaId ?? '').trim();
    const field = String(body.field ?? '').trim() as 'status' | 'nextAction' | 'notes';
    const proposedValue = String(body.proposedValue ?? '').trim();
    const reason = String(body.reason ?? '').trim();
    if (!ideaId || !field || proposedValue.length < 1 || reason.length < 3) {
      return Response.json({ error: 'Idea, field, proposed value, and reason are required.' }, { status: 400 });
    }
    const proposal = await createProposal({ ideaId, field, proposedValue, reason });
    return Response.json({ proposal, message: `${proposal.id} is waiting for human review.` }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not create the proposal.' }, { status: 500 });
  }
}
