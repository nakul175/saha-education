import type { ResourceContent, ResourceType } from './resource-types';

export const RESOURCE_TYPES: ResourceType[] = ['lesson', 'worksheet', 'quiz', 'activity'];
export const RESOURCE_FIELDS: { key: Exclude<keyof ResourceContent, 'type'>; label: string; multiline?: boolean; required?: boolean; maxLength: number; pattern?: string }[] = [
  { key: 'title', label: 'Title', required: true, maxLength: 160 },
  { key: 'curriculum', label: 'Curriculum or local programme', required: true, maxLength: 120 },
  { key: 'gradeLevel', label: 'Grade or learning level', required: true, maxLength: 40 },
  { key: 'subject', label: 'Subject', required: true, maxLength: 80 },
  { key: 'language', label: 'Language code (e.g. en-IN)', required: true, maxLength: 35, pattern: '[a-z]{2,3}(-[A-Za-z0-9]{2,8})*' },
  { key: 'objectives', label: 'Learning objectives', multiline: true, required: true, maxLength: 4000 },
  { key: 'body', label: 'Student material', multiline: true, required: true, maxLength: 20000 },
  { key: 'teacherNotes', label: 'Teacher notes (staff only)', multiline: true, maxLength: 8000 },
  { key: 'answerKey', label: 'Answer key (staff only)', multiline: true, maxLength: 8000 },
];

// Original structural prompts for manual authoring; no generated lesson claims.
const outlines: Record<ResourceType, string> = {
  lesson: 'Opening question:\n[Write a question to introduce the topic.]\n\nExplore:\n[Write the explanation or demonstration.]\n\nPractise:\n[Write a task students can complete.]\n\nReflect:\n[Write a check for understanding.]',
  worksheet: 'Instructions:\n[Write clear instructions.]\n\nTask 1:\n[Write a task and provide space for a response.]\n\nTask 2:\n[Write a second task.]\n\nReflection:\n[Write a reflection question.]',
  quiz: 'Instructions:\n[State how students should respond.]\n\nQuestion 1:\n[Write the question and response options, if needed.]\n\nQuestion 2:\n[Write another question.]',
  activity: 'Materials:\n[List the materials needed.]\n\nSteps:\n1. [Write the first step.]\n2. [Write the next step.]\n\nShare:\n[Write how students will share what they learned.]',
};

export function resourceTemplate(type: ResourceType): ResourceContent {
  return { type, title: '', curriculum: '', gradeLevel: '', subject: '', language: '', objectives: '',
    body: outlines[type], teacherNotes: '', answerKey: '' };
}

export function copyResourceContent(source: ResourceContent): ResourceContent {
  return { type: source.type, title: source.title, curriculum: source.curriculum, gradeLevel: source.gradeLevel,
    subject: source.subject, language: source.language, objectives: source.objectives, body: source.body,
    teacherNotes: source.teacherNotes, answerKey: source.answerKey };
}
