import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, InteractionManager, Alert, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { mockStudent, mockAcademicInfo } from '../services/mockData';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import Skeleton from '../components/Skeleton';

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { user, isFaceRegistered } = useAuth();
  const currentStudent = user || mockStudent;
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadTodayClasses = useCallback(async () => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = days[new Date().getDay()];
    
    const res = await api.getEnrolledClasses(currentDay);
    if (res.success && res.classes) {
      let todaySessions = res.classes.filter((s: any) => s.type !== 'Break' && s.type !== 'Event');
      
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      todaySessions = todaySessions.map((s: any) => {
        const [startHour, startMin] = s.startTime.split(':').map(Number);
        const [endHour, endMin] = s.endTime.split(':').map(Number);
        const startTotal = startHour * 60 + startMin;
        const endTotal = endHour * 60 + endMin;
        
        let isActive = false;
        let isCheckInAllowed = false;
        let isEnded = false;

        if (endTotal >= startTotal) {
          // Standard daytime class
          isActive = currentMinutes >= startTotal && currentMinutes <= endTotal;
          isCheckInAllowed = currentMinutes >= (startTotal - 15) && currentMinutes <= endTotal;
          isEnded = currentMinutes > endTotal;
        } else {
          // Spans past midnight (e.g., 21:00 to 00:00 or 23:00 to 01:00)
          isActive = currentMinutes >= startTotal || currentMinutes <= endTotal;
          isCheckInAllowed = currentMinutes >= (startTotal - 15) || currentMinutes <= endTotal;
          isEnded = currentMinutes > endTotal && currentMinutes < (startTotal - 15);
        }
        
        return {
          ...s,
          isActive,
          isCheckInAllowed,
          isEnded,
        };
      });
      
      setSessions(todaySessions);
    } else {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      (async () => {
        setLoading(true);
        await loadTodayClasses();
        setLoading(false);
      })();
    });

    return () => task.cancel();
  }, [loadTodayClasses]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTodayClasses();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#4F46E5']}
          tintColor="#4F46E5"
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          <Text style={styles.nameText}>{currentStudent.name}</Text>
          <Text style={styles.deptText}>{currentStudent.department} • {currentStudent.batch}</Text>
        </View>
        <TouchableOpacity 
          style={styles.avatar}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Account')}
        >
          <Text style={styles.avatarText}>{currentStudent.name ? currentStudent.name.charAt(0) : 'S'}</Text>
        </TouchableOpacity>
      </View>

      {/* Warning Banner: Face Biometrics Not Registered */}
      {!isFaceRegistered && (
        <View style={styles.warningBanner}>
          <View style={styles.warningContent}>
            <View style={styles.warningIconCircle}>
              <Ionicons name="alert-circle" size={24} color="#D97706" />
            </View>
            <View style={styles.warningTextGroup}>
              <Text style={styles.warningTitle}>Face Biometrics Required</Text>
              <Text style={styles.warningSubtitle}>
                You haven't registered your face yet. Biometrics are required to check in to lectures.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.warningButton}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('FaceRegistration')}
          >
            <Ionicons name="camera-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.warningButtonText}>Register Face Now</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Quick Timetable Banner */}
      <TouchableOpacity 
        style={styles.timetableBanner}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('Timetable')}
      >
        <View style={styles.bannerLeft}>
          <View style={styles.bannerIconCircle}>
            <Ionicons name="calendar" size={20} color="#4F46E5" />
          </View>
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.bannerTitle}>Academic Timetable</Text>
            <Text style={styles.bannerSubtitle}>{mockAcademicInfo.term} • {mockAcademicInfo.session}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#6B7280" />
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Today's & Upcoming Classes</Text>

      {loading ? (
        <View style={{ gap: 16, marginTop: 10 }}>
          <Skeleton height={180} borderRadius={16} />
          <Skeleton height={180} borderRadius={16} />
        </View>
      ) : sessions.length === 0 ? (
        <Text style={{ textAlign: 'center', marginTop: 20, color: '#6B7280' }}>No classes scheduled for today.</Text>
      ) : (
        sessions.map((session) => (
          <View key={session.id} style={[styles.card, session.isActive && styles.activeCard]}>
            <View style={styles.cardHeader}>
              <View style={styles.badgeRow}>
                {session.courseCode && (
                  <View style={styles.codeBadge}>
                    <Text style={styles.codeBadgeText}>{session.courseCode}</Text>
                  </View>
                )}
                {session.typeLabel && (
                  <View style={[styles.typeBadge, session.type === 'P' ? styles.pBadge : styles.lBadge]}>
                    <Text style={[styles.typeBadgeText, session.type === 'P' ? styles.pBadgeText : styles.lBadgeText]}>
                      {session.typeLabel}
                    </Text>
                  </View>
                )}
              </View>

              {session.isActive ? (
                <View style={styles.activeBadge}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activeText}>Live</Text>
                </View>
              ) : (
                <Text style={styles.dayTag}>{session.day}</Text>
              )}
            </View>

            <Text style={styles.cardTitle}>{session.courseName}</Text>
            
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={16} color="#4F46E5" />
              <Text style={styles.venueText}>{session.venue}</Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={16} color="#6B7280" />
              <Text style={styles.sessionText}>{session.lecturer}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={16} color="#6B7280" />
              <Text style={styles.sessionText}>
                {session.startTime} - {session.endTime}
                {session.duration ? `  (${session.duration})` : ''}
              </Text>
            </View>
            
            <TouchableOpacity 
              style={[
                styles.checkInButton, 
                session.isActive 
                  ? styles.buttonActive 
                  : (session.isCheckInAllowed ? styles.buttonAllowed : styles.buttonDisabled)
              ]}
              onPress={() => {
                if (!isFaceRegistered) {
                  Alert.alert(
                    'Biometrics Required',
                    'You must register your face biometrics before you can check in to class.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Register Now', onPress: () => navigation.navigate('FaceRegistration') },
                    ]
                  );
                  return;
                }
                if (session.isCheckInAllowed) {
                  navigation.navigate('LocationCheck', { sessionId: session.id, session });
                }
              }}
              disabled={!session.isCheckInAllowed}
            >
              <Ionicons 
                name={session.isActive ? "finger-print-outline" : (session.isCheckInAllowed ? "time-outline" : "lock-closed-outline")} 
                size={18} 
                color={session.isActive ? "#fff" : (session.isCheckInAllowed ? "#4F46E5" : "#9CA3AF")} 
                style={{ marginRight: 6 }}
              />
              <Text style={[
                styles.checkInButtonText, 
                session.isActive 
                  ? styles.buttonTextActive 
                  : (session.isCheckInAllowed ? styles.buttonTextAllowed : styles.buttonTextDisabled)
              ]}>
                {session.isActive 
                  ? "Check-In to Live Class" 
                  : (session.isCheckInAllowed 
                      ? "Check-In Open Early" 
                      : (session.isEnded ? "Class Ended" : "Check-In Opens 15m Prior"))}
              </Text>
              {session.isCheckInAllowed && (
                <Ionicons name="arrow-forward" size={18} color={session.isActive ? "#fff" : "#4F46E5"} />
              )}
            </TouchableOpacity>
          </View>
        ))
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F3F4F6',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  welcomeText: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 2,
  },
  nameText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
  },
  deptText: {
    fontSize: 12,
    color: '#4F46E5',
    fontWeight: '600',
    marginTop: 2,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  avatarText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  timetableBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  bannerSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    marginBottom: 16,
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
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  codeBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  codeBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  typeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  lBadge: {
    backgroundColor: '#EEF2FF',
  },
  lBadgeText: {
    color: '#4F46E5',
  },
  pBadge: {
    backgroundColor: '#ECFDF5',
  },
  pBadgeText: {
    color: '#059669',
  },
  dayTag: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
    lineHeight: 22,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 4,
  },
  activeText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  venueText: {
    fontSize: 14,
    color: '#4F46E5',
    marginLeft: 8,
    fontWeight: '700',
  },
  sessionText: {
    fontSize: 14,
    color: '#4B5563',
    marginLeft: 8,
    fontWeight: '500',
  },
  checkInButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 13,
    borderRadius: 12,
    marginTop: 14,
  },
  buttonActive: {
    backgroundColor: '#4F46E5',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  buttonAllowed: {
    backgroundColor: '#EEF2FF',
  },
  buttonDisabled: {
    backgroundColor: '#F3F4F6',
  },
  checkInButtonText: {
    fontSize: 15,
    fontWeight: '700',
    marginRight: 6,
  },
  buttonTextActive: {
    color: '#FFFFFF',
  },
  buttonTextAllowed: {
    color: '#4F46E5',
  },
  buttonTextDisabled: {
    color: '#9CA3AF',
  },
  warningBanner: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    shadowColor: '#D97706',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  warningContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  warningIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  warningTextGroup: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 4,
  },
  warningSubtitle: {
    fontSize: 13,
    color: '#B45309',
    lineHeight: 18,
  },
  warningButton: {
    backgroundColor: '#D97706',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  warningButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
