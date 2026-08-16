import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, InteractionManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import Skeleton from '../components/Skeleton';

export default function HistoryScreen() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      (async () => {
        const response = await api.getHistory();
        if (response.success) {
          const sortedHistory = [...response.history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setHistory(sortedHistory);
        }
        setLoading(false);
      })();
    });

    return () => task.cancel();
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: 20 }]}>
        <Text style={styles.title}>Attendance History</Text>
        <View style={{ gap: 12 }}>
          <Skeleton height={80} borderRadius={16} />
          <Skeleton height={80} borderRadius={16} />
          <Skeleton height={80} borderRadius={16} />
          <Skeleton height={80} borderRadius={16} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Attendance History</Text>
      <FlatList
        data={history}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 30 }}
        renderItem={({ item }) => {
          const isPresent = item.status === 'Present';
          return (
            <View style={styles.card}>
              <View style={styles.cardLeft}>
                <View style={[styles.iconContainer, isPresent ? styles.iconPresent : styles.iconAbsent]}>
                  <Ionicons name={isPresent ? "checkmark" : "close"} size={20} color={isPresent ? "#10B981" : "#EF4444"} />
                </View>
                <View style={styles.textContainer}>
                  <Text style={styles.courseName}>{item.course}</Text>
                  <Text style={styles.date}>{item.date}</Text>
                </View>
              </View>
              <View style={[styles.badge, isPresent ? styles.badgePresent : styles.badgeAbsent]}>
                <Text style={[styles.badgeText, isPresent ? styles.textPresent : styles.textAbsent]}>
                  {item.status}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No attendance history found.</Text>}
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
  card: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  iconPresent: {
    backgroundColor: '#ECFDF5',
  },
  iconAbsent: {
    backgroundColor: '#FEF2F2',
  },
  courseName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  date: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgePresent: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  badgeAbsent: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  textPresent: {
    color: '#10B981',
  },
  textAbsent: {
    color: '#EF4444',
  },
  empty: {
    textAlign: 'center',
    color: '#6B7280',
    marginTop: 30,
    fontSize: 16,
  }
});
