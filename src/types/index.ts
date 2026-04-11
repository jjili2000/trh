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
