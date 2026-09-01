import { resolveProposal } from '@/db/store';

export const runtime = 'edge';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const resolution = body.resolution === 'Approved' ? 'Approved' : body.resolution === 'Rejected' ? 'Rejected' : null;
    if (!resolution) return Response.json({ error: 'Resolution must be Approved or Rejected.' }, { status: 400 });
    return Response.json({ proposal: await resolveProposal(id, resolution), message: `Proposal ${resolution.toLowerCase()}.` });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not resolve the proposal.' }, { status: 500 });
  }
}
