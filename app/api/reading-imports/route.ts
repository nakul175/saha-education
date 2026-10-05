import { authenticated, body } from '@/lib/education/http';
import { assertImportStaff, listReadingImports, stageReadingImport, stageReadingImportSchema, ReadingImportConflict } from '@/lib/education/reading-imports';
export async function GET(request: Request) { return authenticated(request, false, async principal => Response.json(await listReadingImports(principal))); }
export async function POST(request: Request) { return authenticated(request, true, async principal => {
  assertImportStaff(principal); const input = await body(request, stageReadingImportSchema);
  try { return Response.json(await stageReadingImport(principal, input), { status: 201 }); }
  catch (error) { if (error instanceof ReadingImportConflict) return Response.json({ error: 'Reading import conflict' }, { status: 409 }); throw error; }
}); }
