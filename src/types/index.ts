export type UserRole = 'admin' | 'manager' | 'user';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: UserRole;
  managerId?: string;
  position?: string;
  createdAt: string;
}

export interface ActivityType {
  id: string;
  name: string;
  color: string;
}

export interface Position {
  id: string;
  name: string;
}

export interface TimeEntry {
  id: string;
  userId: string;
  date: string;
  hours: number;
  activityTypeId: string;
  description?: string;
  status: 'pending' | 'approved' | 'rejected';
  validatedBy?: string;
  validatedAt?: string;
  createdAt: string;
}

export interface AbsenceRequest {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  type: 'vacation' | 'sick' | 'personal' | 'other';
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  validatedBy?: string;
  validatedAt?: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  userId: string;
  date: string;
  amount: number;
  reason: string;
  receiptFile?: string; // base64
  receiptFileName?: string;
  receiptFileType?: string;
  status: 'pending' | 'approved' | 'rejected';
  validatedBy?: string;
  validatedAt?: string;
  createdAt: string;
}

export interface AppSettings {
  clubName: string;
  clubLogo?: string;
}

// ─── Seasons ──────────────────────────────────────────────────────────────────

export type SeasonStatus = 'draft' | 'published' | 'closed' | 'deleted';

export interface Season {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: SeasonStatus;
  createdAt: string;
}

export interface TemplateWeek {
  id: string;
  seasonId: string;
  label: string;
  courses: TemplateCourse[];
  createdAt: string;
}

export interface TemplateCourse {
  id: string;
  templateWeekId: string;
  label: string;
  dayOfWeek: number; // 1=Lundi … 7=Dimanche
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  teacherId: string | null;
  createdAt: string;
}

export interface WeekAssignment {
  id: string;
  seasonId: string;
  templateWeekId: string;
  weekStartDate: string; // YYYY-MM-DD (lundi)
}

export interface SchoolHoliday {
  label: string;
  startDate: string;
  endDate: string;
}

export type DocumentStatus = 'pending_validation' | 'validated';

export interface HRDocument {
  id: string;
  fileName: string;
  fileType: string;
  fileData?: string; // base64, only in detail view
  documentType: string;
  userId?: string;
  detectedEmployeeName?: string;
  periodStart?: string;
  periodEnd?: string;
  notes?: string;
  status: DocumentStatus;
  uploadedBy: string;
  validatedAt?: string;
  createdAt: string;
}
