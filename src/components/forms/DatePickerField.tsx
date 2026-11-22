import React, { useMemo, useState } from 'react';
import {
  Keyboard,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SHADOWS } from '../../theme/tokens';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseIsoDate(iso?: string): { year: number; month: number; day: number } | null {
  if (!iso) return null;
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function toIsoDate(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function formatFriendlyDate(iso?: string): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return iso || 'Pick date';
  return `${SHORT_MONTHS[parsed.month]} ${parsed.day}, ${parsed.year}`;
}

interface Props {
  label?: string;
  value: string;
  onChange: (isoDate: string) => void;
  placeholder?: string;
  compact?: boolean;
  backgroundColor?: string;
}

/**
 * Interactive warm calendar picker field.
 * Tapping opens a visual month/year calendar grid (respecting Android safe-area navigation bars).
 */
export const DatePickerField: React.FC<Props> = ({
  label,
  value,
  onChange,
  placeholder = 'Select date',
  compact = false,
  backgroundColor,
}) => {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [showYearGrid, setShowYearGrid] = useState(false);

  const today = useMemo(() => {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
      iso: toIsoDate(now.getFullYear(), now.getMonth(), now.getDate()),
    };
  }, []);

  const parsedValue = parseIsoDate(value);
  const [viewYear, setViewYear] = useState(parsedValue?.year ?? today.year);
  const [viewMonth, setViewMonth] = useState(parsedValue?.month ?? today.month);

  const openCalendar = () => {
    Keyboard.dismiss();
    const p = parseIsoDate(value);
    setViewYear(p?.year ?? today.year);
    setViewMonth(p?.month ?? today.month);
    setShowYearGrid(false);
    setOpen(true);
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const calendarCells = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: Array<number | null> = [];
    for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const years = useMemo(() => {
    const list: number[] = [];
    const base = today.year;
    for (let y = base - 12; y <= base + 6; y++) list.push(y);
    return list;
  }, [today.year]);

  const handleSelectDay = (day: number) => {
    const iso = toIsoDate(viewYear, viewMonth, day);
    onChange(iso);
    setOpen(false);
  };

  const handlePickToday = () => {
    onChange(today.iso);
    setOpen(false);
  };

  return (
    <View style={{ flex: 1 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity
        onPress={openCalendar}
        activeOpacity={0.8}
        style={[
          styles.fieldBtn,
          compact && styles.fieldBtnCompact,
          backgroundColor ? { backgroundColor } : null,
        ]}
      >
        <Text style={styles.calEmoji}>📅</Text>
        <Text
          style={[
            styles.fieldText,
            compact && styles.fieldTextCompact,
            !parsedValue && styles.placeholderText,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
        >
          {parsedValue ? formatFriendlyDate(value) : placeholder}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={[
            styles.backdrop,
            {
              paddingTop: Math.max(insets.top, 24) + 12,
              paddingBottom: Math.max(insets.bottom, 20) + 12,
            },
          ]}
        >
          <TouchableWithoutFeedback onPress={() => setOpen(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>

          <View style={styles.dialog}>
            {/* Header: Month & Year Navigation */}
            <View style={styles.headerRow}>
              <TouchableOpacity
                onPress={prevMonth}
                style={styles.navArrowBtn}
                activeOpacity={0.75}
              >
                <Text style={styles.navArrowText}>‹</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setShowYearGrid(!showYearGrid)}
                style={styles.monthYearBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.monthYearText}>
                  {MONTH_NAMES[viewMonth]} {viewYear} {showYearGrid ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={nextMonth}
                style={styles.navArrowBtn}
                activeOpacity={0.75}
              >
                <Text style={styles.navArrowText}>›</Text>
              </TouchableOpacity>
            </View>

            {showYearGrid ? (
              <ScrollView
                style={styles.yearScroll}
                contentContainerStyle={styles.yearGrid}
                showsVerticalScrollIndicator={false}
              >
                {years.map((y) => {
                  const active = y === viewYear;
                  return (
                    <TouchableOpacity
                      key={y}
                      onPress={() => {
                        setViewYear(y);
                        setShowYearGrid(false);
                      }}
                      style={[styles.yearCell, active && styles.yearCellActive]}
                    >
                      <Text style={[styles.yearText, active && styles.yearTextActive]}>
                        {y}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <>
                {/* Weekday Header */}
                <View style={styles.weekRow}>
                  {WEEKDAYS.map((w) => (
                    <Text key={w} style={styles.weekText}>
                      {w}
                    </Text>
                  ))}
                </View>

                {/* Days Grid */}
                <View style={styles.daysGrid}>
                  {calendarCells.map((day, idx) => {
                    if (day === null) {
                      return <View key={`empty_${idx}`} style={styles.daySlot} />;
                    }
                    const iso = toIsoDate(viewYear, viewMonth, day);
                    const isSelected = Boolean(
                      parsedValue &&
                        parsedValue.year === viewYear &&
                        parsedValue.month === viewMonth &&
                        parsedValue.day === day
                    );
                    const isToday = iso === today.iso;

                    return (
                      <TouchableOpacity
                        key={iso}
                        onPress={() => handleSelectDay(day)}
                        style={styles.daySlot}
                        activeOpacity={0.75}
                      >
                        <View
                          style={[
                            styles.dayCircle,
                            isToday && !isSelected && styles.dayToday,
                            isSelected && styles.daySelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dayText,
                              isToday && !isSelected && styles.dayTodayText,
                              isSelected && styles.daySelectedText,
                            ]}
                          >
                            {day}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Footer Shortcuts */}
            <View style={styles.footerRow}>
              <TouchableOpacity
                onPress={handlePickToday}
                style={styles.todayBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.todayBtnText}>☀️ Today</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                style={styles.cancelBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.inkMuted,
    marginBottom: 4,
    marginTop: 2,
  },
  fieldBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: COLORS.canvas,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  fieldBtnCompact: {
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 9,
    gap: 5,
  },
  calEmoji: {
    fontSize: 14,
  },
  fieldText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.ink,
    flex: 1,
  },
  fieldTextCompact: {
    fontSize: 12,
  },
  placeholderText: {
    color: COLORS.inkSoft,
    fontWeight: '600',
  },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(28,25,23,0.52)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    ...SHADOWS.card,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  navArrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrowText: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.ink,
    lineHeight: 22,
  },
  monthYearBtn: {
    flex: 1,
    backgroundColor: COLORS.coralSoft,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  monthYearText: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.coralDark,
  },

  yearScroll: {
    maxHeight: 230,
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  yearCell: {
    width: '30%',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  yearCellActive: {
    backgroundColor: COLORS.coral,
    borderColor: COLORS.coral,
  },
  yearText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.ink,
  },
  yearTextActive: {
    color: '#FFFFFF',
  },

  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 2,
  },
  weekText: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.inkSoft,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  daySlot: {
    width: '14.28%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: {
    borderWidth: 1.5,
    borderColor: COLORS.coral,
    backgroundColor: '#FFF7ED',
  },
  daySelected: {
    backgroundColor: COLORS.coral,
  },
  dayText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.ink,
  },
  dayTodayText: {
    color: COLORS.coralDark,
    fontWeight: '900',
  },
  daySelectedText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },

  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
  },
  todayBtn: {
    backgroundColor: COLORS.amberSoft,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  todayBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
  },
  cancelBtn: {
    backgroundColor: COLORS.canvas,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.inkMuted,
  },
});
