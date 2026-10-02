import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, InteractionManager, Alert, RefreshControl } from 'react-native';
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
            <Text style={styles.nameText}>{currentStudent.name}</Text>
          </View>
          {/* Avatar (Optional as per original code) */}
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
                <View style={[styles.leftAccentBar, { backgroundColor: session.isActive ? '#3366cc' : '#737784' }]} />

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
                  </View>

                  {!session.isActive && (
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
                
                {/* Check-In Button */}
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
                    size={16} 
                    color={session.isActive ? "#fff" : (session.isCheckInAllowed ? "#094cb2" : "#737784")} 
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
                          : (session.isEnded ? "Class Ended" : "View Lecture Details"))}
                  </Text>
                  {session.isCheckInAllowed && (
                    <Ionicons name="arrow-forward" size={16} color={session.isActive ? "#fff" : "#094cb2"} style={{ marginLeft: 6 }} />
                  )}
                </TouchableOpacity>
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
    textTransform: 'capitalize',
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
});
