import { authenticated, body } from '@/lib/education/http';
import {
  listCurriculumReferences,
  createCurriculumReference,
  createCurriculumSchema,
  CurriculumConflict,
  type CurriculumFilter,
} from '@/lib/education/curriculum';

// Filters are strict, single-valued query parameters; blank values mean "not set".
// A repeated key stays an array so the strict schema rejects it after the role check.
function filters(request: Request): CurriculumFilter {
  const search = new URL(request.url).searchParams,
    input: Record<string, string | string[]> = {};
  for (const key of new Set(search.keys())) {
    const values = search.getAll(key);
    if (values.length > 1) input[key] = values;
    else if (values[0].trim()) input[key] = values[0].trim();
  }
  return input as CurriculumFilter;
}
export async function GET(request: Request) {
  return authenticated(request, false, async (principal) =>
    Response.json(await listCurriculumReferences(principal, filters(request))),
  );
}
export async function POST(request: Request) {
  return authenticated(request, true, async (principal) => {
    const input = await body(request, createCurriculumSchema);
    try {
      return Response.json(await createCurriculumReference(principal, input), { status: 201 });
    } catch (error) {
      if (error instanceof CurriculumConflict)
        return Response.json({ error: 'Curriculum reference conflict' }, { status: 409 });
      throw error;
    }
  });
}
