import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import { MotoristHomeHeader } from '@/components/MotoristHomeHeader';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import {
  getSharedAvatarUrl,
  publishSharedAvatarUrl,
  subscribeToSharedAvatar,
} from '@/lib/avatarStore';
import { listVehicles, setPrimaryVehicle } from '@/services/vehicleService';
import type { Vehicle } from '@/types/vehicle';
import { normalizeText } from '@/lib/typography';
import { isValidPlateNumber, sanitizePlateNumber } from '@/lib/plateNumber';

const motorcycleIcon = require('../../assets/images/motorcycle.png');
const carIcon = require('../../assets/images/car.png');
const trashBinIcon = require('../../assets/images/trash-bin.png');
const MOTORIST_RADIUS_KEY = 'motorist_search_radius_km';

export default function MotoristProfileScreen() {
  const router = useRouter();
  const { setupVehicle, openSettings } = useLocalSearchParams<{
    setupVehicle?: string;
    openSettings?: string;
  }>();
  const { session, signOut } = useAuth();
  const { colors, isDarkMode } = useAppTheme();

  const email = session?.user.email ?? 'motorist@example.com';
  const fullName = typeof session?.user.user_metadata?.full_name === 'string'
    ? session.user.user_metadata.full_name
    : email.split('@')[0];
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    () =>
      getSharedAvatarUrl() ||
      (typeof session?.user.user_metadata?.avatar_url === 'string'
        ? session.user.user_metadata.avatar_url
        : null),
  );
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(null);
  const [avatarUploadSuccess, setAvatarUploadSuccess] = useState(false);
  const [avatarPickerVisible, setAvatarPickerVisible] = useState(false);
  const [accountDetailsVisible, setAccountDetailsVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(openSettings === '1');
  const [searchRadius, setSearchRadius] = useState(10);
  const [editableEmail, setEditableEmail] = useState(email);
  const [mobileNumber, setMobileNumber] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [accountDetailsSuccessVisible, setAccountDetailsSuccessVisible] =
    useState(false);
  const [accountDetailsSuccessMessage, setAccountDetailsSuccessMessage] =
    useState('');
  const [motoristVehicles, setMotoristVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoadedFor, setVehiclesLoadedFor] = useState<string | null>(null);
  const [addVehicleVisible, setAddVehicleVisible] = useState(false);
  const [vehicleType, setVehicleType] = useState<'car' | 'motorcycle'>('motorcycle');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [vehiclePromptDismissed, setVehiclePromptDismissed] = useState(false);
  const [vehicleLimitVisible, setVehicleLimitVisible] = useState(false);
  const [logoutConfirmationVisible, setLogoutConfirmationVisible] =
    useState(false);
  const avatarRequestId = useRef(0);
  const avatarSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vehiclesLoading = Boolean(session?.user.id) && vehiclesLoadedFor !== session?.user.id;
  const shouldPromptVehicle =
    setupVehicle === '1' &&
    Boolean(session?.user.id) &&
    vehiclesLoadedFor === session?.user.id &&
    motoristVehicles.length === 0 &&
    !vehiclePromptDismissed;

  useEffect(
    () => () => {
      if (avatarSuccessTimer.current) clearTimeout(avatarSuccessTimer.current);
    },
    [],
  );

  useEffect(() => subscribeToSharedAvatar(setAvatarUrl), []);

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
    if (!session?.user.id) return;
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
    const requestId = ++avatarRequestId.current;
    void supabase
      .from('profiles')
      .select('avatar_path')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.warn('Motorist avatar load failed:', error.message);
          return;
        }
        if (!active || requestId !== avatarRequestId.current || !data?.avatar_path) return;
        const { data: avatar } = supabase.storage
          .from('mechanic-avatars')
          .getPublicUrl(data.avatar_path);
        setAvatarUrl(avatar.publicUrl);
        publishSharedAvatarUrl(avatar.publicUrl);
      });
    return () => {
      active = false;
    };
  }, [session?.user.id]);

  const saveVehicle = async () => {
    if (motoristVehicles.length >= 2) {
      setVehicleLimitVisible(true);
      return;
    }
    if (!session?.user.id || !vehicleMake.trim() || !vehicleModel.trim() || !vehicleYear.trim() || !vehiclePlate.trim()) {
      Alert.alert('Missing Details', 'Please fill out all vehicle fields.');
      return;
    }
    const plateNumber = sanitizePlateNumber(vehiclePlate).trim();
    if (!isValidPlateNumber(plateNumber)) {
      Alert.alert(
        'Invalid Plate Number',
        'Use up to 7 letters or numbers, with at most one space.',
      );
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
        plate_number: plateNumber,
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
      setVehicleLimitVisible(true);
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
      setAccountDetailsSuccessMessage(
        'Your details have been saved. Please check your email to confirm the new email address.',
      );
    } else {
      setAccountDetailsSuccessMessage(
        'Your account details have been updated successfully.',
      );
    }
    setSavingDetails(false);
    setAccountDetailsSuccessVisible(true);
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
    setAvatarUploadSuccess(false);
    if (avatarSuccessTimer.current) clearTimeout(avatarSuccessTimer.current);
    const requestId = ++avatarRequestId.current;
    try {
      const converted = await ImageManipulator.manipulateAsync(result.assets[0].uri, [], {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      if (requestId === avatarRequestId.current) {
        setAvatarPreviewUri(converted.uri);
        setAvatarUrl(converted.uri);
      }
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
      const { data: avatar } = supabase.storage
        .from('mechanic-avatars')
        .getPublicUrl(path);
      const cacheBustedUrl = `${avatar.publicUrl}?v=${Date.now()}`;
      const avatarReady = await Image.prefetch(cacheBustedUrl).catch((error) => {
        console.warn(
          'Uploaded motorist avatar could not be preloaded:',
          error instanceof Error ? error.message : error,
        );
        return false;
      });
      if (requestId === avatarRequestId.current) {
        setAvatarUrl(cacheBustedUrl);
        publishSharedAvatarUrl(cacheBustedUrl);
        setAvatarPreviewUri(null);
        setAvatarUploadSuccess(true);
        avatarSuccessTimer.current = setTimeout(() => {
          setAvatarUploadSuccess(false);
          avatarSuccessTimer.current = null;
        }, 2500);
      }
      if (!avatarReady) {
        console.warn('Motorist avatar will load from storage without a cached preview.');
      }
    } catch (error) {
      if (requestId === avatarRequestId.current) {
        setAvatarUrl(previousAvatarUrl);
        setAvatarPreviewUri(null);
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
  }

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
            {avatarPreviewUri ? (
              <ProfileAvatar
                uri={avatarPreviewUri}
                name={fullName}
                size={80}
                backgroundColor="#FFF1D6"
              />
            ) : (
              <ProfileAvatar
                uri={avatarUrl}
                name={fullName}
                size={80}
                backgroundColor="#FFF1D6"
              />
            )}
            {uploadingAvatar ? (
              <View style={styles.avatarUploadingOverlay} pointerEvents="none">
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.avatarUploadingText}>Uploading</Text>
              </View>
            ) : null}
            <View style={[styles.cameraBadge, { backgroundColor: colors.primary }]}>
              <Ionicons name="camera-outline" size={16} color="#FFFFFF" />
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
                <Ionicons name="settings-outline" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {mobileNumber || 'Phone number not added'}
            </Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>{email}</Text>
          </View>
          <View style={[styles.editProfileContainer, { backgroundColor: colors.softCard }]}>
            <TouchableOpacity
              onPress={() => {
                setEditableEmail(email);
                setAccountDetailsVisible(true);
              }}
              style={[styles.editProfileButton, { backgroundColor: colors.card }]}
            >
              <Text style={[styles.editProfileText, { color: colors.primary }]}>Edit Profile</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.garageHeader}>
          <View style={styles.garageTitleRow}>
            <Ionicons name="home-outline" size={20} color={colors.primary} />
            <Text style={[styles.garageTitle, { color: colors.text }]}>My Garage</Text>
          </View>
          <TouchableOpacity
            onPress={openAddVehicleForm}
            style={[styles.addVehicleButton, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
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
                style={[styles.vehicleIconImage, { tintColor: colors.primary }]} 
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
                    backgroundColor: vehicle.is_primary ? colors.softCard : colors.card,
                    borderColor: vehicle.is_primary ? colors.primary : colors.border,
                  },
                ]}
                disabled={vehicle.is_primary}
              >
                <Ionicons
                  name={vehicle.is_primary ? 'checkmark-circle' : 'radio-button-off-outline'}
                  size={16}
                  color={colors.primary}
                />
                <Text style={[styles.primaryVehicleText, { color: colors.primary }]}>
                  {vehicle.is_primary ? 'Primary vehicle' : 'Set as primary'}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => confirmDeleteVehicle(vehicle)}
              style={[styles.deleteVehicleButton, { backgroundColor: colors.btnSecondary }]}
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
            <Image source={carIcon} resizeMode="contain" style={[styles.vehicleIconImage, { tintColor: colors.textMuted }]} />
            <Text style={[styles.emptyVehicleText, { color: colors.textMuted }]}>
              No vehicles added yet
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={handleLogout} style={[styles.logoutButton, { backgroundColor: colors.btnSecondary }]}>
          <Ionicons name="log-out-outline" size={20} color="#D92D20" />
          <Text style={styles.logoutButtonText}>Log Out of Mechanic Ko</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={vehicleLimitVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setVehicleLimitVisible(false)}
      >
        <View style={styles.vehicleLimitOverlay}>
          <View style={[styles.vehicleLimitCard, { backgroundColor: colors.card }]}>
            <View style={[styles.vehicleLimitIcon, { backgroundColor: colors.softCard }]}>
              <Ionicons name="car-outline" size={30} color={colors.primary} />
            </View>
            <Text style={[styles.vehicleLimitTitle, { color: colors.text }]}>
              Vehicle limit reached
            </Text>
            <Text style={[styles.vehicleLimitMessage, { color: colors.textMuted }]}>
              Your garage can hold up to two vehicles. Remove an existing vehicle
              before adding a new one.
            </Text>
            <View style={[styles.vehicleLimitProgressTrack, { backgroundColor: colors.border }]}>
              <View style={styles.vehicleLimitProgressFill} />
            </View>
            <View style={styles.vehicleLimitProgressLabels}>
              <Text style={[styles.vehicleLimitProgressText, { color: colors.textMuted }]}>
                Garage capacity
              </Text>
              <Text style={[styles.vehicleLimitProgressValue, { color: colors.primary }]}>2 / 2</Text>
            </View>
            <TouchableOpacity
              style={[styles.vehicleLimitButton, { backgroundColor: colors.primary }]}
              onPress={() => setVehicleLimitVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.vehicleLimitButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={avatarUploadSuccess}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarUploadSuccess(false)}
      >
        <View style={[styles.avatarSuccessOverlay, { backgroundColor: colors.overlay }]}>
          <View
            accessibilityRole="alert"
            style={[styles.avatarSuccessCard, { backgroundColor: colors.card }]}
          >
            <View style={styles.avatarSuccessIcon}>
              <Ionicons name="checkmark" size={30} color="#FFFFFF" />
            </View>
            <Text style={styles.avatarSuccessTitle}>
              Uploaded successfully
            </Text>
            <Text style={[styles.avatarSuccessMessage, { color: colors.textMuted }]}>
              Your profile photo has been updated.
            </Text>
          </View>
        </View>
      </Modal>

      <Modal
        visible={logoutConfirmationVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutConfirmationVisible(false)}
      >
        <View style={styles.logoutModalOverlay}>
          <View style={[styles.logoutModalCard, { backgroundColor: colors.card }]}>
            <View style={[styles.logoutModalIcon, { backgroundColor: colors.btnSecondary }]}>
              <Ionicons name="log-out-outline" size={30} color="#D92D20" />
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
        <View style={[styles.avatarPickerOverlay, { backgroundColor: colors.overlay }]}>
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
                <View style={[styles.avatarPickerIcon, { backgroundColor: colors.softCard }]}>
                  <Ionicons name="camera-outline" size={26} color={colors.primary} />
                </View>
                <View style={styles.avatarPickerCopy}>
                  <Text style={[styles.avatarPickerOptionTitle, { color: colors.text }]}>Take a photo</Text>
                  <Text style={[styles.avatarPickerOptionText, { color: colors.textMuted }]}>Use your camera</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.avatarPickerOption, { backgroundColor: colors.bg, borderColor: colors.border }]}
                onPress={() => {
                  setAvatarPickerVisible(false);
                  void changeAvatar('gallery');
                }}
              >
                <View style={[styles.avatarPickerIcon, { backgroundColor: colors.softCard }]}>
                  <Ionicons name="images-outline" size={26} color={colors.primary} />
                </View>
                <View style={styles.avatarPickerCopy}>
                  <Text style={[styles.avatarPickerOptionTitle, { color: colors.text }]}>Choose from gallery</Text>
                  <Text style={[styles.avatarPickerOptionText, { color: colors.textMuted }]}>Select an existing photo</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={colors.primary} />
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
        visible={addVehicleVisible || shouldPromptVehicle}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setAddVehicleVisible(false);
          setVehiclePromptDismissed(true);
        }}
      >
        <SafeAreaView style={[styles.detailScreen, { backgroundColor: colors.bg }]}>
          <View style={[styles.detailHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Text style={[styles.detailTitle, { color: colors.text }]}>Add Vehicle</Text>
            <TouchableOpacity
              onPress={() => {
                setAddVehicleVisible(false);
                setVehiclePromptDismissed(true);
              }}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={26} color={colors.text} />
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
                    { backgroundColor: vehicleType === type ? colors.primary : colors.card, borderColor: vehicleType === type ? colors.primary : colors.border },
                  ]}
                >
                  <Image
                    source={type === 'car' ? carIcon : motorcycleIcon}
                    resizeMode="contain"
                    style={[
                      styles.vehicleTypeIcon,
                      { opacity: vehicleType === type ? 1 : 0.7, tintColor: vehicleType === type ? '#FFFFFF' : colors.primary },
                    ]}
                  />
                  <Text style={{ color: vehicleType === type ? '#FFFFFF' : colors.text, fontWeight: '700', fontSize: normalizeText(15) }}>
                    {type === 'car' ? 'Car' : 'Motorcycle'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={[styles.vehicleInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]} placeholder="Make (e.g. Yamaha)" placeholderTextColor={colors.textMuted} value={vehicleMake} onChangeText={setVehicleMake} />
            <TextInput style={[styles.vehicleInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]} placeholder="Model (e.g. NMAX)" placeholderTextColor={colors.textMuted} value={vehicleModel} onChangeText={setVehicleModel} />
            <TextInput style={[styles.vehicleInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]} placeholder="Year" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={vehicleYear} onChangeText={setVehicleYear} />
            <TextInput style={[styles.vehicleInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]} placeholder="Plate number" placeholderTextColor={colors.textMuted} autoCapitalize="characters" maxLength={8} value={vehiclePlate} onChangeText={(value) => setVehiclePlate(sanitizePlateNumber(value))} />
            <TouchableOpacity onPress={() => void saveVehicle()} disabled={savingVehicle} style={[styles.saveVehicleButton, savingVehicle && styles.disabled]}>
              {savingVehicle ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveVehicleText}>Save Vehicle</Text>}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {settingsVisible ? (
        <View style={styles.settingsOverlay}>
          <SafeAreaView style={[styles.detailScreen, { backgroundColor: colors.bg }]}>
          <View style={[styles.detailHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => setSettingsVisible(false)}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Back to profile"
            >
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text
              style={[
                styles.detailTitle,
                styles.settingsHeaderTitle,
                { color: colors.text },
              ]}
            >
              Settings & Preferences
            </Text>
            <View style={styles.settingsHeaderSpacer} />
          </View>
          <View style={[styles.settingsPanel, { backgroundColor: colors.card }]}>
            <TouchableOpacity
              style={[styles.settingsRow, { borderBottomColor: colors.border }]}
              onPress={() => {
                router.push('/(app)/payment-methods');
              }}
            >
              <Ionicons name="card-outline" size={24} color={colors.primary} style={styles.settingsRowIcon} />
              <View style={styles.settingsRowCopy}>
                <Text style={[styles.settingsRowText, { color: colors.text }]}>Payment Method</Text>
              </View>
              <Ionicons name="chevron-forward" size={21} color={colors.primary} />
            </TouchableOpacity>
            <View style={styles.settingsRow}>
              <Ionicons name="moon-outline" size={24} color={colors.primary} style={styles.settingsRowIcon} />
              <View style={styles.settingsRowCopy}>
                <Text style={[styles.settingsRowText, { color: colors.text }]}>Dark Mode</Text>
              </View>
              <Switch
                value={isDarkMode}
                disabled
                trackColor={{ false: colors.border, true: colors.border }}
                thumbColor="#FFFFFF"
              />
              <Text style={[styles.settingsRowHint, { color: colors.textMuted }]}>
                Temporarily unavailable
              </Text>
            </View>
            <View style={[styles.settingsRow, styles.radiusSettingsRow, { borderBottomColor: colors.border }]}>
              <Ionicons name="radio-outline" size={24} color={colors.primary} style={styles.settingsRowIcon} />
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
          </SafeAreaView>
        </View>
      ) : null}

      <Modal
        visible={accountDetailsVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setAccountDetailsVisible(false)}
      >
        <SafeAreaView style={[styles.detailScreen, { backgroundColor: colors.bg }]}>
          <View style={[styles.detailHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Text style={[styles.detailTitle, { color: colors.text }]}>Account Details</Text>
            <TouchableOpacity
              onPress={() => setAccountDetailsVisible(false)}
              style={styles.closeButton}
              accessibilityLabel="Close account details"
            >
              <Ionicons name="close" size={26} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.detailsList}
            contentContainerStyle={styles.accountDetailsContent}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={[
                styles.accountProfileCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <ProfileAvatar
                uri={avatarUrl}
                name={fullName}
                size={60}
                backgroundColor={colors.softCard}
              />
              <View style={styles.accountProfileCopy}>
                <Text
                  style={[styles.accountProfileName, { color: colors.text }]}
                  numberOfLines={2}
                >
                  {fullName}
                </Text>
                <View
                  style={[
                    styles.accountTypeBadge,
                    { backgroundColor: colors.softCard },
                  ]}
                >
                  <Ionicons name="car-outline" size={14} color={colors.primary} />
                  <Text style={[styles.accountTypeBadgeText, { color: colors.primary }]}>
                    Motorist account
                  </Text>
                </View>
              </View>
            </View>

            <Text style={[styles.accountSectionLabel, { color: colors.textMuted }]}>
              PERSONAL INFORMATION
            </Text>
            <View
              style={[
                styles.accountInfoCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.accountInfoRow}>
                <View style={[styles.accountInfoIcon, { backgroundColor: colors.softCard }]}>
                  <Ionicons name="person-outline" size={19} color={colors.primary} />
                </View>
                <View style={styles.accountInfoCopy}>
                  <Text style={[styles.accountDetailLabel, { color: colors.textMuted }]}>
                    Full name
                  </Text>
                  <Text style={[styles.accountDetailValue, { color: colors.text }]}>
                    {fullName}
                  </Text>
                </View>
              </View>
              <View style={[styles.accountInfoDivider, { backgroundColor: colors.border }]} />
              <View style={styles.accountInfoRow}>
                <View style={[styles.accountInfoIcon, { backgroundColor: colors.softCard }]}>
                  <Ionicons name="mail-outline" size={19} color={colors.primary} />
                </View>
                <View style={styles.accountInfoCopy}>
                  <Text style={[styles.accountDetailLabel, { color: colors.textMuted }]}>
                    Email address
                  </Text>
                  <TextInput
                    style={[
                      styles.accountDetailInput,
                      { color: colors.text, borderBottomColor: colors.border },
                    ]}
                    value={editableEmail}
                    onChangeText={setEditableEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="Email address"
                  />
                </View>
              </View>
              <View style={[styles.accountInfoDivider, { backgroundColor: colors.border }]} />
              <View style={styles.accountInfoRow}>
                <View style={[styles.accountInfoIcon, { backgroundColor: colors.softCard }]}>
                  <Ionicons name="call-outline" size={19} color={colors.primary} />
                </View>
                <View style={styles.accountInfoCopy}>
                  <Text style={[styles.accountDetailLabel, { color: colors.textMuted }]}>
                    Phone number
                  </Text>
                  <TextInput
                    style={[
                      styles.accountDetailInput,
                      { color: colors.text, borderBottomColor: colors.border },
                    ]}
                    value={mobileNumber}
                    onChangeText={setMobileNumber}
                    keyboardType="phone-pad"
                    placeholder="Enter phone number"
                    placeholderTextColor={colors.textMuted}
                    accessibilityLabel="Phone number"
                  />
                </View>
              </View>
              <View style={[styles.accountInfoDivider, { backgroundColor: colors.border }]} />
              <View style={styles.accountInfoRow}>
                <View style={[styles.accountInfoIcon, { backgroundColor: colors.softCard }]}>
                  <Ionicons name="shield-checkmark-outline" size={19} color={colors.primary} />
                </View>
                <View style={styles.accountInfoCopy}>
                  <Text style={[styles.accountDetailLabel, { color: colors.textMuted }]}>
                    Account type
                  </Text>
                  <Text style={[styles.accountDetailValue, { color: colors.text }]}>
                    Motorist
                  </Text>
                </View>
              </View>
            </View>

            <View
              style={[
                styles.accountPrivacyNote,
                { backgroundColor: colors.softCard },
              ]}
            >
              <Ionicons
                name="information-circle-outline"
                size={19}
                color={colors.primary}
              />
              <Text style={[styles.accountPrivacyText, { color: colors.textMuted }]}>
                Keep your contact details up to date so mechanics can reach you
                about your bookings.
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.saveDetailsButton,
                { backgroundColor: colors.primary },
                savingDetails && styles.disabled,
              ]}
              onPress={() => void saveAccountDetails()}
              disabled={savingDetails}
              accessibilityRole="button"
            >
              {savingDetails ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.saveDetailsText}>Save changes</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={accountDetailsSuccessVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAccountDetailsSuccessVisible(false)}
      >
        <View style={styles.accountSuccessOverlay}>
          <View
            style={[
              styles.accountSuccessCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.accountSuccessIcon}>
              <Ionicons name="checkmark" size={28} color="#FFFFFF" />
            </View>
            <Text style={[styles.accountSuccessTitle, { color: colors.text }]}>
              Changes saved successfully!
            </Text>
            <Text
              style={[
                styles.accountSuccessMessage,
                { color: colors.textMuted },
              ]}
            >
              {accountDetailsSuccessMessage}
            </Text>
            <TouchableOpacity
              style={styles.accountSuccessButton}
              onPress={() => setAccountDetailsSuccessVisible(false)}
              accessibilityRole="button"
            >
              <Text style={styles.accountSuccessButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  settingsOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10, elevation: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: normalizeText(20), fontWeight: '800' },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  card: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', padding: 14, borderRadius: 14, marginBottom: 18 },
  profileInfo: { flex: 1, position: 'relative' },
  avatar: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginRight: 14, borderWidth: 2, overflow: 'visible' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 42 },
  avatarInitials: { fontSize: normalizeText(32), fontWeight: '800' },
  cameraBadge: { position: 'absolute', right: -2, bottom: -2, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarUploadingOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: 40,
    backgroundColor: 'rgba(16, 24, 40, 0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  avatarUploadingText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  avatarSuccessOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  avatarSuccessCard: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    borderRadius: 22,
    padding: 28,
    elevation: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  avatarSuccessIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#27AE60',
    marginBottom: 16,
  },
  avatarSuccessTitle: {
    color: '#27AE60',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  avatarSuccessMessage: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 8,
  },
  avatarPickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.52)' },
  avatarPickerCard: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  avatarPickerHandle: { width: 46, height: 6, borderRadius: 3, backgroundColor: '#C7CBD4', alignSelf: 'center', marginBottom: 20 },
  avatarPickerTitle: { fontSize: normalizeText(23), fontWeight: '800', textAlign: 'center' },
  avatarPickerSubtitle: { fontSize: normalizeText(15), textAlign: 'center', marginTop: 6, marginBottom: 20 },
  avatarPickerOptions: { gap: 10 },
  avatarPickerOption: { minHeight: 76, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  avatarPickerIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarPickerCopy: { flex: 1, marginLeft: 14 },
  avatarPickerOptionTitle: { fontSize: normalizeText(17), fontWeight: '800' },
  avatarPickerOptionText: { fontSize: normalizeText(14), marginTop: 3 },
  avatarPickerCancel: { minHeight: 52, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  avatarPickerCancelText: { fontSize: normalizeText(16), fontWeight: '800' },
  profileNameRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingsButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  editProfileContainer: { width: '100%', minHeight: 48, justifyContent: 'center', paddingHorizontal: 8, backgroundColor: '#EEF0FF', borderRadius: 10, marginTop: 12 },
  editProfileButton: { alignSelf: 'flex-start', minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 14, borderRadius: 8 },
  editProfileText: { color: '#0037B0', fontSize: normalizeText(15), fontWeight: '800' },
  name: { fontSize: normalizeText(23), fontWeight: '800' },
  meta: { fontSize: normalizeText(15), marginTop: 2 },
  status: { fontSize: normalizeText(16), fontWeight: '700', marginTop: 4 },
  sectionTitle: { fontSize: normalizeText(17), fontWeight: '800', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 10 },
  menuGroup: { marginBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1 },
  iconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255, 107, 0, 0.08)', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  settingIconImage: { width: 26, height: 26, resizeMode: 'contain' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: normalizeText(17), fontWeight: '700' },
  rowSubtitle: { fontSize: normalizeText(14), marginTop: 2 },
  garageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  garageTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  garageTitle: { fontSize: normalizeText(22), fontWeight: '800' },
  addVehicleButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, borderRadius: 9 },
  addVehicleText: { color: '#FFFFFF', fontSize: normalizeText(15), fontWeight: '800' },
  vehicleCard: { minHeight: 100, flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  vehicleIconBox: { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF0FF' },
  vehicleIconImage: { width: 32, height: 32 },
  vehicleCardCopy: { flex: 1, marginLeft: 16 },
  vehicleName: { fontSize: normalizeText(18), fontWeight: '800' },
  vehiclePlate: { fontSize: normalizeText(13), marginTop: 4 },
  vehicleLimitOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(15, 23, 42, 0.48)' },
  vehicleLimitCard: { width: '100%', maxWidth: 380, borderRadius: 22, padding: 26, alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  vehicleLimitIcon: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8ECFF', marginBottom: 16 },
  vehicleLimitTitle: { fontSize: normalizeText(22), fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  vehicleLimitMessage: { fontSize: normalizeText(15), lineHeight: normalizeText(22), textAlign: 'center', marginBottom: 22 },
  vehicleLimitProgressTrack: { width: '100%', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  vehicleLimitProgressFill: { width: '100%', height: '100%', borderRadius: 4, backgroundColor: '#24439A' },
  vehicleLimitProgressLabels: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
  vehicleLimitProgressText: { fontSize: normalizeText(12), fontWeight: '700' },
  vehicleLimitProgressValue: { color: '#24439A', fontSize: normalizeText(13), fontWeight: '900' },
  vehicleLimitButton: { width: '100%', minHeight: 50, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#24439A' },
  vehicleLimitButtonText: { color: '#FFFFFF', fontSize: normalizeText(16), fontWeight: '900' },
  primaryVehicleButton: { alignSelf: 'flex-start', minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 10, borderRadius: 7, borderWidth: 1 },
  primaryVehicleText: { fontSize: normalizeText(13), fontWeight: '800' },
  deleteVehicleButton: { width: 44, height: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8ECFF', marginLeft: 10 },
  deleteVehicleIcon: { width: 24, height: 24 },
  emptyVehicleCard: { minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  emptyVehicleText: { fontSize: normalizeText(15), fontWeight: '600' },
  systemLabel: { fontSize: normalizeText(13), fontWeight: '700', marginBottom: 10 },
  systemCard: { overflow: 'hidden', borderRadius: 12, marginBottom: 22 },
  systemRow: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, borderBottomWidth: 1 },
  systemIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF1E5' },
  systemCopy: { flex: 1 },
  systemTitle: { fontSize: normalizeText(17), fontWeight: '800' },
  systemSubtitle: { fontSize: normalizeText(14), marginTop: 5 },
  logoutModalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(15, 23, 42, 0.48)' },
  logoutModalCard: { width: '100%', maxWidth: 380, borderRadius: 22, padding: 26, alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  logoutModalIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0F3', marginBottom: 16 },
  logoutModalTitle: { fontSize: normalizeText(22), fontWeight: '800', marginBottom: 8 },
  logoutModalMessage: { fontSize: normalizeText(16), lineHeight: normalizeText(24), textAlign: 'center', marginBottom: 24 },
  logoutModalActions: { width: '100%', flexDirection: 'row', gap: 12 },
  logoutModalCancel: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  logoutModalCancelText: { fontSize: normalizeText(16), fontWeight: '800' },
  logoutModalConfirm: { flex: 1, borderRadius: 12, paddingVertical: 15, alignItems: 'center', backgroundColor: '#D92D20' },
  logoutModalConfirmText: { color: '#FFFFFF', fontSize: normalizeText(16), fontWeight: '800' },
  logoutButton: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, marginTop: 10 },
  logoutButtonText: { color: '#D92D20', fontSize: normalizeText(16), fontWeight: '800' },
  settingsPanel: { marginTop: 32, borderRadius: 12, overflow: 'hidden' },
  settingsRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 0, paddingHorizontal: 22, borderBottomWidth: 1 },
  settingsRowIcon: { width: 30, height: 30, marginRight: 18, textAlign: 'center' },
  settingsRowCopy: { flex: 1, minHeight: 30, justifyContent: 'center' },
  settingsRowText: { fontSize: normalizeText(17), lineHeight: normalizeText(24), fontWeight: '700' },
  settingsRowHint: { fontSize: normalizeText(14), lineHeight: normalizeText(22), marginTop: 2 },
  radiusSettingsRow: { alignItems: 'flex-start', paddingVertical: 18 },
  radiusOptions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  radiusOption: { minWidth: 64, minHeight: 38, paddingHorizontal: 12, borderWidth: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  radiusOptionSelected: { backgroundColor: '#0037B0', borderColor: '#0037B0' },
  radiusOptionText: { fontSize: normalizeText(14), fontWeight: '800' },
  settingsRowSubtitle: { fontSize: normalizeText(14), marginTop: 2 },
  addVehicleForm: { padding: 22, gap: 16 },
  vehicleTypeRow: { flexDirection: 'row', gap: 12 },
  vehicleTypeButton: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 10 },
  vehicleTypeIcon: { width: 25, height: 25 },
  vehicleInput: { minHeight: 52, borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, fontSize: normalizeText(17) },
  saveVehicleButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#0037B0', marginTop: 4 },
  saveVehicleText: { color: '#FFFFFF', fontSize: normalizeText(17), fontWeight: '800' },
  disabled: { opacity: 0.6 },
  detailScreen: { flex: 1 },
  detailHeader: { minHeight: 64, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  detailTitle: { fontSize: normalizeText(20), fontWeight: '800' },
  settingsHeaderTitle: { flex: 1, marginLeft: 12 },
  settingsHeaderSpacer: { width: 44 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  detailsList: { flex: 1 },
  accountDetailsContent: { padding: 18, paddingBottom: 36, gap: 16 },
  accountProfileCard: { minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 18, borderWidth: 1 },
  accountProfileCopy: { flex: 1, gap: 8 },
  accountProfileName: { fontSize: normalizeText(19), lineHeight: normalizeText(24), fontWeight: '800' },
  accountTypeBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  accountTypeBadgeText: { fontSize: normalizeText(12), fontWeight: '800' },
  accountSectionLabel: { marginBottom: -6, fontSize: normalizeText(11), fontWeight: '900', letterSpacing: 0.9 },
  accountInfoCard: { paddingHorizontal: 16, borderWidth: 1, borderRadius: 18 },
  accountInfoRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  accountInfoIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  accountInfoCopy: { flex: 1, gap: 4 },
  accountInfoDivider: { height: 1, marginLeft: 52 },
  accountDetailLabel: { fontSize: normalizeText(12), fontWeight: '700' },
  accountDetailValue: { fontSize: normalizeText(15), lineHeight: normalizeText(21), fontWeight: '700' },
  accountDetailInput: { minHeight: 36, paddingVertical: 2, borderBottomWidth: 1, fontSize: normalizeText(15), fontWeight: '600' },
  accountPrivacyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 14 },
  accountPrivacyText: { flex: 1, fontSize: normalizeText(13), lineHeight: normalizeText(19) },
  saveDetailsButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2, borderRadius: 14 },
  saveDetailsText: { color: '#FFFFFF', fontSize: normalizeText(17), fontWeight: '800' },
  accountSuccessOverlay: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: 'rgba(16, 24, 40, 0.58)' },
  accountSuccessCard: { alignItems: 'center', padding: 22, borderWidth: 1, borderRadius: 22, shadowColor: '#101828', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 22, elevation: 12 },
  accountSuccessIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderRadius: 29, backgroundColor: '#27AE60' },
  accountSuccessTitle: { fontSize: normalizeText(20), lineHeight: normalizeText(26), fontWeight: '800', textAlign: 'center' },
  accountSuccessMessage: { fontSize: normalizeText(15), lineHeight: normalizeText(22), marginTop: 8, textAlign: 'center' },
  accountSuccessButton: { width: '100%', minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 22, borderRadius: 13, backgroundColor: '#2450D8' },
  accountSuccessButtonText: { color: '#FFFFFF', fontSize: normalizeText(15), fontWeight: '800' },
  detailLogoutRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 22, paddingVertical: 20, borderTopWidth: 1 },
  logoutText: { color: '#EF4444', fontSize: normalizeText(17), fontWeight: '800', flex: 1 }
});