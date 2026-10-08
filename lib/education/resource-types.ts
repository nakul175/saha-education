export type ResourceType = 'lesson' | 'worksheet' | 'quiz' | 'activity';
export type ResourceContent = {
  title: string;
  type: ResourceType;
  curriculum: string;
  gradeLevel: string;
  subject: string;
  language: string;
  objectives: string;
  body: string;
  teacherNotes: string;
  answerKey: string;
};
export type ResourceVersion = ResourceContent & {
  id: string;
  resourceId: string;
  version: number;
  createdBy: string;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
};
export type TeachingResource = {
  id: string;
  schoolId: string;
  authorId: string;
  createdAt: string;
  latest: ResourceVersion;
};
export type ResourceAssignment = {
  id: string;
  resourceId: string;
  versionId: string;
  classId: string;
  assignedBy: string;
  createdAt: string;
  dueDate: string | null;
  resource: Omit<ResourceVersion, 'teacherNotes' | 'answerKey'>;
};
