import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import { MotoristHomeHeader } from '@/components/MotoristHomeHeader';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { publishSharedAvatarUrl } from '@/lib/avatarStore';
import { listVehicles, setPrimaryVehicle } from '@/services/vehicleService';
import type { Vehicle } from '@/types/vehicle';

const motorcycleIcon = require('../../assets/images/motorcycle.png');
const carIcon = require('../../assets/images/car.png');
const trashBinIcon = require('../../assets/images/trash-bin.png');
const MOTORIST_RADIUS_KEY = 'motorist_search_radius_km';

export default function MotoristProfileScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { colors, isDarkMode, toggleTheme } = useAppTheme();

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
  const [avatarPickerVisible, setAvatarPickerVisible] = useState(false);
  const [accountDetailsVisible, setAccountDetailsVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [searchRadius, setSearchRadius] = useState(10);
  const [editableEmail, setEditableEmail] = useState(email);
  const [mobileNumber, setMobileNumber] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [motoristVehicles, setMotoristVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoadedFor, setVehiclesLoadedFor] = useState<string | null>(null);
  const [addVehicleVisible, setAddVehicleVisible] = useState(false);
  const [vehicleType, setVehicleType] = useState<'car' | 'motorcycle'>('motorcycle');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [logoutConfirmationVisible, setLogoutConfirmationVisible] =
    useState(false);
  const avatarRequestId = useRef(0);
  const vehiclesLoading = Boolean(session?.user.id) && vehiclesLoadedFor !== session?.user.id;

  useEffect(() => {
    void SecureStore.getItemAsync(MOTORIST_RADIUS_KEY).then((storedRadius) => {
      const parsedRadius = Number(storedRadius);
      if ([5, 10, 15].includes(parsedRadius)) setSearchRadius(parsedRadius);
    });
  }, []);

  const updateSearchRadius = async (radius: number) => {
    setSearchRadius(radius);
    await SecureStore.setItemAsync(MOTORIST_RADIUS_KEY, String(radius));
  };

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

  useEffect(() => {
    if (!session?.user.id) return;
    let active = true;
    void supabase
      .from('profiles')
      .select('avatar_path')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!active || !data?.avatar_path) return;
        const { data: signed } = await supabase.storage
          .from('mechanic-avatars')
          .createSignedUrl(data.avatar_path, 60 * 60);
        if (active && signed?.signedUrl) setAvatarUrl(signed.signedUrl);
      });
    return () => {
      active = false;
    };
  }, [session?.user.id]);

  const saveVehicle = async () => {
    if (motoristVehicles.length >= 2) {
      Alert.alert('Vehicle limit reached', 'You can add up to 2 vehicles only.');
      return;
    }
    if (!session?.user.id || !vehicleMake.trim() || !vehicleModel.trim() || !vehicleYear.trim() || !vehiclePlate.trim()) {
      Alert.alert('Missing Details', 'Please fill out all vehicle fields.');
      return;
    }
    setSavingVehicle(true);
    const { data, error } = await supabase
      .from('vehicles')
      .insert({
        motorist_id: session.user.id,
        type: vehicleType,
        make: vehicleMake.trim(),
        model: vehicleModel.trim(),
        year: vehicleYear.trim(),
        plate_number: vehiclePlate.trim().toUpperCase(),
        is_primary: motoristVehicles.length === 0,
      })
      .select('*')
      .single();
    setSavingVehicle(false);
    if (error) {
      Alert.alert('Unable to add vehicle', error.message);
      return;
    }
    if (data) setMotoristVehicles((current) => [...current, data as Vehicle]);
    setVehicleMake('');
    setVehicleModel('');
    setVehicleYear('');
    setVehiclePlate('');
    setAddVehicleVisible(false);
  };

  const makePrimaryVehicle = async (vehicle: Vehicle) => {
    if (!session?.user.id || vehicle.is_primary) return;
    const { error } = await setPrimaryVehicle(session.user.id, vehicle.id);
    if (error) {
      Alert.alert('Unable to set primary vehicle', error);
      return;
    }
    setMotoristVehicles((current) =>
      current.map((item) => ({ ...item, is_primary: item.id === vehicle.id })),
    );
  };

  const openAddVehicleForm = () => {
    if (motoristVehicles.length >= 2) {
      Alert.alert('Vehicle limit reached', 'You can add up to 2 vehicles only.');
      return;
    }
    setAddVehicleVisible(true);
  };

  const confirmDeleteVehicle = (vehicle: Vehicle) => {
    Alert.alert(
      'Delete vehicle',
      `Are you sure you want to delete ${vehicle.make} ${vehicle.model}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const { error } = await supabase.from('vehicles').delete().eq('id', vehicle.id);
              if (error) {
                Alert.alert('Unable to delete vehicle', error.message);
                return;
              }
              const remainingVehicles = motoristVehicles.filter((item) => item.id !== vehicle.id);
              if (vehicle.is_primary && remainingVehicles[0] && session?.user.id) {
                const primaryResult = await setPrimaryVehicle(
                  session.user.id,
                  remainingVehicles[0].id,
                );
                if (primaryResult.error) {
                  Alert.alert('Unable to update primary vehicle', primaryResult.error);
                  return;
                }
                remainingVehicles[0] = { ...remainingVehicles[0], is_primary: true };
              }
              setMotoristVehicles(
                remainingVehicles.map((item) => ({
                  ...item,
                  is_primary: item.id === remainingVehicles[0]?.id
                    ? remainingVehicles[0].is_primary
                    : item.is_primary,
                })),
              );
            })();
          },
        },
      ],
    );
  };

  useEffect(() => {
    let active = true;
    if (!session?.user.id) {
      return () => {
        active = false;
      };
    }
    void listVehicles(session.user.id).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        Alert.alert('Unable to load garage', error);
        setMotoristVehicles([]);
      } else {
        setMotoristVehicles(data);
      }
      setVehiclesLoadedFor(session.user.id);
    });
    return () => {
      active = false;
    };
  }, [session?.user.id]);

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

    const previousAvatarUrl = avatarUrl;
    setUploadingAvatar(true);
    const requestId = ++avatarRequestId.current;
    try {
      const converted = await ImageManipulator.manipulateAsync(result.assets[0].uri, [], {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      setAvatarUrl(converted.uri);
      publishSharedAvatarUrl(converted.uri);
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
      await Image.prefetch(cacheBustedUrl);
      if (requestId === avatarRequestId.current) {
        setAvatarUrl(cacheBustedUrl);
      }
    } catch (error) {
      if (requestId === avatarRequestId.current) {
        setAvatarUrl(previousAvatarUrl);
        publishSharedAvatarUrl(previousAvatarUrl);
      }
      Alert.alert('Profile photo failed', error instanceof Error ? error.message : 'Could not save the photo.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  function chooseAvatar() {
    setAvatarPickerVisible(true);
  }

  const handleLogout = () => {
    setLogoutConfirmationVisible(true);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      
      <MotoristHomeHeader />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.avatar, { backgroundColor: '#FFF1D6', borderColor: '#F0A202' }]}
            onPress={chooseAvatar}
            disabled={uploadingAvatar}
          >
            <ProfileAvatar
              uri={avatarUrl}
              name={fullName}
              size={84}
              backgroundColor="#FFF1D6"
              borderColor="#F0A202"
            />
            <View style={[styles.cameraBadge, { backgroundColor: colors.primary }]}>
              <Ionicons name="camera-outline" size={14} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <View style={styles.profileInfo}>
            <View style={styles.profileNameRow}>
              <Text style={[styles.name, { color: colors.text }]}>{fullName}</Text>
              <TouchableOpacity
                onPress={() => setSettingsVisible(true)}
                style={styles.settingsButton}
                accessibilityLabel="Open settings and preferences"
              >
                <Ionicons name="settings-outline" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.meta, { color: colors.textMuted }]}>{mobileNumber || '09232124501'}</Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>{email}</Text>
          </View>
          <View style={styles.editProfileContainer}>
            <TouchableOpacity
              onPress={() => {
                setEditableEmail(email);
                setAccountDetailsVisible(true);
              }}
              style={[styles.editProfileButton, { backgroundColor: colors.card }]}
            >
              <Text style={styles.editProfileText}>Edit Profile</Text>
              <Ionicons name="chevron-forward" size={16} color="#0037B0" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.garageHeader}>
          <View style={styles.garageTitleRow}>
            <Ionicons name="home-outline" size={18} color={colors.primary} />
            <Text style={[styles.garageTitle, { color: colors.text }]}>My Garage</Text>
          </View>
          <TouchableOpacity
            onPress={openAddVehicleForm}
            style={[styles.addVehicleButton, { backgroundColor: '#0037B0' }]}
          >
            <Ionicons name="add-circle-outline" size={16} color="#FFFFFF" />
            <Text style={styles.addVehicleText}>Add Vehicle</Text>
          </TouchableOpacity>
        </View>

        {vehiclesLoading ? (
          <View style={[styles.emptyVehicleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : motoristVehicles.length ? motoristVehicles.map((vehicle) => (
          <View
            key={vehicle.id}
            style={[styles.vehicleCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.vehicleIconBox}>
              <Image
                source={vehicle.type === 'car' ? carIcon : motorcycleIcon}
                resizeMode="contain"
                style={styles.vehicleIconImage}
              />
            </View>
            <View style={styles.vehicleCardCopy}>
              <Text style={[styles.vehicleName, { color: colors.text }]}>
                {vehicle.make} {vehicle.model}
              </Text>
              <Text style={[styles.vehiclePlate, { color: colors.textMuted }]}>
                {vehicle.year}  •  Plate: {vehicle.plate_number}
              </Text>
              <TouchableOpacity
                onPress={() => void makePrimaryVehicle(vehicle)}
                style={[
                  styles.primaryVehicleButton,
                  {
                    backgroundColor: vehicle.is_primary ? '#E8ECFF' : colors.card,
                    borderColor: vehicle.is_primary ? '#0037B0' : colors.border,
                  },
                ]}
                disabled={vehicle.is_primary}
              >
                <Ionicons
                  name={vehicle.is_primary ? 'checkmark-circle' : 'radio-button-off-outline'}
                  size={15}
                  color="#0037B0"
                />
                <Text style={[styles.primaryVehicleText, { color: '#0037B0' }]}>
                  {vehicle.is_primary ? 'Primary vehicle' : 'Set as primary'}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => confirmDeleteVehicle(vehicle)}
              style={styles.deleteVehicleButton}
              accessibilityLabel={`Delete ${vehicle.make} ${vehicle.model}`}
            >
              <Image source={trashBinIcon} resizeMode="contain" style={styles.deleteVehicleIcon} />
            </TouchableOpacity>
          </View>
        )        ) : (
          <TouchableOpacity
            onPress={openAddVehicleForm}
            style={[styles.emptyVehicleCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Image source={carIcon} resizeMode="contain" style={styles.vehicleIconImage} />
            <Text style={[styles.emptyVehicleText, { color: colors.textMuted }]}>
              No vehicles added yet
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={handleLogout} style={[styles.logoutButton, { backgroundColor: '#FFF0F3' }]}>
          <Ionicons name="log-out-outline" size={18} color="#D92D20" />
          <Text style={styles.logoutButtonText}>Log Out of Mechanic Ko</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={logoutConfirmationVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutConfirmationVisible(false)}
      >
        <View style={styles.logoutModalOverlay}>
          <View style={[styles.logoutModalCard, { backgroundColor: colors.card }]}>
            <View style={styles.logoutModalIcon}>
              <Ionicons name="log-out-outline" size={28} color="#D92D20" />
            </View>
            <Text style={[styles.logoutModalTitle, { color: colors.text }]}>
              Log out of Mechaniko?
            </Text>
            <Text
              style={[styles.logoutModalMessage, { color: colors.textMuted }]}
            >
              You will need to sign in again to access your account.
            </Text>
            <View style={styles.logoutModalActions}>
              <TouchableOpacity
                style={[styles.logoutModalCancel, { borderColor: colors.border }]}
                onPress={() => setLogoutConfirmationVisible(false)}
              >
                <Text style={[styles.logoutModalCancelText, { color: colors.text }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.logoutModalConfirm}
                onPress={() => {
                  setLogoutConfirmationVisible(false);
                  void signOut();
                }}
              >
                <Text style={styles.logoutModalConfirmText}>Log Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={avatarPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAvatarPickerVisible(false)}
      >
        <View style={styles.avatarPickerOverlay}>
          <View style={[styles.avatarPickerCard, { backgroundColor: colors.card }]}>
            <View style={styles.avatarPickerHandle} />
            <Text style={[styles.avatarPickerTitle, { color: colors.text }]}>Update Profile Photo</Text>
            <Text style={[styles.avatarPickerSubtitle, { color: colors.textMuted }]}>
              Choose where you want to get your profile photo.
            </Text>
            <View style={styles.avatarPickerOptions}>
              <TouchableOpacity
                style={[styles.avatarPickerOption, { backgroundColor: colors.bg, borderColor: colors.border }]}
                onPress={() => {
                  setAvatarPickerVisible(false);
                  void changeAvatar('camera');
                }}
              >
                <View style={[styles.avatarPickerIcon, { backgroundColor: '#E8ECFF' }]}>
                  <Ionicons name="camera-outline" size={25} color="#0037B0" />
                </View>
                <View style={styles.avatarPickerCopy}>
                  <Text style={[styles.avatarPickerOptionTitle, { color: colors.text }]}>Take a photo</Text>
                  <Text style={[styles.avatarPickerOptionText, { color: colors.textMuted }]}>Use your camera</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#0037B0" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.avatarPickerOption, { backgroundColor: colors.bg, borderColor: colors.border }]}
                onPress={() => {
                  setAvatarPickerVisible(false);
                  void changeAvatar('gallery');
                }}
              >
                <View style={[styles.avatarPickerIcon, { backgroundColor: '#E8ECFF' }]}>
                  <Ionicons name="images-outline" size={25} color="#0037B0" />
                </View>
                <View style={styles.avatarPickerCopy}>
                  <Text style={[styles.avatarPickerOptionTitle, { color: colors.text }]}>Choose from gallery</Text>
                  <Text style={[styles.avatarPickerOptionText, { color: colors.textMuted }]}>Select an existing photo</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#0037B0" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.avatarPickerCancel, { borderColor: colors.border }]}
              onPress={() => setAvatarPickerVisible(false)}
            >
              <Text style={[styles.avatarPickerCancelText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={addVehicleVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAddVehicleVisible(false)}
      >
        <View style={[styles.detailScreen, { backgroundColor: colors.bg }]}>
          <View style={[styles.detailHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Text style={[styles.detailTitle, { color: colors.text }]}>Add Vehicle</Text>
            <TouchableOpacity onPress={() => setAddVehicleVisible(false)} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.addVehicleForm}>
            <View style={styles.vehicleTypeRow}>
              {(['motorcycle', 'car'] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => setVehicleType(type)}
                  style={[
                    styles.vehicleTypeButton,
                    { backgroundColor: vehicleType === type ? '#0037B0' : colors.card, borderColor: vehicleType === type ? '#0037B0' : colors.border },
                  ]}
                >
                  <Image
                    source={type === 'car' ? carIcon : motorcycleIcon}
                    resizeMode="contain"
                    style={[
                      styles.vehicleTypeIcon,
                      { opacity: vehicleType === type ? 1 : 0.7 },
                    ]}
                  />
                  <Text style={{ color: vehicleType === type ? '#FFFFFF' : colors.text, fontWeight: '700' }}>
                    {type === 'car' ? 'Car' : 'Motorcycle'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={[styles.vehicleInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]} placeholder="Make (e.g. Yamaha)" placeholderTextColor={colors.textMuted} value={vehicleMake} onChangeText={setVehicleMake} />
            <TextInput style={[styles.vehicleInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]} placeholder="Model (e.g. NMAX)" placeholderTextColor={colors.textMuted} value={vehicleModel} onChangeText={setVehicleModel} />
            <TextInput style={[styles.vehicleInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]} placeholder="Year" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={vehicleYear} onChangeText={setVehicleYear} />
            <TextInput style={[styles.vehicleInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]} placeholder="Plate number" placeholderTextColor={colors.textMuted} autoCapitalize="characters" value={vehiclePlate} onChangeText={setVehiclePlate} />
            <TouchableOpacity onPress={() => void saveVehicle()} disabled={savingVehicle} style={[styles.saveVehicleButton, savingVehicle && styles.disabled]}>
              {savingVehicle ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveVehicleText}>Save Vehicle</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={settingsVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <View style={[styles.detailScreen, { backgroundColor: colors.bg }]}>
          <View style={[styles.detailHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Text style={[styles.detailTitle, { color: colors.text }]}>Settings & Preferences</Text>
            <TouchableOpacity onPress={() => setSettingsVisible(false)} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={[styles.settingsPanel, { backgroundColor: colors.card }]}>
            <TouchableOpacity
              style={[styles.settingsRow, { borderBottomColor: colors.border }]}
              onPress={() => {
                setSettingsVisible(false);
                router.push('/payment-methods');
              }}
            >
              <Ionicons name="card-outline" size={21} color="#0037B0" style={styles.settingsRowIcon} />
              <View style={styles.settingsRowCopy}>
                <Text style={[styles.settingsRowText, { color: colors.text }]}>Payment Method</Text>
              </View>
              <Ionicons name="chevron-forward" size={19} color="#0037B0" />
            </TouchableOpacity>
            <View style={styles.settingsRow}>
              <Ionicons name="moon-outline" size={21} color="#0037B0" style={styles.settingsRowIcon} />
              <View style={styles.settingsRowCopy}>
                <Text style={[styles.settingsRowText, { color: colors.text }]}>Dark Mode</Text>
              </View>
              <Switch
                value={isDarkMode}
                onValueChange={toggleTheme}
                trackColor={{ false: '#D0D5DD', true: '#0037B0' }}
                thumbColor="#FFFFFF"
              />
            </View>
            <View style={[styles.settingsRow, styles.radiusSettingsRow, { borderBottomColor: colors.border }]}>
              <Ionicons name="radio-outline" size={21} color="#0037B0" style={styles.settingsRowIcon} />
              <View style={styles.settingsRowCopy}>
                <Text style={[styles.settingsRowText, { color: colors.text }]}>Mechanic Search Radius</Text>
                <Text style={[styles.settingsRowHint, { color: colors.textMuted }]}>
                  Show mechanics within {searchRadius} km
                </Text>
                <View style={styles.radiusOptions}>
                  {[5, 10, 15].map((radius) => (
                    <TouchableOpacity
                      key={radius}
                      style={[
                        styles.radiusOption,
                        { borderColor: colors.border },
                        searchRadius === radius && styles.radiusOptionSelected,
                      ]}
                      onPress={() => void updateSearchRadius(radius)}
                    >
                      <Text
                        style={[
                          styles.radiusOptionText,
                          { color: searchRadius === radius ? "#FFFFFF" : colors.text },
                        ]}
                      >
                        {radius} km
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>

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
          </ScrollView>
        </View>
      </Modal>
    </View>
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  card: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', padding: 14, borderRadius: 14, marginBottom: 18 },
  profileInfo: { flex: 1, position: 'relative' },
  avatar: { width: 82, height: 82, borderRadius: 41, alignItems: 'center', justifyContent: 'center', marginRight: 14, borderWidth: 2, overflow: 'visible' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 42 },
  avatarInitials: { fontSize: 30, fontWeight: '800' },
  cameraBadge: { position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarPickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.52)' },
  avatarPickerCard: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
  avatarPickerHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: '#C7CBD4', alignSelf: 'center', marginBottom: 18 },
  avatarPickerTitle: { fontSize: 21, fontWeight: '800', textAlign: 'center' },
  avatarPickerSubtitle: { fontSize: 13, textAlign: 'center', marginTop: 6, marginBottom: 20 },
  avatarPickerOptions: { gap: 10 },
  avatarPickerOption: { minHeight: 72, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 },
  avatarPickerIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarPickerCopy: { flex: 1, marginLeft: 12 },
  avatarPickerOptionTitle: { fontSize: 15, fontWeight: '800' },
  avatarPickerOptionText: { fontSize: 12, marginTop: 3 },
  avatarPickerCancel: { minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  avatarPickerCancelText: { fontSize: 14, fontWeight: '800' },
  profileNameRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingsButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  editProfileContainer: { width: '100%', minHeight: 46, justifyContent: 'center', paddingHorizontal: 8, backgroundColor: '#EEF0FF', borderRadius: 8, marginTop: 10 },
  editProfileButton: { alignSelf: 'flex-start', minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 12, borderRadius: 8 },
  editProfileText: { color: '#0037B0', fontSize: 13, fontWeight: '800' },
  name: { fontSize: 21, fontWeight: '800' },
  meta: { fontSize: 13, marginTop: 2 },
  status: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '800', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 10 },
  menuGroup: { marginBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1 },
  iconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255, 107, 0, 0.08)', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  settingIconImage: { width: 26, height: 26, resizeMode: 'contain' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSubtitle: { fontSize: 12, marginTop: 2 },
  garageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  garageTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  garageTitle: { fontSize: 20, fontWeight: '800' },
  addVehicleButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 15, borderRadius: 9 },
  addVehicleText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  vehicleCard: { minHeight: 96, flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  vehicleIconBox: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF0FF' },
  vehicleIconImage: { width: 29, height: 29 },
  vehicleCardCopy: { flex: 1, marginLeft: 14 },
  vehicleName: { fontSize: 16, fontWeight: '800' },
  vehiclePlate: { fontSize: 11, marginTop: 4 },
  primaryVehicleButton: { alignSelf: 'flex-start', minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, paddingHorizontal: 8, borderRadius: 7, borderWidth: 1 },
  primaryVehicleText: { fontSize: 11, fontWeight: '800' },
  deleteVehicleButton: { width: 40, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8ECFF', marginLeft: 8 },
  deleteVehicleIcon: { width: 22, height: 22 },
  emptyVehicleCard: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  emptyVehicleText: { fontSize: 13, fontWeight: '600' },
  systemLabel: { fontSize: 11, fontWeight: '700', marginBottom: 10 },
  systemCard: { overflow: 'hidden', borderRadius: 12, marginBottom: 22 },
  systemRow: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, borderBottomWidth: 1 },
  systemIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF1E5' },
  systemCopy: { flex: 1 },
  systemTitle: { fontSize: 15, fontWeight: '800' },
  systemSubtitle: { fontSize: 12, marginTop: 5 },
  logoutModalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(15, 23, 42, 0.48)' },
  logoutModalCard: { width: '100%', maxWidth: 380, borderRadius: 22, padding: 26, alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  logoutModalIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0F3', marginBottom: 14 },
  logoutModalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  logoutModalMessage: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 22 },
  logoutModalActions: { width: '100%', flexDirection: 'row', gap: 10 },
  logoutModalCancel: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  logoutModalCancelText: { fontSize: 14, fontWeight: '800' },
  logoutModalConfirm: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: '#D92D20' },
  logoutModalConfirmText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  logoutButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, marginTop: 8 },
  logoutButtonText: { color: '#D92D20', fontSize: 14, fontWeight: '800' },
  settingsPanel: { marginTop: 32, borderRadius: 10, overflow: 'hidden' },
  settingsRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 0, paddingHorizontal: 20, borderBottomWidth: 1 },
  settingsRowIcon: { width: 28, height: 28, marginRight: 16, textAlign: 'center' },
  settingsRowCopy: { flex: 1, minHeight: 28, justifyContent: 'center' },
  settingsRowText: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  settingsRowHint: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  radiusSettingsRow: { alignItems: 'flex-start', paddingVertical: 16 },
  radiusOptions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  radiusOption: { minWidth: 58, minHeight: 34, paddingHorizontal: 10, borderWidth: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  radiusOptionSelected: { backgroundColor: '#0037B0', borderColor: '#0037B0' },
  radiusOptionText: { fontSize: 12, fontWeight: '800' },
  settingsRowSubtitle: { fontSize: 12, marginTop: 2 },
  addVehicleForm: { padding: 20, gap: 14 },
  vehicleTypeRow: { flexDirection: 'row', gap: 10 },
  vehicleTypeButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderRadius: 9 },
  vehicleTypeIcon: { width: 23, height: 23 },
  vehicleInput: { minHeight: 48, borderWidth: 1, borderRadius: 9, paddingHorizontal: 14, fontSize: 15 },
  saveVehicleButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#0037B0' },
  saveVehicleText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.6 },
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