import { useState, useEffect, useCallback, useRef, useMemo, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Edit2, Calendar, BookOpen, Plus, X, Trash2,
  ChevronLeft, ChevronRight, Check, AlertCircle, AlertTriangle, Copy, Loader, Building2,
} from 'lucide-react';
import { api } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { Season, SeasonStatus, TemplateWeek, TemplateCourse, WeekAssignment, SchoolHoliday, User } from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const TW_COLORS     = ['#2d6a4f','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#14b8a6','#f97316','#ec4899'];
const COURSE_COLORS = [
  '#2563eb','#16a34a','#dc2626','#9333ea','#ea580c',
  '#0891b2','#be185d','#4f46e5','#b45309','#0f766e','#6d28d9','#be123c',
];
const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DAYS_SHORT = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
const STATUS_CFG: Record<SeasonStatus, { label: string; color: string }> = {
  draft:     { label: 'Brouillon', color: 'bg-gray-100 text-gray-600' },
  published: { label: 'Publiée',   color: 'bg-green-100 text-green-700' },
  closed:    { label: 'Clôturée',  color: 'bg-blue-100 text-blue-700' },
  deleted:   { label: 'Supprimée', color: 'bg-red-100 text-red-700' },
};
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR   = 21;
const SLOT_H     = 30; // px per 30 min

// Lundi de référence pour l'affichage des semaines type (2024-01-01 est un lundi)
const TEMPLATE_WEEK_START = new Date(2024, 0, 1);

// ─── French public holidays ───────────────────────────────────────────────────

function getEaster(year: number): Date {
  // Meeus/Jones/Butcher algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day   = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getFrenchHolidays(year: number): Map<string, string> {
  const map = new Map<string, string>();
  const add = (month: number, day: number, name: string) => {
    const d = new Date(year, month - 1, day);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    map.set(`${y}-${mo}-${dd}`, name);
  };
  // Fixed
  add(1,  1,  "Jour de l'an");
  add(5,  1,  'Fête du travail');
  add(5,  8,  'Victoire 1945');
  add(7,  14, 'Fête nationale');
  add(8,  15, 'Assomption');
  add(11, 1,  'Toussaint');
  add(11, 11, 'Armistice');
  add(12, 25, 'Noël');
  // Easter-based
  const easter = getEaster(year);
  const addOffset = (offset: number, name: string) => {
    const d = new Date(easter);
    d.setDate(d.getDate() + offset);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    map.set(`${y}-${mo}-${dd}`, name);
  };
  addOffset(1,  'Lundi de Pâques');
  addOffset(39, 'Ascension');
  addOffset(50, 'Lundi de Pentecôte');
  return map;
}

