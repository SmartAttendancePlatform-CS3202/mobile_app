import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  InteractionManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import api from '../services/api';
import { ClassSession, AcademicHeaderInfo, mockAcademicInfo } from '../services/mockData';
import Skeleton from '../components/Skeleton';

const DAYS = [
  { key: 'Monday', label: 'Mon' },
  { key: 'Tuesday', label: 'Tue' },
  { key: 'Wednesday', label: 'Wed' },
  { key: 'Thursday', label: 'Thu' },
  { key: 'Friday', label: 'Fri' },
  { key: 'All', label: 'All' },
];

export default function TimetableScreen() {
  const navigation = useNavigation<any>();
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [academicInfo, setAcademicInfo] = useState<AcademicHeaderInfo>(mockAcademicInfo);
  const [loading, setLoading] = useState(true);

  // Auto-select today's day of week (Monday-Friday) or default to Monday
  const currentDayName = useMemo(() => {
    const dayIndex = new Date().getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    const dayMap: { [key: number]: string } = {
      1: 'Monday',
      2: 'Tuesday',
      3: 'Wednesday',
      4: 'Thursday',
      5: 'Friday',
    };
    return dayMap[dayIndex] || 'Monday';
  }, []);

  const [selectedDay, setSelectedDay] = useState<string>(currentDayName);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      (async () => {
        setLoading(true);
        const res = await api.getSessions();
        if (res.success && res.sessions) {
          setSessions(res.sessions);
        }
        const infoRes = await api.getAcademicInfo();
        if (infoRes.success && infoRes.info) {
          setAcademicInfo(infoRes.info);
        }
        setLoading(false);
      })();
    });

    return () => task.cancel();
  }, []);

  const filteredSessions = useMemo(() => {
    let currentSessions = sessions;
    if (selectedDay !== 'All') {
      currentSessions = sessions.filter(s => s.day === selectedDay);
    }
    
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    return currentSessions.map((s: any) => {
      let isActive = false;
      if (s.type !== 'Break' && s.type !== 'Event' && s.day === currentDayName) {
        const [startHour, startMin] = s.startTime.split(':').map(Number);
        const [endHour, endMin] = s.endTime.split(':').map(Number);
        const startTotal = startHour * 60 + startMin;
        const endTotal = endHour * 60 + endMin;
        isActive = currentMinutes >= startTotal && currentMinutes <= endTotal;
      }
      return {
        ...s,
        isActive
      };
    });
  }, [sessions, selectedDay, currentDayName]);

  const getTypeTheme = (type: string) => {
    switch (type) {
      case 'L':
        return {
          bg: '#EEF2FF',
          text: '#4F46E5',
          border: '#C7D2FE',
          icon: 'book-outline',
        };
      case 'P':
        return {
          bg: '#ECFDF5',
          text: '#059669',
          border: '#A7F3D0',
          icon: 'flask-outline',
        };
      case 'L & P':
        return {
          bg: '#FDF4FF',
          text: '#9333EA',
          border: '#F0ABFC',
          icon: 'layers-outline',
        };
      case 'Event':
        return {
          bg: '#F0F9FF',
          text: '#0284C7',
          border: '#BAE6FD',
          icon: 'ribbon-outline',
        };
      case 'Break':
        return {
          bg: '#F3F4F6',
          text: '#6B7280',
          border: '#E5E7EB',
          icon: 'restaurant-outline',
        };
      default:
        return {
          bg: '#F3F4F6',
          text: '#4B5563',
          border: '#E5E7EB',
          icon: 'calendar-outline',
        };
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { padding: 16 }]}>
        <Skeleton height={100} borderRadius={16} style={{ marginBottom: 16, marginTop: 12 }} />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          <Skeleton width={60} height={36} borderRadius={12} />
          <Skeleton width={60} height={36} borderRadius={12} />
          <Skeleton width={60} height={36} borderRadius={12} />
        </View>
        <View style={{ gap: 14 }}>
          <Skeleton height={120} borderRadius={16} />
          <Skeleton height={120} borderRadius={16} />
          <Skeleton height={120} borderRadius={16} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Academic Header Banner */}
      <View style={styles.headerCard}>
        <View style={styles.headerTopRow}>
          <View style={styles.uomBadge}>
            <Ionicons name="school" size={14} color="#4F46E5" />
            <Text style={styles.uomBadgeText}>{academicInfo.university}</Text>
          </View>
          <View style={styles.termBadge}>
            <Text style={styles.termBadgeText}>{academicInfo.term}</Text>
          </View>
        </View>

        <Text style={styles.facultyText}>{academicInfo.faculty} • {academicInfo.department}</Text>
        <Text style={styles.sessionText}>{academicInfo.session}</Text>
      </View>

      {/* Day Selector Pills */}
      <View style={styles.daySelectorContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dayScrollContent}
        >
          {DAYS.map(day => {
            const isSelected = selectedDay === day.key;
            return (
              <TouchableOpacity
                key={day.key}
                style={[styles.dayPill, isSelected && styles.dayPillActive]}
                onPress={() => setSelectedDay(day.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dayPillText, isSelected && styles.dayPillTextActive]}>
                  {day.label}
                </Text>
                {day.key === currentDayName && (
                  <View style={[styles.todayIndicator, isSelected && styles.todayIndicatorActive]} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Timetable List */}
      <FlatList
        data={filteredSessions}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-clear-outline" size={48} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No Classes Scheduled</Text>
            <Text style={styles.emptySubtitle}>Enjoy your free time or use this time for self-study!</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const typeTheme = getTypeTheme(item.type);
          const isBreak = item.type === 'Break';

          if (isBreak) {
            return (
              <View style={styles.breakRow}>
                <View style={styles.breakLine} />
                <View style={styles.breakCard}>
                  <Ionicons name="restaurant-outline" size={16} color="#6B7280" />
                  <Text style={styles.breakTitle}>Lunch Break</Text>
                  <Text style={styles.breakTime}>({item.startTime} - {item.endTime})</Text>
                </View>
                <View style={styles.breakLine} />
              </View>
            );
          }

          return (
            <View style={styles.timelineRow}>
              {/* Timeline Graphic */}
              <View style={styles.timelineGraphic}>
                <View style={[styles.dot, item.isActive ? styles.activeDot : styles.inactiveDot]} />
                {index !== filteredSessions.length - 1 && (
                  <View style={[styles.line, item.isActive ? styles.activeLine : styles.inactiveLine]} />
                )}
              </View>

              {/* Class Card */}
              <View style={[styles.card, item.isActive && styles.activeCard]}>
                {/* Header: Course Code & Type Badge */}
                <View style={styles.cardHeader}>
                  <View style={styles.codeAndDay}>
                    {item.courseCode !== 'RESEARCH' && item.courseCode !== 'UNION' && (
                      <View style={styles.courseCodeBadge}>
                        <Text style={styles.courseCodeText}>{item.courseCode}</Text>
                      </View>
                    )}
                    <View style={[styles.typeBadge, { backgroundColor: typeTheme.bg, borderColor: typeTheme.border }]}>
                      <Ionicons name={typeTheme.icon as any} size={12} color={typeTheme.text} style={{ marginRight: 4 }} />
                      <Text style={[styles.typeBadgeText, { color: typeTheme.text }]}>
                        {item.typeLabel}
                      </Text>
                    </View>
                  </View>

                  {item.isActive && (
                    <View style={styles.liveBadge}>
                      <View style={styles.livePulseDot} />
                      <Text style={styles.liveBadgeText}>LIVE</Text>
                    </View>
                  )}
                </View>

                {/* Course Name */}
                <Text style={styles.courseName}>{item.courseName}</Text>

                {/* Meta details */}
                <View style={styles.detailsGrid}>
                  {/* Venue */}
                  <View style={styles.infoRow}>
                    <Ionicons
                      name={item.venue.toLowerCase().includes('online') ? "globe-outline" : "location-outline"}
                      size={15}
                      color="#4F46E5"
                    />
                    <Text style={styles.venueText}>{item.venue}</Text>
                  </View>

                  {/* Lecturer */}
                  {item.lecturer && item.type !== 'Event' && (
                    <View style={styles.infoRow}>
                      <Ionicons name="person-outline" size={15} color="#6B7280" />
                      <Text style={styles.metaText}>{item.lecturer}</Text>
                    </View>
                  )}

                  {/* Time & Duration */}
                  <View style={styles.infoRow}>
                    <Ionicons name="time-outline" size={15} color="#6B7280" />
                    <Text style={styles.timeText}>
                      {item.startTime} - {item.endTime}
                      {item.duration ? `  (${item.duration})` : ''}
                    </Text>
                  </View>

                  {selectedDay === 'All' && (
                    <View style={styles.infoRow}>
                      <Ionicons name="calendar-outline" size={15} color="#6B7280" />
                      <Text style={styles.dayText}>{item.day}</Text>
                    </View>
                  )}
                </View>

              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#4F46E5',
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  uomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flex: 1,
    marginRight: 8,
  },
  uomBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
    marginLeft: 5,
  },
  termBadge: {
    backgroundColor: '#111827',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  termBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  facultyText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
    marginTop: 2,
  },
  sessionText: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  daySelectorContainer: {
    paddingVertical: 8,
  },
  dayScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  dayPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minWidth: 58,
  },
  dayPillActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  dayPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4B5563',
  },
  dayPillTextActive: {
    color: '#FFFFFF',
  },
  todayIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4F46E5',
    marginTop: 3,
  },
  todayIndicatorActive: {
    backgroundColor: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 30,
    paddingTop: 4,
  },
  timelineRow: {
    flexDirection: 'row',
  },
  timelineGraphic: {
    alignItems: 'center',
    width: 24,
    marginRight: 10,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 22,
    zIndex: 1,
  },
  activeDot: {
    backgroundColor: '#4F46E5',
    borderWidth: 2.5,
    borderColor: '#C7D2FE',
  },
  inactiveDot: {
    backgroundColor: '#D1D5DB',
  },
  line: {
    width: 2,
    flex: 1,
    marginTop: -4,
    marginBottom: -22,
  },
  activeLine: {
    backgroundColor: '#4F46E5',
  },
  inactiveLine: {
    backgroundColor: '#E5E7EB',
  },
  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  activeCard: {
    borderColor: '#4F46E5',
    backgroundColor: '#FAFAFF',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  codeAndDay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  courseCodeBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  courseCodeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4F46E5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 4,
  },
  liveBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  courseName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
    lineHeight: 22,
  },
  detailsGrid: {
    gap: 5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  venueText: {
    fontSize: 13,
    color: '#4F46E5',
    marginLeft: 6,
    fontWeight: '700',
  },
  metaText: {
    fontSize: 13,
    color: '#4B5563',
    marginLeft: 6,
    fontWeight: '500',
  },
  timeText: {
    fontSize: 13,
    color: '#374151',
    marginLeft: 6,
    fontWeight: '600',
  },
  dayText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 6,
    fontWeight: '500',
  },
  breakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
    marginHorizontal: 12,
  },
  breakLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  breakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginHorizontal: 8,
  },
  breakTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
    marginLeft: 6,
  },
  breakTime: {
    fontSize: 11,
    color: '#9CA3AF',
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 6,
  },
});

