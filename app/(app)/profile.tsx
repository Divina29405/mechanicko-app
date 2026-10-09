import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEffect, useState } from 'react';

import { MechanicScreen } from '@/components/mechanic/MechanicScreen';
import { useAuth } from '@/contexts/AuthContext';
import { useMechanic } from '@/contexts/MechanicContext';
import { colors, radii, spacing } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

const specializations = ['Engine', 'Brakes', 'Electrical', 'Motorcycle', 'Roadside SOS'];
const docs = [
  { label: 'TESDA NC II', status: 'Verified' },
  { label: 'Driver’s license', status: 'Verified' },
  { label: 'Barangay clearance', status: 'Pending' },
];

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const { rating, online } = useMechanic();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const email = session?.user.email ?? '';
  const fullName =
    typeof session?.user.user_metadata?.full_name === 'string'
      ? session.user.user_metadata.full_name
      : email.split('@')[0];

  useEffect(() => {
    let active = true;
    async function loadAvatar() {
      if (!session?.user.id) return;
      const { data } = await supabase
        .from('profiles')
        .select('avatar_path')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!active || !data?.avatar_path) return;
      const publicUrl = supabase.storage
        .from('mechanic-avatars')
        .getPublicUrl(data.avatar_path).data.publicUrl;
      if (active) setAvatarUrl(`${publicUrl}?v=${Date.now()}`);
    }
    void loadAvatar();
    return () => {
      active = false;
    };
  }, [session?.user.id]);

  async function changeAvatar(source: 'camera' | 'gallery') {
    if (!session?.user.id) return;
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera permission required', 'Allow camera access to take a profile photo.');
        return;
      }
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            quality: 0.8,
          });
    if (result.canceled || !result.assets[0]?.uri) return;

    setUploadingAvatar(true);
    try {
      const response = await fetch(result.assets[0].uri);
      const body = await response.arrayBuffer();
      const mimeType = result.assets[0].mimeType ?? 'image/jpeg';
      const extension = mimeType.split('/')[1] || 'jpg';
      const path = `${session.user.id}/avatar-${Date.now()}.${extension}`;
      const upload = await supabase.storage
        .from('mechanic-avatars')
        .upload(path, body, { contentType: mimeType, upsert: true });
      if (upload.error) throw new Error(upload.error.message);

      const update = await supabase
        .from('profiles')
        .update({ avatar_path: path })
        .eq('id', session.user.id);
      if (update.error) throw new Error(update.error.message);

      const publicUrl = supabase.storage
        .from('mechanic-avatars')
        .getPublicUrl(path).data.publicUrl;
      setAvatarUrl(`${publicUrl}?v=${Date.now()}`);
    } catch (error) {
      Alert.alert('Profile photo failed', error instanceof Error ? error.message : 'Could not save the photo.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  function chooseAvatar() {
    Alert.alert('Profile photo', 'Choose how to update your profile photo.', [
      { text: 'Camera', onPress: () => void changeAvatar('camera') },
      { text: 'Gallery', onPress: () => void changeAvatar('gallery') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <MechanicScreen title="Profile" subtitle="Specializations, documents, and settings">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Pressable onPress={chooseAvatar} style={styles.avatarButton} disabled={uploadingAvatar}>
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatarImage}
                onError={() => {
                  setAvatarUrl(null);
                  Alert.alert(
                    'Profile photo unavailable',
                    'The photo was saved but could not be loaded. Check the storage read policy.',
                  );
                }}
              />
            ) : (
              <Text style={styles.avatarText}>{fullName.slice(0, 1).toUpperCase()}</Text>
            )}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera-outline" size={14} color={colors.bg} />
            </View>
          </Pressable>
          <Text style={styles.name}>{fullName}</Text>
          <Text style={styles.meta}>{email}</Text>
          <Text style={styles.meta}>
            {rating.toFixed(1)} ★ · {online ? 'Online' : 'Offline'}
          </Text>
        </View>

        <Text style={styles.section}>Specializations</Text>
        <View style={styles.chips}>
          {specializations.map((item) => (
            <View key={item} style={styles.chip}>
              <Text style={styles.chipText}>{item}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.section}>Documents and certifications</Text>
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
          <Text style={styles.logoutText}>Log out</Text>
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
  avatarButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.amberSoft,
    borderWidth: 2,
    borderColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 42,
  },
  avatarText: {
    color: colors.amber,
    fontSize: 30,
    fontWeight: '800',
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
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
