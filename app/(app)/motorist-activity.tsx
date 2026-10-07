import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { colors, radii, spacing } from '@/lib/theme';

export default function MotoristActivityScreen() {
  const router = useRouter();
  const { session } = useAuth();
  
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMyOrders() {
      if (!session?.user.id) return;

      const { data, error } = await supabase
        .from('service_requests')
        .select('*')
        .eq('motorist_id', session.user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setRequests(data);
      }
      setLoading(false);
    }

    fetchMyOrders();
  }, [session]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Activity</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.amber} style={{ marginTop: 40 }} />
        ) : requests.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={48} color={colors.textDim} />
            <Text style={styles.emptyText}>No service requests yet.</Text>
            <Text style={styles.emptySub}>Book a mechanic from the map to see your activity here.</Text>
          </View>
        ) : (
          requests.map((req) => (
            <View key={req.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.serviceType}>
                  {req.request_type === 'emergency' ? '🚨 Emergency SOS' : '📅 Scheduled Service'}
                </Text>
                <Text style={[styles.status, req.status === 'pending' && styles.statusPending]}>
                  {req.status.toUpperCase()}
                </Text>
              </View>
              
              <Text style={styles.issue} numberOfLines={2}>
                {req.vehicle_issue || "No description provided."}
              </Text>
              
              <Text style={styles.date}>
                Requested on: {new Date(req.created_at).toLocaleDateString()}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: 60, paddingBottom: spacing.md, backgroundColor: colors.bgElevated, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  content: { padding: spacing.lg },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 60, padding: 24 },
  emptyText: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 16 },
  emptySub: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  card: { backgroundColor: colors.bgElevated, borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  serviceType: { color: colors.text, fontSize: 15, fontWeight: '800' },
  status: { color: colors.success, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  statusPending: { color: colors.amber },
  issue: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  date: { color: colors.textDim, fontSize: 12, fontWeight: '600' }
});