function getFrenchHolidaysForRange(startYear: number, endYear: number): Map<string, string> {
  const all = new Map<string, string>();
  for (let y = startYear; y <= endYear; y++) {
    for (const [date, name] of getFrenchHolidays(y)) all.set(date, name);
  }
  return all;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonday(date: Date): Date {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

function isoDate(d: Date): string {
  // Utilise les getters locaux (pas toISOString qui repasse en UTC) pour éviter
  // qu'un lundi à 00h00 heure française (UTC+1/+2) n'apparaisse comme le dimanche
  // précédent en UTC et soit comparé à tort à la fin d'une période de vacances.
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getSeasonWeeks(startDate: string, endDate: string): Date[] {
  const weeks: Date[] = [];
  const cur = getMonday(new Date(startDate + 'T00:00:00'));
  const end = new Date(endDate + 'T00:00:00');
  while (cur <= end) { weeks.push(new Date(cur)); cur.setDate(cur.getDate() + 7); }
  return weeks;
}

function getWeekNum(date: Date): number {
  const d = new Date(date); d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number); return h * 60 + m;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function fmtFull(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ISO day of week: 1=Mon … 7=Sun
function getDayOfWeek(d: Date): number {
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

// Group weeks by month (using Wednesday's month)
function groupByMonth(weeks: Date[]): Map<string, Date[]> {
  const map = new Map<string, Date[]>();
  for (const w of weeks) {
    const wed = addDays(w, 2);
    const key = `${wed.getFullYear()}-${String(wed.getMonth() + 1).padStart(2,'0')}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(w);
  }
  return map;
}

function userColor(userId: string | null): string {
  if (!userId) return '#94a3b8'; // slate-400 — cours sans enseignant
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) & 0x7fffffff;
  return COURSE_COLORS[h % COURSE_COLORS.length];
}

function duration(s: string, e: string): string {
  const m = timeToMin(e) - timeToMin(s);
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m}min`;
}

function isConflictingCourse(course: TemplateCourse, allCourses: TemplateCourse[]): boolean {
  if (!course.teacherId) return false; // pas d'enseignant → pas de conflit détectable
  return allCourses.some(o =>
    o.id !== course.id &&
    o.teacherId === course.teacherId &&   // même enseignant
    timeToMin(o.startTime) < timeToMin(course.endTime) &&
    timeToMin(o.endTime)   > timeToMin(course.startTime),
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// ─── Week time grid ───────────────────────────────────────────────────────────

function layoutCourses(courses: TemplateCourse[]): Array<{ course: TemplateCourse; col: number; totalCols: number; isConflict: boolean }> {
  if (!courses.length) return [];

  const sorted = [...courses].sort((a, b) => timeToMin(a.startTime) - timeToMin(b.startTime));

  // Assign columns (greedy packing)
  const colEnds: number[] = [];
  const assignments = sorted.map(c => {
    const start = timeToMin(c.startTime);
    let col = colEnds.findIndex(end => end <= start);
    if (col === -1) { col = colEnds.length; colEnds.push(0); }
    colEnds[col] = timeToMin(c.endTime);
    return { course: c, col };
  });

  // Compute totalCols PER COURSE = max simultaneous active courses during that course.
  // Using only the start times of overlapping courses as check points (sufficient for intervals).
  const localTotalCols = (c: TemplateCourse): number => {
    const cStart = timeToMin(c.startTime);
    const cEnd   = timeToMin(c.endTime);
    const overlapping = courses.filter(o =>
      timeToMin(o.startTime) < cEnd && timeToMin(o.endTime) > cStart,
    );
    if (overlapping.length <= 1) return 1;
    const checkTimes = overlapping.map(o => timeToMin(o.startTime));
    return Math.max(...checkTimes.map(t =>
      overlapping.filter(o => timeToMin(o.startTime) <= t && timeToMin(o.endTime) > t).length,
    ));
  };

  return assignments.map(a => ({
    ...a,
    totalCols: localTotalCols(a.course),
    isConflict: isConflictingCourse(a.course, courses),
  }));
}

function WeekTimeGrid({ templateWeek, startDay, numDays = 7, users, filterUserId, onEditCourse, onAddCourse, holidays, showDates = true }: {
  templateWeek: TemplateWeek | null;
  startDay: Date;
  numDays?: number;
  users: User[];
  filterUserId?: string | null;
  onEditCourse?: (course: TemplateCourse) => void;
  onAddCourse?:  (dayOfWeek: number, startTime: string) => void;
  holidays?: Map<string, string>;
  showDates?: boolean;
}) {
  const { appSettings } = useApp();
  const START_HOUR = appSettings.calendarStartHour ?? DEFAULT_START_HOUR;
  const END_HOUR   = appSettings.calendarEndHour   ?? DEFAULT_END_HOUR;
  const totalSlots = (END_HOUR - START_HOUR) * 2;
  const totalH     = totalSlots * SLOT_H;
  const days       = Array.from({ length: numDays }, (_, i) => addDays(startDay, i));

  // Tooltip
  const [tooltip, setTooltip] = useState<{
    course: TemplateCourse; teacherName: string | null; isConflict: boolean; x: number; y: number;
  } | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mousePos     = useRef({ x: 0, y: 0 });

  // Hovered time slot (for "+" creation)
  const [hoverSlot, setHoverSlot] = useState<{ day: number; slotIndex: number; time: string } | null>(null);

  const showTooltip = (course: TemplateCourse, teacherName: string | null, isConflict: boolean) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    tooltipTimer.current = setTimeout(() => {
      setTooltip({ course, teacherName, isConflict, x: mousePos.current.x, y: mousePos.current.y });
    }, 500);
  };
  const hideTooltip = () => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    setTooltip(null);
  };

  return (
    <div
      className="overflow-x-auto rounded-xl border border-gray-200 bg-white"
      onMouseMove={e => { mousePos.current = { x: e.clientX, y: e.clientY }; }}
    >
      {/* Day headers */}
      <div className="flex border-b border-gray-200">
        <div className="w-12 flex-shrink-0" />
        {days.map((d, i) => {
          const holiday = showDates ? holidays?.get(isoDate(d)) : undefined;
          return (
            <div key={i} className={`flex-1 min-w-20 text-center py-2 text-xs font-semibold border-l border-gray-200 ${holiday ? 'bg-orange-50' : ''}`}>
              <div className={holiday ? 'text-orange-700' : 'text-gray-600'}>{DAYS_SHORT[getDayOfWeek(d) - 1]}</div>
              {showDates && (
                <div className={`font-normal ${holiday ? 'text-orange-400' : 'text-gray-400'}`}>{d.getDate()}</div>
              )}
              {holiday && (
                <div className="text-orange-500 text-[9px] leading-tight px-0.5 truncate mt-0.5" title={holiday}>
                  {holiday}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="flex" style={{ height: totalH }}>
        {/* Time labels */}
        <div className="w-12 flex-shrink-0 relative border-r border-gray-200">
          {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => (
            <div key={i} className="absolute right-1 text-xs text-gray-300 -translate-y-2"
              style={{ top: i * 60 * (SLOT_H / 30) }}>
              {String(START_HOUR + i).padStart(2, '0')}h
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((_, di) => {
          const dayCourses = (templateWeek?.courses.filter(c =>
            c.dayOfWeek === getDayOfWeek(days[di]) &&
            (!filterUserId || c.teacherId === filterUserId)
          )) || [];
          const isHoliday = !!holidays?.get(isoDate(days[di]));
          return (
            <div key={di} className={`flex-1 min-w-20 relative border-l border-gray-200 ${isHoliday ? 'bg-orange-50/40' : ''}`} style={{ height: totalH }}>
              {/* Hour grid lines */}
              {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                <div key={i} className="absolute inset-x-0 border-t border-gray-200"
                  style={{ top: (i + 1) * 60 * (SLOT_H / 30) }} />
              ))}

              {/* Add-course zones per 30-min slot */}
              {onAddCourse && Array.from({ length: totalSlots }, (_, si) => {
                const startMin  = START_HOUR * 60 + si * 30;
                const h         = Math.floor(startMin / 60);
                const m         = startMin % 60;
                const timeStr   = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                const isHov     = hoverSlot?.day === di + 1 && hoverSlot.slotIndex === si;
                // Check if any course overlaps this slot
                const slotEnd   = startMin + 30;
                const hasOverlap = dayCourses.some(c =>
                  timeToMin(c.startTime) < slotEnd && timeToMin(c.endTime) > startMin
                );
                if (hasOverlap) {
                  // Small right-side strip when a course occupies this slot
                  return (
                    <div key={si}
                      className={`absolute right-0 z-20 flex items-center justify-center cursor-pointer transition-colors ${isHov ? 'bg-tennis-green/10' : ''}`}
                      style={{ top: si * SLOT_H, height: SLOT_H, width: 20 }}
                      onMouseEnter={() => setHoverSlot({ day: di + 1, slotIndex: si, time: timeStr })}
                      onMouseLeave={() => setHoverSlot(null)}
                      onClick={() => onAddCourse(di + 1, timeStr)}
                    >
                      {isHov && <Plus size={11} className="text-tennis-green" />}
                    </div>
                  );
                }
                // Full-width zone with centered "+" when slot is empty
                return (
                  <div key={si}
                    className={`absolute inset-x-0 z-10 flex items-center justify-center cursor-pointer transition-colors ${isHov ? 'bg-tennis-green/10' : ''}`}
                    style={{ top: si * SLOT_H, height: SLOT_H }}
                    onMouseEnter={() => setHoverSlot({ day: di + 1, slotIndex: si, time: timeStr })}
                    onMouseLeave={() => setHoverSlot(null)}
                    onClick={() => onAddCourse(di + 1, timeStr)}
                  >
                    {isHov && <Plus size={18} className="text-tennis-green" />}
                  </div>
                );
              })}

              {/* Course blocks — leave 20 px right gutter free */}
              {layoutCourses(dayCourses).map(({ course: c, col, totalCols, isConflict }) => {
                const top         = (timeToMin(c.startTime) - START_HOUR * 60) * (SLOT_H / 30);
                const height      = (timeToMin(c.endTime)   - timeToMin(c.startTime)) * (SLOT_H / 30);
                const teacher     = users.find(u => u.id === c.teacherId);
                const teacherName = teacher ? `${teacher.firstName} ${teacher.lastName}` : null;
                const bg          = userColor(c.teacherId);
                return (
                  <div key={c.id}
                    className={`absolute z-10 rounded p-1 overflow-hidden text-white text-xs select-none
                      ${onEditCourse ? 'cursor-pointer hover:brightness-110 active:brightness-90' : ''}`}
                    style={{
                      top: top + 1, height: height - 2,
                      left:  `calc(${col} * (100% - 20px) / ${totalCols} + 2px)`,
                      width: `calc((100% - 20px) / ${totalCols} - 4px)`,
                      backgroundColor: bg,
                    }}
                    onMouseEnter={() => showTooltip(c, teacherName, isConflict)}
                    onMouseLeave={hideTooltip}
                    onClick={e => { e.stopPropagation(); onEditCourse?.(c); }}
                  >
                    <div className="flex items-start gap-0.5">
                      <div className="font-semibold truncate flex-1">{c.label}</div>
                      {isConflict && <AlertTriangle size={10} className="text-yellow-300 flex-shrink-0 mt-0.5" />}
                    </div>
                    {height > 30 && <div className="opacity-80 truncate">{c.startTime} – {c.endTime}</div>}
                    {height > 50 && teacherName && <div className="opacity-70 truncate">{teacherName}</div>}
                    {height > 70 && c.courseType && <div className="opacity-70 truncate italic">{c.courseType}</div>}
                  </div>
                );
              })}

              {/* Empty column — no separate background needed (white from parent) */}
            </div>
          );
        })}
      </div>

      {/* Floating tooltip (500 ms delay) */}
      {tooltip && (
        <div className="fixed z-[9999] pointer-events-none"
          style={{ left: tooltip.x + 14, top: tooltip.y - 8 }}>
          <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl max-w-52 space-y-0.5">
            <div className="font-semibold">{tooltip.course.label}</div>
            {tooltip.course.courseType && <div className="text-gray-300">{tooltip.course.courseType}</div>}
            <div className="text-gray-300">{tooltip.course.startTime} – {tooltip.course.endTime} · {duration(tooltip.course.startTime, tooltip.course.endTime)}</div>
            {tooltip.teacherName && <div className="text-gray-400">{tooltip.teacherName}</div>}
            {tooltip.isConflict && (
              <div className="flex items-center gap-1 text-yellow-400 pt-0.5">
                <AlertTriangle size={10} /> Conflit d'agenda
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Calendar View ────────────────────────────────────────────────────────────

type ViewMode = 'year' | 'week' | 'day';
const VIEW_LABELS: Record<ViewMode, string> = { year: 'Année', week: 'Semaine', day: 'Jour' };

function CalendarView({ season, templateWeeks, assignments, users, onAssign, onRefresh, onEditTemplateWeek }: {
  season: Season;
  templateWeeks: TemplateWeek[];
  assignments: WeekAssignment[];
  users: User[];
  onAssign: (weekStartDate: string, templateWeekId: string | null) => Promise<void>;
  onRefresh: () => Promise<void>;
  onEditTemplateWeek: (twId: string) => void;
}) {
  const { activityTypes, appSettings } = useApp();
  const END_HOUR   = appSettings.calendarEndHour   ?? DEFAULT_END_HOUR;
  const [viewMode, setViewMode] = useState<ViewMode>('year');
  const [weekIdx, setWeekIdx]   = useState(0);
  const [dayDate, setDayDate]   = useState<Date>(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const s = isoDate(today);
    return s >= season.startDate && s <= season.endDate
      ? today
      : new Date(season.startDate + 'T00:00:00');
  });
  const [assignModal, setAssignModal] = useState<{ weekDate: Date; current: string | null } | null>(null);
  const [assigning, setAssigning]     = useState(false);
  const [filterUserId, setFilterUserId] = useState<string | null>(null);

  // Course modal (create/edit directly from calendar)
  const [calCourseModal, setCalCourseModal] = useState<{
    tw: TemplateWeek; editing: TemplateCourse | null;
  } | null>(null);
  const [calCourseForm, setCalCourseForm] = useState({
    label: '', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', teacherId: '', courseType: '',
  });
  const [calCourseError, setCalCourseError] = useState('');
  const [calCourseSaving, setCalCourseSaving] = useState(false);

  const allWeeks       = getSeasonWeeks(season.startDate, season.endDate);
  const assignMap      = Object.fromEntries(assignments.map(a => [a.weekStartDate, a.templateWeekId]));
  const twColorMap     = Object.fromEntries(templateWeeks.map((tw, i) => [tw.id, TW_COLORS[i % TW_COLORS.length]]));
  const allMonthGroups = groupByMonth(allWeeks);
  const allMonthKeys   = Array.from(allMonthGroups.keys());

  const holidays = useMemo(() => {
    const sy = parseInt(season.startDate.slice(0, 4));
    const ey = parseInt(season.endDate.slice(0, 4));
    return getFrenchHolidaysForRange(sy, ey);
  }, [season.startDate, season.endDate]);

  // Week view
  const currentWeek = allWeeks[weekIdx] || allWeeks[0];
  const currentTWId = currentWeek ? assignMap[isoDate(currentWeek)] : null;
  const currentTW   = templateWeeks.find(tw => tw.id === currentTWId) || null;

  // Day view
  const dayMonday = getMonday(dayDate);
  const dayTWId   = assignMap[isoDate(dayMonday)] || null;
  const dayTW     = templateWeeks.find(tw => tw.id === dayTWId) || null;

  // Active TW (used by course handlers)
  const activeTW = viewMode === 'day' ? dayTW : currentTW;

  // Today helpers
  const todayDate = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  const todayInSeason = isoDate(todayDate) >= season.startDate && isoDate(todayDate) <= season.endDate;

  const navigateWeek = (dir: 1 | -1) =>
    setWeekIdx(i => Math.max(0, Math.min(allWeeks.length - 1, i + dir)));

  const navigateDay = (dir: 1 | -1) => {
    setDayDate(d => {
      const next = addDays(d, dir);
      const s = isoDate(next);
      return s >= season.startDate && s <= season.endDate ? next : d;
    });
  };

  const goToToday = () => {
    if (allWeeks.length === 0) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayMonday = getMonday(today);
    // Find the week index for today, clamped to season bounds
    let targetIdx = allWeeks.findIndex(w => isoDate(w) === isoDate(todayMonday));
    if (targetIdx === -1) {
      // Today is outside season: go to first week if before season, last week if after
      targetIdx = isoDate(today) < season.startDate ? 0 : allWeeks.length - 1;
    }
    if (viewMode === 'week') {
      setWeekIdx(targetIdx);
    } else if (viewMode === 'day') {
      if (todayInSeason) {
        setDayDate(today);
      } else {
        setDayDate(allWeeks[targetIdx]);
      }
    } else {
      // Year view: switch to week view showing today (or nearest week)
      setWeekIdx(targetIdx);
      setViewMode('week');
    }
  };

  const handleAssign = async (twId: string | null) => {
    if (!assignModal || assigning) return;
    setAssigning(true);
    await onAssign(isoDate(assignModal.weekDate), twId);
    setAssignModal(null);
    setAssigning(false);
  };

  // Course handlers — use activeTW (works for both week and day views)
  const handleEditCourse = (course: TemplateCourse) => {
    if (!activeTW) return;
    setCalCourseForm({
      label: course.label, dayOfWeek: course.dayOfWeek,
      startTime: course.startTime, endTime: course.endTime,
      teacherId: course.teacherId || '', courseType: course.courseType || '',
    });
    setCalCourseError('');
    setCalCourseModal({ tw: activeTW, editing: course });
  };

  const handleAddCourse = (dayOfWeek: number, startTime: string) => {
    if (!activeTW) return;
    const endMin = Math.min(timeToMin(startTime) + 60, END_HOUR * 60);
    const endH   = Math.floor(endMin / 60);
    const endM   = endMin % 60;
    setCalCourseForm({
      label: '', dayOfWeek, startTime,
      endTime: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`,
      teacherId: '', courseType: '',
    });
    setCalCourseError('');
    setCalCourseModal({ tw: activeTW, editing: null });
  };

  const saveCalCourse = async (e: FormEvent) => {
    e.preventDefault();
    if (!calCourseModal) return;
    setCalCourseError('');
    if (!calCourseForm.label.trim()) { setCalCourseError('Libellé requis.'); return; }
    if (timeToMin(calCourseForm.endTime) <= timeToMin(calCourseForm.startTime)) {
      setCalCourseError("L'heure de fin doit être après l'heure de début."); return;
    }
    const { tw, editing } = calCourseModal;
    const payload = {
      label: calCourseForm.label, dayOfWeek: Number(calCourseForm.dayOfWeek),
      startTime: calCourseForm.startTime, endTime: calCourseForm.endTime,
      teacherId: calCourseForm.teacherId || null,
      courseType: calCourseForm.courseType.trim() || null,
    };
    setCalCourseSaving(true);
    try {
      if (editing) {
        await api.put(`/seasons/${season.id}/template-weeks/${tw.id}/courses/${editing.id}`, payload);
      } else {
        await api.post(`/seasons/${season.id}/template-weeks/${tw.id}/courses`, payload);
      }
      await onRefresh();
      setCalCourseModal(null);
    } catch (err) { console.error('saveCalCourse error:', err); setCalCourseError('Erreur lors de la sauvegarde.'); }
    finally { setCalCourseSaving(false); }
  };

  const handleCalStartTimeChange = (startTime: string) => {
    const durMin = Math.max(30, timeToMin(calCourseForm.endTime) - timeToMin(calCourseForm.startTime));
    const endMin = Math.min(timeToMin(startTime) + durMin, END_HOUR * 60);
    setCalCourseForm(f => ({
      ...f, startTime,
      endTime: `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`,
    }));
  };

  const handleCalDurationChange = (durMin: number) => {
    const endMin = Math.min(timeToMin(calCourseForm.startTime) + durMin, END_HOUR * 60);
    setCalCourseForm(f => ({
      ...f,
      endTime: `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`,
    }));
  };

  // Teachers who appear in at least one course
  const teacherIds = new Set(
    templateWeeks.flatMap(tw => tw.courses.map(c => c.teacherId).filter(Boolean))
  );
  const teachers = users.filter(u => teacherIds.has(u.id));

  // Total minutes for the selected user in the current view period
  const fmtMin = (m: number) => {
    if (m === 0) return '0h';
    const h = Math.floor(m / 60);
    const min = m % 60;
    return h > 0 ? `${h}h${min ? String(min).padStart(2, '0') : ''}` : `${min}min`;
  };
  let totalMinutes = 0;
  if (filterUserId) {
    if (viewMode === 'year') {
      totalMinutes = allWeeks.reduce((acc, w) => {
        const twId = assignMap[isoDate(w)];
        const tw = templateWeeks.find(t => t.id === twId);
        if (!tw) return acc;
        return acc + tw.courses
          .filter(c => c.teacherId === filterUserId)
          .reduce((s, c) => s + timeToMin(c.endTime) - timeToMin(c.startTime), 0);
      }, 0);
    } else if (viewMode === 'week' && currentTW) {
      totalMinutes = currentTW.courses
        .filter(c => c.teacherId === filterUserId)
        .reduce((s, c) => s + timeToMin(c.endTime) - timeToMin(c.startTime), 0);
    } else if (viewMode === 'day' && dayTW) {
      totalMinutes = dayTW.courses
        .filter(c => c.teacherId === filterUserId && c.dayOfWeek === getDayOfWeek(dayDate))
        .reduce((s, c) => s + timeToMin(c.endTime) - timeToMin(c.startTime), 0);
    }
  }
  const periodLabel = viewMode === 'year' ? 'sur la saison' : viewMode === 'week' ? 'cette semaine' : 'ce jour';

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* View mode selector */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {(['year', 'week', 'day'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setViewMode(v)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === v ? 'bg-tennis-green text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>

        {/* Navigation week */}
        {viewMode === 'week' && (
          <div className="flex items-center gap-2">
            <button onClick={() => navigateWeek(-1)} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronLeft size={16} /></button>
            <span className="text-sm font-medium text-gray-700 min-w-44 text-center">
              {currentWeek
                ? `S${getWeekNum(currentWeek)} · ${fmtShort(currentWeek)} – ${fmtShort(addDays(currentWeek, 6))}`
                : '—'}
            </span>
            <button onClick={() => navigateWeek(1)} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronRight size={16} /></button>
          </div>
        )}

        {/* Navigation jour */}
        {viewMode === 'day' && (
          <div className="flex items-center gap-2">
            <button onClick={() => navigateDay(-1)} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronLeft size={16} /></button>
            <span className="text-sm font-medium text-gray-700 min-w-52 text-center capitalize">
              {dayDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
            <button onClick={() => navigateDay(1)} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronRight size={16} /></button>
          </div>
        )}

        {/* Aujourd'hui */}
        <button
          onClick={goToToday}
          disabled={allWeeks.length === 0}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            todayInSeason
              ? 'border-tennis-green/40 bg-tennis-green/5 text-tennis-green hover:bg-tennis-green/10'
              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          Aujourd'hui
        </button>

        {/* User filter */}
        {teachers.length > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="relative flex items-center">
              <select
                className="pr-7 pl-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-tennis-green/30 appearance-none"
                value={filterUserId ?? ''}
                onChange={e => setFilterUserId(e.target.value || null)}
              >
                <option value="">Tous les enseignants</option>
                {teachers.map(u => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
              {filterUserId && (
                <button
                  className="absolute right-1.5 text-gray-400 hover:text-gray-600"
                  onClick={() => setFilterUserId(null)}
                  title="Effacer le filtre"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            {filterUserId && (
              <span className="text-xs text-gray-500 whitespace-nowrap font-medium">
                <span className="text-tennis-green font-semibold">{fmtMin(totalMinutes)}</span> {periodLabel}
              </span>
            )}
          </div>
        )}

        {/* Legend */}
        {templateWeeks.length > 0 && (
          <div className="flex flex-wrap gap-2 ml-auto">
            {templateWeeks.map((tw, i) => (
              <span key={tw.id} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: TW_COLORS[i % TW_COLORS.length] }} />
                {tw.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Week view ────────────────────────────────────────────────────────── */}
      {viewMode === 'week' && currentWeek && (
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <h3 className="font-semibold text-gray-800">
              Semaine {getWeekNum(currentWeek)} · {fmtFull(currentWeek)} → {fmtFull(addDays(currentWeek, 6))}
            </h3>
            {currentTW ? (
              <button
                className="text-xs px-2 py-1 rounded-full text-white font-medium hover:brightness-110 transition-all"
                style={{ backgroundColor: twColorMap[currentTW.id] }}
                onClick={() => onEditTemplateWeek(currentTW.id)}
                title="Modifier cette semaine type"
              >
                {currentTW.label}
              </button>
            ) : (
              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500">Non planifiée</span>
            )}
            <button onClick={() => setAssignModal({ weekDate: currentWeek, current: currentTWId })}
              className="ml-auto text-xs text-tennis-green hover:underline">
              Modifier type de semaine
            </button>
          </div>
          {currentTW ? (
            <WeekTimeGrid
              templateWeek={currentTW}
              startDay={currentWeek}
              users={users}
              filterUserId={filterUserId}
              onEditCourse={handleEditCourse}
              onAddCourse={handleAddCourse}
              holidays={holidays}
            />
          ) : (
            <div className="card text-center py-12 text-gray-400">
              <Calendar size={36} className="mx-auto mb-3 opacity-30" />
              <p>Aucune semaine type affectée à cette semaine.</p>
              <button onClick={() => setAssignModal({ weekDate: currentWeek, current: null })}
                className="mt-3 text-sm text-tennis-green hover:underline">
                Affecter une semaine type
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Day view ──────────────────────────────────────────────────────────── */}
      {viewMode === 'day' && (
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            {dayTW ? (
              <button
                className="text-xs px-2 py-1 rounded-full text-white font-medium hover:brightness-110 transition-all"
                style={{ backgroundColor: twColorMap[dayTW.id] }}
                onClick={() => onEditTemplateWeek(dayTW.id)}
                title="Modifier cette semaine type"
              >
                {dayTW.label}
              </button>
            ) : (
              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500">Non planifiée</span>
            )}
            <button
              onClick={() => setAssignModal({ weekDate: dayMonday, current: dayTWId })}
              className="ml-auto text-xs text-tennis-green hover:underline"
            >
              Modifier type de semaine
            </button>
          </div>
          {dayTW ? (
            <WeekTimeGrid
              templateWeek={dayTW}
              startDay={dayDate}
              numDays={1}
              users={users}
              filterUserId={filterUserId}
              onEditCourse={handleEditCourse}
              onAddCourse={handleAddCourse}
              holidays={holidays}
            />
          ) : (
            <div className="card text-center py-12 text-gray-400">
              <Calendar size={36} className="mx-auto mb-3 opacity-30" />
              <p>Aucune semaine type affectée pour cette semaine.</p>
              <button
                onClick={() => setAssignModal({ weekDate: dayMonday, current: null })}
                className="mt-3 text-sm text-tennis-green hover:underline"
              >
                Affecter une semaine type
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Year view ─────────────────────────────────────────────────────────── */}
      {viewMode === 'year' && (
        <div className="space-y-6">
          {allMonthKeys.map(key => {
            const [y, m] = key.split('-').map(Number);
            const weeks  = allMonthGroups.get(key) || [];
            return (
              <div key={key}>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  {MONTHS_FR[m - 1]} {y}
                </h3>
                <div className="card p-0 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-2 font-medium text-gray-500 w-12">S</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-500">Période</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-500">Semaine type</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {weeks.map(w => {
                        const wKey = isoDate(w);
                        const twId = assignMap[wKey] || null;
                        const tw   = templateWeeks.find(t => t.id === twId);
                        // Check if any course of that TW has a conflict on a given day
                        const hasConflict = tw
                          ? DAYS_SHORT.some((_, di) => {
                              const dc = tw.courses.filter(c => c.dayOfWeek === di + 1);
                              return dc.some(c => isConflictingCourse(c, dc));
                            })
                          : false;
                        // Check if any course day coincides with a French public holiday
                        const holidayConflicts: string[] = [];
                        if (tw) {
                          for (let di = 0; di < 7; di++) {
                            const dayD = addDays(w, di);
                            const h = holidays.get(isoDate(dayD));
                            if (h) {
                              const dow = getDayOfWeek(dayD); // 1=Lun … 7=Dim
                              if (tw.courses.some(c => c.dayOfWeek === dow)) {
                                holidayConflicts.push(h);
                              }
                            }
                          }
                        }
                        const isThisWeek = isoDate(w) === isoDate(getMonday(todayDate));
                        return (
                          <tr key={wKey} id={isThisWeek ? 'cal-today-row' : undefined}
                            className={`hover:bg-gray-50 ${isThisWeek ? 'bg-tennis-green/5' : ''}`}>
                            <td className={`px-4 py-2.5 font-mono text-xs ${isThisWeek ? 'text-tennis-green font-bold' : 'text-gray-400'}`}>
                              {getWeekNum(w)}{isThisWeek && ' ●'}
                            </td>
                            <td
                              className="px-4 py-2.5 text-gray-600 cursor-pointer"
                              onClick={() => setAssignModal({ weekDate: w, current: twId })}
                            >
                              {fmtShort(w)} → {fmtShort(addDays(w, 6))}
                            </td>
                            <td className="px-4 py-2.5">
                              {tw ? (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full text-white font-medium hover:brightness-110 transition-all"
                                    style={{ backgroundColor: twColorMap[tw.id] }}
                                    onClick={() => onEditTemplateWeek(tw.id)}
                                    title="Modifier cette semaine type"
                                  >
                                    {tw.label}
                                  </button>
                                  {hasConflict && (
                                    <span title="Une ou plusieurs activités sont en conflit d'agenda">
                                      <AlertTriangle size={13} className="text-yellow-500" />
                                    </span>
                                  )}
                                  {holidayConflicts.length > 0 && (
                                    <span title={`Cours sur jour(s) férié(s) : ${holidayConflicts.join(', ')}`}>
                                      <AlertCircle size={13} className="text-orange-500" />
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span
                                  className="text-gray-300 text-xs cursor-pointer hover:text-gray-400"
                                  onClick={() => setAssignModal({ weekDate: w, current: twId })}
                                >—</span>
                              )}
                            </td>
                            <td className="px-2 py-2.5">
                              <Edit2
                                size={13}
                                className="text-gray-300 cursor-pointer hover:text-gray-500"
                                onClick={() => setAssignModal({ weekDate: w, current: twId })}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assign week modal */}
      {assignModal && (
        <Modal title="Affecter une semaine type" onClose={() => setAssignModal(null)}>
          <p className="text-sm text-gray-500 mb-4">
            Semaine {getWeekNum(assignModal.weekDate)} · {fmtFull(assignModal.weekDate)} → {fmtFull(addDays(assignModal.weekDate, 6))}
          </p>
          <div className="space-y-2">
            <button
              onClick={() => handleAssign(null)}
              disabled={assigning}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-colors text-left ${
                !assignModal.current ? 'border-tennis-green bg-tennis-green/5' : 'border-gray-100 hover:border-gray-200'
              }`}
            >
              <span className="w-4 h-4 rounded-sm bg-gray-100 flex-shrink-0" />
              <span className="text-sm text-gray-500">Non planifiée</span>
              {!assignModal.current && <Check size={14} className="ml-auto text-tennis-green" />}
            </button>
            {templateWeeks.map((tw, i) => {
              const color = TW_COLORS[i % TW_COLORS.length];
              const active = assignModal.current === tw.id;
              return (
                <button key={tw.id}
                  onClick={() => handleAssign(tw.id)}
                  disabled={assigning}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-colors text-left ${
                    active ? 'border-tennis-green bg-tennis-green/5' : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <span className="w-4 h-4 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-sm font-medium text-gray-800">{tw.label}</span>
                  <span className="text-xs text-gray-400 ml-1">{tw.courses.length} activité{tw.courses.length !== 1 ? 's' : ''}</span>
                  {active && <Check size={14} className="ml-auto text-tennis-green" />}
                </button>
              );
            })}
          </div>
          {assigning && <div className="text-center mt-4 text-sm text-gray-400">Enregistrement…</div>}
        </Modal>
      )}

      {/* Course create / edit modal (from calendar) */}
      {calCourseModal && (
        <Modal
          title={calCourseModal.editing ? "Modifier l'activité" : 'Nouvelle activité'}
          onClose={() => setCalCourseModal(null)}
        >
          <p className="text-xs text-gray-400 mb-4">
            Semaine type : <strong>{calCourseModal.tw.label}</strong>
          </p>
          <form onSubmit={saveCalCourse} className="space-y-4">
            {calCourseError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{calCourseError}</div>
            )}
            <div>
              <label className="label">Intitulé de l'activité *</label>
              <input className="input" value={calCourseForm.label}
                onChange={e => setCalCourseForm(f => ({ ...f, label: e.target.value }))}
                placeholder="Ex: Tennis débutants" autoFocus required />
            </div>
            <div>
              <label className="label">Jour *</label>
              <select className="input" value={calCourseForm.dayOfWeek}
                onChange={e => setCalCourseForm(f => ({ ...f, dayOfWeek: parseInt(e.target.value) }))}>
                {DAYS_SHORT.map((d, i) => <option key={i + 1} value={i + 1}>{d}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="min-w-0">
                <label className="label">Début *</label>
                <input type="time" className="input" value={calCourseForm.startTime}
                  onChange={e => handleCalStartTimeChange(e.target.value)} required />
              </div>
              <div className="min-w-0">
                <label className="label">Fin *</label>
                <input type="time" className="input" value={calCourseForm.endTime}
                  onChange={e => setCalCourseForm(f => ({ ...f, endTime: e.target.value }))} required />
              </div>
              <div className="min-w-0">
                <label className="label">Durée</label>
                <select
                  className="input"
                  value={String(Math.round((timeToMin(calCourseForm.endTime) - timeToMin(calCourseForm.startTime)) / 30) * 30)}
                  onChange={e => handleCalDurationChange(Number(e.target.value))}
                >
                  {[30,60,90,120,150,180,210,240].map(m => (
                    <option key={m} value={m}>{m < 60 ? `${m}min` : m % 60 === 0 ? `${m/60}h` : `${Math.floor(m/60)}h${String(m%60).padStart(2,'0')}`}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Type d'activité</label>
                <input className="input" list="course-type-list" value={calCourseForm.courseType}
                  onChange={e => setCalCourseForm(f => ({ ...f, courseType: e.target.value }))}
                  placeholder="Ex: Collectif adulte" />
              </div>
              <div>
                <label className="label">Qui</label>
                <select className="input" value={calCourseForm.teacherId}
                  onChange={e => setCalCourseForm(f => ({ ...f, teacherId: e.target.value }))}>
                  <option value="">— Aucun —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                </select>
              </div>
            </div>
            <datalist id="course-type-list">
              {activityTypes
                .filter(at => at.isGlobal !== false || (season.departmentId && at.departmentIds?.includes(season.departmentId)))
                .map(at => <option key={at.id} value={at.name} />)}
            </datalist>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setCalCourseModal(null)} className="btn-secondary">Annuler</button>
              <button type="submit" disabled={calCourseSaving} className="btn-primary">
                {calCourseSaving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── Template Weeks Panel ─────────────────────────────────────────────────────

function TemplateWeeksPanel({ season, templateWeeks, users, allSeasons, onRefresh, selectedTWId, onSelectedTWChange }: {
  season: Season;
  templateWeeks: TemplateWeek[];
  users: User[];
  allSeasons: Season[];
  onRefresh: () => Promise<void>;
  selectedTWId: string | null;
  onSelectedTWChange: (id: string | null) => void;
}) {
  const { activityTypes, appSettings } = useApp();
  const END_HOUR   = appSettings.calendarEndHour   ?? DEFAULT_END_HOUR;
  const [twModal, setTWModal]       = useState<{ editing: TemplateWeek | null } | null>(null);
  const [courseModal, setCourseModal] = useState<{ tw: TemplateWeek; editing: TemplateCourse | null } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'tw' | 'course'; id: string; twId?: string } | null>(null);
  const [copyModal, setCopyModal] = useState(false);
  const [applyModal, setApplyModal] = useState<{ tw: TemplateWeek } | null>(null);

  const [twForm, setTWForm] = useState({ label: '' });
  const [twError, setTWError] = useState('');
  const [courseForm, setCourseForm] = useState({ label: '', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', teacherId: '', courseType: '' });
  const [courseError, setCourseError] = useState('');
  const [twSaving, setTWSaving] = useState(false);
  const [courseSaving, setCourseSaving] = useState(false);

  // Copy modal state
  const [copySourceSeasonId, setCopySourceSeasonId] = useState('');
  const [copySourceTWs, setCopySourceTWs] = useState<TemplateWeek[]>([]);
  const [copySourceTWId, setCopySourceTWId] = useState('');
  const [copyLoading, setCopyLoading] = useState(false);

  // Apply rule state
  const [applyStatus, setApplyStatus] = useState<null | 'loading' | 'success' | 'error'>(null);
  const [applyResult, setApplyResult] = useState('');

  const selectedTW = templateWeeks.find(tw => tw.id === selectedTWId) || templateWeeks[0] || null;

  const openAddTW = () => { setTWForm({ label: '' }); setTWError(''); setTWModal({ editing: null }); };
  const openEditTW = (tw: TemplateWeek) => { setTWForm({ label: tw.label }); setTWError(''); setTWModal({ editing: tw }); };

  const saveTW = async (e: FormEvent) => {
    e.preventDefault(); setTWError('');
    if (!twForm.label.trim()) { setTWError('Libellé requis.'); return; }
    setTWSaving(true);
    try {
      if (twModal?.editing) {
        await api.put(`/seasons/${season.id}/template-weeks/${twModal.editing.id}`, { label: twForm.label });
      } else {
        const created = await api.post<TemplateWeek>(`/seasons/${season.id}/template-weeks`, { label: twForm.label });
        onSelectedTWChange(created.id);
      }
      await onRefresh(); setTWModal(null);
    } catch (err) { console.error('saveTW error:', err); setTWError('Erreur lors de la sauvegarde.'); }
    finally { setTWSaving(false); }
  };

  const deleteTW = async (twId: string) => {
    await api.delete(`/seasons/${season.id}/template-weeks/${twId}`);
    if (selectedTWId === twId) onSelectedTWChange(null);
    await onRefresh(); setDeleteConfirm(null);
  };

  const openAddCourse = (tw: TemplateWeek, dayOfWeek?: number, startTime?: string) => {
    const st = startTime ?? '09:00';
    const endMin = Math.min(timeToMin(st) + 60, END_HOUR * 60);
    setCourseForm({
      label: '', dayOfWeek: dayOfWeek ?? 1, startTime: st,
      endTime: `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`,
      teacherId: '', courseType: '',
    });
    setCourseError(''); setCourseModal({ tw, editing: null });
  };
  const openEditCourse = (tw: TemplateWeek, c: TemplateCourse) => {
    setCourseForm({ label: c.label, dayOfWeek: c.dayOfWeek, startTime: c.startTime, endTime: c.endTime, teacherId: c.teacherId || '', courseType: c.courseType || '' });
    setCourseError(''); setCourseModal({ tw, editing: c });
  };

  const saveCourse = async (e: FormEvent) => {
    e.preventDefault();
    if (!courseModal) return;
    setCourseError('');
    if (!courseForm.label.trim()) { setCourseError('Libellé requis.'); return; }
    if (timeToMin(courseForm.endTime) <= timeToMin(courseForm.startTime)) {
      setCourseError("L'heure de fin doit être après l'heure de début."); return;
    }
    // Capture modal state before any async operation to avoid stale closure
    const twId    = courseModal.tw.id;
    const editing = courseModal.editing;
    const payload = {
      label:      courseForm.label,
      dayOfWeek:  Number(courseForm.dayOfWeek),
      startTime:  courseForm.startTime,
      endTime:    courseForm.endTime,
      teacherId:  courseForm.teacherId || null,
      courseType: courseForm.courseType.trim() || null,
    };
    setCourseSaving(true);
    try {
      if (editing) {
        await api.put(`/seasons/${season.id}/template-weeks/${twId}/courses/${editing.id}`, payload);
      } else {
        await api.post(`/seasons/${season.id}/template-weeks/${twId}/courses`, payload);
      }
      await onRefresh();
      setCourseModal(null);
    } catch (err) { console.error('saveCourse error:', err); setCourseError('Erreur lors de la sauvegarde.'); }
    finally { setCourseSaving(false); }
  };

  const handleStartTimeChange = (startTime: string) => {
    const durMin = Math.max(30, timeToMin(courseForm.endTime) - timeToMin(courseForm.startTime));
    const endMin = Math.min(timeToMin(startTime) + durMin, END_HOUR * 60);
    setCourseForm(f => ({
      ...f, startTime,
      endTime: `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`,
    }));
  };

  const handleDurationChange = (durMin: number) => {
    const endMin = Math.min(timeToMin(courseForm.startTime) + durMin, END_HOUR * 60);
    setCourseForm(f => ({
      ...f,
      endTime: `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`,
    }));
  };

  const deleteCourse = async (twId: string, cId: string) => {
    await api.delete(`/seasons/${season.id}/template-weeks/${twId}/courses/${cId}`);
    await onRefresh(); setDeleteConfirm(null);
  };

  const loadCopySourceTWs = async (sourceSeasonId: string) => {
    if (!sourceSeasonId) { setCopySourceTWs([]); return; }
    setCopyLoading(true);
    try { setCopySourceTWs(await api.get<TemplateWeek[]>(`/seasons/${sourceSeasonId}/template-weeks`)); }
    catch { setCopySourceTWs([]); }
    finally { setCopyLoading(false); }
  };

  const handleCopy = async () => {
    if (!copySourceTWId) return;
    setTWSaving(true);
    try {
      const created = await api.post<TemplateWeek>(`/seasons/${season.id}/template-weeks/copy`, { sourceTemplateWeekId: copySourceTWId });
      onSelectedTWChange(created.id);
      await onRefresh(); setCopyModal(false);
    } catch (err) { console.error('handleCopy error:', err); }
    finally { setTWSaving(false); }
  };

  const handleApplyRule = async () => {
    if (!applyModal) return;
    setApplyStatus('loading');
    try {
      // Récupère les congés Zone C directement depuis le navigateur
      const where = encodeURIComponent(
        `zones like "%Zone C%" and end_date >= "${season.startDate}" and start_date <= "${season.endDate}"`
      );
      const eduUrl =
        `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/` +
        `fr-en-calendrier-scolaire/records?where=${where}&limit=100&order_by=start_date`;

      const resp = await fetch(eduUrl, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      // Déduplication par couple (startDate, endDate)
      const seen = new Set<string>();
      const rawHolidays: SchoolHoliday[] = [];
      for (const r of (data.results || [])) {
        const sd = String(r.start_date || '').substring(0, 10);
        const ed = String(r.end_date   || '').substring(0, 10);
        const key = `${sd}_${ed}`;
        if (sd && ed && !seen.has(key)) {
          seen.add(key);
          rawHolidays.push({ label: r.description || 'Vacances scolaires', startDate: sd, endDate: ed });
        }
      }

      // Correction : les "Vacances d'été" n'ont pas de date de fin explicite dans le
      // jeu de données (end_date = start_date). On les étend jusqu'à la fin de la saison.
      // Critère : end_date <= start_date ET start_date >= 1er juin de l'année de fin de saison.
      const summerThreshold = season.endDate.substring(0, 4) + '-06-01';
      const holidays: SchoolHoliday[] = rawHolidays.map(h =>
        (h.endDate <= h.startDate && h.startDate >= summerThreshold)
          ? { ...h, endDate: season.endDate }
          : h
      );

      // Règle d'exclusion : une semaine est "de congés" si son LUNDI tombe dans une
      // période de congés (pas un test de chevauchement). Cela évite d'exclure les
      // semaines partielles où l'école a lieu du lundi au jeudi (congés le vendredi).
      const allWeeks = getSeasonWeeks(season.startDate, season.endDate);
      const nonHolidayDates = allWeeks
        .filter(w => {
          const mondayStr = isoDate(w);
          return !holidays.some(h => mondayStr >= h.startDate && mondayStr <= h.endDate);
        })
        .map(w => isoDate(w));

      console.log(`[Zone C] ${holidays.length} période(s) de congés :`, holidays.map(h => `${h.label} (${h.startDate} → ${h.endDate})`));
      console.log(`[Zone C] ${nonHolidayDates.length} semaines à affecter sur ${allWeeks.length} au total`);

      const result = await api.post<{ assignedWeeks: number }>(
        `/seasons/${season.id}/assignments/apply-rule`,
        { templateWeekId: applyModal.tw.id, weekDates: nonHolidayDates }
      );
      setApplyResult(`${result.assignedWeeks} semaine(s) affectée(s) (${holidays.length} période(s) de congés Zone C trouvée(s)).`);
      setApplyStatus('success');
      await onRefresh();
    } catch (err) {
      console.error('handleApplyRule error:', err);
      setApplyResult('Impossible de récupérer les vacances scolaires. Vérifiez votre connexion internet.');
      setApplyStatus('error');
    }
  };

  // duration() est défini au niveau module

  return (
    <div className="space-y-4">
      {/* Top bar: TW selector + actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Semaine type chips */}
        <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto pb-1">
          {templateWeeks.map((tw, i) => {
            const color = TW_COLORS[i % TW_COLORS.length];
            const isSelected = (selectedTW?.id || templateWeeks[0]?.id) === tw.id;
            return (
              <div key={tw.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer border-2 transition-colors flex-shrink-0 ${
                  isSelected ? 'border-tennis-green bg-tennis-green/5' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
                onClick={() => onSelectedTWChange(tw.id)}
              >
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-sm font-medium text-gray-800 whitespace-nowrap">{tw.label}</span>
                <span className="text-xs text-gray-400">({tw.courses.length})</span>
                <button onClick={e => { e.stopPropagation(); openEditTW(tw); }}
                  className="p-0.5 text-gray-300 hover:text-tennis-green rounded ml-1"><Edit2 size={12} /></button>
                <button onClick={e => { e.stopPropagation(); setDeleteConfirm({ type: 'tw', id: tw.id }); }}
                  className="p-0.5 text-gray-300 hover:text-red-500 rounded"><Trash2 size={12} /></button>
              </div>
            );
          })}
          {templateWeeks.length === 0 && (
            <span className="text-sm text-gray-400">Aucune semaine type.</span>
          )}
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setCopyModal(true)}
            className="p-1.5 text-gray-400 hover:text-tennis-green hover:bg-tennis-green/10 rounded-lg" title="Importer une semaine type">
            <Copy size={15} />
          </button>
          <button onClick={openAddTW}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-tennis-green/10 text-tennis-green rounded-lg hover:bg-tennis-green/20 transition-colors font-medium">
            <Plus size={14} /> Nouvelle semaine
          </button>
        </div>
      </div>

      {/* Full-width calendar */}
      {selectedTW ? (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => setApplyModal({ tw: selectedTW })}
              className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors">
              <Calendar size={13} /> Règle Zone C
            </button>
            <button onClick={() => openAddCourse(selectedTW)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-tennis-green/10 text-tennis-green rounded-lg hover:bg-tennis-green/20 transition-colors">
              <Plus size={13} /> Ajouter une activité
            </button>
          </div>
          <WeekTimeGrid
            templateWeek={selectedTW}
            startDay={TEMPLATE_WEEK_START}
            users={users}
            onEditCourse={(course) => openEditCourse(selectedTW, course)}
            onAddCourse={(dayOfWeek, startTime) => openAddCourse(selectedTW, dayOfWeek, startTime)}
            showDates={false}
          />
        </div>
      ) : (
        <div className="card text-center py-16 text-gray-400">
          <BookOpen size={36} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Créez une semaine type pour commencer.</p>
        </div>
      )}

      {/* TW form modal */}
      {twModal && (
        <Modal title={twModal.editing ? 'Modifier la semaine type' : 'Nouvelle semaine type'} onClose={() => setTWModal(null)}>
          <form onSubmit={saveTW} className="space-y-4">
            {twError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{twError}</div>}
            <div>
              <label className="label">Libellé *</label>
              <input className="input" value={twForm.label} onChange={e => setTWForm({ label: e.target.value })}
                placeholder="Ex: Semaine standard, Semaine renforcée…" autoFocus required />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setTWModal(null)} className="btn-secondary">Annuler</button>
              <button type="submit" disabled={twSaving} className="btn-primary">{twSaving ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Course form modal */}
      {courseModal && (
        <Modal title={courseModal.editing ? "Modifier l'activité" : 'Nouvelle activité'} onClose={() => setCourseModal(null)}>
          <form onSubmit={saveCourse} className="space-y-4">
            {courseError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{courseError}</div>}
            <div>
              <label className="label">Intitulé de l'activité *</label>
              <input className="input" value={courseForm.label} onChange={e => setCourseForm(f => ({ ...f, label: e.target.value }))}
                placeholder="Ex: Tennis débutants" required />
            </div>
            <div>
              <label className="label">Jour *</label>
              <select className="input" value={courseForm.dayOfWeek}
                onChange={e => setCourseForm(f => ({ ...f, dayOfWeek: parseInt(e.target.value) }))}>
                {DAYS_SHORT.map((d, i) => <option key={i+1} value={i+1}>{d}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="min-w-0">
                <label className="label">Début *</label>
                <input type="time" className="input" value={courseForm.startTime}
                  onChange={e => handleStartTimeChange(e.target.value)} required />
              </div>
              <div className="min-w-0">
                <label className="label">Fin *</label>
                <input type="time" className="input" value={courseForm.endTime}
                  onChange={e => setCourseForm(f => ({ ...f, endTime: e.target.value }))} required />
              </div>
              <div className="min-w-0">
                <label className="label">Durée</label>
                <select
                  className="input"
                  value={String(Math.round((timeToMin(courseForm.endTime) - timeToMin(courseForm.startTime)) / 30) * 30)}
                  onChange={e => handleDurationChange(Number(e.target.value))}
                >
                  {[30,60,90,120,150,180,210,240].map(m => (
                    <option key={m} value={m}>{m < 60 ? `${m}min` : m % 60 === 0 ? `${m/60}h` : `${Math.floor(m/60)}h${String(m%60).padStart(2,'0')}`}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Type d'activité</label>
                <input className="input" list="course-type-list-tw" value={courseForm.courseType}
                  onChange={e => setCourseForm(f => ({ ...f, courseType: e.target.value }))}
                  placeholder="Ex: Collectif adulte" />
                <datalist id="course-type-list-tw">
                  {activityTypes
                    .filter(at => at.isGlobal !== false || (season.departmentId && at.departmentIds?.includes(season.departmentId)))
                    .map(at => <option key={at.id} value={at.name} />)}
                </datalist>
              </div>
              <div>
                <label className="label">Qui</label>
                <select className="input" value={courseForm.teacherId}
                  onChange={e => setCourseForm(f => ({ ...f, teacherId: e.target.value }))}>
                  <option value="">— Aucun —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setCourseModal(null)} className="btn-secondary">Annuler</button>
              <button type="submit" disabled={courseSaving} className="btn-primary">{courseSaving ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <Modal title="Confirmer la suppression" onClose={() => setDeleteConfirm(null)}>
          <p className="text-gray-600 mb-6">Cette action est irréversible.</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteConfirm(null)} className="btn-secondary">Annuler</button>
            <button
              onClick={() => deleteConfirm.type === 'tw'
                ? deleteTW(deleteConfirm.id)
                : deleteCourse(deleteConfirm.twId!, deleteConfirm.id)}
              className="btn-danger">Supprimer</button>
          </div>
        </Modal>
      )}

      {/* Copy modal */}
      {copyModal && (
        <Modal title="Importer une semaine type" onClose={() => setCopyModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="label">Saison source</label>
              <select className="input" value={copySourceSeasonId}
                onChange={e => { setCopySourceSeasonId(e.target.value); setCopySourceTWId(''); loadCopySourceTWs(e.target.value); }}>
                <option value="">— Sélectionner —</option>
                {allSeasons.filter(s => s.id !== season.id).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            {copyLoading && <div className="text-center text-sm text-gray-400">Chargement…</div>}
            {copySourceTWs.length > 0 && (
              <div>
                <label className="label">Semaine type à copier</label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {copySourceTWs.map(tw => (
                    <button key={tw.id}
                      onClick={() => setCopySourceTWId(tw.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 text-left transition-colors ${
                        copySourceTWId === tw.id ? 'border-tennis-green bg-tennis-green/5' : 'border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <span className="text-sm font-medium text-gray-800">{tw.label}</span>
                      <span className="text-xs text-gray-400 ml-auto">{tw.courses.length} activité{tw.courses.length !== 1 ? 's' : ''}</span>
                      {copySourceTWId === tw.id && <Check size={14} className="text-tennis-green" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setCopyModal(false)} className="btn-secondary">Annuler</button>
              <button onClick={handleCopy} disabled={!copySourceTWId || twSaving} className="btn-primary">
                {twSaving ? 'Import…' : 'Importer'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Apply Zone C rule modal */}
      {applyModal && (
        <Modal title="Appliquer sur le calendrier" onClose={() => { setApplyModal(null); setApplyStatus(null); }}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Règle : <strong>Toutes les semaines hors vacances scolaires Zone C</strong>
            </p>
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
              La semaine type <strong>{applyModal.tw.label}</strong> sera affectée à toutes les semaines
              de la saison, sauf celles correspondant aux vacances scolaires de la Zone C.
              Les semaines déjà affectées seront remplacées.
            </div>
            {applyStatus === 'loading' && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader size={16} className="animate-spin" /> Récupération des vacances scolaires…
              </div>
            )}
            {applyStatus === 'success' && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <Check size={16} /> {applyResult}
              </div>
            )}
            {applyStatus === 'error' && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle size={16} /> {applyResult}
              </div>
            )}
            {applyStatus !== 'success' && (
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => { setApplyModal(null); setApplyStatus(null); }} className="btn-secondary">Annuler</button>
                <button onClick={handleApplyRule} disabled={applyStatus === 'loading'} className="btn-primary">
                  Appliquer
                </button>
              </div>
            )}
            {applyStatus === 'success' && (
              <div className="flex justify-end">
                <button onClick={() => { setApplyModal(null); setApplyStatus(null); }} className="btn-primary">Fermer</button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Season Detail (main page) ────────────────────────────────────────────────

export default function SeasonDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { users, departments } = useApp();

  const [season, setSeason] = useState<Season | null>(null);
  const [templateWeeks, setTemplateWeeks] = useState<TemplateWeek[]>([]);
  const [assignments, setAssignments] = useState<WeekAssignment[]>([]);
  const [allSeasons, setAllSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'calendar' | 'template-weeks'>('calendar');
  const [panelSelectedTWId, setPanelSelectedTWId] = useState<string | null>(null);

  // Status edit
  const [statusEditing, setStatusEditing] = useState(false);
  const [nameEditing, setNameEditing] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const [deptEditing, setDeptEditing] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const [s, tws, asgn, all] = await Promise.all([
        api.get<Season>(`/seasons/${id}`),
        api.get<TemplateWeek[]>(`/seasons/${id}/template-weeks`),
        api.get<WeekAssignment[]>(`/seasons/${id}/assignments`),
        api.get<Season[]>('/seasons'),
      ]);
      setSeason(s); setTemplateWeeks(tws); setAssignments(asgn); setAllSeasons(all);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAssign = async (weekStartDate: string, templateWeekId: string | null) => {
    if (!id) return;
    await api.put(`/seasons/${id}/assignments`, { weekStartDate, templateWeekId });
    const updated = await api.get<WeekAssignment[]>(`/seasons/${id}/assignments`);
    setAssignments(updated);
  };

  const handleStatusChange = async (status: SeasonStatus) => {
    if (!id) return;
    const updated = await api.put<Season>(`/seasons/${id}`, { status });
    setSeason(updated); setStatusEditing(false);
  };

  const handleNameSave = async () => {
    if (!id || !nameVal.trim()) return;
    const updated = await api.put<Season>(`/seasons/${id}`, { name: nameVal });
    setSeason(updated); setNameEditing(false);
  };

  const handleDeptChange = async (departmentId: string | null) => {
    if (!id) return;
    const updated = await api.put<Season>(`/seasons/${id}`, { departmentId });
    setSeason(updated); setDeptEditing(false);
  };

  const handleEditTemplateWeek = (twId: string) => {
    setPanelSelectedTWId(twId);
    setActiveTab('template-weeks');
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement…</div>;
  if (!season)  return <div className="p-8 text-center text-red-500">Saison introuvable.</div>;

  const statusCfg = STATUS_CFG[season.status];

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-4 mb-6">
        <button onClick={() => navigate('/seasons')}
          className="mt-1 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          {nameEditing ? (
            <div className="flex items-center gap-2">
              <input className="input text-xl font-bold" value={nameVal} autoFocus
                onChange={e => setNameVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') setNameEditing(false); }} />
              <button onClick={handleNameSave} className="p-1.5 text-tennis-green hover:bg-tennis-green/10 rounded"><Check size={16} /></button>
              <button onClick={() => setNameEditing(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"><X size={16} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{season.name}</h1>
              <button onClick={() => { setNameVal(season.name); setNameEditing(true); }}
                className="p-1 text-gray-300 hover:text-gray-500"><Edit2 size={15} /></button>
              {deptEditing ? (
                <div className="flex items-center gap-1">
                  <select
                    autoFocus
                    className="text-xs border border-purple-300 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-400"
                    value={season.departmentId ?? ''}
                    onChange={e => handleDeptChange(e.target.value || null)}
                  >
                    <option value="">— Aucune direction —</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <button onClick={() => setDeptEditing(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X size={13} /></button>
                </div>
              ) : (
                <button
                  onClick={() => setDeptEditing(true)}
                  className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                    season.departmentId
                      ? 'bg-purple-50 text-purple-600 hover:bg-purple-100'
                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                  }`}
                  title="Modifier la direction"
                >
                  <Building2 size={10} />
                  {season.departmentId
                    ? (departments.find(d => d.id === season.departmentId)?.name ?? 'Direction')
                    : 'Ajouter une direction'}
                </button>
              )}
            </div>
          )}
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date(season.startDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            {' → '}
            {new Date(season.endDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        {/* Status badge + editor */}
        <div className="relative">
          <button onClick={() => setStatusEditing(!statusEditing)}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full font-medium ${statusCfg.color}`}>
            {statusCfg.label}
            <Edit2 size={12} />
          </button>
          {statusEditing && (
            <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-10 min-w-36">
              {(['draft','published','closed','deleted'] as SeasonStatus[]).map(s => (
                <button key={s} onClick={() => handleStatusChange(s)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${season.status === s ? 'text-tennis-green font-medium' : 'text-gray-700'}`}>
                  {season.status === s && <Check size={13} />}
                  {STATUS_CFG[s].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-1 -mb-px">
          {([
            { key: 'calendar',       label: 'Calendrier',     icon: <Calendar size={15} /> },
            { key: 'template-weeks', label: 'Semaines type',  icon: <BookOpen size={15} /> },
          ] as { key: 'calendar' | 'template-weeks'; label: string; icon: React.ReactNode }[]).map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key ? 'border-tennis-green text-tennis-green' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Les deux panneaux restent montés (CSS display) pour que :
          - CalendarView reçoive les mises à jour de templateWeeks en temps réel
          - La position de navigation (viewMode, viewDate, weekIdx) soit préservée
            quand l'utilisateur bascule entre les onglets */}
      <div style={{ display: activeTab === 'calendar' ? 'block' : 'none' }}>
        <CalendarView
          season={season}
          templateWeeks={templateWeeks}
          assignments={assignments}
          users={users}
          onAssign={handleAssign}
          onRefresh={loadData}
          onEditTemplateWeek={handleEditTemplateWeek}
        />
      </div>

      <div style={{ display: activeTab === 'template-weeks' ? 'block' : 'none' }}>
        <TemplateWeeksPanel
          season={season}
          templateWeeks={templateWeeks}
          users={users}
          allSeasons={allSeasons}
          onRefresh={loadData}
          selectedTWId={panelSelectedTWId}
          onSelectedTWChange={setPanelSelectedTWId}
        />
      </div>
    </div>
  );
}
