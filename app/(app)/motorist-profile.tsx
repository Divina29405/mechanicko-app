import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { colors, radii, spacing } from '@/lib/theme';

export default function MotoristProfileScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();

  const email = session?.user.email ?? 'motorist@example.com';
  const fullName = typeof session?.user.user_metadata?.full_name === 'string'
    ? session.user.user_metadata.full_name
    : email.split('@')[0];

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={32} color={colors.amber} />
          </View>
          <View>
            <Text style={styles.name}>{fullName}</Text>
            <Text style={styles.meta}>{email}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Settings & Preferences</Text>
        
        <View style={styles.menuGroup}>
          <SettingRow icon="car-sport-outline" title="My Vehicles" subtitle="Manage your registered motorcycles and cars" />
          <SettingRow icon="card-outline" title="Payment Methods" subtitle="Link GCash or Credit/Debit Cards" />
          <SettingRow icon="location-outline" title="Saved Locations" subtitle="Home, Work, and frequent stops" />
          <SettingRow icon="notifications-outline" title="Notifications" subtitle="Update alert preferences" />
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
          <Text style={styles.logoutText}>Mag-logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function SettingRow({ icon, title, subtitle }: { icon: any, title: string, subtitle: string }) {
  return (
    <TouchableOpacity style={styles.row}>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={20} color={colors.amber} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: 60, paddingBottom: spacing.md, backgroundColor: colors.bgElevated, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  content: { padding: spacing.lg },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgElevated, borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xl },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.amberSoft, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md, borderWidth: 2, borderColor: colors.amber },
  name: { color: colors.text, fontSize: 20, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 14, marginTop: 2 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: spacing.md },
  menuGroup: { backgroundColor: colors.bgElevated, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md, borderWidth: 1, borderColor: colors.border },
  rowText: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  logoutButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.sos, borderRadius: radii.md, paddingVertical: 16, alignItems: 'center' },
  logoutText: { color: colors.sos, fontSize: 16, fontWeight: '800' }
});