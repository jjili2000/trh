import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import {
  User,
  ActivityType,
  Position,
  TimeEntry,
  AbsenceRequest,
  Expense,
  AppSettings,
  HRDocument,
} from '../types';
import { api, setToken, clearToken, getToken } from '../api/client';

// ─── Context Types ────────────────────────────────────────────────────────────

interface AppContextType {
  currentUser: User | null;
  users: User[];
  activityTypes: ActivityType[];
  positions: Position[];
  timeEntries: TimeEntry[];
  absenceRequests: AbsenceRequest[];
  expenses: Expense[];
  documents: HRDocument[];
  appSettings: AppSettings;
  loading: boolean;

  // Auth
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;

  // Users
  addUser: (user: Omit<User, 'id' | 'createdAt'>) => Promise<void>;
  updateUser: (id: string, data: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;

  // Activity Types
  addActivityType: (at: Omit<ActivityType, 'id'>) => Promise<void>;
  updateActivityType: (id: string, data: Partial<ActivityType>) => Promise<void>;
  deleteActivityType: (id: string) => Promise<void>;

  // Positions
  addPosition: (data: Omit<Position, 'id'>) => Promise<void>;
  updatePosition: (id: string, data: Partial<Position>) => Promise<void>;
  deletePosition: (id: string) => Promise<void>;

  // Time Entries
  addTimeEntry: (entry: Omit<TimeEntry, 'id' | 'createdAt' | 'status'>) => Promise<void>;
  updateTimeEntry: (id: string, data: Partial<TimeEntry>) => Promise<void>;
  approveTimeEntry: (id: string) => Promise<void>;
  rejectTimeEntry: (id: string) => Promise<void>;

  // Absence Requests
  addAbsenceRequest: (req: Omit<AbsenceRequest, 'id' | 'createdAt' | 'status'>) => Promise<void>;
  updateAbsenceRequest: (id: string, data: Partial<AbsenceRequest>) => Promise<void>;
  approveAbsenceRequest: (id: string) => Promise<void>;
  rejectAbsenceRequest: (id: string) => Promise<void>;

  // Expenses
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt' | 'status'>) => Promise<void>;
  updateExpense: (id: string, data: Partial<Expense>) => Promise<void>;
  approveExpense: (id: string) => Promise<void>;
  rejectExpense: (id: string) => Promise<void>;

  // Documents
  addDocument: (data: { fileName: string; fileType: string; fileData: string }) => Promise<HRDocument>;
  updateDocument: (id: string, data: Partial<HRDocument>) => Promise<HRDocument>;
  deleteDocument: (id: string) => Promise<void>;

  // Settings
  updateSettings: (data: Partial<AppSettings>) => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AppContext = createContext<AppContextType | null>(null);

const defaultSettings: AppSettings = { clubName: 'Tennis Club' };

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [absenceRequests, setAbsenceRequests] = useState<AbsenceRequest[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [documents, setDocuments] = useState<HRDocument[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultSettings);
  const [loading, setLoading] = useState<boolean>(true);

  // ── Data Loading ─────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    try {
      const [
        fetchedUsers,
        fetchedActivityTypes,
        fetchedPositions,
        fetchedTimeEntries,
        fetchedAbsenceRequests,
        fetchedExpenses,
        fetchedDocuments,
        fetchedSettings,
      ] = await Promise.all([
        api.get<User[]>('/users'),
        api.get<ActivityType[]>('/activity-types'),
        api.get<Position[]>('/positions'),
        api.get<TimeEntry[]>('/time-entries'),
        api.get<AbsenceRequest[]>('/absence-requests'),
        api.get<Expense[]>('/expenses'),
        api.get<HRDocument[]>('/documents'),
        api.get<AppSettings>('/settings'),
      ]);
      setUsers(fetchedUsers);
      setActivityTypes(fetchedActivityTypes);
      setPositions(fetchedPositions);
      setTimeEntries(fetchedTimeEntries);
      setAbsenceRequests(fetchedAbsenceRequests);
      setExpenses(fetchedExpenses);
      setDocuments(fetchedDocuments);
      setAppSettings(fetchedSettings);
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }, []);

