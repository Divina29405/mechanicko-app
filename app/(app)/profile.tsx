import { Ionicons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { MechanicScreen } from '@/components/mechanic/MechanicScreen';
import { useAuth } from '@/contexts/AuthContext';
import { useMechanic } from '@/contexts/MechanicContext';
import { colors, radii, spacing } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

function withCacheBust(url: string) {
  return `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
}

type MaintenancePrice = {
  service: string;
  price: string;
};

type SelectedAddress = {
  address: string;
  latitude: number;
  longitude: number;
};

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
  const [expandedSection, setExpandedSection] = useState<
    | 'specializations'
    | 'documents'
    | 'certifications'
    | 'maintenance-pricing'
    | 'account-details'
    | null
  >(null);
  const [maintenancePrices, setMaintenancePrices] = useState<MaintenancePrice[]>([]);
  const [newService, setNewService] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [savingPrices, setSavingPrices] = useState(false);
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
  const email = session?.user.email ?? '';
  const fullName =
    typeof session?.user.user_metadata?.full_name === 'string'
      ? session.user.user_metadata.full_name
      : email.split('@')[0];

  useEffect(() => {
    if (!session?.user.id) return;
    void supabase
      .from('profiles')
      .select(
        'mobile_number,home_address,home_latitude,home_longitude,skills,certifications,maintenance_pricing,experience,license_front_path,license_back_path',
      )
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          Alert.alert('Profile unavailable', error.message);
          return;
        }
        const metadata = session.user.user_metadata ?? {};
        const metadataLatitude =
          typeof metadata.home_latitude === 'number' ? metadata.home_latitude : null;
        const metadataLongitude =
          typeof metadata.home_longitude === 'number' ? metadata.home_longitude : null;
        const mergedProfile = data
          ? {
              ...data,
              home_address:
                data.home_address ||
                (typeof metadata.home_address === 'string' ? metadata.home_address : null),
              home_latitude: data.home_latitude ?? metadataLatitude,
              home_longitude: data.home_longitude ?? metadataLongitude,
            }
          : {
              mobile_number: null,
              home_address:
                typeof metadata.home_address === 'string' ? metadata.home_address : null,
              home_latitude: metadataLatitude,
              home_longitude: metadataLongitude,
              skills: null,
              certifications: null,
              maintenance_pricing: null,
              experience: null,
              license_front_path: null,
              license_back_path: null,
            };
        setProfile(mergedProfile);
        setMaintenancePrices(
          Array.isArray(mergedProfile.maintenance_pricing)
            ? mergedProfile.maintenance_pricing
            : [],
        );
      });
  }, [session?.user.id, session?.user.user_metadata]);

  const specializations = (profile?.skills ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const certifications = profile?.certifications
    ? profile.certifications
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean)
    : [];
  const documents =
    profile?.license_front_path || profile?.license_back_path
      ? [{ label: 'Driver’s license', status: 'Submitted' }]
      : [];

  function toggleSection(
    section:
      | 'specializations'
      | 'documents'
      | 'certifications'
      | 'maintenance-pricing'
      | 'account-details',
  ) {
    setExpandedSection(section);
  }

  async function saveMaintenancePrices(nextPrices: MaintenancePrice[]) {
    if (!session?.user.id) return;
    setSavingPrices(true);
    const { error } = await supabase
      .from('profiles')
      .update({ maintenance_pricing: nextPrices })
      .eq('id', session.user.id);
    setSavingPrices(false);
    if (error) {
      Alert.alert('Unable to save pricing', error.message);
      return;
    }
    setMaintenancePrices(nextPrices);
  }

  function addMaintenancePrice() {
    const service = newService.trim();
    const price = newPrice.trim();
    if (!service || !price) {
      Alert.alert('Incomplete pricing', 'Enter the labor name and price first.');
      return;
    }
    const nextPrices = [...maintenancePrices, { service, price }];
    void saveMaintenancePrices(nextPrices);
    setNewService('');
    setNewPrice('');
  }

  function removeMaintenancePrice(index: number) {
    const nextPrices = maintenancePrices.filter((_, itemIndex) => itemIndex !== index);
    Alert.alert('Remove labor price?', 'This item will be removed from your public pricing list.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void saveMaintenancePrices(nextPrices) },
    ]);
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
          address: message.address,
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
    const { data, error } = await supabase.rpc('save_mechanic_home_location', {
      p_home_address: selectedAddress.address,
      p_home_latitude: selectedAddress.latitude,
      p_home_longitude: selectedAddress.longitude,
    });
    setSavingAddress(false);

    if (error) {
      Alert.alert('Unable to save address', error.message);
      return;
    }
    const saved = Array.isArray(data) ? data[0] : data;
    if (!saved?.home_address) {
      Alert.alert('Unable to save address', 'No mechanic profile was updated.');
      return;
    }
    setProfile((current) => (current ? {
      ...current,
      home_address: saved.home_address,
      home_latitude: saved.home_latitude,
      home_longitude: saved.home_longitude,
    } : current));
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
    const requestId = ++avatarRequestId.current;
    setAvatarUrl(null);
    try {
      const converted = await ImageManipulator.manipulateAsync(result.assets[0].uri, [], {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      const convertedFile = new File(converted.uri);
      if (!convertedFile.exists) {
        throw new Error('The converted photo was not created on the device.');
      }
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

      const signed = await supabase.storage
        .from('mechanic-avatars')
        .createSignedUrl(path, 60 * 60);
      if (signed.error || !signed.data?.signedUrl) {
        throw new Error(signed.error?.message ?? 'The photo was saved but could not be loaded.');
      }
      const imageResponse = await fetch(signed.data.signedUrl);
      const contentType = imageResponse.headers.get('content-type') ?? '';
      if (!imageResponse.ok || !contentType.startsWith('image/')) {
        throw new Error(
          `The uploaded file is not being served as an image (${imageResponse.status}, ${contentType || 'unknown content type'}).`,
        );
      }
      if (requestId === avatarRequestId.current) {
        setAvatarUrl(withCacheBust(signed.data.signedUrl));
      }
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
    <MechanicScreen back title="My Profile">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Pressable onPress={chooseAvatar} style={styles.avatarButton} disabled={uploadingAvatar}>
            {avatarLoading ? (
              <View style={styles.avatarLoading} />
            ) : avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatarImage}
                onError={(event) => {
                  setAvatarUrl(null);
                  const nativeError = event.nativeEvent.error;
                  Alert.alert(
                    'Profile photo unavailable',
                    nativeError ?? 'The image URL could not be loaded.',
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
          <View style={styles.profileInfo}>
            <Text style={styles.name}>{fullName}</Text>
            <Text style={styles.meta}>{email}</Text>
            <Text style={styles.meta}>{rating.toFixed(1)} ★</Text>
            <Text style={[styles.status, online ? styles.online : styles.offline]}>
              {online ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>

        <View style={styles.accordionList}>
          <View style={styles.accordion}>
            <Pressable
              onPress={() => toggleSection('specializations')}
              style={({ pressed }) => [styles.sectionHeader, pressed && styles.pressed]}
            >
              <View style={styles.sectionIcon}>
                <Ionicons name="construct-outline" size={20} color={colors.amber} />
              </View>
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
              <View style={styles.sectionIcon}>
                <Ionicons name="document-text-outline" size={20} color={colors.amber} />
              </View>
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
              <View style={styles.sectionIcon}>
                <Ionicons name="ribbon-outline" size={20} color={colors.amber} />
              </View>
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
              <View style={styles.sectionIcon}>
                <Ionicons name="pricetag-outline" size={20} color={colors.amber} />
              </View>
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
              <View style={styles.sectionIcon}>
                <Ionicons name="person-circle-outline" size={20} color={colors.amber} />
              </View>
              <Text style={styles.section}>Account Details</Text>
              <Ionicons
                name={expandedSection === 'account-details' ? 'chevron-up' : 'chevron-forward'}
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
          </View>
        </View>

        <Pressable onPress={signOut} style={({ pressed }) => [styles.logout, pressed && styles.pressed]}>
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </ScrollView>
      <Modal
        visible={expandedSection !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setExpandedSection(null)}
      >
        <SafeAreaView style={styles.detailScreen} edges={['top', 'bottom']}>
          <View style={styles.detailTopRow}>
            <Text style={styles.detailHeaderTitle}>
              {expandedSection === 'specializations'
                ? 'Specializations'
                : expandedSection === 'documents'
                  ? 'Documents'
                  : expandedSection === 'certifications'
                    ? 'Certifications'
                    : expandedSection === 'account-details'
                      ? 'Account Details'
                      : 'Maintenance Pricing'}
            </Text>
            <Pressable
              onPress={() => setExpandedSection(null)}
              style={styles.closeButton}
              accessibilityLabel="Close profile details"
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.detailDivider} />
          <ScrollView contentContainerStyle={styles.detailContent}>
            {expandedSection === 'account-details' ? (
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
                      {profile?.home_address || 'Not provided'}
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
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
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
                    onPress={addMaintenancePrice}
                    disabled={savingPrices}
                    style={({ pressed }) => [styles.addPriceButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="add" size={20} color={colors.white} />
                    <Text style={styles.addPriceText}>Add labor price</Text>
                  </Pressable>
                </View>
                {maintenancePrices.length ? (
                  maintenancePrices.map((item, index) => (
                    <View key={`${item.service}-${index}`} style={styles.detailItem}>
                      <Ionicons name="construct-outline" size={20} color={colors.amber} />
                      <View style={styles.priceText}>
                        <Text style={styles.detailItemText}>{item.service}</Text>
                        <Text style={styles.priceValue}>{item.price}</Text>
                      </View>
                      <Pressable
                        onPress={() => removeMaintenancePrice(index)}
                        accessibilityLabel={`Remove ${item.service}`}
                      >
                        <Ionicons name="trash-outline" size={20} color={colors.error} />
                      </Pressable>
                    </View>
                  ))
                ) : (
                  <Text style={styles.detailEmpty}>No maintenance labor prices added yet.</Text>
                )}
              </>
            ) : expandedSection === 'specializations' ? (
              specializations.length ? (
                <View style={styles.chips}>
                  {specializations.map((item) => (
                    <View key={item} style={styles.detailItem}>
                      <Ionicons name="construct-outline" size={20} color={colors.amber} />
                      <Text style={styles.detailItemText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.detailEmpty}>No specializations added yet.</Text>
              )
            ) : expandedSection === 'documents' ? (
              documents.length ? (
                documents.map((doc) => (
                  <View key={doc.label} style={styles.detailItem}>
                    <Ionicons name="document-text-outline" size={20} color={colors.amber} />
                    <Text style={styles.detailItemText}>{doc.label}</Text>
                    <Text style={styles.docStatus}>{doc.status}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.detailEmpty}>No documents uploaded yet.</Text>
              )
            ) : certifications.length ? (
              certifications.map((label) => (
                <View key={label} style={styles.detailItem}>
                  <Ionicons name="ribbon-outline" size={20} color={colors.amber} />
                  <Text style={styles.detailItemText}>{label}</Text>
                  <Text style={styles.docStatus}>Verified</Text>
                </View>
              ))
            ) : (
              <Text style={styles.detailEmpty}>No certifications uploaded yet.</Text>
            )}
          </ScrollView>
        </SafeAreaView>
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
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.md,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
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
    flex: 1,
    backgroundColor: colors.bg,
  },
  detailTopRow: {
    minHeight: 60,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailHeaderTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  detailDivider: {
    height: 1,
    marginHorizontal: spacing.md,
    backgroundColor: colors.border,
  },
  detailContent: {
    padding: spacing.md,
  },
  detailIntro: {
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  priceForm: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  priceInput: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.bgElevated,
    color: colors.text,
  },
  addPriceButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: colors.amber,
  },
  addPriceText: {
    color: colors.white,
    fontWeight: '800',
  },
  detailItem: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailItemText: {
    flex: 1,
    color: colors.text,
    fontWeight: '600',
  },
  priceText: {
    flex: 1,
  },
  priceValue: {
    marginTop: 4,
    color: colors.success,
    fontWeight: '800',
  },
  detailEmpty: {
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  accountDetails: {
    marginHorizontal: -spacing.md,
    marginBottom: -spacing.md,
  },
  accountDetailRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  accountDetailLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  accountDetailValue: {
    color: colors.text,
    fontSize: 14,
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
    borderRadius: radii.sm,
    backgroundColor: colors.amber,
  },
  saveAddressButtonText: {
    color: colors.white,
    fontWeight: '800',
  },
  deleteAccountRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
