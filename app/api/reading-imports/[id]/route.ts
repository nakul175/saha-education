import { authenticated } from '@/lib/education/http';
import { getReadingImport } from '@/lib/education/reading-imports';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return authenticated(request, false, async (principal) =>
    Response.json(await getReadingImport(principal, (await params).id)),
  );
}
