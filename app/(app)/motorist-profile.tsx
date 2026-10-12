import { Ionicons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import { MechanicScreen } from '@/components/mechanic/MechanicScreen';
import { ComingSoonModal } from '@/components/ComingSoonModal';

const vehicleIcon = require('../../assets/images/vehicle.png');
const locationIcon = require('../../assets/images/location.png');
const darkModeIcon = require('../../assets/images/dark-mode.png');
const paymentMethodIcon = require('../../assets/images/payment-method.png');

export default function MotoristProfileScreen() {
  const { session, signOut } = useAuth();
  const { colors } = useAppTheme();

  const email = session?.user.email ?? 'motorist@example.com';
  const fullName = typeof session?.user.user_metadata?.full_name === 'string'
    ? session.user.user_metadata.full_name
    : email.split('@')[0];
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    typeof session?.user.user_metadata?.avatar_url === 'string'
      ? session.user.user_metadata.avatar_url
      : null,
  );
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [accountDetailsVisible, setAccountDetailsVisible] = useState(false);
  const [editableEmail, setEditableEmail] = useState(email);
  const [mobileNumber, setMobileNumber] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [comingSoonVisible, setComingSoonVisible] = useState(false);
  const avatarRequestId = useRef(0);

  useEffect(() => {
    if (!accountDetailsVisible || !session?.user.id) return;
    let active = true;
    const loadMobileNumber = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('mobile_number')
        .eq('id', session.user.id)
        .maybeSingle();
      if (active && !error) setMobileNumber(data?.mobile_number ?? '');
    };
    void loadMobileNumber();
    return () => {
      active = false;
    };
  }, [accountDetailsVisible, session?.user.id]);

  async function saveAccountDetails() {
    if (!session?.user.id || savingDetails) return;
    const nextEmail = editableEmail.trim();
    const nextMobile = mobileNumber.trim();
    if (!nextEmail || !nextEmail.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (!nextMobile) {
      Alert.alert('Phone number required', 'Please enter your phone number.');
      return;
    }

    setSavingDetails(true);
    const profileUpdate = await supabase
      .from('profiles')
      .update({ email: nextEmail, mobile_number: nextMobile })
      .eq('id', session.user.id);
    if (profileUpdate.error) {
      setSavingDetails(false);
      Alert.alert('Update failed', profileUpdate.error.message);
      return;
    }

    if (nextEmail !== email) {
      const authUpdate = await supabase.auth.updateUser({ email: nextEmail });
      if (authUpdate.error) {
        setSavingDetails(false);
        Alert.alert('Email update failed', authUpdate.error.message);
        return;
      }
      Alert.alert('Changes saved successfully!', 'Please check your email to confirm the new email address.');
    } else {
      Alert.alert('Changes saved successfully!', 'Your account details have been updated.');
    }
    setSavingDetails(false);
  }

  function initials(name: string) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  function showComingSoon() {
    setComingSoonVisible(true);
  }

  async function changeAvatar(source: 'camera' | 'gallery') {
    if (!session?.user.id || uploadingAvatar) return;
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
    const requestId = ++avatarRequestId.current;
    try {
      const converted = await ImageManipulator.manipulateAsync(result.assets[0].uri, [], {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      const convertedFile = new File(converted.uri);
      if (!convertedFile.exists) throw new Error('The converted photo was not created.');
      const path = `${session.user.id}/motorist-avatar-${Date.now()}.jpg`;
      const upload = await supabase.storage.from('mechanic-avatars').upload(
        path,
        (await convertedFile.bytes()).buffer,
        { cacheControl: '3600', contentType: 'image/jpeg', upsert: true },
      );
      if (upload.error) throw new Error(upload.error.message);
      const update = await supabase.from('profiles').update({ avatar_path: path }).eq('id', session.user.id);
      if (update.error) throw new Error(update.error.message);
      const signed = await supabase.storage.from('mechanic-avatars').createSignedUrl(path, 60 * 60);
      if (signed.error || !signed.data?.signedUrl) {
        throw new Error(signed.error?.message ?? 'The photo was saved but could not be loaded.');
      }
      const cacheBustedUrl = `${signed.data.signedUrl}&v=${Date.now()}`;
      await supabase.auth.updateUser({ data: { avatar_url: cacheBustedUrl } });
      if (requestId === avatarRequestId.current) setAvatarUrl(cacheBustedUrl);
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
    <MechanicScreen back title="My Profile">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.avatar, { backgroundColor: '#FFF1D6', borderColor: '#F0A202' }]}
            onPress={chooseAvatar}
            disabled={uploadingAvatar}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={[styles.avatarInitials, { color: colors.primary }]}>
                {initials(fullName) || 'M'}
              </Text>
            )}
            <View style={[styles.cameraBadge, { backgroundColor: colors.primary }]}>
              <Ionicons name="camera-outline" size={14} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <View style={styles.profileInfo}>
            <Text style={[styles.name, { color: colors.text }]}>{fullName}</Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>{email}</Text>
            <Text style={[styles.status, { color: '#27AE60' }]}>Motorist</Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Settings & Preferences</Text>
        
        <View style={[styles.menuGroup, { backgroundColor: colors.card }]}>
          
          <SettingRow 
            iconSource={vehicleIcon}
            title="My Vehicles" 
            subtitle="Manage your registered motorcycles and cars" 
            colors={colors} 
            onPress={showComingSoon}
          />

          <SettingRow iconSource={paymentMethodIcon} title="Payment Methods" subtitle="Link GCash or Credit/Debit Cards" colors={colors} onPress={showComingSoon} />
          <SettingRow iconSource={locationIcon} title="Saved Locations" subtitle="Home, Work, and frequent stops" colors={colors} onPress={showComingSoon} />
          
          <TouchableOpacity style={[styles.row, { borderBottomColor: colors.border }]} onPress={showComingSoon}>
            <View style={styles.iconBox}>
              <Image source={darkModeIcon} style={styles.settingIconImage} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Dark Mode</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>Coming soon</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Account Details</Text>

        <View style={[styles.menuGroup, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[styles.row, { borderBottomColor: colors.border }]}
            onPress={() => {
              setEditableEmail(email);
              setAccountDetailsVisible(true);
            }}
          >
            <View style={styles.iconBox}>
              <Ionicons name="person-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>My Details</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                View your account information
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

      </ScrollView>

      <Modal
        visible={accountDetailsVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setAccountDetailsVisible(false)}
      >
        <View style={[styles.detailScreen, { backgroundColor: colors.bg }]}>
          <View style={[styles.detailHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Text style={[styles.detailTitle, { color: colors.text }]}>Account Details</Text>
            <TouchableOpacity
              onPress={() => setAccountDetailsVisible(false)}
              style={styles.closeButton}
              accessibilityLabel="Close account details"
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={[styles.detailsList, { backgroundColor: colors.card }]} keyboardShouldPersistTaps="handled">
            <AccountDetailRow label="Full Name" value={fullName} colors={colors} />
            <View style={[styles.editableDetailRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Email Address</Text>
              <TextInput
                style={[styles.detailInput, { color: colors.text }]}
                value={editableEmail}
                onChangeText={setEditableEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={[styles.editableDetailRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Phone Number</Text>
              <TextInput
                style={[styles.detailInput, { color: colors.text }]}
                value={mobileNumber}
                onChangeText={setMobileNumber}
                keyboardType="phone-pad"
                placeholder="Enter phone number"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <AccountDetailRow label="Account Type" value="Motorist" colors={colors} />
            <TouchableOpacity
              style={[styles.saveDetailsButton, { backgroundColor: colors.primary }]}
              onPress={() => void saveAccountDetails()}
              disabled={savingDetails}
            >
              {savingDetails ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveDetailsText}>Save changes</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.detailLogoutRow, { borderTopColor: colors.border }]}
              onPress={handleLogout}
            >
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              <Text style={styles.logoutText}>Mag-logout</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
      <ComingSoonModal
        visible={comingSoonVisible}
        onClose={() => setComingSoonVisible(false)}
      />
    </MechanicScreen>
  );
}

function AccountDetailRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: { text: string; textMuted: string; border: string };
}) {
  return (
    <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function SettingRow({ iconSource, title, subtitle, colors, isLast = false, onPress }: any) {
  return (
    <TouchableOpacity style={[styles.row, !isLast && { borderBottomColor: colors.border }]} onPress={onPress}>
      <View style={styles.iconBox}>
        <Image source={iconSource} style={styles.settingIconImage} />
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
  content: { paddingBottom: 32 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 24, borderBottomWidth: 1, marginBottom: 0 },
  profileInfo: { flex: 1 },
  avatar: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginRight: 16, borderWidth: 2, overflow: 'visible' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 42 },
  avatarInitials: { fontSize: 30, fontWeight: '800' },
  cameraBadge: { position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 22, fontWeight: '800' },
  meta: { fontSize: 14, marginTop: 4 },
  status: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '800', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 10 },
  menuGroup: { marginBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1 },
  iconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255, 107, 0, 0.08)', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  settingIconImage: { width: 26, height: 26, resizeMode: 'contain' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSubtitle: { fontSize: 12, marginTop: 2 },
  detailScreen: { flex: 1 },
  detailHeader: { minHeight: 60, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  detailTitle: { fontSize: 18, fontWeight: '800' },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  detailsList: { marginTop: 16 },
  detailRow: { minHeight: 58, paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  editableDetailRow: { minHeight: 58, paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  detailLabel: { fontSize: 13, fontWeight: '600' },
  detailValue: { flex: 1, fontSize: 15, fontWeight: '700', marginLeft: 20, textAlign: 'right' },
  detailInput: { flex: 1, minHeight: 38, borderWidth: 0, paddingHorizontal: 0, paddingVertical: 4, fontSize: 15, fontWeight: '600', marginLeft: 20, textAlign: 'right' },
  saveDetailsButton: { minHeight: 46, margin: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  saveDetailsText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  detailLogoutRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 18, borderTopWidth: 1 },
  logoutText: { color: '#EF4444', fontSize: 15, fontWeight: '800', flex: 1 }
});