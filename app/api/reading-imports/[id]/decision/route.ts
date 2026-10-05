import { authenticated, body } from '@/lib/education/http';
import { assertImportStaff, decideReadingImport, readingImportDecisionSchema, ReadingImportConflict } from '@/lib/education/reading-imports';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, true, async principal => {
    assertImportStaff(principal); const input = await body(request, readingImportDecisionSchema);
    try { return Response.json(await decideReadingImport(principal, (await params).id, input)); }
    catch (error) { if (error instanceof ReadingImportConflict) return Response.json({ error: 'Reading import conflict' }, { status: 409 }); throw error; }
  });
}
