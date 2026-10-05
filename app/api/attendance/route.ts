import { NextRequest } from 'next/server';
import { listAttendance, markAttendance } from '@/lib/education/attendance';
import { getPrincipal, requireRole } from '@/lib/education/auth';
import { parseRequestBodyWithErrorHandling } from '@/lib/education/request-body';
import { z } from 'zod';

// GET /api/attendance - List attendance records
export async function GET(request: NextRequest) {
  try {
    const principal = getPrincipal();
    if (!principal) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId');
    const date = searchParams.get('date');
    const studentId = searchParams.get('studentId');
    
    // Only teachers and admins can view attendance records
    requireRole(principal, 'teacher');
    
    // Build filter object for listAttendance function
    const filter: { classId?: string; date?: string; studentId?: string } = {};
    if (classId) filter.classId = classId;
    if (date) filter.date = date;
    if (studentId) filter.studentId = studentId;
    
    const records = await listAttendance(filter);
    
    return Response.json(records);
  } catch (error) {
    console.error('Error fetching attendance:', error);
    return Response.json({ error: 'Failed to fetch attendance records' }, { status: 500 });
  }
}

// POST /api/attendance - Mark attendance for a class
export async function POST(request: NextRequest) {
  try {
    const principal = getPrincipal();
    if (!principal) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    // Only teachers and admins can mark attendance
    requireRole(principal, 'teacher');
    
    // Parse request body
    const schema = z.object({
      classId: z.string(),
      date: z.string(),
      entries: z.array(z.object({
        studentId: z.string(),
        status: z.enum(['present', 'absent', 'late', 'excused']),
        note: z.string().optional()
      }))
    });
    
    const result = await parseRequestBodyWithErrorHandling(schema, request);
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    
    const { classId, date, entries } = result.data;
    
    // Mark attendance for the entire class
    const records = await markAttendance(classId, date, entries, principal.id);
    
    // Note: Guardians are not notified in this implementation as no notification function exists
    
    return Response.json(records);
  } catch (error) {
    console.error('Error creating attendance records:', error);
    return Response.json({ error: 'Failed to create attendance records' }, { status: 500 });
  }
}