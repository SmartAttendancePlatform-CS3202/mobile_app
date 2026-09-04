import React from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

// Import Screens
import HomeScreen from '../screens/HomeScreen';
import HistoryScreen from '../screens/HistoryScreen';
import TimetableScreen from '../screens/TimetableScreen';
import CheckInScreen from '../screens/CheckInScreen';
import LocationCheckScreen from '../screens/LocationCheckScreen';
import AccountScreen from '../screens/AccountScreen';
import LoginScreen from '../screens/LoginScreen';
import PendingApprovalScreen from '../screens/PendingApprovalScreen';
import OnboardingScreen from '../screens/OnboardingScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Bottom Tabs for main app flow
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        freezeOnBlur: true,
        headerShown: route.name !== 'Account',
        headerStyle: { backgroundColor: '#F3F4F6', elevation: 0, shadowOpacity: 0, borderBottomWidth: 0 },
        headerTitleStyle: { color: '#111827', fontWeight: 'bold', fontSize: 22 },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: any = 'home';
          if (route.name === 'Dashboard') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Timetable') {
            iconName = focused ? 'calendar' : 'calendar-outline';
          } else if (route.name === 'History') {
            iconName = focused ? 'time' : 'time-outline';
          } else if (route.name === 'Account') {
            iconName = focused ? 'person' : 'person-outline';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#4F46E5',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          elevation: 10,
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: -5 },
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={HomeScreen} />
      <Tab.Screen name="Timetable" component={TimetableScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Account" component={AccountScreen} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}

// Main App Navigator with Strict Auth Gating
export default function AppNavigator() {
  const { isAuthenticated, isPendingApproval, isFaceRegistered, loading, setFaceRegistered } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingLogo}>
          <Ionicons name="scan-outline" size={44} color="#4F46E5" />
        </View>
        <ActivityIndicator size="large" color="#4F46E5" style={{ marginTop: 20 }} />
        <Text style={styles.loadingText}>Initializing Student Portal...</Text>
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        // 1. Unauthenticated -> Login Screen
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : isPendingApproval ? (
        // 2. Authenticated but Pending Approval -> Locked Pending Screen
        <Stack.Screen name="PendingApproval" component={PendingApprovalScreen} />
      ) : (
        // 3. Fully Authenticated Active Student -> Main App (Can view Dashboard, Timetables, Account)
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen
            name="FaceRegistration"
            options={{
              headerShown: true,
              title: 'Face Biometrics Registration',
              headerStyle: { backgroundColor: '#F3F4F6' },
              headerTintColor: '#111827',
              headerTitleStyle: { fontWeight: 'bold' },
            }}
          >
            {() => <OnboardingScreen onSuccess={() => setFaceRegistered(true)} />}
          </Stack.Screen>
          <Stack.Screen
            name="LocationCheck"
            component={LocationCheckScreen}
            options={{
              headerShown: true,
              title: 'Location Verification',
              headerStyle: { backgroundColor: '#F3F4F6' },
              headerTintColor: '#111827',
              headerTitleStyle: { fontWeight: 'bold' },
            }}
          />
          <Stack.Screen
            name="CheckIn"
            component={CheckInScreen}
            options={{
              headerShown: true,
              title: 'Session Check-In',
              headerStyle: { backgroundColor: '#F3F4F6' },
              headerTintColor: '#111827',
              headerTitleStyle: { fontWeight: 'bold' },
            }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingLogo: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
});
