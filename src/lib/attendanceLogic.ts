/**
 * Shared attendance computation logic.
 * All status derivations must use this module so the rules are consistent
 * across Director, Management, Employee, and Intern views.
 */

export interface WorkSchedule {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
  late_threshold_few: number;   // minutes
  late_threshold_late: number;  // minutes
  early_threshold_few: number;
  early_threshold_early: number;
  half_day_threshold_pct: number;
}

export const DAY_KEYS: (keyof WorkSchedule)[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

/** Returns true if a given date string (YYYY-MM-DD) is a working day per the schedule. */
export function isWorkingDay(dateStr: string, schedule: WorkSchedule): boolean {
  const dow = new Date(dateStr + 'T12:00:00').getDay(); // 0=Sun
  return !!schedule[DAY_KEYS[dow]];
}

/** Convert "HH:MM" to total minutes since midnight. */
export function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Derive attendance status and labels from check-in/out times and schedule. */
export interface DerivedAttendance {
  status: string;
  late_minutes: number;
  early_minutes: number;
  overtime_hours: number;
  late_label: string | null;
  early_label: string | null;
  checkout_label: string | null;
  working_hours: number | null;
}

export function deriveAttendanceStatus(
  checkInISO: string | null,
  checkOutISO: string | null,
  schedule: WorkSchedule,
): DerivedAttendance {
  const startMins = timeToMins(schedule.start_time);
  const endMins   = timeToMins(schedule.end_time);
  const totalWorkMins = endMins - startMins;

  let late_minutes = 0;
  let early_minutes = 0;
  let overtime_hours = 0;
  let late_label: string | null = null;
  let early_label: string | null = null;
  let checkout_label: string | null = null;
  let working_hours: number | null = null;
  let status = 'present';

  if (!checkInISO) {
    // No check-in at all — caller should decide absent/holiday/weekend
    return { status: 'absent', late_minutes: 0, early_minutes: 0, overtime_hours: 0, late_label: null, early_label: null, checkout_label: null, working_hours: null };
  }

  const checkInDate = new Date(checkInISO);
  const checkInMins = checkInDate.getHours() * 60 + checkInDate.getMinutes();

  // --- Late arrival ---
  if (checkInMins > startMins) {
    late_minutes = checkInMins - startMins;
    if (late_minutes <= schedule.late_threshold_few) {
      late_label = 'Few Minutes Late';
      status = 'late';
    } else if (late_minutes <= schedule.late_threshold_late) {
      late_label = 'Late';
      status = 'late';
    } else {
      late_label = 'Very Late';
      status = 'late';
    }
  }

  // --- Checkout analysis ---
  if (checkOutISO) {
    const checkOutDate = new Date(checkOutISO);
    const checkOutMins = checkOutDate.getHours() * 60 + checkOutDate.getMinutes();

    // Working hours
    working_hours = Math.round(((checkOutDate.getTime() - checkInDate.getTime()) / 36000)) / 100;

    const minutesWorked = checkOutMins - checkInMins;
    const percentWorked = totalWorkMins > 0 ? (minutesWorked / totalWorkMins) * 100 : 100;

    if (checkOutMins < endMins) {
      early_minutes = endMins - checkOutMins;

      if (percentWorked <= schedule.half_day_threshold_pct) {
        early_label = 'Half Day';
        status = 'half_day';
      } else if (early_minutes <= schedule.early_threshold_few) {
        early_label = 'Few Minutes Early';
      } else if (early_minutes <= schedule.early_threshold_early) {
        early_label = 'Early Checkout';
      } else {
        early_label = 'Early Checkout';
      }
    } else if (checkOutMins > endMins) {
      // Overtime
      overtime_hours = Math.round(((checkOutMins - endMins) / 60) * 10) / 10;
      checkout_label = `Overtime ${overtime_hours}h`;
      if (status === 'present') status = 'overtime';
    }
  }

  return { status, late_minutes, early_minutes, overtime_hours, late_label, early_label, checkout_label, working_hours };
}

/** Full status label for display. */
export const STATUS_LABEL: Record<string, string> = {
  present:     'Present',
  absent:      'Absent',
  late:        'Late',
  half_day:    'Half Day',
  overtime:    'Overtime',
  holiday:     'Holiday',
  weekend_off: 'Weekend Off',
  on_leave:    'On Leave',
};

/** Tailwind classes for each status badge. */
export const STATUS_STYLES: Record<string, string> = {
  present:     'border-green-500/30 text-green-400 bg-green-500/10',
  absent:      'border-red-500/30 text-red-400 bg-red-500/10',
  late:        'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  half_day:    'border-orange-500/30 text-orange-400 bg-orange-500/10',
  overtime:    'border-purple-500/30 text-purple-400 bg-purple-500/10',
  holiday:     'border-blue-500/30 text-blue-400 bg-blue-500/10',
  weekend_off: 'border-muted-foreground/30 text-muted-foreground bg-muted/30',
  on_leave:    'border-cyan-500/30 text-cyan-400 bg-cyan-500/10',
};
