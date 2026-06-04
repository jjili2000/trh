export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: UserRole;
  managerId?: string;
  position?: string;
  departmentId?: string | null;
  moduleAccess?: string[];
  blocked?: boolean;
  createdAt: string;
}

export interface ActivityType {
  id: string;
  name: string;
  color: string;
  isGlobal?: boolean;
  departmentIds?: string[];
}

export interface Department {
  id: string;
  name: string;
  parentId: string | null;
  directorId: string | null;
  createdAt: string;
}

export interface Position {
  id: string;
  name: string;
  isProtected?: boolean;
}

export interface ValidationConfig {
  budget: { mode: 'AND' | 'OR'; positions: string[] };
  expenses: { mode: 'AND' | 'OR'; positions: string[] };
}

export interface TimeEntry {
  id: string;
  userId: string;
  date: string;
  hours: number;
  activityTypeId: string;
  description?: string;
  startTime?: string; // HH:MM
  endTime?: string;   // HH:MM
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  rejectionReason?: string | null;
  validatedBy?: string;
  validatedAt?: string;
  createdAt: string;
}

export interface AbsenceRequest {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  durationDays?: number; // peut être décimal (0.5 = demi-journée)
  type: 'vacation' | 'sick' | 'personal' | 'other';
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string | null;
  validatedBy?: string;
  validatedAt?: string;
  createdAt: string;
}

export interface VatLine {
  rate: string;   // ex: "20"
  amount: number; // montant TVA
}

export interface Expense {
  id: string;
  userId: string;
  date: string;
  amount: number;       // montant TTC (compatibilité existante)
  reason: string;
  vendor?: string;
  amountHt?: number;
  vatDetails?: VatLine[];
  receiptFilePath?: string; // nom du fichier sur le serveur (UUID.ext)
  receiptFileName?: string; // nom d'origine affiché à l'utilisateur
  receiptFileType?: string; // MIME type
  receiptFile?: string;     // base64 legacy (avant migration filesystem)
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string | null;
  validatedBy?: string;
  validatedAt?: string;
  createdAt: string;
}

export interface AppSettings {
  clubName: string;
  clubLogo?: string;
  calendarStartHour?: number;
  calendarEndHour?: number;
  appUrl?: string;
}

// ─── Seasons ──────────────────────────────────────────────────────────────────

export type SeasonStatus = 'draft' | 'published' | 'closed' | 'deleted';

export interface Season {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: SeasonStatus;
  departmentId?: string | null;
  createdAt: string;
}

export interface TemplateWeek {
  id: string;
  seasonId: string;
  label: string;
  isCustom?: boolean;
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
  teacherId:  string | null;
  courseType: string | null;
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
  filePath?: string; // nom du fichier sur le serveur (UUID.ext)
  documentType: string;
  userId?: string;
  detectedEmployeeName?: string;
  periodStart?: string;
  periodEnd?: string;
  status: DocumentStatus;
  uploadedBy: string;
  validatedAt?: string;
  createdAt: string;
}

// ─── Budget ───────────────────────────────────────────────────────────────────

export type BudgetRequestStatus = 'draft' | 'submitted' | 'approved' | 'cancelled';
export type RealBudgetStatus = 'active' | 'closed';
export type BudgetLineType = 'income' | 'expense';

export interface BudgetRequestLine {
  id: string; requestId: string; type: BudgetLineType;
  label: string; qty: number; unitPrice: number; amount: number; sortOrder: number; createdAt: string;
}

export interface BudgetRequest {
  id: string; userId: string; label: string;
  startDate: string; endDate: string; comment: string | null;
  status: BudgetRequestStatus; approverId: string | null;
  approverComment: string | null; approvedAt: string | null;
  createdAt: string; updatedAt: string; lines?: BudgetRequestLine[];
  realBudgetId?: string;
}

export interface BudgetLineDetail {
  id: string; lineId: string; detailDate: string; label: string;
  paymentMethod: string; qty: number; unitPrice: number; amount: number;
  receiptFile: string | null; receiptFileName: string | null; receiptFileType: string | null;
  userId: string; createdAt: string;
}

