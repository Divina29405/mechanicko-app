import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
  TextInput
} from 'react-native';
import { WebView } from 'react-native-webview';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c).toFixed(1);
};

const CANCELLATION_REASONS = [
  "Mechanic is taking too long",
  "Mechanic is unresponsive",
  "Pinned the wrong location/vehicle",
  "Issue was resolved locally",
  "Other"
];

const webLocation = {
  coords: {
    latitude: 14.5995,
    longitude: 120.9842,
    altitude: null,
    accuracy: 100,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: Date.now(),
} as Location.LocationObject;

export default function MotoristMap() {
  const router = useRouter();
  const { session } = useAuth();
  const { colors } = useAppTheme();
  
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [liveMechanics, setLiveMechanics] = useState<any[]>([]);
  const [selectedMechanic, setSelectedMechanic] = useState<any>(null);
  const [activeRequest, setActiveRequest] = useState<any>(null);
  const [completedJob, setCompletedJob] = useState<any>(null);
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');

  // Cancellation States
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const fetchLiveMechanics = async (userLat: number, userLng: number) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('role', 'mechanic').eq('status', 'available');
    if (!error && data) {
      const formattedMechanics = data.map(mech => ({
        id: mech.id, name: mech.full_name || 'Unnamed Mechanic', rating: mech.average_rating || 0,
        price: mech.base_price || 500, latitude: mech.latitude, longitude: mech.longitude,
        distance: `${calculateDistance(userLat, userLng, mech.latitude, mech.longitude)} km`
      }));
      setLiveMechanics(formattedMechanics);
    }
  };

  useEffect(() => {
    (async () => {
      if (Platform.OS === "web") {
        setHasPermission(true);
        setLocation(webLocation);
        fetchLiveMechanics(
          webLocation.coords.latitude,
          webLocation.coords.longitude,
        );
        return;
      }

      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        setHasPermission(true);
        let currentLoc = await Location.getCurrentPositionAsync({});
        setLocation(currentLoc);
        fetchLiveMechanics(currentLoc.coords.latitude, currentLoc.coords.longitude);
      } else {
        setHasPermission(false);
      }
    })();
  }, []);

  const handleEmergencySOS = () => {
    if (!location) return Alert.alert("Location Required", "Please wait while we pinpoint your location.");
    router.push({ pathname: '/emergency-checklist', params: { lat: location.coords.latitude, lng: location.coords.longitude } });
  };

  const handleBookNow = async () => {
    if (!selectedMechanic || !session?.user?.id || !location) return;
    const { data, error } = await supabase.from('service_requests').insert([{ 
          motorist_id: session.user.id, mechanic_id: selectedMechanic.id, latitude: location.coords.latitude, 
          longitude: location.coords.longitude, status: 'pending', request_type: 'routine'
    }]).select().single();

    if (error) return Alert.alert("Booking Failed", error.message);
    setActiveRequest({ ...data, mechanic: selectedMechanic });
    setSelectedMechanic(null);
  };

  const confirmCancel = async () => {
    if (!cancelReason) {
      Alert.alert("Reason Required", "Please select a reason for cancelling.");
      return;
    }
    
    setIsCancelling(true);

    if (activeRequest?.id) {
      await supabase.from('service_requests').update({ 
        status: 'cancelled',
        cancellation_reason: cancelReason
      }).eq('id', activeRequest.id);
      
      // Strike 1 Warning Implementation
      if (cancelReason === "Issue was resolved locally" || cancelReason === "Other") {
        Alert.alert(
          "⚠️ Warning Recorded", 
          "Cancelling because the issue was resolved locally wastes the dispatched mechanic's time and fuel. Repeated cancellations will result in a temporary account suspension."
        );
      } else {
        Alert.alert("Booking Cancelled", "Your service request has been cancelled.");
      }
    }
    
    setActiveRequest(null);
    setCancelModalVisible(false);
    setCancelReason('');
    setIsCancelling(false);
  };

  useEffect(() => {
    if (!activeRequest?.id) return;
    const channel = supabase.channel(`track_request_${activeRequest.id}`).on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'service_requests', filter: `id=eq.${activeRequest.id}` },
        (payload) => {
          setActiveRequest((prev: any) => ({ ...prev, status: payload.new.status }));
          if (payload.new.status === 'completed') { setCompletedJob(activeRequest); setActiveRequest(null); }
        }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeRequest]);

  const handleCompleteJob = async () => {
    await supabase.from('service_requests').update({ status: 'closed' }).eq('id', completedJob.id);
    Alert.alert("Transaction Closed", "Payment confirmed and review submitted!");
    setCompletedJob(null);
    setRating(5);
    setReview('');
  };

  if (!hasPermission || !location) {
    return (
      <View style={[styles.fallbackContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.fallbackText, { color: colors.text, marginTop: 16 }]}>Pinpointing your location...</Text>
      </View>
    );
  }

  const mapHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>body { padding: 0; margin: 0; background-color: ${colors.bg}; } #map { height: 100vh; width: 100vw; }</style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', { zoomControl: false }).setView([${location.coords.latitude}, ${location.coords.longitude}], 15);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

          var userIcon = L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-black.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41] });
          L.marker([${location.coords.latitude}, ${location.coords.longitude}], {icon: userIcon}).addTo(map).bindPopup("<b>You are here</b>");

          var mechIcon = L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41] });
          var mechanics = ${JSON.stringify(liveMechanics)};
          mechanics.forEach(function(mech) {
            if (mech.latitude && mech.longitude) {
              var marker = L.marker([mech.latitude, mech.longitude], {icon: mechIcon}).addTo(map);
              marker.on('click', function() { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MECHANIC_SELECTED', mechanic: mech })); });
            }
          });
        </script>
      </body>
    </html>
  `;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <WebView source={{ html: mapHtml }} style={styles.map} scrollEnabled={false} onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'MECHANIC_SELECTED' && !activeRequest) setSelectedMechanic(data.mechanic);
          } catch (e) {}
        }}
      />
      
      <View style={styles.topOverlay}>
        <TouchableOpacity style={[styles.iconCircle, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.push('/motorist-profile')}>
          <Ionicons name="person" size={24} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.iconCircle, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.push('/motorist-activity')}>
          <Ionicons name="receipt" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.overlay}>
        {activeRequest ? (
          <View style={[styles.trackingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.trackingHeader, { borderBottomColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={styles.mechanicAvatar}><Ionicons name="person" size={24} color={colors.primary} /></View>
                <View>
                  <Text style={[styles.trackingName, { color: colors.text }]}>{activeRequest.mechanic?.name || 'Your Mechanic'}</Text>
                  <Text style={styles.badge}>✅ Verified Professional</Text>
                </View>
              </View>
              <View style={[styles.etaBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                <Text style={styles.etaText}>15</Text>
                <Text style={styles.etaLabel}>MIN</Text>
              </View>
            </View>
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.statusText}>{activeRequest.status.toUpperCase()}</Text>
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.actionBtnSecondary, { backgroundColor: colors.btnSecondary }]}>
                <Text style={[styles.actionBtnText, { color: colors.text }]}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtnPrimary}>
                <Text style={styles.actionBtnText}>Chat</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setCancelModalVisible(true)}>
              <Text style={styles.cancelButtonText}>Cancel Booking</Text>
            </TouchableOpacity>
          </View>
        ) : selectedMechanic ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.profileHeader}>
              <View>
                <Text style={[styles.title, { color: colors.text }]}>{selectedMechanic.name}</Text>
                <Text style={styles.rating}>★ {selectedMechanic.rating}  •  📍 {selectedMechanic.distance}</Text>
              </View>
              <Text style={[styles.price, { color: colors.text }]}>₱{selectedMechanic.price}</Text>
            </View>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>Estimated base price for standard service.</Text>
            <TouchableOpacity style={styles.bookButton} onPress={handleBookNow}>
              <Text style={styles.bookButtonText}>⚡ Book Now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.cancelButton, {marginTop: 12}]} onPress={() => setSelectedMechanic(null)}>
              <Text style={styles.cancelButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ width: '100%', alignItems: 'center' }}>
            <TouchableOpacity style={styles.sosButton} onPress={handleEmergencySOS}>
              <Text style={styles.sosText}>🚨 EMERGENCY SOS</Text>
            </TouchableOpacity>
            <View style={[styles.defaultBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.bannerText, { color: colors.text }]}>Tap a marker to view profiles and book services.</Text>
            </View>
          </View>
        )}
      </View>

      {/* RATING MODAL */}
      <Modal visible={!!completedJob} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="checkmark-circle" size={60} color="#10b981" style={{ marginBottom: 16 }} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Service Completed!</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>Please pay the mechanic to close this transaction.</Text>
            <View style={[styles.ratingBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Text style={[styles.ratingPrompt, { color: colors.text }]}>Rate {completedJob?.mechanic?.name}</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity key={star} onPress={() => setRating(star)}>
                    <Ionicons name={star <= rating ? "star" : "star-outline"} size={40} color={colors.primary} style={{ marginHorizontal: 4 }} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TextInput style={[styles.reviewInput, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]} placeholder="Leave a review..." placeholderTextColor={colors.textMuted} multiline value={review} onChangeText={setReview} />
            <TouchableOpacity style={styles.submitReviewBtn} onPress={handleCompleteJob}>
              <Text style={styles.submitReviewText}>Confirm Payment & Submit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* CANCELLATION MODAL */}
      <Modal visible={cancelModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Cancel Booking</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>Please select a reason for cancelling. Frequent cancellations may lead to account penalties.</Text>
            
            <View style={{ width: '100%', marginBottom: 20 }}>
              {CANCELLATION_REASONS.map((reason, index) => {
                const isSelected = cancelReason === reason;
                return (
                  <TouchableOpacity 
                    key={index}
                    style={[
                      styles.reasonRow, 
                      { backgroundColor: colors.bg, borderColor: colors.border },
                      isSelected && { borderColor: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.05)' }
                    ]}
                    onPress={() => setCancelReason(reason)}
                  >
                    <Text style={[styles.reasonText, { color: isSelected ? '#EF4444' : colors.text }]}>{reason}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity style={[styles.closeCancelBtn, { backgroundColor: colors.btnSecondary }]} onPress={() => setCancelModalVisible(false)} disabled={isCancelling}>
                <Text style={[styles.actionBtnText, { color: colors.text }]}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmCancelBtn, isCancelling && { opacity: 0.7 }]} onPress={confirmCancel} disabled={isCancelling}>
                <Text style={styles.actionBtnText}>{isCancelling ? 'Processing...' : 'Confirm Cancel'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
  fallbackContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  fallbackText: { fontSize: 16, textAlign: 'center', marginBottom: 24, lineHeight: 24 },
  overlay: { position: 'absolute', bottom: 30, width: '100%', alignItems: 'center', paddingHorizontal: 16 },
  
  card: { width: '100%', padding: 24, borderRadius: 20, elevation: 8, borderWidth: 1 },
  profileHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 20, fontWeight: 'bold' },
  rating: { color: '#FF6B00', fontSize: 14, marginTop: 4, fontWeight: '700' },
  price: { fontSize: 24, fontWeight: '900' },
  subtitle: { fontSize: 14, marginBottom: 20 },
  
  sosButton: { backgroundColor: '#FF3800', paddingVertical: 16, width: '100%', borderRadius: 25, alignItems: 'center', marginBottom: 16, elevation: 8 },
  sosText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16, letterSpacing: 1.5 },
  bookButton: { backgroundColor: '#FF6B00', paddingVertical: 14, width: '100%', borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  bookButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  cancelButton: { paddingVertical: 12, alignItems: 'center' },
  cancelButtonText: { color: '#EF4444', fontWeight: 'bold', fontSize: 14 },

  defaultBanner: { padding: 16, borderRadius: 12, width: '100%', alignItems: 'center', borderWidth: 1, elevation: 3 },
  bannerText: { fontSize: 14, textAlign: 'center', fontWeight: '600' },
  topOverlay: { position: 'absolute', top: 50, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', zIndex: 10 },
  iconCircle: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', elevation: 5, borderWidth: 1 },

  trackingCard: { width: '100%', padding: 20, borderRadius: 20, elevation: 10, borderWidth: 1 },
  trackingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, paddingBottom: 16 },
  mechanicAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255, 107, 0, 0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: '#FF6B00' },
  trackingName: { fontSize: 18, fontWeight: 'bold' },
  badge: { color: '#10b981', fontSize: 12, fontWeight: '700', marginTop: 2 },
  etaBox: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  etaText: { color: '#FF6B00', fontSize: 18, fontWeight: '900' },
  etaLabel: { color: '#6B7280', fontSize: 10, fontWeight: 'bold' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, backgroundColor: 'rgba(255, 107, 0, 0.05)', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255, 107, 0, 0.2)' },
  statusText: { color: '#FF6B00', fontSize: 14, fontWeight: '600', marginLeft: 12 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  actionBtnPrimary: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF6B00', paddingVertical: 12, borderRadius: 12, marginHorizontal: 4 },
  actionBtnSecondary: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, marginHorizontal: 4 },
  actionBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { borderRadius: 24, padding: 24, alignItems: 'center', elevation: 10, borderWidth: 1 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  modalSubtitle: { fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  ratingBox: { width: '100%', alignItems: 'center', marginBottom: 20, paddingVertical: 16, borderRadius: 16, borderWidth: 1 },
  ratingPrompt: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  starsRow: { flexDirection: 'row' },
  reviewInput: { width: '100%', borderRadius: 12, padding: 16, height: 100, textAlignVertical: 'top', marginBottom: 20, borderWidth: 1 },
  submitReviewBtn: { backgroundColor: '#10b981', width: '100%', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  submitReviewText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  
  // Cancellation Styles
  reasonRow: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  reasonText: { fontSize: 14, fontWeight: '600' },
  closeCancelBtn: { flex: 1, paddingVertical: 16, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  confirmCancelBtn: { flex: 1, backgroundColor: '#EF4444', paddingVertical: 16, borderRadius: 12, alignItems: 'center' }
});