import { NextRequest } from 'next/server';
import { listStudents, createStudent } from '@/lib/education/students';
import { parseRequestBodyWithErrorHandling } from '@/lib/education/request-body';
import { studentSchema } from '@/lib/education/validation';
import { getPrincipal, requireRole } from '@/lib/education/auth';

export async function GET(request: NextRequest) {
  try {
    const principal = getPrincipal();
    
    if (!principal) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;

    let schoolId: string | undefined = undefined;
    // Only include schoolId if user has admin role
    if (principal.role === 'admin') {
      schoolId = principal.schoolId;
    }

    const students = await listStudents(schoolId);
    
    return Response.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    return Response.json({ error: 'Failed to fetch students' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = getPrincipal();
    
    if (!principal) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Check that user can create students (admin or teacher role)
    try {
      requireRole(principal, 'admin');
    } catch (error) {
      try {
        requireRole(principal, 'teacher');
      } catch (error2) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const result = await parseRequestBodyWithErrorHandling(studentSchema, request);
    
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    const student = await createStudent(result.data);
    
    return Response.json(student, { status: 201 });
  } catch (error) {
    console.error('Error creating student:', error);
    return Response.json({ error: 'Failed to create student' }, { status: 500 });
  }
}