export interface RealBudgetLine {
  id: string; realBudgetId: string; sourceLineId: string | null;
  sourceLabel: string | null; sourceQty: number | null; sourceUnitPrice: number | null;
  type: BudgetLineType; label: string; forecastAmount: number;
  sortOrder: number; createdAt: string; details?: BudgetLineDetail[];
}

export interface BudgetAccessGrant {
  id: string; userId: string; grantedBy: string;
  userName: string; userEmail: string; createdAt?: string;
}

export interface RealBudget {
  id: string; requestId: string; userId: string; label: string;
  startDate: string; endDate: string; status: RealBudgetStatus;
  createdAt: string; lines?: RealBudgetLine[]; accessGrants?: BudgetAccessGrant[];
}

export type BudgetAuditAction = 'add_line' | 'delete_line' | 'add_detail' | 'update_detail' | 'delete_detail';

export interface BudgetAuditLog {
  id: string;
  userId: string;
  userName: string;
  action: BudgetAuditAction;
  lineLabel: string | null;
  detailLabel: string | null;
  detailAmount: number | null;
  createdAt: string;
}

export interface AppNotification {
  id: string; type: string; title: string; body: string | null;
  refType: string | null; refId: string | null;
  readAt: string | null; createdAt: string;
}

// ─── Accounting ───────────────────────────────────────────────────────────────

export interface AccountingPeriod {
  id: string;
  userId: string;
  label: string;
  startDate: string;
  endDate: string;
  importCount: number;
  createdAt: string;
}

export interface BankImport {
  id: string;
  userId: string;
  periodId: string | null;
  label: string;
  fileName: string;
  storedFileName: string | null;
  importedAt: string;
  operationCount: number;
}

export type PaymentMethod = 'card' | 'transfer' | 'direct_debit' | 'check' | 'cash' | 'other';
export type OperationDirection = 'credit' | 'debit';
export type CategorySource = 'manual' | 'rule' | 'none';

export interface BankOperation {
  id: string;
  importId: string;
  periodId: string | null;
  periodLabel: string | null;
  operationDate: string;
  direction: OperationDirection;
  paymentMethod: PaymentMethod;
  amount: number;
  rawLabel: string | null;
  thirdParty: string | null;
  blockMDT: string | null;
  blockLIB: string | null;
  blockMOTIF: string | null;
  blockRNF: string | null;
  category: string | null;
  categorySource: CategorySource;
  ruleId: string | null;
  ruleName?: string | null;
}

export type RuleField = 'rawLabel' | 'thirdParty' | 'blockMDT' | 'blockLIB' | 'blockMOTIF' | 'blockRNF' | 'paymentMethod' | 'direction' | 'amount' | 'operationDate';
export type RuleOperator = 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'notContains' | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual' | 'before' | 'after' | 'onOrBefore' | 'onOrAfter';

export interface RuleCondition {
  id?: string;
  field: RuleField;
  operator: RuleOperator;
  value: string;
}

export interface SavedFilter {
  id: string;
  label: string;
  filters: {
    periodId?: string;
    importId?: string;
    direction?: string;
    paymentMethod?: string;
    category?: string;
    search?: string;
    amountMin?: string;
    amountMax?: string;
  };
  createdAt: string;
}

export interface RuleGroup {
  id: string;
  groupOperator: 'AND' | 'OR';
  conditions: RuleCondition[];
}

export interface AccountingRule {
  id: string;
  userId: string;
  label: string;
  conditionOperator: 'AND' | 'OR';
  rootOperator: 'AND' | 'OR';
  category: string;
  priority: number;
  createdAt: string;
  conditions: RuleCondition[];
  groups: RuleGroup[];
}

// ─── Payroll ──────────────────────────────────────────────────────────────────

export type PayrollStatus = 'draft' | 'validated';

export interface PayrollPeriod {
  id: string;
  startDate: string;
  endDate: string;
  status: PayrollStatus;
  createdBy: string;
  validatedBy?: string;
  validatedAt?: string;
  createdAt: string;
}

export interface PayrollUserRow {
  userId: string;
  firstName: string;
  lastName: string;
  totalHours: number;
  absenceDays: number;
  totalExpenses: number;
  timeEntries: TimeEntry[];
  absenceRequests: AbsenceRequest[];
  expenses: Expense[];
}

export interface PayrollDetail {
  period: PayrollPeriod;
  rows: PayrollUserRow[];
}
