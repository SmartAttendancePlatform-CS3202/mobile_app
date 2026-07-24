import React, { useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Import Screens
import LoginScreen from '../screens/LoginScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import HomeScreen from '../screens/HomeScreen';
import HistoryScreen from '../screens/HistoryScreen';
import TimetableScreen from '../screens/TimetableScreen';
import CheckInScreen from '../screens/CheckInScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Account Tab Flow
function AccountTab() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isFaceRegistered, setIsFaceRegistered] = useState(false);

  const handleLoginSuccess = (registered: boolean) => {
    setIsAuthenticated(true);
    setIsFaceRegistered(registered);
  };

  const handleFaceRegistrationSuccess = () => {
    setIsFaceRegistered(true);
  };

  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  if (!isFaceRegistered) {
    return <OnboardingScreen onSuccess={handleFaceRegistrationSuccess} />;
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' }}>
      <Ionicons name="checkmark-circle" size={80} color="#10B981" style={{ marginBottom: 20 }} />
      <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#111827', marginBottom: 10 }}>Account Ready</Text>
      <Text style={{ fontSize: 16, color: '#6B7280' }}>You are logged in and your face is registered.</Text>
    </View>
  );
}

// Bottom Tabs for main app flow
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
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
      <Tab.Screen name="Account" component={AccountTab} />
    </Tab.Navigator>
  );
}

// Main App Navigator
export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen 
        name="CheckIn" 
        component={CheckInScreen} 
        options={{ 
          headerShown: true, 
          title: 'Session Check-In',
          headerStyle: { backgroundColor: '#F3F4F6' },
          headerTintColor: '#111827',
          headerTitleStyle: { fontWeight: 'bold' }
        }} 
      />
    </Stack.Navigator>
  );
}
