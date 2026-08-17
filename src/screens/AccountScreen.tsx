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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { mockAcademicInfo, mockStudent } from '../services/mockData';
import LoginScreen from './LoginScreen';
import OnboardingScreen from './OnboardingScreen';

export default function AccountScreen() {
  const navigation = useNavigation<any>();
  const {
    user,
    isAuthenticated,
    isFaceRegistered,
    logout,
    login,
    setFaceRegistered,
    loading: authLoading,
  } = useAuth();

  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [showFaceRegModal, setShowFaceRegModal] = useState<boolean>(false);

  const currentStudent = user || mockStudent;

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
    Alert.alert('Face Registered', 'Your facial biometrics have been successfully updated.');
  };

  if (authLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Header with Dynamic Sign In / Sign Out Button */}
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.headerTitle}>Account</Text>
          <Text style={styles.headerSubtitle}>
            {isAuthenticated ? 'Student Profile & Settings' : 'Guest Portal'}
          </Text>
        </View>

        {isAuthenticated ? (
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOutPress}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={16} color="#EF4444" style={{ marginRight: 5 }} />
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.signInButton}
            onPress={handleSignInPress}
            activeOpacity={0.8}
          >
            <Ionicons name="log-in-outline" size={16} color="#FFFFFF" style={{ marginRight: 5 }} />
            <Text style={styles.signInButtonText}>Sign In</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {isAuthenticated ? (
          /* ========================================================================= */
          /* SIGNED IN VIEW - Comprehensive Student Details                             */
          /* ========================================================================= */
          <>
            {/* Profile Hero Card */}
            <View style={styles.heroCard}>
              <View style={styles.avatarWrapper}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>
                    {currentStudent.name ? currentStudent.name.charAt(0) : 'S'}
                  </Text>
                </View>
                <View style={styles.verifiedCheck}>
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                </View>
              </View>

              <Text style={styles.studentName}>{currentStudent.name}</Text>
              <Text style={styles.studentEmail}>{currentStudent.email}</Text>

              <View style={styles.badgeRow}>
                {currentStudent.indexNumber && (
                  <View style={styles.indexBadge}>
                    <Ionicons name="id-card-outline" size={13} color="#4F46E5" style={{ marginRight: 4 }} />
                    <Text style={styles.indexBadgeText}>Index: {currentStudent.indexNumber}</Text>
                  </View>
                )}
                <View style={styles.statusBadge}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusBadgeText}>Active Student</Text>
                </View>
              </View>
            </View>

            {/* Academic Information Card */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrap}>
                  <Ionicons name="school" size={18} color="#4F46E5" />
                </View>
                <Text style={styles.sectionTitle}>Academic Information</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>University</Text>
                <Text style={styles.infoValue}>{mockAcademicInfo.university}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Faculty</Text>
                <Text style={styles.infoValue}>{mockAcademicInfo.faculty}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Department</Text>
                <Text style={styles.infoValue}>{currentStudent.department || mockAcademicInfo.department}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Academic Term</Text>
                <Text style={styles.infoValueHighlight}>{mockAcademicInfo.term}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Session / Intake</Text>
                <Text style={styles.infoValue}>{currentStudent.batch || mockAcademicInfo.session}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Academic Period</Text>
                <Text style={styles.infoValue}>{mockAcademicInfo.period}</Text>
              </View>
            </View>

            {/* Biometric & Face Verification Status */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIconWrap, { backgroundColor: isFaceRegistered ? '#ECFDF5' : '#FEF3C7' }]}>
                  <Ionicons
                    name={isFaceRegistered ? 'shield-checkmark' : 'alert-circle'}
                    size={18}
                    color={isFaceRegistered ? '#10B981' : '#D97706'}
                  />
                </View>
                <Text style={styles.sectionTitle}>Biometrics & Security</Text>
              </View>

              <View style={styles.biometricStatusRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.biometricTitle}>Face Registration</Text>
                  <Text style={styles.biometricSubtitle}>
                    {isFaceRegistered
                      ? 'Your facial embedding is active and registered for live attendance check-ins.'
                      : 'Face biometrics not yet registered. You must register to check in to lectures.'}
                  </Text>
                </View>
                <View style={[styles.bioStatusPill, isFaceRegistered ? styles.bioPillSuccess : styles.bioPillWarning]}>
                  <Ionicons
                    name={isFaceRegistered ? 'checkmark-circle' : 'close-circle'}
                    size={14}
                    color={isFaceRegistered ? '#10B981' : '#D97706'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.bioStatusText, isFaceRegistered ? styles.bioTextSuccess : styles.bioTextWarning]}>
                    {isFaceRegistered ? 'Registered' : 'Action Required'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.actionButtonSecondary, { marginTop: 12 }]}
                onPress={() => setShowFaceRegModal(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="camera-reverse-outline" size={18} color="#4F46E5" style={{ marginRight: 8 }} />
                <Text style={styles.actionButtonSecondaryText}>
                  {isFaceRegistered ? 'Update / Re-register Face' : 'Register Face Biometrics'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Account & Contact Details */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrap}>
                  <Ionicons name="person-circle" size={18} color="#4F46E5" />
                </View>
                <Text style={styles.sectionTitle}>Account Details</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Student ID</Text>
                <Text style={styles.infoValue}>{currentStudent.id}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>University Email</Text>
                <Text style={styles.infoValue}>{currentStudent.email}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Role</Text>
                <Text style={styles.infoValue}>Undergraduate Student</Text>
              </View>
            </View>

            {/* System & Device Info */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrap}>
                  <Ionicons name="hardware-chip-outline" size={18} color="#4F46E5" />
                </View>
                <Text style={styles.sectionTitle}>Device & Permissions</Text>
              </View>

              <View style={styles.permissionRow}>
                <View style={styles.permLeft}>
                  <Ionicons name="location-outline" size={18} color="#4F46E5" style={{ marginRight: 10 }} />
                  <Text style={styles.permText}>Lecture Hall Geofencing</Text>
                </View>
                <View style={styles.permBadge}>
                  <Text style={styles.permBadgeText}>Enabled</Text>
                </View>
              </View>
              <View style={styles.divider} />

              <View style={styles.permissionRow}>
                <View style={styles.permLeft}>
                  <Ionicons name="camera-outline" size={18} color="#4F46E5" style={{ marginRight: 10 }} />
                  <Text style={styles.permText}>Camera & Liveness Engine</Text>
                </View>
                <View style={styles.permBadge}>
                  <Text style={styles.permBadgeText}>Enabled</Text>
                </View>
              </View>
              <View style={styles.divider} />

              <View style={styles.permissionRow}>
                <View style={styles.permLeft}>
                  <Ionicons name="information-circle-outline" size={18} color="#6B7280" style={{ marginRight: 10 }} />
                  <Text style={styles.permText}>App Version</Text>
                </View>
                <Text style={styles.versionText}>v1.0.0 (Expo v57)</Text>
              </View>
            </View>
          </>
        ) : (
          /* ========================================================================= */
          /* SIGNED OUT VIEW - Guest Portal & Sign In Prompt                           */
          /* ========================================================================= */
          <View style={styles.signedOutContainer}>
            <View style={styles.signedOutHero}>
              <View style={styles.signedOutAvatar}>
                <Ionicons name="person-outline" size={44} color="#9CA3AF" />
              </View>
              <Text style={styles.signedOutTitle}>Not Signed In</Text>
              <Text style={styles.signedOutSubtitle}>
                Sign in with your University student credentials to access your personalized timetable, live lecture attendance check-ins, and biometric verification.
              </Text>

              <TouchableOpacity
                style={styles.primarySignInButton}
                onPress={handleSignInPress}
                activeOpacity={0.85}
              >
                <Ionicons name="log-in-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.primarySignInButtonText}>Sign In with Student Account</Text>
              </TouchableOpacity>
            </View>

            {/* University Portal Preview Card */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrap}>
                  <Ionicons name="school-outline" size={18} color="#4F46E5" />
                </View>
                <Text style={styles.sectionTitle}>University Portal</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Institution</Text>
                <Text style={styles.infoValue}>{mockAcademicInfo.university}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Faculty</Text>
                <Text style={styles.infoValue}>{mockAcademicInfo.faculty}</Text>
              </View>
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
        <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Sign In</Text>
            <TouchableOpacity
              onPress={() => setShowLoginModal(false)}
              style={styles.modalCloseButton}
            >
              <Ionicons name="close" size={24} color="#6B7280" />
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
        <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
          <View style={styles.modalHeaderFullScreen}>
            <TouchableOpacity
              onPress={() => setShowFaceRegModal(false)}
              style={styles.modalCloseButton}
            >
              <Ionicons name="arrow-back" size={24} color="#111827" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Face Biometrics</Text>
            <View style={{ width: 32 }} />
          </View>
          <OnboardingScreen onSuccess={handleFaceRegSuccess} />
        </View>
      </Modal>
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
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: '#F3F4F6',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
    shadowColor: '#EF4444',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  signOutButtonText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4F46E5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#4F46E5',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  signInButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
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
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
    textAlign: 'center',
  },
  studentEmail: {
    fontSize: 13,
    color: '#6B7280',
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
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  indexBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    flex: 1,
  },
  infoValue: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
    flex: 1.5,
    textAlign: 'right',
  },
  infoValueHighlight: {
    fontSize: 13,
    color: '#4F46E5',
    fontWeight: '700',
    flex: 1.5,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  biometricStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  biometricTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 3,
  },
  biometricSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 17,
  },
  bioStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  bioPillSuccess: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  bioPillWarning: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  bioStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  bioTextSuccess: {
    color: '#059669',
  },
  bioTextWarning: {
    color: '#D97706',
  },
  actionButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  actionButtonSecondaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },
  permissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  permLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  permText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  permBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  permBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  versionText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  signedOutContainer: {
    marginTop: 10,
  },
  signedOutHero: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 26,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  signedOutAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  signedOutTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  signedOutSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  primarySignInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  primarySignInButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    backgroundColor: '#F3F4F6',
  },
  modalHeaderFullScreen: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#F3F4F6',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalCloseButton: {
    padding: 6,
  },
});
