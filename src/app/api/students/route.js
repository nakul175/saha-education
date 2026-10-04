// API route for student management
import { NextResponse } from 'next/server';
import { connectToDB } from '@/lib/mongodb';
import User from '@/src/modules/users/user.model';

export async function GET() {
  try {
    await connectToDB();
    
    const students = await User.find({ role: 'student' })
      .populate('schoolId', 'name code')
      .populate('guardianId', 'firstName lastName phoneNumber email');
    
    return NextResponse.json(students);
  } catch (error) {
    // console.error('Error fetching students:', error);
    return NextResponse.json(
      { message: 'Failed to fetch students' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await connectToDB();
    
    const body = await request.json();
    
    // Create student with role set to 'student'
    const studentData = { ...body, role: 'student' };
    const student = new User(studentData);
    
    const savedStudent = await student.save();
    
    return NextResponse.json(savedStudent, { status: 201 });
  } catch (error) {
    // console.error('Error creating student:', error);
    return NextResponse.json(
      { message: 'Failed to create student' },
      { status: 500 }
    );
  }
}