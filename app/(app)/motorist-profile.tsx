import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View, Switch } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';

export default function MotoristProfileScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { colors, isDarkMode, toggleTheme } = useAppTheme();

  const email = session?.user.email ?? 'motorist@example.com';
  const fullName = typeof session?.user.user_metadata?.full_name === 'string'
    ? session.user.user_metadata.full_name
    : email.split('@')[0];

  // NEW: Logout Confirmation Dialog
  const handleLogout = () => {
    Alert.alert(
      "Confirm Logout",
      "Are you sure you want to log out of your account?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Log Out", style: "destructive", onPress: signOut }
      ]
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>My Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={32} color={colors.primary} />
          </View>
          <View>
            <Text style={[styles.name, { color: colors.text }]}>{fullName}</Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>{email}</Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Settings & Preferences</Text>
        
        <View style={[styles.menuGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          
          <SettingRow 
            icon="car-sport-outline" 
            title="My Vehicles" 
            subtitle="Manage your registered motorcycles and cars" 
            colors={colors} 
            onPress={() => router.push('/my-vehicles')}
          />

          <SettingRow icon="card-outline" title="Payment Methods" subtitle="Link GCash or Credit/Debit Cards" colors={colors} />
          <SettingRow icon="location-outline" title="Saved Locations" subtitle="Home, Work, and frequent stops" colors={colors} />
          
          <View style={[styles.row, { borderBottomColor: colors.border, borderBottomWidth: 0 }]}>
            <View style={styles.iconBox}>
              <Ionicons name="moon" size={20} color={colors.primary} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Dark Mode</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>Auto-switches at 6:00 PM</Text>
            </View>
            <Switch 
              value={isDarkMode} 
              onValueChange={toggleTheme} 
              trackColor={{ false: '#E5E7EB', true: '#FF6B00' }}
              thumbColor={'#FFFFFF'}
            />
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Mag-logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function SettingRow({ icon, title, subtitle, colors, isLast = false, onPress }: any) {
  return (
    <TouchableOpacity style={[styles.row, !isLast && { borderBottomColor: colors.border }]} onPress={onPress}>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  content: { padding: 20 },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 20, borderWidth: 1, marginBottom: 32, elevation: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255, 107, 0, 0.08)', alignItems: 'center', justifyContent: 'center', marginRight: 16, borderWidth: 2, borderColor: '#FF6B00' },
  name: { fontSize: 20, fontWeight: '800' },
  meta: { fontSize: 14, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 16 },
  menuGroup: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 32, elevation: 2, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  iconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255, 107, 0, 0.05)', alignItems: 'center', justifyContent: 'center', marginRight: 16, borderWidth: 1, borderColor: 'rgba(255, 107, 0, 0.2)' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSubtitle: { fontSize: 12, marginTop: 2 },
  logoutButton: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#EF4444', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  logoutText: { color: '#EF4444', fontSize: 16, fontWeight: '800' }
});