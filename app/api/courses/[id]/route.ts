import { NextRequest } from 'next/server';
import { getCourse, updateCourse } from '@/lib/education/courses';
import { requirePrincipal, requireRole } from '@/lib/education/auth';
import { parseRequestBodyWithErrorHandling } from '@/lib/education/request-body';
import { courseSchema } from '@/lib/education/validation';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  const course = await getCourse(id);
  
  if (!course) {
    return Response.json({ error: 'Course not found' }, { status: 404 });
  }
  
  return Response.json(course);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const principal = requirePrincipal();
  requireRole(principal, 'admin');
  
  const { id } = await params;
  
  const result = await parseRequestBodyWithErrorHandling(courseSchema, request);
  
  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  
  const updatedCourse = await updateCourse(id, result.data);
  
  if (!updatedCourse) {
    return Response.json({ error: 'Course not found' }, { status: 404 });
  }
  
  return Response.json(updatedCourse);
}