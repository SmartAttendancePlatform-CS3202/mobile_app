import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

export default function TimetableScreen() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const response = await api.getSessions();
      if (response.success) {
        setSessions(response.sessions);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Today's Schedule</Text>
      
      <FlatList
        data={sessions}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 30 }}
        renderItem={({ item, index }) => (
          <View style={styles.timelineRow}>
            {/* Timeline Line & Dot */}
            <View style={styles.timelineGraphic}>
              <View style={[styles.dot, item.isActive ? styles.activeDot : styles.inactiveDot]} />
              {index !== sessions.length - 1 && (
                <View style={[styles.line, item.isActive ? styles.activeLine : styles.inactiveLine]} />
              )}
            </View>

            {/* Card Content */}
            <View style={[styles.card, item.isActive && styles.activeCard]}>
              <View style={styles.cardHeader}>
                <Text style={styles.courseName}>{item.courseName}</Text>
                {item.isActive && (
                  <View style={styles.liveBadge}>
                    <Text style={styles.liveBadgeText}>LIVE</Text>
                  </View>
                )}
              </View>
              
              <View style={styles.infoRow}>
                <Ionicons name="person-outline" size={16} color="#6B7280" />
                <Text style={styles.lecturer}>{item.lecturer}</Text>
              </View>
              
              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={16} color="#6B7280" />
                <Text style={styles.time}>{item.startTime} - {item.endTime}</Text>
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F3F4F6',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 24,
    color: '#111827',
  },
  timelineRow: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  timelineGraphic: {
    alignItems: 'center',
    width: 30,
    marginRight: 10,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 24,
    zIndex: 1,
  },
  activeDot: {
    backgroundColor: '#4F46E5',
    borderWidth: 3,
    borderColor: '#C7D2FE',
  },
  inactiveDot: {
    backgroundColor: '#D1D5DB',
  },
  line: {
    width: 2,
    flex: 1,
    marginTop: -10,
    marginBottom: -24,
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
    padding: 18,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  activeCard: {
    borderColor: '#4F46E5',
    backgroundColor: '#FAFAFF',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  courseName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  liveBadge: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  liveBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  lecturer: {
    fontSize: 14,
    color: '#4B5563',
    marginLeft: 8,
    fontWeight: '500',
  },
  time: {
    fontSize: 14,
    color: '#4B5563',
    marginLeft: 8,
    fontWeight: '500',
  }
});