  // Restore session on mount
  useEffect(() => {
    const restore = async () => {
      if (getToken()) {
        try {
          const user = await api.get<User>('/users/me');
          setCurrentUser(user);
          await loadAll();
        } catch {
          // Token invalid/expired — clear it
          clearToken();
        }
      }
      setLoading(false);
    };
    restore();
  }, [loadAll]);

  // ── Auth ─────────────────────────────────────────────────────────────────────

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const { token, user } = await api.post<{ token: string; user: User }>('/auth/login', {
        email,
        password,
      });
      setToken(token);
      setCurrentUser(user);
      await loadAll();
      return true;
    } catch {
      return false;
    }
  };

  const logout = () => {
    clearToken();
    setCurrentUser(null);
    setUsers([]);
    setActivityTypes([]);
    setTimeEntries([]);
    setAbsenceRequests([]);
    setExpenses([]);
    setDocuments([]);
    setAppSettings(defaultSettings);
  };

  // ── Users ────────────────────────────────────────────────────────────────────

  const addUser = async (data: Omit<User, 'id' | 'createdAt'>) => {
    await api.post('/users', data);
    const updated = await api.get<User[]>('/users');
    setUsers(updated);
  };

  const updateUser = async (id: string, data: Partial<User>) => {
    await api.put(`/users/${id}`, data);
    const updated = await api.get<User[]>('/users');
    setUsers(updated);
    // Refresh currentUser if it's the same person
    if (currentUser?.id === id) {
      const me = await api.get<User>('/users/me');
      setCurrentUser(me);
    }
  };

  const deleteUser = async (id: string) => {
    await api.delete(`/users/${id}`);
    const updated = await api.get<User[]>('/users');
    setUsers(updated);
  };

  // ── Positions ─────────────────────────────────────────────────────────────────

  const addPosition = async (data: Omit<Position, 'id'>) => {
    await api.post('/positions', data);
    const updated = await api.get<Position[]>('/positions');
    setPositions(updated);
  };

  const updatePosition = async (id: string, data: Partial<Position>) => {
    await api.put(`/positions/${id}`, data);
    const updated = await api.get<Position[]>('/positions');
    setPositions(updated);
  };

  const deletePosition = async (id: string) => {
    await api.delete(`/positions/${id}`);
    const updated = await api.get<Position[]>('/positions');
    setPositions(updated);
  };

  // ── Activity Types ────────────────────────────────────────────────────────────

  const addActivityType = async (data: Omit<ActivityType, 'id'>) => {
    await api.post('/activity-types', data);
    const updated = await api.get<ActivityType[]>('/activity-types');
    setActivityTypes(updated);
  };

  const updateActivityType = async (id: string, data: Partial<ActivityType>) => {
    await api.put(`/activity-types/${id}`, data);
    const updated = await api.get<ActivityType[]>('/activity-types');
    setActivityTypes(updated);
  };

  const deleteActivityType = async (id: string) => {
    await api.delete(`/activity-types/${id}`);
    const updated = await api.get<ActivityType[]>('/activity-types');
    setActivityTypes(updated);
  };

  // ── Time Entries ──────────────────────────────────────────────────────────────

  const addTimeEntry = async (data: Omit<TimeEntry, 'id' | 'createdAt' | 'status'>) => {
    await api.post('/time-entries', data);
    const updated = await api.get<TimeEntry[]>('/time-entries');
    setTimeEntries(updated);
  };

  const updateTimeEntry = async (id: string, data: Partial<TimeEntry>) => {
    await api.put(`/time-entries/${id}`, data);
    const updated = await api.get<TimeEntry[]>('/time-entries');
    setTimeEntries(updated);
  };

  const approveTimeEntry = async (id: string) => {
    await api.put(`/time-entries/${id}/approve`, {});
    const updated = await api.get<TimeEntry[]>('/time-entries');
    setTimeEntries(updated);
  };

  const rejectTimeEntry = async (id: string) => {
    await api.put(`/time-entries/${id}/reject`, {});
    const updated = await api.get<TimeEntry[]>('/time-entries');
    setTimeEntries(updated);
  };

  // ── Absence Requests ──────────────────────────────────────────────────────────

  const addAbsenceRequest = async (data: Omit<AbsenceRequest, 'id' | 'createdAt' | 'status'>) => {
    await api.post('/absence-requests', data);
    const updated = await api.get<AbsenceRequest[]>('/absence-requests');
    setAbsenceRequests(updated);
  };

  const updateAbsenceRequest = async (id: string, data: Partial<AbsenceRequest>) => {
    await api.put(`/absence-requests/${id}`, data);
    const updated = await api.get<AbsenceRequest[]>('/absence-requests');
    setAbsenceRequests(updated);
  };

  const approveAbsenceRequest = async (id: string) => {
    await api.put(`/absence-requests/${id}/approve`, {});
    const updated = await api.get<AbsenceRequest[]>('/absence-requests');
    setAbsenceRequests(updated);
  };

  const rejectAbsenceRequest = async (id: string) => {
    await api.put(`/absence-requests/${id}/reject`, {});
    const updated = await api.get<AbsenceRequest[]>('/absence-requests');
    setAbsenceRequests(updated);
  };

  // ── Expenses ──────────────────────────────────────────────────────────────────

  const addExpense = async (data: Omit<Expense, 'id' | 'createdAt' | 'status'>) => {
    await api.post('/expenses', data);
    const updated = await api.get<Expense[]>('/expenses');
    setExpenses(updated);
  };

  const updateExpense = async (id: string, data: Partial<Expense>) => {
    await api.put(`/expenses/${id}`, data);
    const updated = await api.get<Expense[]>('/expenses');
    setExpenses(updated);
  };

  const approveExpense = async (id: string) => {
    await api.put(`/expenses/${id}/approve`, {});
    const updated = await api.get<Expense[]>('/expenses');
    setExpenses(updated);
  };

  const rejectExpense = async (id: string) => {
    await api.put(`/expenses/${id}/reject`, {});
    const updated = await api.get<Expense[]>('/expenses');
    setExpenses(updated);
  };

  // ── Documents ─────────────────────────────────────────────────────────────────

  const addDocument = async (data: { fileName: string; fileType: string; fileData: string }): Promise<HRDocument> => {
    const created = await api.post<HRDocument>('/documents', data);
    const updated = await api.get<HRDocument[]>('/documents');
    setDocuments(updated);
    return created;
  };

  const updateDocument = async (id: string, data: Partial<HRDocument>): Promise<HRDocument> => {
    const updated = await api.put<HRDocument>(`/documents/${id}`, data);
    const list = await api.get<HRDocument[]>('/documents');
    setDocuments(list);
    return updated;
  };

  const deleteDocument = async (id: string) => {
    await api.delete(`/documents/${id}`);
    const updated = await api.get<HRDocument[]>('/documents');
    setDocuments(updated);
  };

  // ── Settings ──────────────────────────────────────────────────────────────────

  const updateSettings = async (data: Partial<AppSettings>) => {
    const updated = await api.put<AppSettings>('/settings', data);
    setAppSettings(updated);
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        users,
        activityTypes,
        positions,
        timeEntries,
        absenceRequests,
        expenses,
        documents,
        appSettings,
        loading,
        login,
        logout,
        addUser,
        updateUser,
        deleteUser,
        addActivityType,
        updateActivityType,
        deleteActivityType,
        addPosition,
        updatePosition,
        deletePosition,
        addTimeEntry,
        updateTimeEntry,
        approveTimeEntry,
        rejectTimeEntry,
        addAbsenceRequest,
        updateAbsenceRequest,
        approveAbsenceRequest,
        rejectAbsenceRequest,
        addExpense,
        updateExpense,
        approveExpense,
        rejectExpense,
        addDocument,
        updateDocument,
        deleteDocument,
        updateSettings,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
