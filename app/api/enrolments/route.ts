import { listEnrolments, enrolStudent, updateEnrolmentStatus } from '../../../lib/education/enrolments';
import { getPrincipal } from '../../../lib/education/auth';
import { parseSearchParams } from '../../../lib/education/request-body';
import { enrolmentSchema } from '../../../lib/education/validation';

export async function GET(request: Request) {
  const principal = getPrincipal();
  if (!principal) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  
  try {
    const params = parseSearchParams(
      enrolmentSchema.pick({ studentId: true, classId: true }),
      searchParams
    );
    
    const filter: { studentId?: string; classId?: string } = {};
    if (params.studentId) filter.studentId = params.studentId;
    if (params.classId) filter.classId = params.classId;

    const enrolments = await listEnrolments(filter);
    return Response.json(enrolments);
  } catch (error) {
    return Response.json({ error: 'Failed to fetch enrolments' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const principal = getPrincipal();
  if (!principal) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    // Check if user has permission to enrol students (admin or teacher)
    if (principal.role !== 'admin' && principal.role !== 'teacher') {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    
    // Validate the body structure - we use the full schema since it requires both studentId and classId
    const validatedBody = enrolmentSchema.parse(body);
    
    const enrolment = await enrolStudent(validatedBody.studentId, validatedBody.classId);
    return Response.json(enrolment, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: 'Failed to enrol student' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const principal = getPrincipal();
  if (!principal) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    // Check if user has permission to update enrolment status (admin or teacher)
    if (principal.role !== 'admin' && principal.role !== 'teacher') {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    
    // Validate the body structure - we use a partial schema but make sure we extract required fields
    const validatedBody = enrolmentSchema.pick({ id: true, status: true }).parse(body);
    
    // Explicit check that required fields exist before calling updateEnrolmentStatus
    if (!validatedBody.id) {
      return Response.json({ error: 'Enrolment ID is required' }, { status: 400 });
    }
    
    const updatedEnrolment = await updateEnrolmentStatus(validatedBody.id, validatedBody.status);
    
    if (!updatedEnrolment) {
      return Response.json({ error: 'Enrolment not found' }, { status: 404 });
    }
    
    return Response.json(updatedEnrolment);
  } catch (error) {
    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: 'Failed to update enrolment status' }, { status: 500 });
  }
}