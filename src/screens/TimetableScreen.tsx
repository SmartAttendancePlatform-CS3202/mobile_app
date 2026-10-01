import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  InteractionManager,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { ClassSession, AcademicHeaderInfo, mockAcademicInfo } from '../services/mockData';
import Skeleton from '../components/Skeleton';

const DAYS = [
  { key: 'Monday', label: 'Mon', date: '28' },
  { key: 'Tuesday', label: 'Tue', date: '29' },
  { key: 'Wednesday', label: 'Wed', date: '30' },
  { key: 'Thursday', label: 'Thu', date: '31' },
  { key: 'Friday', label: 'Fri', date: '01' },
  { key: 'Saturday', label: 'Sat', date: '02' },
  { key: 'Sunday', label: 'Sun', date: '03' },
  { key: 'All', label: 'All', date: '*' },
];

export default function TimetableScreen() {
  const navigation = useNavigation<any>();
  const { isFaceRegistered } = useAuth();
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [academicInfo, setAcademicInfo] = useState<AcademicHeaderInfo>(mockAcademicInfo);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Auto-select today's day of week or default to Monday
  const currentDayName = useMemo(() => {
    const dayIndex = new Date().getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    const dayMap: { [key: number]: string } = {
      0: 'Sunday',
      1: 'Monday',
      2: 'Tuesday',
      3: 'Wednesday',
      4: 'Thursday',
      5: 'Friday',
      6: 'Saturday',
    };
    return dayMap[dayIndex] || 'Monday';
  }, []);

  const [selectedDay, setSelectedDay] = useState<string>(currentDayName);

  const loadData = useCallback(async () => {
    const [classRes, infoRes] = await Promise.all([
      api.getEnrolledClasses(),
      api.getAcademicInfo(),
    ]);

    if (classRes.success && classRes.classes) {
      setSessions(classRes.classes);
    }
    if (infoRes.success && infoRes.info) {
      setAcademicInfo(infoRes.info);
    }
  }, []);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      (async () => {
        setLoading(true);
        await loadData();
        setLoading(false);
      })();
    });

    return () => task.cancel();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const filteredSessions = useMemo(() => {
    let currentSessions = sessions;
    if (selectedDay !== 'All') {
      currentSessions = sessions.filter(s => (s.day || '').toLowerCase() === selectedDay.toLowerCase());
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
        if (endTotal >= startTotal) {
          isActive = currentMinutes >= startTotal && currentMinutes <= endTotal;
        } else {
          isActive = currentMinutes >= startTotal || currentMinutes <= endTotal;
        }
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
        return { bg: '#d9e2ff', text: '#094cb2', border: '#b1c5ff', icon: 'book' };
      case 'P':
        return { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0', icon: 'flask' };
      case 'L & P':
        return { bg: '#FDF4FF', text: '#9333EA', border: '#F0ABFC', icon: 'layers' };
      case 'Event':
        return { bg: '#F0F9FF', text: '#0284C7', border: '#BAE6FD', icon: 'ribbon' };
      case 'Break':
        return { bg: '#f5f3f4', text: '#434653', border: '#e3e2e3', icon: 'restaurant' };
      default:
        return { bg: '#f5f3f4', text: '#434653', border: '#e3e2e3', icon: 'calendar' };
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { padding: 16 }]}>
        <Skeleton height={100} borderRadius={16} style={{ marginBottom: 16, marginTop: 12 }} />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          <Skeleton width={60} height={56} borderRadius={14} />
          <Skeleton width={60} height={56} borderRadius={14} />
          <Skeleton width={60} height={56} borderRadius={14} />
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
      {/* Top Header */}
      <View style={styles.topHeader}>
        <Text style={styles.headerTitle}>Timetable</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.semPill}>
            <Text style={styles.semPillText}>Sem 1</Text>
            <Ionicons name="chevron-down" size={14} color="#434653" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.searchButton}>
            <Ionicons name="search" size={16} color="#434653" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Warning Notice if Face Not Registered */}
      {!isFaceRegistered && (
        <TouchableOpacity
          style={styles.warningNotice}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('FaceRegistration')}
        >
          <Ionicons name="alert-circle" size={20} color="#D97706" style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.warningNoticeTitle}>Biometrics Not Registered</Text>
            <Text style={styles.warningNoticeText}>
              Register face biometrics to check in to classes.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#D97706" />
        </TouchableOpacity>
      )}

      {/* Hero Card / Academic Banner */}
      <View style={styles.heroCardWrapper}>
        <View style={styles.heroCard}>
          <View style={styles.heroGradientBar} />
          <View style={styles.heroContent}>
            <View style={styles.heroTopRow}>
              <View style={styles.facultyBadge}>
                <Ionicons name="school" size={14} color="#094cb2" style={{ marginRight: 4 }} />
                <Text style={styles.facultyBadgeText}>{academicInfo.faculty}</Text>
              </View>
              <View style={styles.activeTermBadge}>
                <View style={styles.activeTermDot} />
                <Text style={styles.activeTermText}>Active Term</Text>
              </View>
            </View>
            
            <View style={styles.heroMiddleRow}>
              <Text style={styles.academicYearText}>{academicInfo.session}</Text>
              <Text style={styles.degreeText}>{academicInfo.department}</Text>
            </View>

            <View style={styles.heroBottomRow}>
              <View style={styles.heroTag}>
                <Text style={styles.heroTagText}>{academicInfo.term}</Text>
              </View>
              <View style={styles.heroTag}>
                <Text style={styles.heroTagText}>Year 3</Text>
              </View>
              <Text style={styles.heroDot}>•</Text>
              <Text style={styles.heroWeeksText}>14 Weeks remaining</Text>
            </View>
          </View>
        </View>
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
                style={[styles.dayTab, isSelected && styles.dayTabActive]}
                onPress={() => setSelectedDay(day.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dayTabLabel, isSelected && styles.dayTabLabelActive]}>
                  {day.label}
                </Text>
                <Text style={[styles.dayTabDate, isSelected && styles.dayTabDateActive]}>
                  {day.date}
                </Text>
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#094cb2']}
            tintColor="#094cb2"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-clear-outline" size={48} color="#c3c6d5" />
            <Text style={styles.emptyTitle}>No Classes Scheduled for {selectedDay}</Text>
            <Text style={styles.emptySubtitle}>Enjoy your free time or pull down to refresh classes.</Text>
            <TouchableOpacity style={styles.syncButtonOutline} onPress={onRefresh}>
              <Ionicons name="sync-outline" size={16} color="#094cb2" style={{ marginRight: 6 }} />
              <Text style={styles.syncButtonOutlineText}>Sync Enrolled Classes</Text>
            </TouchableOpacity>
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
                  <Ionicons name="restaurant-outline" size={14} color="#6B7280" />
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
                <View style={[styles.dotContainer, item.isActive && styles.dotContainerActive]}>
                  <View style={[styles.dot, item.isActive ? styles.activeDot : styles.inactiveDot]} />
                </View>
                {index !== filteredSessions.length - 1 && (
                  <View style={styles.line} />
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
                  {/* Lecturer */}
                  {item.lecturer && item.type !== 'Event' && (
                    <View style={styles.infoRow}>
                      <Ionicons name="person" size={14} color="#094cb2" />
                      <Text style={styles.metaText}>{item.lecturer}</Text>
                    </View>
                  )}

                  {/* Venue */}
                  <View style={styles.infoRow}>
                    <Ionicons
                      name={item.venue.toLowerCase().includes('online') ? "globe" : "location"}
                      size={14}
                      color="#737784"
                    />
                    <Text style={styles.venueText}>{item.venue}</Text>
                  </View>

                  {/* Time */}
                  <View style={styles.infoRow}>
                    <Ionicons name="time" size={14} color="#737784" />
                    <Text style={styles.timeText}>
                      {item.startTime} - {item.endTime}
                    </Text>
                    <Text style={styles.durationText}>
                      {item.duration ? `(${item.duration})` : ''}
                    </Text>
                  </View>

                  {selectedDay === 'All' && (
                    <View style={styles.infoRow}>
                      <Ionicons name="calendar" size={14} color="#737784" />
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
    backgroundColor: '#faf9fa',
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(250, 249, 250, 0.9)',
    borderBottomWidth: 1,
    borderBottomColor: '#eceeef',
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1b1c1d',
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  semPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#c3c6d5',
  },
  semPillText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#434653',
    marginRight: 4,
  },
  searchButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#c3c6d5',
  },
  heroCardWrapper: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    shadowColor: '#094cb2',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    position: 'relative',
  },
  heroGradientBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
    backgroundColor: '#094cb2',
  },
  heroContent: {
    padding: 16,
    paddingLeft: 22,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  facultyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  facultyBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#094cb2',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeTermBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  activeTermDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
    marginRight: 4,
  },
  activeTermText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#047857',
  },
  heroMiddleRow: {
    marginBottom: 10,
  },
  academicYearText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1b1c1d',
    marginBottom: 2,
  },
  degreeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#434653',
  },
  heroBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f2f3f5',
    paddingTop: 8,
    gap: 8,
  },
  heroTag: {
    backgroundColor: '#f5f3f4',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  heroTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#434653',
  },
  heroDot: {
    color: '#c3c6d5',
    fontSize: 14,
  },
  heroWeeksText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#737784',
  },
  daySelectorContainer: {
    paddingVertical: 12,
  },
  dayScrollContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  dayTab: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    minWidth: 58,
    height: 56,
    paddingHorizontal: 12,
  },
  dayTabActive: {
    backgroundColor: '#094cb2',
    borderColor: '#094cb2',
    shadowColor: '#094cb2',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  dayTabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#737784',
    textTransform: 'uppercase',
  },
  dayTabLabelActive: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  dayTabDate: {
    fontSize: 12,
    color: '#737784',
    marginTop: 2,
  },
  dayTabDateActive: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  timelineRow: {
    flexDirection: 'row',
    position: 'relative',
  },
  timelineGraphic: {
    width: 24,
    alignItems: 'center',
    marginRight: 12,
    position: 'relative',
  },
  line: {
    position: 'absolute',
    top: 24,
    bottom: -24,
    width: 2,
    backgroundColor: '#c3c6d5',
  },
  dotContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    zIndex: 2,
  },
  dotContainerActive: {
    backgroundColor: 'rgba(9, 76, 178, 0.2)',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  activeDot: {
    backgroundColor: '#094cb2',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  inactiveDot: {
    backgroundColor: '#d9e2ff',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  card: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#1b1c1d',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  activeCard: {
    borderColor: 'rgba(9, 76, 178, 0.3)',
    backgroundColor: '#ffffff',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  codeAndDay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  courseCodeBadge: {
    backgroundColor: '#1b1c1d',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  courseCodeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
    marginRight: 4,
  },
  liveBadgeText: {
    color: '#047857',
    fontSize: 10,
    fontWeight: 'bold',
  },
  courseName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1b1c1d',
    marginBottom: 10,
    lineHeight: 22,
  },
  detailsGrid: {
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
    color: '#094cb2',
    fontWeight: '600',
    marginLeft: 6,
  },
  venueText: {
    fontSize: 12,
    color: '#434653',
    fontWeight: '500',
    marginLeft: 6,
    textTransform: 'capitalize',
  },
  timeText: {
    fontSize: 12,
    color: '#1b1c1d',
    fontWeight: 'bold',
    marginLeft: 6,
  },
  durationText: {
    fontSize: 11,
    color: '#737784',
    marginLeft: 6,
  },
  dayText: {
    fontSize: 12,
    color: '#737784',
    fontWeight: '500',
    marginLeft: 6,
  },
  breakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    paddingLeft: 36,
  },
  breakLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#f2f3f5',
  },
  breakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 8,
  },
  breakTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#737784',
    marginLeft: 6,
  },
  breakTime: {
    fontSize: 11,
    color: '#c3c6d5',
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1b1c1d',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#737784',
    textAlign: 'center',
    marginTop: 6,
  },
  syncButtonOutline: {
    marginTop: 16,
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d9e2ff',
  },
  syncButtonOutlineText: {
    color: '#094cb2',
    fontWeight: 'bold',
    fontSize: 12,
  },
  warningNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 4,
    marginTop: 16,
  },
  warningNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  warningNoticeText: {
    fontSize: 12,
    color: '#B45309',
    marginTop: 1,
  },
});
