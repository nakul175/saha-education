import { NextRequest } from 'next/server';
import { getClass, updateClass } from '@/lib/education/classes';
import { listEnrolments } from '@/lib/education/enrolments';
import { getStudent } from '@/lib/education/students';
import { parseRequestBodyWithErrorHandling } from '@/lib/education/request-body';
import { classSchema } from '@/lib/education/validation';
import { getPrincipal, requireRole } from '@/lib/education/auth';
import type { Principal } from '@/lib/education/types';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    const principal = getPrincipal();
    
    if (!principal) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const classRecord = await getClass(id);
    
    if (!classRecord) {
      return Response.json({ error: 'Class not found' }, { status: 404 });
    }
    
    // Get enrolments for this class
    const enrolments = await listEnrolments({ classId: id });
    
    // Get students for each enrolment
    const studentPromises = enrolments.map(enrolment => getStudent(enrolment.studentId));
    const students = await Promise.all(studentPromises);
    
    // Filter out any null students and create the response
    const enrolledStudents = students.filter(student => student !== null);
    
    return Response.json({
      ...classRecord,
      enrolledStudents
    });
  } catch (error) {
    console.error('Error fetching class:', error);
    return Response.json({ error: 'Failed to fetch class' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    const principal = getPrincipal();
    
    if (!principal) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Only admin can update classes
    try {
      requireRole(principal, 'admin');
    } catch (error) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await parseRequestBodyWithErrorHandling(classSchema, request);
    
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    const updatedClass = await updateClass(id, result.data);
    
    if (!updatedClass) {
      return Response.json({ error: 'Class not found' }, { status: 404 });
    }
    
    return Response.json(updatedClass);
  } catch (error) {
    console.error('Error updating class:', error);
    return Response.json({ error: 'Failed to update class' }, { status: 500 });
  }
}