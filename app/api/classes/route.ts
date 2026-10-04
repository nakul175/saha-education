import { NextRequest } from 'next/server';
import { listClasses, createClass } from '@/lib/education/classes';
import { parseRequestBodyWithErrorHandling } from '@/lib/education/request-body';
import { classSchema } from '@/lib/education/validation';
import { getPrincipal, requireRole } from '@/lib/education/auth';

export async function GET(request: NextRequest) {
  try {
    const principal = getPrincipal();
    
    if (!principal) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || undefined;
    const teacherId = searchParams.get('teacherId') || undefined;

    // Only include schoolId filter if user has admin role
    let filteredSchoolId: string | undefined = undefined;
    if (principal.role === 'admin' && schoolId) {
      filteredSchoolId = schoolId;
    } else if (principal.role !== 'admin') {
      // For non-admin users, we might want to use their own schoolId or teacherId
      filteredSchoolId = principal.schoolId;
    }

    const classes = await listClasses(filteredSchoolId);
    
    return Response.json(classes);
  } catch (error) {
    console.error('Error fetching classes:', error);
    return Response.json({ error: 'Failed to fetch classes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = getPrincipal();
    
    if (!principal) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Only admin can create classes
    requireRole(principal, 'admin');

    const result = await parseRequestBodyWithErrorHandling(classSchema, request);
    
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    const createdClass = await createClass(result.data);
    
    return Response.json(createdClass, { status: 201 });
  } catch (error) {
    console.error('Error creating class:', error);
    return Response.json({ error: 'Failed to create class' }, { status: 500 });
  }
}