// API route for enrolment management
import { NextResponse } from 'next/server';
import { connectToDB } from '@/lib/mongodb';
import Enrolment from '@/src/modules/enrolments/enrolment.model';

export async function GET() {
  try {
    await connectToDB();
    
    const enrolments = await Enrolment.find()
      .populate('studentId', 'firstName lastName')
      .populate('courseId', 'title code')
      .populate('classId', 'name');
    
    return NextResponse.json(enrolments);
  } catch (error) {
    // console.error('Error fetching enrolments:', error);
    return NextResponse.json(
      { message: 'Failed to fetch enrolments' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await connectToDB();
    
    const body = await request.json();
    
    const enrolment = new Enrolment(body);
    
    const savedEnrolment = await enrolment.save();
    
    return NextResponse.json(savedEnrolment, { status: 201 });
  } catch (error) {
    // console.error('Error creating enrolment:', error);
    return NextResponse.json(
      { message: 'Failed to create enrolment' },
      { status: 500 }
    );
  }
}