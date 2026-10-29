import { Ionicons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { ProfileAvatar } from '@/components/ProfileAvatar';
import { MechanicScreen } from '@/components/mechanic/MechanicScreen';
import { useAuth } from '@/contexts/AuthContext';
import { useMechanic } from '@/contexts/MechanicContext';
import { supabase } from '@/lib/supabase';
import { colors, radii, spacing } from '@/lib/theme';
import { createVehicle, listVehicles, setPrimaryVehicle } from '@/services/vehicleService';
import type { FuelType, Vehicle, VehicleType } from '@/types/vehicle';
import { isValidPlateNumber, sanitizePlateNumber } from '@/lib/plateNumber';

type MaintenancePrice = {
  service: string;
  price: string;
};

type SelectedAddress = {
  address: string;
  latitude: number;
  longitude: number;
};

function formatHomeAddress(address: string) {
  return address
    .split(',')
    .map((part) => part.trim())
    .filter(
      (part) =>
        part.length > 0 &&
        !/^northern manila district$/i.test(part) &&
        !/^philippines$/i.test(part) &&
        !/^\d{4}$/.test(part),
    )
    .join(', ');
}

function createAddressMapHtml(latitude: number, longitude: number) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>*{box-sizing:border-box}body{margin:0;font-family:sans-serif}#map{position:fixed;inset:0}.search{position:fixed;z-index:1000;top:16px;left:16px;right:16px;display:flex;gap:8px}input{flex:1;padding:13px;border:1px solid #E5E7EB;border-radius:12px;font-size:15px}button{border:0;border-radius:12px;padding:0 16px;background:#F0A202;color:white;font-weight:700}#results{position:fixed;z-index:1000;top:70px;left:16px;right:16px;max-height:230px;overflow:auto}.result{display:block;width:100%;padding:12px;margin-bottom:6px;text-align:left;background:white;color:#101828;border:1px solid #E5E7EB}.hint{position:fixed;z-index:999;left:16px;right:16px;bottom:18px;padding:12px;border-radius:12px;background:rgba(16,24,40,.88);color:white;text-align:center;font-size:13px}</style></head><body><div id="map"></div><div class="search"><input id="query" placeholder="Search home address"><button onclick="searchAddress()">Search</button></div><div id="results"></div><div class="hint">Tap the map to place your pin.</div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>
  var map=L.map('map').setView([${latitude},${longitude}],16),marker=null;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
  function sendPin(lat,lng,address){if(marker)marker.setLatLng([lat,lng]);else marker=L.marker([lat,lng]).addTo(map);window.ReactNativeWebView.postMessage(JSON.stringify({type:'pin',latitude:lat,longitude:lng,address:address}));}
  function pin(lat,lng){sendPin(lat,lng,'Pinned location ('+lat.toFixed(6)+', '+lng.toFixed(6)+')');fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat='+lat+'&lon='+lng).then(function(r){return r.json()}).then(function(d){if(d.display_name)sendPin(lat,lng,d.display_name)}).catch(function(){});}
  map.on('click',function(e){pin(e.latlng.lat,e.latlng.lng)});
  function searchAddress(){var q=document.getElementById('query').value.trim(),r=document.getElementById('results');if(!q)return;r.innerHTML='<div class="result">Searching...</div>';fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ph&q='+encodeURIComponent(q)).then(function(x){return x.json()}).then(function(items){r.innerHTML='';if(!items.length){r.innerHTML='<div class="result">No address found.</div>';return}items.forEach(function(item){var b=document.createElement('button');b.className='result';b.textContent=item.display_name;b.onclick=function(){var lat=Number(item.lat),lng=Number(item.lon);map.setView([lat,lng],18);sendPin(lat,lng,item.display_name);r.innerHTML=''};r.appendChild(b)})}).catch(function(){r.innerHTML='<div class="result">Search failed. Check your connection.</div>'})}
</script></body></html>`;
}

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const { rating, online, avatarUrl, setAvatarUrl, avatarLoading } = useMechanic();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUploadSuccess, setAvatarUploadSuccess] = useState(false);
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(null);
  const [avatarPickerVisible, setAvatarPickerVisible] = useState(false);
  const [logoutConfirmationVisible, setLogoutConfirmationVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [expandedSection, setExpandedSection] = useState<
    | 'specializations'
    | 'documents'
    | 'certifications'
    | 'maintenance-pricing'
    | 'account-details'
    | 'garage'
    | null
  >(null);
  const [garageVehicles, setGarageVehicles] = useState<Vehicle[]>([]);
  const [garageLoading, setGarageLoading] = useState(false);
  const [garageLoadedFor, setGarageLoadedFor] = useState<string | null>(null);
  const [garageVehicleType, setGarageVehicleType] = useState<VehicleType>('motorcycle');
  const [garageMake, setGarageMake] = useState('');
  const [garageModel, setGarageModel] = useState('');
  const [garageYear, setGarageYear] = useState('');
  const [garagePlate, setGaragePlate] = useState('');
  const [garageFuelType, setGarageFuelType] = useState<FuelType>('Gasoline');
  const [savingGarageVehicle, setSavingGarageVehicle] = useState(false);
  const primaryVehicleRequest = useRef(false);
  const [maintenancePrices, setMaintenancePrices] = useState<MaintenancePrice[]>([]);
  const [editingPriceIndex, setEditingPriceIndex] = useState<number | null>(null);
  const [editingService, setEditingService] = useState('');
  const [editingPrice, setEditingPrice] = useState('');
  const [specializationDraft, setSpecializationDraft] = useState('');
  const [newService, setNewService] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [savingSpecializations, setSavingSpecializations] = useState(false);
  const [savingPrices, setSavingPrices] = useState(false);
  const [priceAdded, setPriceAdded] = useState(false);
  const [requestingDeletion, setRequestingDeletion] = useState(false);
  const [addressPickerVisible, setAddressPickerVisible] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<SelectedAddress | null>(null);
  const [profile, setProfile] = useState<{
    mobile_number: string | null;
    home_address: string | null;
    home_latitude: number | null;
    home_longitude: number | null;
    skills: string | null;
    certifications: string | null;
    maintenance_pricing: MaintenancePrice[] | null;
    experience: string | null;
    license_front_path: string | null;
    license_back_path: string | null;
  } | null>(null);
  const avatarRequestId = useRef(0);
  const avatarSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const email = session?.user.email ?? '';
  const fullName =
    typeof session?.user.user_metadata?.full_name === 'string'
      ? session.user.user_metadata.full_name
      : email.split('@')[0];

  useEffect(
    () => () => {
      if (avatarSuccessTimer.current) clearTimeout(avatarSuccessTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!session?.user.id) return;
    let active = true;
    const loadProfileDetails = async () => {
      const metadata = session.user.user_metadata ?? {};
      const metadataLatitude =
        typeof metadata.home_latitude === 'number' ? metadata.home_latitude : null;
      const metadataLongitude =
        typeof metadata.home_longitude === 'number' ? metadata.home_longitude : null;
      const profileFields =
        'mobile_number,home_address,home_latitude,home_longitude,skills,certifications,maintenance_pricing,experience,license_front_path,license_back_path';
      const [
        { data, error },
        { data: application, error: applicationError },
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select(profileFields)
          .eq('id', session.user.id)
          .maybeSingle(),
        supabase
          .from('mechanic_applications')
          .select('skills,certifications,experience,license_front_path,license_back_path')
          .eq('id', session.user.id)
          .maybeSingle(),
      ]);

      if (!active) return;
      if (error) {
        Alert.alert('Profile unavailable', error.message);
      }
      if (applicationError) {
        Alert.alert('Application details unavailable', applicationError.message);
      }

      const mergedProfile = {
        mobile_number: data?.mobile_number ?? null,
        home_address:
          data?.home_address ||
          (typeof metadata.home_address === 'string' ? metadata.home_address : null),
        home_latitude: data?.home_latitude ?? metadataLatitude,
        home_longitude: data?.home_longitude ?? metadataLongitude,
        skills:
          data?.skills ||
          application?.skills ||
          (typeof metadata.skills === 'string' ? metadata.skills : null),
        certifications: data?.certifications || application?.certifications || null,
        maintenance_pricing: data?.maintenance_pricing ?? null,
        experience: data?.experience || application?.experience || null,
        license_front_path: data?.license_front_path || application?.license_front_path || null,
        license_back_path: data?.license_back_path || application?.license_back_path || null,
      };
      setProfile(mergedProfile);
      setSpecializationDraft(mergedProfile.skills ?? '');
      setMaintenancePrices(
        Array.isArray(mergedProfile.maintenance_pricing)
          ? mergedProfile.maintenance_pricing
          : [],
      );
    };

    void loadProfileDetails();
    return () => {
      active = false;
    };
  }, [session?.user.id, session?.user.user_metadata]);

  useEffect(() => {
    if (expandedSection !== 'garage' || !session?.user.id) return;
    if (garageLoadedFor === session.user.id) return;
    let active = true;
    void listVehicles(session.user.id).then(({ data, error }) => {
      if (!active) return;
      setGarageLoading(false);
      if (error) {
        Alert.alert('Unable to load garage', error);
        return;
      }
      setGarageVehicles(data.filter((vehicle) => vehicle.mechanic_id === session.user.id));
      setGarageLoadedFor(session.user.id);
    });
    return () => {
      active = false;
    };
  }, [expandedSection, garageLoadedFor, session?.user.id]);

  const specializations = (profile?.skills ?? '')
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const certifications = profile?.certifications
    ? profile.certifications
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean)
    : [];
  const documents =
    [
      profile?.license_front_path
        ? { label: "Driver's license - front", status: 'Submitted' }
        : null,
      profile?.license_back_path
        ? { label: "Driver's license - back", status: 'Submitted' }
        : null,
    ].filter((document): document is { label: string; status: string } => Boolean(document));

  function toggleSection(
    section:
      | 'specializations'
      | 'documents'
      | 'certifications'
      | 'maintenance-pricing'
      | 'account-details'
      | 'garage',
  ) {
    if (section === 'garage' && garageLoadedFor !== session?.user.id) {
      setGarageLoading(true);
    }
    setExpandedSection(section);
  }

  async function saveGarageVehicle() {
    if (!session?.user.id || savingGarageVehicle || garageLoading) return;
    if (garageVehicles.length >= 2) {
      Alert.alert(
        'Vehicle limit reached',
        'Your garage can hold up to two vehicles. Remove an existing vehicle before adding a new one.',
      );
      return;
    }
    if (
      !garageMake.trim() ||
      !garageModel.trim() ||
      !garageYear.trim() ||
      !garagePlate.trim()
    ) {
      Alert.alert('Missing Details', 'Please fill out all vehicle fields.');
      return;
    }
    const plateNumber = sanitizePlateNumber(garagePlate);
    if (!isValidPlateNumber(plateNumber)) {
      Alert.alert(
        'Invalid Plate Number',
        'Use up to 7 letters or numbers, with at most one space.',
      );
      return;
    }
    setSavingGarageVehicle(true);
    const { data, error } = await createVehicle({
      ownerId: session.user.id,
      ownerRole: 'mechanic',
      type: garageVehicleType,
      make: garageMake,
      model: garageModel,
      year: garageYear,
      plateNumber,
      fuelType: garageFuelType,
      isPrimary: garageVehicles.length === 0,
    });
    setSavingGarageVehicle(false);
    if (error || !data) {
      Alert.alert('Unable to add vehicle', error ?? 'The vehicle could not be saved.');
      return;
    }
    setGarageVehicles((current) => [data, ...current]);
    setGarageMake('');
    setGarageModel('');
    setGarageYear('');
    setGaragePlate('');
  }

  async function makeGarageVehiclePrimary(vehicle: Vehicle) {
    if (!session?.user.id || vehicle.is_primary || primaryVehicleRequest.current) return;
    const previousVehicles = garageVehicles;
    primaryVehicleRequest.current = true;
    setGarageVehicles((current) =>
      current.map((item) => ({ ...item, is_primary: item.id === vehicle.id })),
    );
    try {
      const { error } = await setPrimaryVehicle(
        session.user.id,
        vehicle.id,
        'mechanic',
      );
      if (error) {
        setGarageVehicles(previousVehicles);
        Alert.alert('Unable to set primary vehicle', error);
      }
    } catch (error) {
      setGarageVehicles(previousVehicles);
      Alert.alert(
        'Unable to set primary vehicle',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      primaryVehicleRequest.current = false;
    }
  }

  function deleteGarageVehicle(vehicle: Vehicle) {
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
              if (!session?.user.id) return;
              const { error } = await supabase
                .from('vehicles')
                .delete()
                .eq('id', vehicle.id)
                .eq('mechanic_id', session.user.id);
              if (error) {
                Alert.alert('Unable to delete vehicle', error.message);
                return;
              }
              setGarageVehicles((current) =>
                current.filter((item) => item.id !== vehicle.id),
              );
            })();
          },
        },
      ],
    );
  }

  async function saveMaintenancePrices(nextPrices: MaintenancePrice[]) {
    if (!session?.user.id || savingPrices) return false;
    setSavingPrices(true);
    const { error } = await supabase
      .from('profiles')
      .update({ maintenance_pricing: nextPrices })
      .eq('id', session.user.id);
    setSavingPrices(false);
    if (error) {
      Alert.alert('Unable to save pricing', error.message);
      return false;
    }
    setMaintenancePrices(nextPrices);
    return true;
  }

  async function addMaintenancePrice() {
    const service = newService.trim();
    const price = newPrice.trim();
    if (!service || !price) {
      Alert.alert('Incomplete pricing', 'Enter the labor name and price first.');
      return;
    }

    const numericPrice = Number(price.replace(/,/g, '').replace(/^₱\s*/, ''));
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      Alert.alert('Invalid price', 'Enter a valid price greater than zero.');
      return;
    }
    const nextPrices = [...maintenancePrices, { service, price }];
    setPriceAdded(false);
    const saved = await saveMaintenancePrices(nextPrices);
    if (saved) {
      setNewService('');
      setNewPrice('');
      setPriceAdded(true);
      setTimeout(() => setPriceAdded(false), 1800);
    }
  }

  async function saveEditedMaintenancePrice(index: number) {
    const service = editingService.trim();
    const price = editingPrice.trim();
    if (!service || !price) {
      Alert.alert('Incomplete pricing', 'Enter the labor name and price first.');
      return;
    }
    const numericPrice = Number(price.replace(/,/g, '').replace(/^₱\s*/, ''));
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      Alert.alert('Invalid price', 'Enter a valid price greater than zero.');
      return;
    }
    const nextPrices = maintenancePrices.map((item, itemIndex) =>
      itemIndex === index ? { service, price } : item,
    );
    if (await saveMaintenancePrices(nextPrices)) {
      setEditingPriceIndex(null);
      setEditingService('');
      setEditingPrice('');
    }
  }

  async function saveSpecializations() {
    if (!session?.user.id || savingSpecializations) return;
    setSavingSpecializations(true);
    const skills = specializationDraft
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .join(', ');
    const { data, error } = await supabase
      .from('profiles')
      .update({ skills })
      .eq('id', session.user.id)
      .select('id')
      .maybeSingle();
    setSavingSpecializations(false);
    if (error) {
      Alert.alert('Unable to save specializations', error.message);
      return;
    }
    if (!data) {
      Alert.alert(
        'Unable to save specializations',
        'Your mechanic profile was not found. Please sign out and sign in again.',
      );
      return;
    }
    setProfile((current) => (current ? { ...current, skills } : current));
    setSpecializationDraft(skills);
    Alert.alert('Specializations saved', 'Your mechanic services were updated.');
  }

  function requestAccountDeletion() {
    if (!session?.user.id || requestingDeletion) return;

    Alert.alert(
      'Request account deletion?',
      'Your request will be sent to the admin team for review. Your account will not be deleted immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send request',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setRequestingDeletion(true);
              const { error } = await supabase
                .from('account_deletion_requests')
                .upsert(
                  { user_id: session.user.id, status: 'pending' },
                  { onConflict: 'user_id' },
                );
              setRequestingDeletion(false);
              if (error) {
                Alert.alert('Request failed', error.message);
                return;
              }
              Alert.alert(
                'Request submitted',
                'The admin team will review your account deletion request.',
              );
            })();
          },
        },
      ],
    );
  }

  function openAddressPicker() {
    setSelectedAddress(null);
    setAddressPickerVisible(true);
  }

  function handleAddressMapMessage(event: { nativeEvent: { data: string } }) {
    try {
      const message = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        address?: string;
        latitude?: number;
        longitude?: number;
      };
      if (
        message.type === 'pin' &&
        message.address &&
        typeof message.latitude === 'number' &&
        typeof message.longitude === 'number'
      ) {
        setSelectedAddress({
          address: formatHomeAddress(message.address),
          latitude: message.latitude,
          longitude: message.longitude,
        });
      }
    } catch {
      Alert.alert('Map unavailable', 'Hindi nabasa ang napiling location. Subukan ulit.');
    }
  }

  async function saveSelectedAddress() {
    if (!session?.user.id) {
      Alert.alert('Unable to save address', 'Your session has expired. Please log in again.');
      return;
    }
    if (!selectedAddress) {
      Alert.alert('Location required', 'Search for an address or tap the map to place a pin first.');
      return;
    }

    setSavingAddress(true);
    const locationPayload = {
      home_address: selectedAddress.address.trim(),
      home_latitude: selectedAddress.latitude,
      home_longitude: selectedAddress.longitude,
    };
    const { data, error } = await supabase.rpc('save_mechanic_home_location', {
      p_home_address: selectedAddress.address,
      p_home_latitude: selectedAddress.latitude,
      p_home_longitude: selectedAddress.longitude,
    });
    let saved = Array.isArray(data) ? data[0] : data;

    if (error || !saved?.home_address) {
      const fallback = await supabase
        .from('profiles')
        .update(locationPayload)
        .eq('id', session.user.id)
        .select('home_address,home_latitude,home_longitude')
        .maybeSingle();
      if (fallback.error || !fallback.data?.home_address) {
        setSavingAddress(false);
        Alert.alert(
          'Unable to save address',
          fallback.error?.message || error?.message || 'No mechanic profile was updated.',
        );
        return;
      }
      saved = fallback.data;
    }
    setSavingAddress(false);
    const savedAddress = {
      home_address: saved.home_address || locationPayload.home_address,
      home_latitude: saved.home_latitude ?? locationPayload.home_latitude,
      home_longitude: saved.home_longitude ?? locationPayload.home_longitude,
    };
    const { error: metadataError } = await supabase.auth.updateUser({
      data: {
        home_address: savedAddress.home_address,
        home_latitude: savedAddress.home_latitude,
        home_longitude: savedAddress.home_longitude,
      },
    });
    if (metadataError) {
      console.warn('Home address metadata sync failed:', metadataError.message);
    }
    setProfile((current) => ({
      mobile_number: current?.mobile_number ?? null,
      ...savedAddress,
      skills: current?.skills ?? null,
      certifications: current?.certifications ?? null,
      maintenance_pricing: current?.maintenance_pricing ?? null,
      experience: current?.experience ?? null,
      license_front_path: current?.license_front_path ?? null,
      license_back_path: current?.license_back_path ?? null,
    }));
    setAddressPickerVisible(false);
    setSelectedAddress(null);
  }

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
    setAvatarUploadSuccess(false);
    if (avatarSuccessTimer.current) clearTimeout(avatarSuccessTimer.current);
    const requestId = ++avatarRequestId.current;
    try {
      const converted = await ImageManipulator.manipulateAsync(result.assets[0].uri, [], {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      const convertedFile = new File(converted.uri);
      if (!convertedFile.exists) {
        throw new Error('The converted photo was not created on the device.');
      }
      setAvatarPreviewUri(converted.uri);
      const body = (await convertedFile.bytes()).buffer;
      const path = `${session.user.id}/avatar-${Date.now()}.jpg`;
      const upload = await supabase.storage
        .from('mechanic-avatars')
        .upload(path, body, {
          cacheControl: '3600',
          contentType: 'image/jpeg',
          upsert: true,
        });
      if (upload.error) throw new Error(upload.error.message);

      const update = await supabase
        .from('profiles')
        .update({ avatar_path: path })
        .eq('id', session.user.id);
      if (update.error) throw new Error(update.error.message);

      const { data: avatar } = supabase.storage
        .from('mechanic-avatars')
        .getPublicUrl(path);
      const avatarReady = await Image.prefetch(avatar.publicUrl).catch((error) => {
        console.warn(
          'Uploaded mechanic avatar could not be preloaded:',
          error instanceof Error ? error.message : error,
        );
        return false;
      });
      if (!avatarReady) {
        Alert.alert(
          'Photo uploaded',
          'Your photo was saved, but could not be prepared for the headers yet. Please try again shortly.',
        );
        return;
      }
      if (requestId === avatarRequestId.current) {
        setAvatarUrl(avatar.publicUrl);
        setAvatarPreviewUri(null);
        setAvatarUploadSuccess(true);
        avatarSuccessTimer.current = setTimeout(() => {
          setAvatarUploadSuccess(false);
          avatarSuccessTimer.current = null;
        }, 2500);
      }
    } catch (error) {
      if (requestId === avatarRequestId.current) {
        setAvatarPreviewUri(null);
        setAvatarUploadSuccess(false);
      }
      Alert.alert('Profile photo failed', error instanceof Error ? error.message : 'Could not save the photo.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  function chooseAvatar() {
    setAvatarPickerVisible(true);
  }

  async function confirmSignOut() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await signOut('mechanic');
      setLogoutConfirmationVisible(false);
    } catch (error) {
      setLogoutConfirmationVisible(false);
      Alert.alert(
        'Unable to log out',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <MechanicScreen back title="My Profile">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.avatarColumn}>
            <Pressable onPress={chooseAvatar} style={styles.avatarButton} disabled={uploadingAvatar}>
              {avatarPreviewUri ? (
                <ProfileAvatar
                  uri={avatarPreviewUri}
                  size={80}
                  backgroundColor={colors.amberSoft}
                />
              ) : avatarUrl ? (
                <ProfileAvatar
                  uri={avatarUrl}
                  size={80}
                  backgroundColor={colors.amberSoft}
                />
              ) : avatarLoading ? (
                <View style={styles.avatarLoading} />
              ) : (
                <Text style={styles.avatarText}>{fullName.slice(0, 1).toUpperCase()}</Text>
              )}
              {uploadingAvatar ? (
                <View style={styles.avatarUploadingOverlay} pointerEvents="none">
                  <ActivityIndicator size="small" color={colors.white} />
                  <Text style={styles.avatarUploadingText}>Uploading</Text>
                </View>
              ) : null}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera-outline" size={14} color={colors.bg} />
              </View>
            </Pressable>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.name}>{fullName}</Text>
            <Text style={styles.meta}>{email}</Text>
            <Text style={styles.meta}>{rating.toFixed(1)} ★</Text>
            <Text style={[styles.status, online ? styles.online : styles.offline]}>
              {online ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>

        <View style={styles.accordion}>
          <Pressable
            onPress={() => toggleSection('garage')}
            style={({ pressed }) => [styles.sectionHeader, pressed && styles.pressed]}
          >
            <Ionicons name="car-sport-outline" size={24} color={colors.blue} />
            <Text style={styles.section}>My Garage</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        <View style={styles.accordionList}>
          <View style={styles.accordion}>
            <Pressable
              onPress={() => toggleSection('specializations')}
              style={({ pressed }) => [styles.sectionHeader, pressed && styles.pressed]}
            >
              <Image
                source={require('../../assets/images/specializations.png')}
                style={styles.sectionIconImage}
              />
              <Text style={styles.section}>Specializations</Text>
              <Ionicons
                name={expandedSection === 'specializations' ? 'chevron-up' : 'chevron-forward'}
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
            </View>

          <View style={styles.accordion}>
            <Pressable
              onPress={() => toggleSection('documents')}
              style={({ pressed }) => [styles.sectionHeader, pressed && styles.pressed]}
            >
              <Image
                source={require('../../assets/images/documents.png')}
                style={styles.sectionIconImage}
              />
              <Text style={styles.section}>Documents</Text>
              <Ionicons
                name={expandedSection === 'documents' ? 'chevron-up' : 'chevron-forward'}
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
            </View>

          <View style={styles.accordion}>
            <Pressable
              onPress={() => toggleSection('certifications')}
              style={({ pressed }) => [styles.sectionHeader, pressed && styles.pressed]}
            >
              <Image
                source={require('../../assets/images/certifications.png')}
                style={styles.sectionIconImage}
              />
              <Text style={styles.section}>Certifications</Text>
              <Ionicons
                name={expandedSection === 'certifications' ? 'chevron-up' : 'chevron-forward'}
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
          </View>
          <View style={styles.accordion}>
            <Pressable
              onPress={() => toggleSection('maintenance-pricing')}
              style={({ pressed }) => [styles.sectionHeader, pressed && styles.pressed]}
            >
              <Image
                source={require('../../assets/images/maintenance-pricing.png')}
                style={styles.sectionIconImage}
              />
              <Text style={styles.section}>Maintenance Pricing</Text>
              <Ionicons
                name={expandedSection === 'maintenance-pricing' ? 'chevron-up' : 'chevron-forward'}
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
          </View>
          <View style={styles.sectionSeparator} />
          <View style={styles.accordion}>
            <Pressable
              onPress={() => toggleSection('account-details')}
              style={({ pressed }) => [styles.sectionHeader, pressed && styles.pressed]}
            >
              <Image
                source={require('../../assets/images/account-details.png')}
                style={styles.sectionIconImage}
              />
              <Text style={styles.section}>Account Details</Text>
              <Ionicons
                name={expandedSection === 'account-details' ? 'chevron-up' : 'chevron-forward'}
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={() => setLogoutConfirmationVisible(true)}
          style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
        >
          <Image
            source={require('../../assets/images/logout.png')}
            style={styles.logoutIcon}
          />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </ScrollView>
      <Modal
        visible={avatarUploadSuccess}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarUploadSuccess(false)}
      >
        <View style={styles.avatarSuccessOverlay}>
          <View
            accessibilityRole="alert"
            style={styles.avatarSuccessCard}
          >
            <View style={styles.avatarSuccessIcon}>
              <Ionicons name="checkmark" size={30} color={colors.white} />
            </View>
            <Text style={styles.avatarSuccessTitle}>Uploaded successfully</Text>
            <Text style={styles.avatarSuccessMessage}>
              Your profile photo has been updated.
            </Text>
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
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setAvatarPickerVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close profile photo options"
          />
          <View style={styles.avatarPickerCard}>
            <View style={styles.avatarPickerHandle} />
            <Text style={styles.avatarPickerTitle}>Update Profile Photo</Text>
            <Text style={styles.avatarPickerSubtitle}>
              Choose where you want to get your profile photo.
            </Text>
            <View style={styles.avatarPickerOptions}>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.avatarPickerOption,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  setAvatarPickerVisible(false);
                  void changeAvatar('camera');
                }}
              >
                <View style={styles.avatarPickerIcon}>
                  <Ionicons name="camera-outline" size={26} color={colors.amber} />
                </View>
                <View style={styles.avatarPickerCopy}>
                  <Text style={styles.avatarPickerOptionTitle}>Take a photo</Text>
                  <Text style={styles.avatarPickerOptionText}>Use your camera</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={colors.amber} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.avatarPickerOption,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  setAvatarPickerVisible(false);
                  void changeAvatar('gallery');
                }}
              >
                <View style={styles.avatarPickerIcon}>
                  <Ionicons name="images-outline" size={26} color={colors.amber} />
                </View>
                <View style={styles.avatarPickerCopy}>
                  <Text style={styles.avatarPickerOptionTitle}>Choose from gallery</Text>
                  <Text style={styles.avatarPickerOptionText}>
                    Select an existing photo
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={colors.amber} />
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setAvatarPickerVisible(false)}
              style={({ pressed }) => [
                styles.avatarPickerCancel,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.avatarPickerCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={logoutConfirmationVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!loggingOut) setLogoutConfirmationVisible(false);
        }}
      >
        <View style={styles.logoutModalOverlay}>
          <View style={styles.logoutModalCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close logout confirmation"
              disabled={loggingOut}
              onPress={() => setLogoutConfirmationVisible(false)}
              style={({ pressed }) => [
                styles.logoutModalClose,
                pressed && !loggingOut && styles.pressed,
              ]}
            >
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
            <Image
              source={require('../../assets/images/logoutconfirmation.jpg')}
              style={styles.logoutModalImage}
              resizeMode="contain"
            />
            <Text style={styles.logoutModalTitle}>Are You Logging Out?</Text>
            <Text style={styles.logoutModalMessage}>
              You can always log back in at any time.
            </Text>
            <View style={styles.logoutModalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={loggingOut}
                onPress={() => setLogoutConfirmationVisible(false)}
                style={({ pressed }) => [
                  styles.logoutModalCancel,
                  pressed && !loggingOut && styles.pressed,
                ]}
              >
                <Text style={styles.logoutModalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={loggingOut}
                onPress={() => void confirmSignOut()}
                style={({ pressed }) => [
                  styles.logoutModalConfirm,
                  pressed && !loggingOut && styles.pressed,
                ]}
              >
                {loggingOut ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.logoutModalConfirmText}>Log out</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={expandedSection !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setExpandedSection(null)}
      >
        <KeyboardAvoidingView
          style={styles.detailOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setExpandedSection(null)}
            accessibilityRole="button"
            accessibilityLabel="Close profile details"
          />
          <SafeAreaView style={styles.detailScreen} edges={['bottom']}>
            <View style={styles.detailTopRow}>
              <View style={styles.detailTitleGroup}>
                <Text style={styles.detailHeaderTitle}>
                  {expandedSection === 'garage'
                    ? 'My Garage'
                    : expandedSection === 'specializations'
                    ? 'Specializations'
                    : expandedSection === 'documents'
                      ? 'Documents'
                      : expandedSection === 'certifications'
                        ? 'Certifications'
                        : expandedSection === 'account-details'
                          ? 'Account Details'
                          : 'Maintenance Pricing'}
                </Text>
              </View>
              <Pressable
                onPress={() => setExpandedSection(null)}
                style={styles.closeButton}
                accessibilityLabel="Close profile details"
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.detailScroll}
              contentContainerStyle={styles.detailContent}
              keyboardShouldPersistTaps="handled"
            >
            {expandedSection === 'garage' ? (
              <>
                <View style={styles.garageVehicleForm}>
                  <View style={styles.garageFormTitleRow}>
                    <Text style={styles.garageFormTitle}>Add a vehicle</Text>
                    <Text style={styles.garageCapacity}>
                      {garageVehicles.length} / 2
                    </Text>
                  </View>
                  <View style={styles.garageChoiceRow}>
                    {(['motorcycle', 'car'] as const).map((type) => (
                      <Pressable
                        key={type}
                        onPress={() => setGarageVehicleType(type)}
                        style={[
                          styles.garageChoice,
                          garageVehicleType === type && styles.garageChoiceSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.garageChoiceText,
                            garageVehicleType === type && styles.garageChoiceTextSelected,
                          ]}
                        >
                          {type === 'motorcycle' ? 'Motorcycle' : 'Car'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.garageInputRow}>
                    <TextInput
                      value={garageMake}
                      onChangeText={setGarageMake}
                      placeholder="Make"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.priceInput, styles.garageHalfInput]}
                    />
                    <TextInput
                      value={garageModel}
                      onChangeText={setGarageModel}
                      placeholder="Model"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.priceInput, styles.garageHalfInput]}
                    />
                  </View>
                  <View style={styles.garageInputRow}>
                    <TextInput
                      value={garageYear}
                      onChangeText={setGarageYear}
                      placeholder="Year"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="number-pad"
                      style={[styles.priceInput, styles.garageHalfInput]}
                    />
                    <TextInput
                      value={garagePlate}
                      placeholder="Plate number"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="characters"
                      maxLength={8}
                      onChangeText={(value) => setGaragePlate(sanitizePlateNumber(value))}
                      style={[styles.priceInput, styles.garageHalfInput]}
                    />
                  </View>
                  <View style={styles.garageChoiceRow}>
                    {(['Gasoline', 'Diesel', 'Electric'] as const).map((fuelType) => (
                      <Pressable
                        key={fuelType}
                        onPress={() => setGarageFuelType(fuelType)}
                        style={[
                          styles.fuelChoice,
                          garageFuelType === fuelType && styles.garageChoiceSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.fuelChoiceText,
                            garageFuelType === fuelType && styles.garageChoiceTextSelected,
                          ]}
                        >
                          {fuelType}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    onPress={() => void saveGarageVehicle()}
                    disabled={
                      savingGarageVehicle ||
                      garageLoading ||
                      garageVehicles.length >= 2
                    }
                    style={({ pressed }) => [
                      styles.addPriceButton,
                      pressed && styles.pressed,
                      (savingGarageVehicle ||
                        garageLoading ||
                        garageVehicles.length >= 2) &&
                        styles.disabled,
                    ]}
                  >
                    {savingGarageVehicle || garageLoading ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Ionicons name="add" size={20} color={colors.white} />
                    )}
                    <Text style={styles.addPriceText}>
                      {savingGarageVehicle
                        ? 'Saving...'
                        : garageLoading
                          ? 'Loading garage...'
                        : garageVehicles.length >= 2
                          ? 'Vehicle limit reached'
                          : 'Add vehicle'}
                    </Text>
                  </Pressable>
                </View>
                {garageLoading ? (
                  <ActivityIndicator color={colors.blue} style={styles.garageLoader} />
                ) : garageVehicles.length ? (
                  garageVehicles.map((vehicle) => (
                    <View key={vehicle.id} style={styles.garageVehicleCard}>
                      <Ionicons
                        name={vehicle.type === 'motorcycle' ? 'bicycle-outline' : 'car-outline'}
                        size={22}
                        color={colors.blue}
                      />
                      <View style={styles.garageVehicleCopy}>
                        <Text style={styles.garageVehicleName}>
                          {vehicle.make} {vehicle.model}
                        </Text>
                        <Text style={styles.garageVehicleMeta}>
                          {vehicle.year} · {vehicle.plate_number}
                        </Text>
                        <Pressable
                          onPress={() => void makeGarageVehiclePrimary(vehicle)}
                          disabled={vehicle.is_primary}
                          style={({ pressed }) => [
                            styles.primaryVehicleButton,
                            pressed && styles.pressed,
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: vehicle.is_primary }}
                          accessibilityLabel={
                            vehicle.is_primary
                              ? `${vehicle.make} ${vehicle.model} is the primary vehicle`
                              : `Set ${vehicle.make} ${vehicle.model} as primary`
                          }
                        >
                          <Ionicons
                            name={vehicle.is_primary ? 'checkmark-circle' : 'radio-button-off-outline'}
                            size={18}
                            color={colors.blue}
                          />
                          <Text style={styles.primaryVehicleText}>
                            {vehicle.is_primary ? 'Primary vehicle' : 'Set as primary'}
                          </Text>
                        </Pressable>
                      </View>
                      <Pressable
                        onPress={() => deleteGarageVehicle(vehicle)}
                        hitSlop={8}
                        accessibilityLabel={`Delete ${vehicle.make} ${vehicle.model}`}
                      >
                        <Ionicons name="trash-outline" size={20} color={colors.error} />
                      </Pressable>
                    </View>
                  ))
                ) : (
                  <Text style={styles.garageEmptyText}>No vehicles added yet.</Text>
                )}
              </>
            ) : expandedSection === 'account-details' ? (
              <View style={styles.accountDetails}>
                <View style={styles.accountDetailRow}>
                  <Text style={styles.accountDetailLabel}>Full name</Text>
                  <Text style={styles.accountDetailValue}>{fullName}</Text>
                </View>
                <View style={styles.accountDetailRow}>
                  <Text style={styles.accountDetailLabel}>Email address</Text>
                  <Text style={styles.accountDetailValue}>{email || 'Not provided'}</Text>
                </View>
                <View style={styles.accountDetailRow}>
                  <Text style={styles.accountDetailLabel}>Mobile number</Text>
                  <Text style={styles.accountDetailValue}>
                    {profile?.mobile_number || 'Not provided'}
                  </Text>
                </View>
                <Pressable
                  onPress={openAddressPicker}
                  style={({ pressed }) => [styles.accountDetailRow, pressed && styles.pressed]}
                >
                  <Text style={styles.accountDetailLabel}>Home address</Text>
                  <View style={styles.accountDetailValueRow}>
                    <Text style={styles.accountDetailValue}>
                      {profile?.home_address
                        ? formatHomeAddress(profile.home_address)
                        : 'Not provided'}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </View>
                </Pressable>
                <View style={styles.accountDetailRow}>
                  <Text style={styles.accountDetailLabel}>Account type</Text>
                  <Text style={styles.accountDetailValue}>Mechanic</Text>
                </View>
                <Pressable
                  onPress={requestAccountDeletion}
                  disabled={requestingDeletion}
                  style={({ pressed }) => [
                    styles.deleteAccountRow,
                    pressed && styles.pressed,
                    requestingDeletion && styles.disabled,
                  ]}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                  <Text style={styles.deleteAccountLabel}>
                    {requestingDeletion ? 'Sending request...' : 'Request account deletion'}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.error} />
                </Pressable>
              </View>
            ) : expandedSection === 'maintenance-pricing' ? (
              <>
                <Text style={styles.detailIntro}>
                  List your motorcycle maintenance labor and prices for customers to see.
                </Text>
                <View style={styles.priceForm}>
                  <TextInput
                    value={newService}
                    onChangeText={setNewService}
                    placeholder="Labor name (e.g. Change oil)"
                    placeholderTextColor={colors.textMuted}
                    style={styles.priceInput}
                  />
                  <TextInput
                    value={newPrice}
                    onChangeText={setNewPrice}
                    placeholder="Price (e.g. ₱250)"
                    placeholderTextColor={colors.textMuted}
                    style={styles.priceInput}
                  />
                  <Pressable
                    onPress={() => void addMaintenancePrice()}
                    disabled={savingPrices}
                    style={({ pressed }) => [styles.addPriceButton, pressed && styles.pressed]}
                  >
                    {savingPrices ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Ionicons name={priceAdded ? 'checkmark' : 'add'} size={20} color={colors.white} />
                    )}
                    <Text style={styles.addPriceText}>
                      {savingPrices ? 'Adding...' : priceAdded ? 'Added' : 'Add labor price'}
                    </Text>
                  </Pressable>
                </View>
                {maintenancePrices.length ? (
                  maintenancePrices.map((item, index) => (
                    <View key={`${item.service}-${index}`}>
                      <View style={styles.detailItem}>
                        <Ionicons name="construct-outline" size={20} color={colors.amber} />
                        <Text style={styles.detailItemText}>{item.service}</Text>
                        <Text style={styles.priceValue}>{item.price}</Text>
                        <Pressable
                          onPress={() => {
                            setEditingPriceIndex(index);
                            setEditingService(item.service);
                            setEditingPrice(item.price);
                          }}
                          disabled={savingPrices}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${item.service} price`}
                          style={styles.editPriceAction}
                        >
                          <Ionicons name="create-outline" size={20} color={colors.blue} />
                        </Pressable>
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={styles.detailEmptyCard}>
                    <Ionicons name="pricetag-outline" size={24} color={colors.blue} />
                    <Text style={styles.detailEmpty}>No maintenance labor prices added yet.</Text>
                  </View>
                )}
              </>
            ) : expandedSection === 'specializations' ? (
              <>
                <Text style={styles.detailIntro}>
                  Add the motorcycle services you provide. Separate each service with a comma or a new line.
                </Text>
                <TextInput
                  value={specializationDraft}
                  onChangeText={setSpecializationDraft}
                  placeholder="e.g. Engine repair, Oil change"
                  placeholderTextColor={colors.textMuted}
                  style={styles.specializationInput}
                  multiline
                  maxLength={500}
                  accessibilityLabel="Mechanic specializations"
                />
                <Pressable
                  onPress={() => void saveSpecializations()}
                  disabled={savingSpecializations}
                  style={({ pressed }) => [
                    styles.addPriceButton,
                    pressed && styles.pressed,
                    savingSpecializations && styles.disabled,
                  ]}
                >
                  {savingSpecializations ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Ionicons name="save-outline" size={19} color={colors.white} />
                  )}
                  <Text style={styles.addPriceText}>
                    {savingSpecializations ? 'Saving...' : 'Save specializations'}
                  </Text>
                </Pressable>
                {specializations.length ? (
                  <View style={styles.chips}>
                    {specializations.map((item) => (
                      <View key={item} style={styles.specializationChip}>
                        <Ionicons name="construct-outline" size={18} color={colors.amber} />
                        <Text style={styles.detailItemText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.detailEmptyCard}>
                    <Ionicons name="construct-outline" size={24} color={colors.blue} />
                    <Text style={styles.detailEmpty}>
                      No specializations added yet. Add them above to display your services.
                    </Text>
                  </View>
                )}
              </>
            ) : expandedSection === 'documents' ? (
              documents.length ? (
                documents.map((doc) => (
                  <View key={doc.label} style={styles.detailItem}>
                    <Ionicons name="document-text-outline" size={20} color={colors.amber} />
                    <Text style={styles.detailItemText}>{doc.label}</Text>
                    <View style={styles.statusBadge}>
                      <Text style={styles.docStatus}>{doc.status}</Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.detailEmptyCard}>
                  <Ionicons name="document-text-outline" size={24} color={colors.blue} />
                  <Text style={styles.detailEmpty}>No documents uploaded yet.</Text>
                </View>
              )
            ) : certifications.length || profile?.experience ? (
              <>
                {certifications.map((label) => (
                  <View key={label} style={styles.detailItem}>
                    <Ionicons name="ribbon-outline" size={20} color={colors.amber} />
                    <Text style={styles.detailItemText}>{label}</Text>
                    <View style={styles.statusBadge}>
                      <Text style={styles.docStatus}>Submitted</Text>
                    </View>
                  </View>
                ))}
                {profile?.experience ? (
                  <View style={styles.experienceCard}>
                    <Text style={styles.experienceLabel}>Experience</Text>
                    <Text style={styles.experienceText}>{profile.experience}</Text>
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.detailEmptyCard}>
                <Ionicons name="ribbon-outline" size={24} color={colors.blue} />
                <Text style={styles.detailEmpty}>No certifications added yet.</Text>
              </View>
            )}
            </ScrollView>
            {expandedSection === 'maintenance-pricing' &&
            editingPriceIndex !== null ? (
              <View style={styles.editPriceOverlay}>
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={() => {
                    if (savingPrices) return;
                    setEditingPriceIndex(null);
                    setEditingService('');
                    setEditingPrice('');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Close price editor"
                />
                <View style={styles.editPricePopup}>
                  <View style={styles.editPricePopupHeader}>
                    <View style={styles.editPricePopupIcon}>
                      <Ionicons name="pricetag-outline" size={20} color={colors.blue} />
                    </View>
                    <View style={styles.editPricePopupTitleGroup}>
                      <Text style={styles.editPriceTitle}>Edit service</Text>
                      <Text style={styles.editPriceSubtitle}>
                        Update the service name or price.
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        setEditingPriceIndex(null);
                        setEditingService('');
                        setEditingPrice('');
                      }}
                      disabled={savingPrices}
                      hitSlop={8}
                      accessibilityLabel="Close price editor"
                    >
                      <Ionicons name="close" size={22} color={colors.textMuted} />
                    </Pressable>
                  </View>
                  <View style={styles.editPriceField}>
                    <Text style={styles.editPriceLabel}>Service name</Text>
                    <TextInput
                      value={editingService}
                      onChangeText={setEditingService}
                      placeholder="Labor name"
                      placeholderTextColor={colors.textMuted}
                      style={styles.editPriceInput}
                    />
                  </View>
                  <View style={styles.editPriceField}>
                    <Text style={styles.editPriceLabel}>Price</Text>
                    <TextInput
                      value={editingPrice}
                      onChangeText={setEditingPrice}
                      placeholder="₱0.00"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      style={styles.editPriceInput}
                    />
                  </View>
                  <View style={styles.editPriceButtons}>
                    <Pressable
                      onPress={() => {
                        setEditingPriceIndex(null);
                        setEditingService('');
                        setEditingPrice('');
                      }}
                      disabled={savingPrices}
                      style={({ pressed }) => [
                        styles.editPriceCancelButton,
                        pressed && styles.pressed,
                        savingPrices && styles.disabled,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel editing service"
                    >
                      <Text style={styles.editPriceCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void saveEditedMaintenancePrice(editingPriceIndex)}
                      disabled={savingPrices}
                      style={({ pressed }) => [
                        styles.editPriceSaveButton,
                        pressed && styles.pressed,
                        savingPrices && styles.disabled,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Save service changes"
                    >
                      {savingPrices ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <Text style={styles.editPriceSaveText}>Save changes</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : null}
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        visible={addressPickerVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setAddressPickerVisible(false)}
      >
        <SafeAreaView style={styles.addressPickerScreen} edges={['top', 'bottom']}>
          <View style={styles.detailTopRow}>
            <Text style={styles.detailHeaderTitle}>Set Home Address</Text>
            <Pressable
              onPress={() => setAddressPickerVisible(false)}
              style={styles.closeButton}
              accessibilityLabel="Close address picker"
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.detailDivider} />
          <WebView
            source={{
              html: createAddressMapHtml(
                profile?.home_latitude || 14.5995,
                profile?.home_longitude || 120.9842,
              ),
            }}
            onMessage={handleAddressMapMessage}
            javaScriptEnabled
            style={styles.addressMap}
          />
          <View style={styles.addressPickerFooter}>
            <Text style={styles.selectedAddressText} numberOfLines={2}>
              {selectedAddress?.address || 'Search or tap the map to choose your home address.'}
            </Text>
            <Pressable
              onPress={saveSelectedAddress}
              disabled={savingAddress}
              style={({ pressed }) => [
                styles.saveAddressButton,
                pressed && styles.pressed,
                savingAddress && styles.disabled,
              ]}
            >
              <Text style={styles.saveAddressButtonText}>
                {savingAddress ? 'Saving...' : 'Save address'}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </MechanicScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    padding: spacing.lg,
    marginBottom: 0,
  },
  profileInfo: {
    flex: 1,
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
  },
  avatarColumn: {
    alignItems: 'center',
    marginRight: spacing.md,
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
  avatarLoading: {
    width: '100%',
    height: '100%',
    borderRadius: 42,
    backgroundColor: colors.bgElevated,
  },
  avatarUploadingOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: 42,
    backgroundColor: 'rgba(16, 24, 40, 0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  avatarUploadingText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '700',
  },
  avatarSuccessOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(16, 24, 40, 0.48)',
  },
  avatarSuccessCard: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    borderRadius: radii.lg,
    backgroundColor: colors.bgElevated,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  avatarSuccessIcon: {
    width: 58,
    height: 58,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
    marginBottom: spacing.md,
  },
  avatarSuccessTitle: {
    color: colors.success,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  avatarSuccessMessage: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.xs,
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
  avatarPickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
  },
  avatarPickerCard: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    backgroundColor: colors.bgElevated,
  },
  avatarPickerHandle: {
    width: 46,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C7CBD4',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  avatarPickerTitle: {
    color: colors.text,
    fontSize: 23,
    fontWeight: '800',
    textAlign: 'center',
  },
  avatarPickerSubtitle: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  avatarPickerOptions: {
    gap: spacing.sm,
  },
  avatarPickerOption: {
    minHeight: 76,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  avatarPickerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPickerCopy: {
    flex: 1,
    marginLeft: spacing.md,
  },
  avatarPickerOptionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  avatarPickerOptionText: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 3,
  },
  avatarPickerCancel: {
    minHeight: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  avatarPickerCancelText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
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
  status: {
    marginTop: 4,
    fontWeight: '700',
  },
  online: {
    color: colors.success,
  },
  offline: {
    color: colors.textMuted,
  },
  accordionList: {
    backgroundColor: colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  accordion: {
    backgroundColor: colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    overflow: 'hidden',
  },
  sectionSeparator: {
    height: spacing.md,
    backgroundColor: colors.bg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 58,
    paddingHorizontal: spacing.md,
  },
  sectionIconImage: {
    width: 28,
    height: 28,
  },
  section: {
    flex: 1,
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  sectionContent: {
    padding: spacing.md,
    backgroundColor: colors.bg,
  },
  detailScreen: {
    width: '100%',
    height: '88%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    overflow: 'hidden',
  },
  detailOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  detailScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  detailTopRow: {
    minHeight: 56,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailHeaderTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  detailDivider: {
    height: 0,
  },
  detailContent: {
    padding: 12,
    paddingBottom: spacing.lg,
  },
  detailIntro: {
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  priceForm: {
    gap: 8,
    marginBottom: spacing.md,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.blueSoft,
    borderRadius: radii.md,
    backgroundColor: colors.blueSoft,
  },
  specializationInput: {
    minHeight: 76,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.blueSoft,
    borderRadius: radii.md,
    backgroundColor: colors.bgElevated,
    color: colors.text,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  priceInput: {
    minHeight: 42,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.blueSoft,
    borderRadius: radii.md,
    backgroundColor: colors.bgElevated,
    color: colors.text,
  },
  garageVehicleForm: {
    gap: 8,
    marginBottom: spacing.md,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.blueSoft,
    borderRadius: radii.md,
    backgroundColor: colors.blueSoft,
  },
  garageFormTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  garageFormTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  garageCapacity: {
    color: colors.blue,
    fontSize: 12,
    fontWeight: '800',
  },
  garageChoiceRow: {
    flexDirection: 'row',
    gap: 6,
  },
  garageChoice: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.bgElevated,
  },
  garageChoiceSelected: {
    borderColor: colors.blue,
    backgroundColor: colors.blue,
  },
  garageChoiceText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  garageChoiceTextSelected: {
    color: colors.white,
  },
  garageInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  garageHalfInput: {
    flex: 1,
    minWidth: 0,
  },
  fuelChoice: {
    flex: 1,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    backgroundColor: colors.bgElevated,
  },
  fuelChoiceText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  garageVehicleCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.bgElevated,
  },
  garageVehicleCopy: {
    flex: 1,
    gap: 3,
  },
  garageVehicleName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  garageVehicleMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  primaryVehicleButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 2,
    paddingHorizontal: 10,
    borderRadius: radii.full,
    backgroundColor: colors.blueSoft,
  },
  primaryVehicleText: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: '800',
  },
  garageLoader: {
    marginVertical: spacing.md,
  },
  garageEmptyText: {
    paddingVertical: spacing.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
  addPriceButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.blue,
  },
  addPriceText: {
    color: colors.white,
    fontWeight: '800',
  },
  detailItem: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 10,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    marginBottom: 6,
  },
  editPriceOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
  },
  editPricePopup: {
    width: '100%',
    maxWidth: 420,
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgElevated,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  editPricePopupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editPricePopupIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    backgroundColor: colors.blueSoft,
  },
  editPricePopupTitleGroup: {
    flex: 1,
  },
  editPriceTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  editPriceSubtitle: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
  },
  editPriceField: {
    gap: spacing.xs,
  },
  editPriceLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  editPriceInput: {
    minHeight: 42,
    backgroundColor: colors.bgElevated,
  },
  editPriceButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  editPriceSaveButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.blue,
  },
  editPriceSaveText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  editPriceCancelButton: {
    minWidth: 92,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.bgElevated,
  },
  editPriceCancelText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  editPriceAction: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailItemText: {
    flex: 1,
    color: colors.text,
    fontWeight: '600',
  },
  priceValue: {
    minWidth: 72,
    textAlign: 'right',
    color: colors.blue,
    fontWeight: '800',
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    backgroundColor: colors.blueSoft,
  },
  detailEmpty: {
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  detailEmptyCard: {
    alignItems: 'center',
    gap: 8,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.blueSoft,
    borderRadius: radii.md,
    backgroundColor: colors.bgElevated,
  },
  experienceCard: {
    marginTop: spacing.sm,
    padding: 12,
    backgroundColor: colors.blueSoft,
    borderWidth: 1,
    borderColor: colors.blueSoft,
    borderRadius: radii.md,
  },
  experienceLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  experienceText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  accountDetails: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.bgElevated,
  },
  accountDetailRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    backgroundColor: colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  accountDetailLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  accountDetailValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    flex: 1.4,
    textAlign: 'right',
  },
  accountDetailValueRow: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  addressPickerScreen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  addressMap: {
    flex: 1,
  },
  addressPickerFooter: {
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  selectedAddressText: {
    color: colors.textMuted,
    lineHeight: 19,
  },
  saveAddressButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.blue,
  },
  saveAddressButtonText: {
    color: colors.white,
    fontWeight: '800',
  },
  deleteAccountRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 12,
    backgroundColor: colors.errorSoft,
  },
  deleteAccountLabel: {
    flex: 1,
    color: colors.error,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.6,
  },
  chips: {
    gap: 6,
    marginTop: spacing.md,
  },
  specializationChip: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 10,
    backgroundColor: colors.blueSoft,
    borderWidth: 1,
    borderColor: colors.blueSoft,
    borderRadius: radii.md,
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
    color: colors.blue,
    fontWeight: '700',
    fontSize: 12,
  },
  pending: {
    color: colors.amber,
  },
  logout: {
    marginTop: spacing.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 0,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  logoutIcon: {
    width: 22,
    height: 22,
    resizeMode: 'contain',
  },
  logoutText: {
    color: colors.text,
    fontWeight: '700',
  },
  logoutModalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
  },
  logoutModalCard: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  logoutModalClose: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    zIndex: 1,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutModalImage: {
    width: 180,
    height: 170,
    marginBottom: spacing.sm,
  },
  logoutModalTitle: {
    color: '#111111',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  logoutModalMessage: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    color: '#4B4B4B',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  logoutModalActions: {
    width: '100%',
    flexDirection: 'row',
    gap: spacing.md,
  },
  logoutModalCancel: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#8A8A8A',
    borderRadius: radii.full,
  },
  logoutModalCancelText: {
    color: '#333333',
    fontSize: 17,
    fontWeight: '600',
  },
  logoutModalConfirm: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#050505',
    borderRadius: radii.full,
  },
  logoutModalConfirmText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
});
