import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { mockStudent, mockAcademicInfo } from '../services/mockData';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
import api from '../services/api';
import Skeleton from '../components/Skeleton';

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { user, isFaceRegistered } = useAuth();
  const currentStudent = user || mockStudent;
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [verifyingSessionId, setVerifyingSessionId] = useState<string | null>(null);

  const loadTodayClasses = useCallback(async () => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = days[new Date().getDay()];
    
    const res = await api.getEnrolledClasses(currentDay);
    if (res.success && res.classes) {
      let todaySessions = res.classes.filter((s: any) => s.type !== 'Break' && s.type !== 'Event');
      
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      todaySessions = todaySessions.map((s: any) => {
        const startTimeStr = s.startTime || '08:00';
        const endTimeStr = s.endTime || '10:00';
        const [startHour = 8, startMin = 0] = startTimeStr.split(':').map(Number);
        const [endHour = 10, endMin = 0] = endTimeStr.split(':').map(Number);
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
    (async () => {
      setLoading(true);
      await loadTodayClasses();
      setLoading(false);
    })();
  }, [loadTodayClasses]);

  const loadTodayClassesRef = useRef(loadTodayClasses);
  useEffect(() => {
    loadTodayClassesRef.current = loadTodayClasses;
  }, [loadTodayClasses]);

  // Real-time Supabase subscription for verification windows and attendance records
  useEffect(() => {
    const channelName = `realtime_windows_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'verification_windows' },
        () => {
          loadTodayClassesRef.current();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_records' },
        () => {
          loadTodayClassesRef.current();
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, []);

  // Polling every 5s while screen is in focus
  useFocusEffect(
    useCallback(() => {
      loadTodayClasses();
      const interval = setInterval(() => {
        loadTodayClasses();
      }, 5000);
      return () => clearInterval(interval);
    }, [loadTodayClasses])
  );

  const handleMarkRandomCheck = async (session: any) => {
    if (session.isEnded) {
      Alert.alert(
        'Verification Closed',
        'Class time has ended. Random verification is closed and no longer available.',
        [{ text: 'OK' }]
      );
      return;
    }
    try {
      setVerifyingSessionId(session.id);
      const targetSessionId = session.lectureSessionId || session.id;
      const res = await api.submitRandomCheck(targetSessionId, session.randomWindowId);
      if (res.success) {
        await loadTodayClasses();
        const successTitle = res.isFullyMarked ? '✓ Attendance Marked!' : '✓ Random Verification Done!';
        const successBody = typeof res.message === 'string' && res.message.trim().length > 0
          ? res.message
          : 'Random verification recorded successfully.';
        Alert.alert(
          successTitle,
          successBody,
          [{ text: 'OK' }]
        );
      } else {
        const failBody = typeof res.message === 'string' && res.message.trim().length > 0
          ? res.message
          : 'Outside lecture venue geofence. Please ensure you are inside the classroom.';
        Alert.alert(
          'Location Check Failed',
          failBody,
          [{ text: 'Try Again' }]
        );
      }
    } catch (err: any) {
      const errMsg = typeof err?.message === 'string' ? err.message : 'Failed to submit random check.';
      Alert.alert('Verification Error', errMsg);
    } finally {
      setVerifyingSessionId(null);
    }
  };

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
          colors={['#3366cc']}
          tintColor="#3366cc"
        />
      }
    >
      <View style={styles.contentContainer}>
        {/* Header Title */}
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Dashboard</Text>
        </View>

        {/* User Profile Summary */}
        <View style={styles.greetingSection}>
          <View style={styles.greetingTextContainer}>
            <Text style={styles.welcomeText}>WELCOME BACK,</Text>
            <Text style={styles.nameText}>
              {currentStudent.name
                ? currentStudent.name.split(' ')[0].charAt(0).toUpperCase() +
                  currentStudent.name.split(' ')[0].slice(1)
                : 'Student'}
            </Text>
          </View>
          {/* Avatar (Optional as per original code) */}
          <TouchableOpacity 
            style={styles.avatar}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Account')}
          >
            <Text style={styles.avatarText}>{currentStudent.name ? currentStudent.name.charAt(0).toUpperCase() : 'S'}</Text>
          </TouchableOpacity>
        </View>

        {/* Warning Banner: Face Biometrics Not Registered */}
        {!isFaceRegistered && (
          <View style={styles.warningBanner}>
            <View style={styles.warningContent}>
              <View style={styles.warningIconCircle}>
                <Ionicons name="alert-circle" size={20} color="#92400E" />
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



        {/* Classes Section */}
        <View style={styles.classesSectionHeader}>
          <Text style={styles.sectionTitle}>Today's & Upcoming Classes</Text>
          <View style={styles.classCountBadge}>
            <Text style={styles.classCountText}>{sessions.length} Classes</Text>
          </View>
        </View>

        {loading ? (
          <View style={{ gap: 16, marginTop: 10 }}>
            <Skeleton height={200} borderRadius={16} />
            <Skeleton height={200} borderRadius={16} />
          </View>
        ) : sessions.length === 0 ? (
          <Text style={styles.emptyText}>No classes scheduled for today.</Text>
        ) : (
          sessions.map((session) => (
            <View key={session.id} style={styles.cardWrapper}>
              <View style={[styles.card, session.isActive ? styles.activeCard : styles.inactiveCard]}>
                
                {/* Left colored accent bar */}
                <View
                  style={[
                    styles.leftAccentBar,
                    {
                      backgroundColor: session.isCheckedIn
                        ? (session.attendanceStatus === 'late' ? '#D97706' : '#10b981')
                        : (session.randomCheckActive
                            ? (session.isEnded ? '#737784' : '#6366f1')
                            : (session.initialVerified
                                ? '#10b981'
                                : (session.isActive ? '#3366cc' : '#737784'))),
                    },
                  ]}
                />

                {/* Card Header / Meta Badges */}
                <View style={styles.cardHeader}>
                  <View style={styles.badgeRow}>
                    {session.courseCode && (
                      <View style={styles.codeBadge}>
                        <Text style={styles.codeBadgeText}>{session.courseCode}</Text>
                      </View>
                    )}
                    {session.typeLabel && (
                      <View style={styles.typeBadge}>
                        <Text style={styles.typeBadgeText}>{session.typeLabel}</Text>
                      </View>
                    )}
                    {session.isCheckedIn ? (
                      <View
                        style={[
                          styles.checkedInBadge,
                          session.attendanceStatus === 'late' && styles.lateBadge,
                        ]}
                      >
                        <Ionicons
                          name={session.attendanceStatus === 'late' ? "time" : "checkmark-circle"}
                          size={12}
                          color={session.attendanceStatus === 'late' ? '#92400E' : '#047857'}
                        />
                        <Text
                          style={[
                            styles.checkedInBadgeText,
                            session.attendanceStatus === 'late' && styles.lateBadgeText,
                          ]}
                        >
                          {session.attendanceStatus === 'late' ? 'Late' : 'Attended'}
                        </Text>
                      </View>
                    ) : (
                      <>
                        {session.randomCheckActive && (
                          <View style={[styles.randomBadge, session.isEnded && styles.randomBadgeDisabled]}>
                            <Ionicons
                              name={session.isEnded ? "lock-closed" : "radio"}
                              size={12}
                              color={session.isEnded ? "#737784" : "#4F46E5"}
                            />
                            <Text style={[styles.randomBadgeText, session.isEnded && styles.randomBadgeTextDisabled]}>
                              {session.isEnded ? 'Random Check Closed' : 'Random Check Active'}
                            </Text>
                          </View>
                        )}
                        {session.initialVerified && (
                          <View style={styles.initialVerifiedBadge}>
                            <Ionicons
                              name="checkmark-circle"
                              size={12}
                              color="#047857"
                            />
                            <Text style={styles.initialVerifiedBadgeText}>
                              Initial Verified
                            </Text>
                          </View>
                        )}
                        {!session.randomCheckActive && session.randomCheckCompletedAt && !session.initialVerified && (
                          <View style={styles.randomVerifiedBadge}>
                            <Ionicons name="checkmark-circle" size={12} color="#4F46E5" />
                            <Text style={styles.randomVerifiedBadgeText}>Random Verified</Text>
                          </View>
                        )}
                      </>
                    )}
                  </View>

                  {!session.isActive && !session.isCheckedIn && !session.initialVerified && !session.randomCheckActive && (
                    <Text style={styles.dayTag}>{session.day}</Text>
                  )}
                </View>

                {/* Course Subject Title */}
                <Text style={styles.cardTitle}>{session.courseName}</Text>
                
                {/* Details List */}
                <View style={styles.detailsList}>
                  <View style={styles.infoRow}>
                    <Ionicons name="location-sharp" size={16} color="#3366cc" style={styles.infoIcon} />
                    <Text style={styles.venueText}>{session.venue}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="person" size={16} color="#737784" style={styles.infoIcon} />
                    <Text style={styles.sessionText}>{session.lecturer}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="time" size={16} color="#737784" style={styles.infoIcon} />
                    <Text style={styles.sessionText}>
                      {session.startTime} - {session.endTime}
                      {session.duration ? `  (${session.duration})` : ''}
                    </Text>
                  </View>
                </View>

                {/* Random Verification Interactive Prompt (Tick Box) */}
                {session.randomCheckActive && !session.isCheckedIn && (
                  <View style={[styles.randomNoticeBox, session.isEnded && styles.randomNoticeBoxDisabled]}>
                    <View style={styles.randomNoticeHeader}>
                      <Ionicons
                        name={session.isEnded ? "lock-closed" : "radio"}
                        size={16}
                        color={session.isEnded ? "#737784" : "#4F46E5"}
                      />
                      <Text style={[styles.randomNoticeTitle, session.isEnded && styles.randomNoticeTitleDisabled]}>
                        {session.isEnded ? 'Random Verification Closed' : 'Random Verification Active'}
                      </Text>
                    </View>
                    <Text style={[styles.randomNoticeSubtitle, session.isEnded && styles.randomNoticeSubtitleDisabled]}>
                      {session.isEnded
                        ? 'Class time has ended. Random verification is closed and no longer accepted.'
                        : 'Lecturer launched random verification. Tap the tick below to confirm your presence via GPS (no face scan required).'}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.randomTickButton,
                        session.isEnded && styles.randomTickButtonDisabled,
                        verifyingSessionId === session.id && { opacity: 0.7 },
                      ]}
                      onPress={() => handleMarkRandomCheck(session)}
                      disabled={verifyingSessionId === session.id || session.isEnded}
                      activeOpacity={session.isEnded ? 1 : 0.85}
                    >
                      {verifyingSessionId === session.id ? (
                        <>
                          <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                          <Text style={styles.randomTickButtonText}>Checking GPS Location...</Text>
                        </>
                      ) : (
                        <>
                          <Ionicons
                            name={session.isEnded ? "lock-closed-outline" : "checkmark-circle"}
                            size={18}
                            color={session.isEnded ? "#737784" : "#FFFFFF"}
                            style={{ marginRight: 6 }}
                          />
                          <Text style={[styles.randomTickButtonText, session.isEnded && styles.randomTickButtonTextDisabled]}>
                            {session.isEnded ? 'Mark Random Verification (Class Ended)' : '✓ Mark Random Verification'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
                
                {/* Initial Check-In / Final Attendance Button */}
                <TouchableOpacity 
                  style={[
                    styles.checkInButton, 
                    session.isCheckedIn
                      ? (session.attendanceStatus === 'late' ? styles.buttonLate : styles.buttonCheckedIn)
                      : (session.initialVerified
                          ? styles.buttonInitialVerified
                          : (session.isActive 
                              ? styles.buttonActive 
                              : (session.isCheckInAllowed ? styles.buttonAllowed : styles.buttonDisabled)))
                  ]}
                  onPress={() => {
                    if (session.isCheckedIn || session.initialVerified) return;
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
                  disabled={session.isCheckedIn || session.initialVerified || !session.isCheckInAllowed}
                >
                  <Ionicons 
                    name={
                      session.isCheckedIn
                        ? (session.attendanceStatus === 'late' ? "time-outline" : "checkmark-circle")
                        : (session.initialVerified
                            ? "checkmark-circle-outline"
                            : (session.isActive ? "finger-print-outline" : (session.isCheckInAllowed ? "time-outline" : "lock-closed-outline")))
                    } 
                    size={16} 
                    color={
                      session.isCheckedIn
                        ? (session.attendanceStatus === 'late' ? "#92400E" : "#047857")
                        : (session.initialVerified
                            ? "#047857"
                            : (session.isActive ? "#fff" : (session.isCheckInAllowed ? "#094cb2" : "#737784")))
                    } 
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[
                    styles.checkInButtonText, 
                    session.isCheckedIn
                      ? (session.attendanceStatus === 'late' ? styles.buttonTextLate : styles.buttonTextCheckedIn)
                      : (session.initialVerified
                          ? styles.buttonTextInitialVerified
                          : (session.isActive 
                              ? styles.buttonTextActive 
                              : (session.isCheckInAllowed ? styles.buttonTextAllowed : styles.buttonTextDisabled)))
                  ]}>
                    {session.isCheckedIn
                      ? (session.attendanceStatus === 'late' ? "⚠ Marked Late" : "✓ Attendance Marked")
                      : (session.initialVerified
                          ? "✓ Initial Verification Done"
                          : (session.isActive 
                              ? (session.randomCheckCompletedAt ? "Complete Face Check-In" : "Check-In to Live Class") 
                              : (session.isCheckInAllowed 
                                  ? "Check-In Open Early" 
                                  : (session.isEnded ? "Class Ended" : "View Lecture Details"))))}
                  </Text>
                  {!session.isCheckedIn && !session.initialVerified && session.isCheckInAllowed && (
                    <Ionicons name="arrow-forward" size={16} color={session.isActive ? "#fff" : "#094cb2"} style={{ marginLeft: 6 }} />
                  )}
                </TouchableOpacity>

                {/* Subtext notice if initial check is done and waiting for random check */}
                {session.initialVerified && !session.isCheckedIn && !session.randomCheckActive && (
                  <Text style={styles.waitingNoticeText}>
                    {session.isEnded
                      ? 'Class time has ended'
                      : 'Initial check-in done • Waiting for lecturer random check window'}
                  </Text>
                )}
              </View>
            </View>
          ))
        )}
      </View>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#faf9fa',
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingTop: 36,
  },
  pageHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#e9e8e9',
    paddingBottom: 12,
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1b1c1d',
    letterSpacing: -0.5,
  },
  greetingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  greetingTextContainer: {
    paddingRight: 8,
  },
  welcomeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#737784',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nameText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1b1c1d',
    marginTop: 2,
    letterSpacing: -0.5,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3366cc',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3366cc',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  warningBanner: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    shadowColor: '#D97706',
    shadowOpacity: 0.05,
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
    fontWeight: 'bold',
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
    borderRadius: 12,
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
    fontWeight: 'bold',
  },
  timetableBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    shadowColor: '#1b1c1d',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    borderWidth: 1,
    borderColor: '#e3e2e3',
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e7ebff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1b1c1d',
  },
  bannerSubtitle: {
    fontSize: 12,
    color: '#737784',
    marginTop: 2,
  },
  classesSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1b1c1d',
    letterSpacing: -0.3,
  },
  classCountBadge: {
    backgroundColor: '#dfe3e8',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  classCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#42474b',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#737784',
    fontSize: 14,
  },
  cardWrapper: {
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 16,
    shadowColor: '#1b1c1d',
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    borderWidth: 1,
    borderColor: '#e3e2e3',
    position: 'relative',
    overflow: 'hidden',
  },
  activeCard: {
  },
  inactiveCard: {
  },
  leftAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  codeBadge: {
    backgroundColor: '#1b1c1d',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  codeBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  typeBadge: {
    backgroundColor: '#e7ebff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#094cb2',
  },
  dayTag: {
    fontSize: 12,
    color: '#737784',
    fontWeight: '600',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1b1c1d',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  detailsList: {
    marginBottom: 20,
    gap: 10,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
    marginRight: 6,
  },
  activeText: {
    color: '#047857',
    fontSize: 11,
    fontWeight: 'bold',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoIcon: {
    width: 16,
    textAlign: 'center',
  },
  venueText: {
    fontSize: 12,
    color: '#094cb2',
    marginLeft: 10,
    fontWeight: '600',
  },
  sessionText: {
    fontSize: 12,
    color: '#434653',
    marginLeft: 10,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  checkInButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  buttonActive: {
    backgroundColor: '#3366cc',
    shadowColor: '#3366cc',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  buttonAllowed: {
    backgroundColor: '#faf9fa',
    borderColor: '#c3c6d5',
  },
  buttonDisabled: {
    backgroundColor: '#faf9fa',
    borderColor: '#e3e2e3',
  },
  buttonCheckedIn: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  buttonLate: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  checkInButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  buttonTextActive: {
    color: '#FFFFFF',
  },
  buttonTextAllowed: {
    color: '#094cb2',
  },
  buttonTextDisabled: {
    color: '#737784',
  },
  buttonTextCheckedIn: {
    color: '#047857',
  },
  buttonTextLate: {
    color: '#92400E',
  },
  checkedInBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    gap: 4,
  },
  lateBadge: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  checkedInBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  lateBadgeText: {
    color: '#92400E',
  },
  initialVerifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    gap: 4,
  },
  initialVerifiedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  buttonInitialVerified: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  buttonTextInitialVerified: {
    color: '#047857',
  },
  randomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    gap: 4,
  },
  randomBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  randomVerifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    gap: 4,
  },
  randomVerifiedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  randomNoticeBox: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  randomNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  randomNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3730A3',
  },
  randomNoticeSubtitle: {
    fontSize: 12,
    color: '#4338CA',
    lineHeight: 16,
    marginBottom: 10,
  },
  randomTickButton: {
    backgroundColor: '#4F46E5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    shadowColor: '#4F46E5',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  randomTickButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  randomBadgeDisabled: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  randomBadgeTextDisabled: {
    color: '#737784',
  },
  randomNoticeBoxDisabled: {
    backgroundColor: '#F8F9FA',
    borderColor: '#E5E7EB',
  },
  randomNoticeTitleDisabled: {
    color: '#737784',
  },
  randomNoticeSubtitleDisabled: {
    color: '#9CA3AF',
  },
  randomTickButtonDisabled: {
    backgroundColor: '#E5E7EB',
    borderColor: '#D1D5DB',
    borderWidth: 1,
    shadowOpacity: 0,
    elevation: 0,
  },
  randomTickButtonTextDisabled: {
    color: '#737784',
  },
  waitingNoticeText: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 6,
    fontStyle: 'italic',
  },
});
