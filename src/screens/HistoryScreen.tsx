import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api, { formatModuleTitle } from '../services/api';
import { AttendanceHistoryItem } from '../services/mockData';
import { useAuth } from '../context/AuthContext';
import Skeleton from '../components/Skeleton';

export default function HistoryScreen() {
  const { user } = useAuth();
  const [history, setHistory] = useState<AttendanceHistoryItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const sortRecords = (records: AttendanceHistoryItem[]): AttendanceHistoryItem[] => {
    return [...records].sort((a, b) => {
      const timeA = new Date(a.heldAt || a.date || 0).getTime();
      const timeB = new Date(b.heldAt || b.date || 0).getTime();
      return timeB - timeA;
    });
  };

  const revalidateHistory = useCallback(async (silent: boolean = false) => {
    if (!silent) {
      setIsRevalidating(true);
    }
    try {
      const response = await api.getHistory(user?.id);
      if (response.success && response.history) {
        setHistory(sortRecords(response.history));
      }
    } catch (e) {
      console.warn('Error revalidating attendance history:', e);
    } finally {
      setIsRevalidating(false);
      setInitialLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    let isMounted = true;

    // 1. Immediately read and display offline cache from phone storage
    (async () => {
      try {
        const cached = await api.getCachedHistory(user?.id);
        if (isMounted && cached && cached.length > 0) {
          const validCached = cached.filter((c: any) => {
            const title = formatModuleTitle(c.courseCode, c.courseName, c.course);
            return (
              Boolean(title) &&
              title !== 'Module' &&
              title !== 'COURSE Class Session' &&
              title !== 'Academic Module'
            );
          });
          if (validCached.length > 0) {
            setHistory(sortRecords(validCached));
            setInitialLoading(false);
          }
        }
      } catch (err) {
        console.warn('Failed to load initial cached history:', err);
      }
    })();

    // 2. Perform background revalidation against backend/database
    revalidateHistory(false);

    return () => {
      isMounted = false;
    };
  }, [user?.id, revalidateHistory]);

  const onRefresh = async () => {
    setRefreshing(true);
    await revalidateHistory(false);
    setRefreshing(false);
  };

  const getStatusBadgeConfig = (status: string) => {
    switch (status) {
      case 'Present':
        return {
          icon: 'checkmark' as const,
          color: '#10B981',
          bg: '#ECFDF5',
          border: '#A7F3D0',
          text: '#10B981',
        };
      case 'Late':
        return {
          icon: 'time' as const,
          color: '#F59E0B',
          bg: '#FEF3C7',
          border: '#FDE68A',
          text: '#D97706',
        };
      case 'Absent':
      default:
        return {
          icon: 'close' as const,
          color: '#EF4444',
          bg: '#FEF2F2',
          border: '#FECACA',
          text: '#EF4444',
        };
    }
  };

  if (initialLoading && history.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: 44 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Attendance History</Text>
        </View>
        <View style={{ gap: 12 }}>
          <Skeleton height={96} borderRadius={16} />
          <Skeleton height={96} borderRadius={16} />
          <Skeleton height={96} borderRadius={16} />
          <Skeleton height={96} borderRadius={16} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with Top Loading Circle */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>Attendance History</Text>
        {isRevalidating && (
          <View style={styles.topSyncIndicator}>
            <ActivityIndicator size="small" color="#3366cc" />
            <Text style={styles.syncingText}>Updating...</Text>
          </View>
        )}
      </View>

      <FlatList
        data={history}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#3366cc']}
            tintColor="#3366cc"
          />
        }
        renderItem={({ item }) => {
          const cfg = getStatusBadgeConfig(item.status);
          const moduleDisplay = formatModuleTitle(item.courseCode, item.courseName, item.course) || 'Academic Module';

          return (
            <View style={styles.card}>
              <View style={styles.cardLeft}>
                {/* Left Status Icon Container */}
                <View style={[styles.iconContainer, { backgroundColor: cfg.bg }]}>
                  <Ionicons name={cfg.icon} size={20} color={cfg.color} />
                </View>

                {/* Card Text Info */}
                <View style={styles.textContainer}>
                  {/* Module Name & Code */}
                  <Text style={styles.moduleName} numberOfLines={2}>
                    {moduleDisplay}
                  </Text>

                  {/* Date Held */}
                  <View style={styles.dateRow}>
                    <Ionicons name="calendar-outline" size={13} color="#6B7280" style={{ marginRight: 4 }} />
                    <Text style={styles.dateText}>
                      {item.dateFormatted || item.date || 'Recent'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Status Badge */}
              <View style={[styles.badge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                <Text style={[styles.badgeText, { color: cfg.text }]}>
                  {item.status}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-clear-outline" size={48} color="#9CA3AF" />
            <Text style={styles.emptyText}>No attendance records found.</Text>
            <Text style={styles.emptySubtext}>
              Recorded lectures will appear here once held by lecturers.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 44,
    backgroundColor: '#F3F4F6',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  topSyncIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 6,
  },
  syncingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3366cc',
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
    marginRight: 12,
  },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  moduleName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    paddingHorizontal: 20,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  emptySubtext: {
    marginTop: 4,
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});

