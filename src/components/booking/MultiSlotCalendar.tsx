import { useMemo } from 'react';
import { CalendarClock, X } from 'lucide-react';
import type { ScheduleSlot } from '../../lib/db';
import {
  formatMinutes,
  parseTimeToMinutes,
  type BookedSession,
  type SelectedSlot,
} from '../../lib/bookingsStore';

type Props = {
  schedule: ScheduleSlot[];
  hourlyRate: number;
  language: 'en' | 'ar' | 'fr';
  selected: SelectedSlot[];
  onChange: (slots: SelectedSlot[]) => void;
  bookedSessions: BookedSession[];
  tutorId: string;
};

export function creditCostFor(hourlyRate: number): number {
  return Math.max(1, Math.round(hourlyRate / 25));
}

const DAYS_AHEAD = 14;

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayToNumber(day: string | number): number {
  if (typeof day === 'number') return day % 7;
  const str = String(day || '').trim().toLowerCase();
  if (str.startsWith('sun') || str === '0') return 0;
  if (str.startsWith('mon') || str === '1') return 1;
  if (str.startsWith('tue') || str === '2') return 2;
  if (str.startsWith('wed') || str === '3') return 3;
  if (str.startsWith('thu') || str === '4') return 4;
  if (str.startsWith('fri') || str === '5') return 5;
  if (str.startsWith('sat') || str === '6') return 6;
  return 0;
}

export default function MultiSlotCalendar({
  schedule,
  hourlyRate,
  language,
  selected,
  onChange,
  bookedSessions,
  tutorId,
}: Props) {
  const t = (en: string, ar: string, fr?: string) => (language === 'ar' ? ar : (language === 'fr' ? (fr || en) : en));

  const effectiveSchedule = useMemo(() => {
    if (schedule && schedule.length > 0) return schedule;
    return [0, 1, 2, 3, 4, 5, 6].flatMap(d => [
      { id: `def-am-${d}`, tutorId, dayOfWeek: d, startTime: '09:00', endTime: '12:00', isAvailable: true },
      { id: `def-pm-${d}`, tutorId, dayOfWeek: d, startTime: '14:00', endTime: '18:00', isAvailable: true }
    ]);
  }, [schedule, tutorId]);

  const days = useMemo(() => {
    const list: { iso: string; label: string; isToday: boolean; slots: { start: number; end: number }[] }[] = [];
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + i);
      const slots: { start: number; end: number }[] = [];
      effectiveSchedule
        .filter(s => (s.isAvailable !== false) && dayToNumber(s.dayOfWeek) === d.getDay())
        .forEach(s => {
          const from = parseTimeToMinutes(s.startTime);
          const to = parseTimeToMinutes(s.endTime);
          for (let m = from; m + 60 <= to; m += 60) slots.push({ start: m, end: m + 60 });
        });
      slots.sort((a, b) => a.start - b.start);
      list.push({
        iso: toIsoDate(d),
        label: d.toLocaleDateString(language === 'ar' ? 'ar' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' }),
        isToday: i === 0,
        slots,
      });
    }
    return list;
  }, [effectiveSchedule, language]);

  const cost = creditCostFor(hourlyRate);
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const slotKey = (iso: string, start: number) => `${iso}_${start}`;

  const isTaken = (iso: string, start: number) =>
    bookedSessions.some(
      b => b.tutorId === tutorId && b.status === 'confirmed' && b.date === iso && parseTimeToMinutes(b.startTime) === start
    );

  const toggle = (iso: string, label: string, slot: { start: number; end: number }) => {
    const key = slotKey(iso, slot.start);
    if (selected.some(s => s.key === key)) {
      onChange(selected.filter(s => s.key !== key));
    } else {
      onChange([
        ...selected,
        {
          key,
          date: iso,
          dayLabel: label,
          startTime: formatMinutes(slot.start),
          endTime: formatMinutes(slot.end),
          creditCost: cost,
        },
      ]);
    }
  };

  return (
    <>
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
        <div>
          <h3 className="font-semibold text-gray-800 mb-1">{t('Select Dates & Times', 'اختر التواريخ والأوقات')}</h3>
          <p className="text-xs text-gray-400">
            {t('Tap multiple slots to book several sessions at once across different days.', 'اضغط على مواعيد مختلفة لحجز عدة حصص في أيام متعددة دفعة واحدة.')}
          </p>
        </div>

        <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
          {days
            .filter(d => d.slots.length > 0)
            .map(d => (
              <div key={d.iso} className="space-y-2">
                <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-slate-900 px-2 py-1 rounded-lg">
                  {d.label}
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  {d.slots.map(slot => {
                    const key = slotKey(d.iso, slot.start);
                    const taken = isTaken(d.iso, slot.start);
                    const past = d.isToday && slot.start <= nowMinutes;
                    const isSelected = selected.some(s => s.key === key);
                    return (
                      <button
                        key={key}
                        onClick={() => toggle(d.iso, d.label, slot)}
                        disabled={taken || past}
                        className={`py-2.5 rounded-xl text-xs font-semibold transition-all ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                            : taken || past
                            ? 'bg-gray-50 text-gray-300 line-through cursor-not-allowed dark:bg-slate-800 dark:text-gray-600'
                            : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600 dark:bg-slate-800 dark:text-gray-300'
                        }`}
                      >
                        {formatMinutes(slot.start)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          {days.every(d => d.slots.length === 0) && (
            <p className="text-sm text-gray-400 text-center py-4">
              {t('No available slots for the next 14 days.', 'لا توجد مواعيد متاحة خلال الـ 14 يوماً القادمة.')}
            </p>
          )}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-blue-600" /> {t('Selected Sessions', 'الحصص المختارة')}
            </h3>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">{selected.length}</span>
          </div>
          <div className="space-y-2">
            {[...selected]
              .sort((a, b) =>
                a.date === b.date
                  ? parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
                  : a.date.localeCompare(b.date)
              )
              .map(s => (
                <div key={s.key} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                  <div>
                    <p className="text-xs font-semibold text-gray-800">{s.dayLabel}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {s.startTime} – {s.endTime} · {s.creditCost} {t('credits', 'رصيد')}
                    </p>
                  </div>
                  <button
                    onClick={() => onChange(selected.filter(x => x.key !== s.key))}
                    className="p-1.5 bg-red-50 hover:bg-red-100 text-red-400 rounded-lg transition-colors"
                    aria-label={t('Remove session', 'إزالة الحصة')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </>
  );
}
