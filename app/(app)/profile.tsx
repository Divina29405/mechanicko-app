import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MechanicScreen } from '@/components/mechanic/MechanicScreen';
import { useAuth } from '@/contexts/AuthContext';
import { useMechanic } from '@/contexts/MechanicContext';
import { colors, radii, spacing } from '@/lib/theme';

const specializations = ['Engine', 'Brakes', 'Electrical', 'Motorcycle', 'Roadside SOS'];
const docs = [
  { label: 'TESDA NC II', status: 'Verified' },
  { label: 'Driver’s license', status: 'Verified' },
  { label: 'Barangay clearance', status: 'Pending' },
];

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const { rating, online } = useMechanic();
  const email = session?.user.email ?? '';
  const fullName =
    typeof session?.user.user_metadata?.full_name === 'string'
      ? session.user.user_metadata.full_name
      : email.split('@')[0];

  return (
    <MechanicScreen title="Profile" subtitle="Espesyalidad, docs, at settings">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.name}>{fullName}</Text>
          <Text style={styles.meta}>{email}</Text>
          <Text style={styles.meta}>
            {rating.toFixed(1)} ★ · {online ? 'Online' : 'Offline'}
          </Text>
        </View>

        <Text style={styles.section}>Espesyalidad</Text>
        <View style={styles.chips}>
          {specializations.map((item) => (
            <View key={item} style={styles.chip}>
              <Text style={styles.chipText}>{item}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.section}>Dokumento at sertipikasyon</Text>
        {docs.map((doc) => (
          <View key={doc.label} style={styles.doc}>
            <Ionicons name="document-text-outline" size={18} color={colors.amber} />
            <Text style={styles.docLabel}>{doc.label}</Text>
            <Text style={[styles.docStatus, doc.status === 'Pending' && styles.pending]}>
              {doc.status}
            </Text>
          </View>
        ))}

        <Pressable onPress={signOut} style={({ pressed }) => [styles.logout, pressed && styles.pressed]}>
          <Text style={styles.logoutText}>Mag-logout</Text>
        </Pressable>
      </ScrollView>
    </MechanicScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  name: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  meta: {
    marginTop: 4,
    color: colors.textMuted,
  },
  section: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    color: colors.text,
    fontWeight: '800',
    fontSize: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: colors.amberSoft,
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    color: colors.amber,
    fontWeight: '700',
    fontSize: 12,
  },
  doc: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: 8,
  },
  docLabel: {
    flex: 1,
    color: colors.text,
    fontWeight: '600',
  },
  docStatus: {
    color: colors.success,
    fontWeight: '700',
    fontSize: 12,
  },
  pending: {
    color: colors.amber,
  },
  logout: {
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: colors.text,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
});
