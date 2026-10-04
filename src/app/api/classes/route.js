// API route for class management
import { NextResponse } from 'next/server';
import { connectToDB } from '@/lib/mongodb';
import Class from '@/src/modules/classes/class.model';

export async function GET() {
  try {
    await connectToDB();
    
    const classes = await Class.find()
      .populate('schoolId', 'name code')
      .populate('teacherId', 'firstName lastName')
      .populate('students', 'firstName lastName');
    
    return NextResponse.json(classes);
  } catch (error) {
    // console.error('Error fetching classes:', error);
    return NextResponse.json(
      { message: 'Failed to fetch classes' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await connectToDB();
    
    const body = await request.json();
    
    const classEntry = new Class(body);
    
    const savedClass = await classEntry.save();
    
    return NextResponse.json(savedClass, { status: 201 });
  } catch (error) {
    // console.error('Error creating class:', error);
    return NextResponse.json(
      { message: 'Failed to create class' },
      { status: 500 }
    );
  }
}