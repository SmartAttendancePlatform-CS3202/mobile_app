import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { EnrolledModule } from '../services/mockData';
import LoginScreen from './LoginScreen';
import OnboardingScreen from './OnboardingScreen';

export default function AccountScreen() {
  const navigation = useNavigation<any>();
  const {
    user,
    isAuthenticated,
    isFaceRegistered,
    logout,
    refreshProfile,
    setFaceRegistered,
    loading: authLoading,
  } = useAuth();

  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [showFaceRegModal, setShowFaceRegModal] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [modules, setModules] = useState<EnrolledModule[]>([]);
  const [totalCredits, setTotalCredits] = useState<number>(0);
  const [modulesLoading, setModulesLoading] = useState<boolean>(false);
  const [syncingModules, setSyncingModules] = useState<boolean>(false);

  const currentStudent = user;

  const loadModules = async () => {
    setModulesLoading(true);
    try {
      const res = await api.getEnrolledModulesSummary();
      if (res.success && res.modules) {
        setModules(res.modules);
        setTotalCredits(res.totalCredits);
      }
    } catch (e) {
      console.log('Error loading enrolled modules:', e);
    }
    setModulesLoading(false);
  };

  React.useEffect(() => {
    if (isAuthenticated) {
      loadModules();
    }
  }, [isAuthenticated]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshProfile(), loadModules()]);
    setRefreshing(false);
  };

  const handleSyncModulesPress = async () => {
    setSyncingModules(true);
    try {
      const res = await api.getEnrolledModulesSummary();
      if (res.success && res.modules) {
        setModules(res.modules);
        setTotalCredits(res.totalCredits);
        Alert.alert(
          'Synchronization Complete',
          `Successfully imported ${res.modules.length} enrolled modules (${res.totalCredits} credits) from the university database.`
        );
      } else {
        Alert.alert('Sync Result', res.message || 'No enrolled classes found in database.');
      }
    } catch (err: any) {
      Alert.alert('Sync Error', err?.message || 'Failed to sync with database.');
    }
    setSyncingModules(false);
  };

  const handleSignOutPress = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of your student account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleSignInPress = () => {
    setShowLoginModal(true);
  };

  const handleLoginSuccess = async (registered: boolean) => {
    setShowLoginModal(false);
    await setFaceRegistered(registered);
  };

  const handleFaceRegSuccess = async () => {
    setShowFaceRegModal(false);
    await setFaceRegistered(true);
    await refreshProfile();
    Alert.alert(
      'Face Biometrics Saved',
      'Your facial biometrics have been successfully updated in the database.'
    );
  };

  const val = (v?: string | number | null) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v);
    }
    return '—';
  };

  if (authLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#094cb2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={styles.headerAccentBar} />
          <Text style={styles.headerTitle}>Profile</Text>
        </View>

        {isAuthenticated ? (
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOutPress}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={16} color="#094cb2" style={{ marginRight: 5 }} />
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.signInButton}
            onPress={handleSignInPress}
            activeOpacity={0.8}
          >
            <Ionicons name="log-in-outline" size={16} color="#094cb2" style={{ marginRight: 5 }} />
            <Text style={styles.signInButtonText}>Sign In</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#094cb2']}
            tintColor="#094cb2"
          />
        }
      >
        {isAuthenticated && currentStudent ? (
          <>
            {/* 1. Hero Profile Card */}
            <View style={styles.heroCard}>
              <View style={styles.heroGradientBar} />
              <View style={styles.avatarWrapper}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>
                    {currentStudent.name ? currentStudent.name.charAt(0).toUpperCase() : 'R'}
                  </Text>
                </View>
                {isFaceRegistered && (
                  <View style={styles.verifiedCheck} testID="biometrics-verified-badge">
                    <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  </View>
                )}
              </View>

              <Text style={styles.studentName}>{currentStudent.name || currentStudent.displayName || 'Student'}</Text>
              <Text style={styles.studentEmail}>{currentStudent.email}</Text>

              <View style={styles.badgeRow}>
                {currentStudent.indexNumber && (
                  <View style={styles.indexBadge}>
                    <Text style={styles.indexBadgeTextLight}>Index: </Text>
                    <Text style={styles.indexBadgeTextBold}>{currentStudent.indexNumber}</Text>
                  </View>
                )}
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>STUDENT</Text>
                </View>
              </View>
            </View>

            {/* 2. Academic Information Section */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrap}>
                  <Ionicons name="school" size={18} color="#094cb2" />
                </View>
                <View>
                  <Text style={styles.sectionTitle}>Academic Information</Text>
                  <Text style={styles.sectionSubtitle}>Faculty records & curriculum cohort</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Faculty</Text>
                <Text style={styles.infoValue}>{val(currentStudent.facultyName)}</Text>
              </View>
              <View style={styles.divider} />
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Department</Text>
                <Text style={styles.infoValue}>{val(currentStudent.department)}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Academic Year</Text>
                <Text style={styles.infoValue}>{val(currentStudent.academicYear)}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Year Level</Text>
                <Text style={styles.infoValue}>
                  {currentStudent.yearLevel !== undefined && currentStudent.yearLevel !== null
                    ? `Level ${currentStudent.yearLevel}`
                    : '—'}
                </Text>
              </View>
            </View>

            {/* 3. Enrolled Modules Section */}
            <View style={styles.sectionCard}>
              <View style={[styles.sectionHeader, { justifyContent: 'space-between' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={styles.sectionIconWrap}>
                    <Ionicons name="book" size={18} color="#094cb2" />
                  </View>
                  <View>
                    <Text style={styles.sectionTitle}>Enrolled Modules</Text>
                    <Text style={styles.sectionSubtitle}>
                      {modules.length} Courses • {totalCredits} Total Credits
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.syncIconButton}
                  activeOpacity={0.7}
                  onPress={handleSyncModulesPress}
                  disabled={syncingModules}
                >
                  {syncingModules ? (
                    <ActivityIndicator size="small" color="#434653" />
                  ) : (
                    <Ionicons name="refresh" size={18} color="#434653" />
                  )}
                </TouchableOpacity>
              </View>

              {modulesLoading ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#094cb2" />
                  <Text style={{ marginTop: 8, color: '#737784', fontSize: 13 }}>Loading enrolled modules...</Text>
                </View>
              ) : modules.length === 0 ? (
                <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                  <Ionicons name="school-outline" size={36} color="#c3c6d5" />
                  <Text style={{ marginTop: 8, color: '#434653', fontSize: 14, fontWeight: '500' }}>
                    No enrolled modules found in database
                  </Text>
                  <TouchableOpacity
                    style={styles.syncButtonOutline}
                    onPress={handleSyncModulesPress}
                    disabled={syncingModules}
                  >
                    <Ionicons name="sync-outline" size={15} color="#094cb2" style={{ marginRight: 6 }} />
                    <Text style={styles.syncButtonOutlineText}>Import from University DB</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.modulesList}>
                  {modules.map((m, idx) => (
                    <View key={m.id || idx} style={styles.moduleCard}>
                      <View style={styles.moduleCodeBadge}>
                        <Text style={styles.moduleCodeBadgeText}>{m.courseCode}</Text>
                      </View>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={styles.moduleTitle} numberOfLines={1}>{m.courseName}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* 4. Biometrics & Security Section */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrap}>
                  <Ionicons name="shield-checkmark" size={18} color="#094cb2" />
                </View>
                <View>
                  <Text style={styles.sectionTitle}>Biometrics & Security</Text>
                  <Text style={styles.sectionSubtitle}>Identity authentication credentials</Text>
                </View>
              </View>

              <View style={styles.biometricStatusRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.biometricTitle}>Face Biometrics</Text>
                  <Text style={styles.biometricSubtitle}>
                    {isFaceRegistered
                      ? 'Your facial embedding is active and registered in the database for live attendance check-ins.'
                      : 'Face biometrics not yet registered. You must register to check in to lectures.'}
                  </Text>
                </View>
                <View style={[styles.bioStatusPill, isFaceRegistered ? styles.bioPillSuccess : styles.bioPillWarning]}>
                  <Ionicons
                    name={isFaceRegistered ? 'checkmark-circle' : 'close-circle'}
                    size={14}
                    color={isFaceRegistered ? '#ffffff' : '#D97706'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.bioStatusText, isFaceRegistered ? styles.bioTextSuccess : styles.bioTextWarning]}>
                    {isFaceRegistered ? 'Registered' : 'Action Required'}
                  </Text>
                </View>
              </View>

              {isFaceRegistered ? (
                <>
                  <TouchableOpacity
                    style={styles.actionButtonSecondary}
                    onPress={() => setShowFaceRegModal(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="camera-outline" size={16} color="#094cb2" style={{ marginRight: 8 }} />
                    <Text style={styles.actionButtonSecondaryText}>Re-register Face Biometrics</Text>
                  </TouchableOpacity>
                  <View style={styles.unlockedNoticeBox}>
                    <Ionicons name="flask-outline" size={15} color="#094cb2" style={{ marginRight: 6, marginTop: 2 }} />
                    <Text style={styles.unlockedNoticeText}>
                      <Text style={{ fontWeight: '700', color: '#094cb2' }}>Testing Mode: </Text>
                      Biometric re-registration is unlocked. Capturing a new face will update your active database profile.
                    </Text>
                  </View>
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.actionButtonSecondary, { marginTop: 14 }]}
                  onPress={() => setShowFaceRegModal(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="camera" size={18} color="#094cb2" style={{ marginRight: 8 }} />
                  <Text style={styles.actionButtonSecondaryText}>Register Face Biometrics</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Subtle Footer Note */}
            <View style={styles.footerWrap}>
              <Text style={styles.footerText}>Alexandria Scholarly Platform • v1.0.0</Text>
            </View>
          </>
        ) : (
          /* SIGNED OUT VIEW */
          <View style={styles.signedOutContainer}>
            <View style={styles.heroCard}>
              <View style={styles.signedOutAvatar}>
                <Ionicons name="person-outline" size={44} color="#737784" />
              </View>
              <Text style={styles.studentName}>Not Signed In</Text>
              <Text style={[styles.studentEmail, { paddingHorizontal: 20 }]}>
                Sign in with your University credentials to access your profile and live attendance check-ins.
              </Text>
              <TouchableOpacity
                style={styles.actionButtonSecondary}
                onPress={handleSignInPress}
                activeOpacity={0.85}
              >
                <Ionicons name="log-in-outline" size={18} color="#094cb2" style={{ marginRight: 8 }} />
                <Text style={styles.actionButtonSecondaryText}>Sign In with Student Account</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.footerWrap}>
              <Text style={styles.footerText}>Alexandria Scholarly Platform • v1.0.0</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Modal for Sign In */}
      <Modal
        visible={showLoginModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLoginModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#f7f8fa' }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Sign In</Text>
            <TouchableOpacity
              onPress={() => setShowLoginModal(false)}
              style={styles.modalCloseButton}
            >
              <Ionicons name="close" size={24} color="#1b1c1d" />
            </TouchableOpacity>
          </View>
          <LoginScreen onLoginSuccess={handleLoginSuccess} />
        </View>
      </Modal>

      {/* Modal for Face Registration / Onboarding */}
      <Modal
        visible={showFaceRegModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowFaceRegModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#f7f8fa' }}>
          <View style={styles.modalHeaderFullScreen}>
            <TouchableOpacity
              onPress={() => setShowFaceRegModal(false)}
              style={styles.modalCloseButton}
            >
              <Ionicons name="arrow-back" size={24} color="#1b1c1d" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {isFaceRegistered ? 'Re-register Face Biometrics' : 'Face Biometrics Registration'}
            </Text>
            <View style={{ width: 32 }} />
          </View>
          {showFaceRegModal && (
            <OnboardingScreen onSuccess={handleFaceRegSuccess} />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f8fa',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f7f8fa',
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 14,
    backgroundColor: '#f7f8fa',
    borderBottomWidth: 1,
    borderBottomColor: '#eceeef',
  },
  headerAccentBar: {
    width: 6,
    height: 24,
    backgroundColor: '#094cb2',
    borderRadius: 3,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1b1c1d',
    letterSpacing: -0.5,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#1b1c1d',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  signOutButtonText: {
    color: '#1b1c1d',
    fontSize: 12,
    fontWeight: 'bold',
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#1b1c1d',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  signInButtonText: {
    color: '#1b1c1d',
    fontSize: 12,
    fontWeight: 'bold',
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#1b1c1d',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    borderWidth: 1,
    borderColor: '#e5e7eb',
    position: 'relative',
    overflow: 'hidden',
  },
  heroGradientBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: '#094cb2',
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 12,
    marginTop: 4,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#094cb2',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#094cb2',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    borderWidth: 4,
    borderColor: 'rgba(217, 226, 255, 0.5)',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: 'bold',
  },
  verifiedCheck: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  studentName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1b1c1d',
    marginBottom: 4,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  studentEmail: {
    fontSize: 12,
    color: '#434653',
    marginBottom: 14,
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  indexBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f3f4',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#c3c6d5',
  },
  indexBadgeTextLight: {
    fontSize: 12,
    fontWeight: '500',
    color: '#434653',
  },
  indexBadgeTextBold: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1b1c1d',
  },
  roleBadge: {
    backgroundColor: '#d9e2ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#001946',
    letterSpacing: 0.5,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#1b1c1d',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f1f3',
    paddingBottom: 10,
  },
  sectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#d9e2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1b1c1d',
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#737784',
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  infoLabel: {
    fontSize: 12,
    color: '#434653',
    fontWeight: '500',
    flex: 1,
  },
  infoValue: {
    fontSize: 12,
    color: '#1b1c1d',
    fontWeight: 'bold',
    flex: 1.5,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: '#f2f3f5',
  },
  syncIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f5f3f4',
    borderWidth: 1,
    borderColor: '#c3c6d5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modulesList: {
    flexDirection: 'column',
    gap: 10,
    marginTop: 6,
  },
  moduleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#faf9fa',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8eaed',
  },
  moduleCodeBadge: {
    backgroundColor: '#1b1c1d',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    width: 72,
    alignItems: 'center',
    marginRight: 10,
  },
  moduleCodeBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  moduleTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1b1c1d',
    textTransform: 'capitalize',
  },
  biometricStatusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  biometricTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1b1c1d',
    marginBottom: 2,
  },
  biometricSubtitle: {
    fontSize: 11,
    color: '#434653',
    lineHeight: 16,
  },
  bioStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  bioPillSuccess: {
    backgroundColor: '#1b1c1d',
  },
  bioPillWarning: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  bioStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  bioTextSuccess: {
    color: '#ffffff',
  },
  bioTextWarning: {
    color: '#D97706',
  },
  actionButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d9e2ff',
    marginTop: 16,
  },
  actionButtonSecondaryText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#094cb2',
  },
  unlockedNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#d9e2ff',
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#b1c5ff',
  },
  unlockedNoticeText: {
    flex: 1,
    fontSize: 11,
    color: '#1b1c1d',
    lineHeight: 16,
  },
  footerWrap: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  footerText: {
    fontSize: 11,
    color: '#737784',
    fontWeight: '500',
  },
  signedOutContainer: {
    marginTop: 10,
  },
  signedOutAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f5f3f4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    backgroundColor: '#f7f8fa',
  },
  modalHeaderFullScreen: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#f7f8fa',
    borderBottomWidth: 1,
    borderBottomColor: '#eceeef',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1b1c1d',
  },
  modalCloseButton: {
    padding: 6,
  },
  syncButtonOutline: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d9e2ff',
  },
  syncButtonOutlineText: {
    color: '#094cb2',
    fontSize: 13,
    fontWeight: '600',
  }
});
