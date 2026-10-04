import { listCourses, createCourse } from '@/lib/education/courses';
import { getPrincipal, requireRole } from '@/lib/education/auth';
import { parseRequestBodyWithErrorHandling } from '@/lib/education/request-body';
import { courseSchema } from '@/lib/education/validation';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get('schoolId') || undefined;
  
  try {
    const courses = await listCourses(schoolId);
    return Response.json(courses);
  } catch (error) {
    return Response.json({ error: 'Failed to fetch courses' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // Verify authentication and admin role
    const principal = getPrincipal();
    if (!principal) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    requireRole(principal, 'admin');
    
    // Parse request body
    const result = await parseRequestBodyWithErrorHandling(courseSchema, request);
    
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    
    const course = await createCourse(result.data);
    return Response.json(course, { status: 201 });
  } catch (error) {
    return Response.json({ error: 'Failed to create course' }, { status: 500 });
  }
}