import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/contexts/ThemeContext';

export default function MotoristActivityScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { colors } = useAppTheme();
  
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'completed' | 'cancelled'>('pending');

  const fetchMyOrders = async () => {
    if (!session?.user.id) return;
    const { data, error } = await supabase
      .from('service_requests')
      .select('*')
      .eq('motorist_id', session.user.id)
      .order('created_at', { ascending: false });

    if (!error && data) setRequests(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchMyOrders();
  }, [session]);

  // NEW: Handle Cancellation from the Activity Screen
  const handleCancel = (id: string) => {
    Alert.alert(
      "Cancel Request",
      "Are you sure you want to cancel this pending request?",
      [
        { text: "Back", style: "cancel" },
        { 
          text: "Confirm Cancel", 
          style: "destructive", 
          onPress: async () => {
            setLoading(true);
            await supabase.from('service_requests').update({ 
              status: 'cancelled',
              cancellation_reason: 'Cancelled from Activity Menu'
            }).eq('id', id);
            fetchMyOrders(); // Refresh the list
          }
        }
      ]
    );
  };

  const filteredRequests = requests.filter(req => {
    if (activeTab === 'pending') return ['pending', 'accepted', 'in_transit', 'in_progress'].includes(req.status);
    if (activeTab === 'completed') return ['completed', 'closed'].includes(req.status);
    if (activeTab === 'cancelled') return req.status === 'cancelled';
    return true;
  });

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>My Activity</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.tabContainer, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {['pending', 'completed', 'cancelled'].map((tab) => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary }]} onPress={() => setActiveTab(tab as any)}>
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.textMuted }]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : filteredRequests.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={48} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.text }]}>No {activeTab} requests.</Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              {activeTab === 'pending' ? "You don't have any active bookings right now." : 
               activeTab === 'completed' ? "Your finished services and receipts will appear here." : 
               "Your cancelled requests will appear here."}
            </Text>
          </View>
        ) : (
          filteredRequests.map((req) => (
            <View key={req.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.serviceType, { color: colors.text }]}>
                  {req.request_type === 'emergency' ? '🚨 Emergency SOS' : '📅 Standard Service'}
                </Text>
                <Text style={[styles.status, activeTab === 'pending' ? { color: colors.primary } : activeTab === 'cancelled' ? { color: '#EF4444' } : { color: '#10b981' }]}>
                  {req.status.toUpperCase()}
                </Text>
              </View>
              
              <Text style={[styles.issue, { color: colors.textMuted }]} numberOfLines={2}>
                {req.vehicle_issue || "No description provided."}
              </Text>

              {activeTab === 'completed' && req.final_price && (
                <View style={[styles.receiptBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                  <View style={styles.receiptHeader}>
                    <Text style={[styles.receiptTitle, { color: colors.text }]}>Final Amount Paid</Text>
                    <Text style={[styles.receiptPrice, { color: colors.text }]}>₱{req.final_price}</Text>
                  </View>
                  {req.mechanic_notes && (
                    <Text style={[styles.receiptNotes, { color: colors.textMuted }]}>
                      Mechanic Notes: {req.mechanic_notes}
                    </Text>
                  )}
                </View>
              )}
              
              <Text style={[styles.date, { color: colors.textMuted }]}>
                Requested on: {new Date(req.created_at).toLocaleDateString()}
              </Text>

              {/* NEW: Cancel Button for Pending Requests */}
              {req.status === 'pending' && (
                <TouchableOpacity 
                  style={styles.cancelListButton} 
                  onPress={() => handleCancel(req.id)}
                >
                  <Text style={styles.cancelListButtonText}>Cancel Request</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  
  tabContainer: { flexDirection: 'row', paddingHorizontal: 10, borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 16, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 14, fontWeight: '700' },

  content: { padding: 20 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 60, padding: 24 },
  emptyText: { fontSize: 18, fontWeight: '700', marginTop: 16 },
  emptySub: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  
  card: { borderRadius: 16, padding: 20, borderWidth: 1, marginBottom: 16, elevation: 3, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  serviceType: { fontSize: 15, fontWeight: '800' },
  status: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  issue: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  
  receiptBox: { padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 12, borderStyle: 'dashed' },
  receiptHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  receiptTitle: { fontSize: 14, fontWeight: '700' },
  receiptPrice: { fontSize: 16, fontWeight: '900', color: '#10b981' },
  receiptNotes: { fontSize: 13, fontStyle: 'italic', marginTop: 4 },

  date: { fontSize: 12, fontWeight: '600' },

  // New Cancel Button Style
  cancelListButton: { marginTop: 16, paddingVertical: 12, borderRadius: 8, backgroundColor: 'rgba(239, 68, 68, 0.1)', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' },
  cancelListButtonText: { color: '#EF4444', fontWeight: 'bold', fontSize: 14 }
});