import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { supabase } from '@/lib/supabase'; // Adjust this path if needed
import { Ionicons } from '@expo/vector-icons';

// Haversine formula to calculate true distance between two coordinates in kilometers
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c).toFixed(1);
};

export default function MotoristMap() {
  const router = useRouter();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  
  // UI & Live Data States
  const [liveMechanics, setLiveMechanics] = useState<any[]>([]);
  const [selectedMechanic, setSelectedMechanic] = useState<any>(null);
  const [activeRequest, setActiveRequest] = useState<any>(null);

  const fetchLiveMechanics = async (userLat: number, userLng: number) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'mechanic')
      .eq('status', 'available');

    if (error) {
      console.log("Error fetching mechanics:", error);
      return;
    }

    if (data) {
      const formattedMechanics = data.map(mech => ({
        id: mech.id,
        name: mech.full_name || 'Unnamed Mechanic',
        rating: mech.average_rating || 0,
        price: mech.base_price || 500,
        latitude: mech.latitude,
        longitude: mech.longitude,
        distance: `${calculateDistance(userLat, userLng, mech.latitude, mech.longitude)} km`
      }));
      
      setLiveMechanics(formattedMechanics);
    }
  };

  useEffect(() => {
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        setHasPermission(true);
        let currentLoc = await Location.getCurrentPositionAsync({});
        setLocation(currentLoc);
        // Fetch live mechanics once we have the user's location
        fetchLiveMechanics(currentLoc.coords.latitude, currentLoc.coords.longitude);
      } else {
        setHasPermission(false);
      }
    })();
  }, []);

  const requestLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      setHasPermission(true);
      let currentLoc = await Location.getCurrentPositionAsync({});
      setLocation(currentLoc);
      fetchLiveMechanics(currentLoc.coords.latitude, currentLoc.coords.longitude);
    } else {
      setHasPermission(false);
    }
  };

  // ROUTE TO EMERGENCY CHECKLIST
  const handleEmergencySOS = () => {
    if (!location) {
      Alert.alert("Location Required", "Please wait while we pinpoint your location.");
      return;
    }

    router.push({
      pathname: '/emergency-checklist',
      params: { lat: location.coords.latitude, lng: location.coords.longitude }
    });
  };

  // LIVE BOOKING PREPARATION
  const handleBookNow = async () => {
    if (!selectedMechanic) return;
    
    // In the next step, this will run a real insert into service_requests targeting selectedMechanic.id
    Alert.alert(
      "Request Sent", 
      `Waiting for ${selectedMechanic.name} to accept your booking...`,
      [{ 
        text: "OK", 
        onPress: () => {
          setActiveRequest({ status: 'pending', mechanic: selectedMechanic });
          setSelectedMechanic(null);
        }
      }]
    );
  };

  const cancelRequest = () => {
    setActiveRequest(null);
  };

  if (!hasPermission) {
    return (
      <View style={styles.fallbackContainer}>
        <Text style={styles.fallbackText}>Share your location to find nearby mechanics.</Text>
        <TouchableOpacity style={styles.button} onPress={requestLocation}>
          <Text style={styles.buttonText}>Enable Location</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!location) {
    return (
      <View style={styles.fallbackContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={[styles.fallbackText, { marginTop: 16 }]}>Pinpointing your location...</Text>
      </View>
    );
  }

  // Inject Leaflet Map with Live Database Mechanics
  const mapHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body { padding: 0; margin: 0; background-color: #121212; }
          #map { height: 100vh; width: 100vw; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', { zoomControl: false }).setView([${location.coords.latitude}, ${location.coords.longitude}], 15);
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(map);

          // User Marker (Blue)
          var userIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41]
          });
          L.marker([${location.coords.latitude}, ${location.coords.longitude}], {icon: userIcon}).addTo(map).bindPopup("<b>You are here</b>");

          // Mechanic Marker (Red)
          var mechIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41]
          });

          // Injecting Live Supabase Data into Map
          var mechanics = ${JSON.stringify(liveMechanics)};
          
          mechanics.forEach(function(mech) {
            // Only plot if the mechanic actually has coordinates
            if (mech.latitude && mech.longitude) {
              var marker = L.marker([mech.latitude, mech.longitude], {icon: mechIcon}).addTo(map);
              
              marker.on('click', function() {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MECHANIC_SELECTED', mechanic: mech }));
              });
            }
          });
        </script>
      </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <WebView 
        source={{ html: mapHtml }} 
        style={styles.map} 
        scrollEnabled={false} 
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'MECHANIC_SELECTED' && !activeRequest) {
              setSelectedMechanic(data.mechanic);
            }
          } catch (e) {
            console.log("Error parsing webview message", e);
          }
        }}
      />
      
      {/* NEW: Top Navigation Overlay */}
      <View style={styles.topOverlay}>
        <TouchableOpacity style={styles.iconCircle} onPress={() => router.push('/motorist-profile')}>
          <Ionicons name="person" size={24} color="#ffffff" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.iconCircle} onPress={() => router.push('/motorist-activity')}>
          <Ionicons name="receipt" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* UI Overlay Logic */}
      <View style={styles.overlay}>
        
        {/* State 1: Active Request Tracking */}
        {activeRequest ? (
          <View style={styles.card}>
            <ActivityIndicator size="large" color="#3b82f6" style={{ marginBottom: 12 }} />
            <Text style={styles.title}>Waiting for {activeRequest.mechanic.name}...</Text>
            <Text style={styles.subtitle}>The mechanic is reviewing your request.</Text>
            <TouchableOpacity style={styles.cancelButton} onPress={cancelRequest}>
              <Text style={styles.cancelButtonText}>Cancel Request</Text>
            </TouchableOpacity>
          </View>
        ) : 
        
        /* State 2: Mechanic Profile Selected */
        selectedMechanic ? (
          <View style={styles.card}>
            <View style={styles.profileHeader}>
              <View>
                <Text style={styles.title}>{selectedMechanic.name}</Text>
                <Text style={styles.rating}>⭐ {selectedMechanic.rating}  •  📍 {selectedMechanic.distance}</Text>
              </View>
              <Text style={styles.price}>₱{selectedMechanic.price}</Text>
            </View>

            <Text style={styles.subtitle}>Estimated base price for standard service.</Text>

            <TouchableOpacity style={styles.bookButton} onPress={handleBookNow}>
              <Text style={styles.bookButtonText}>⚡ Book Now</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.scheduleButton} 
              onPress={() => router.push({
                pathname: '/schedule',
                params: { 
                  lat: location.coords.latitude, 
                  lng: location.coords.longitude,
                  mechanicId: selectedMechanic.id 
                }
              })}
            >
              <Text style={styles.scheduleText}>📅 Schedule for Later</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.cancelButton, {marginTop: 12}]} onPress={() => setSelectedMechanic(null)}>
              <Text style={styles.cancelButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        ) : 
        
        /* State 3: Default Map View with SOS Button */
        (
          <View style={{ width: '100%', alignItems: 'center' }}>
            <TouchableOpacity style={styles.sosButton} onPress={handleEmergencySOS}>
              <Text style={styles.sosText}>🚨 EMERGENCY SOS</Text>
            </TouchableOpacity>

            <View style={styles.defaultBanner}>
              <Text style={styles.bannerText}>Tap a red marker on the map to view mechanic profiles and book services.</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
  fallbackContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#121212' },
  fallbackText: { fontSize: 16, textAlign: 'center', marginBottom: 24, color: '#ffffff', lineHeight: 24 },
  button: { backgroundColor: '#3b82f6', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 8 },
  buttonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 },
  overlay: { position: 'absolute', bottom: 30, width: '100%', alignItems: 'center', paddingHorizontal: 16 },
  
  card: { backgroundColor: '#1e1e1e', width: '100%', padding: 24, borderRadius: 20, elevation: 5 },
  profileHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { color: '#ffffff', fontSize: 20, fontWeight: 'bold' },
  rating: { color: '#facc15', fontSize: 14, marginTop: 4, fontWeight: '600' },
  price: { color: '#10b981', fontSize: 22, fontWeight: '900' },
  subtitle: { color: '#aaaaaa', fontSize: 14, marginBottom: 20 },
  
  sosButton: { backgroundColor: '#ef4444', paddingVertical: 16, width: '100%', borderRadius: 25, alignItems: 'center', marginBottom: 16, elevation: 5 },
  sosText: { color: '#ffffff', fontWeight: '900', fontSize: 16, letterSpacing: 1 },

  bookButton: { backgroundColor: '#ef4444', paddingVertical: 14, width: '100%', borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  bookButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 },
  scheduleButton: { backgroundColor: '#3b82f6', paddingVertical: 14, width: '100%', borderRadius: 12, alignItems: 'center' },
  scheduleText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 },
  
  cancelButton: { paddingVertical: 10, alignItems: 'center' },
  cancelButtonText: { color: '#ef4444', fontWeight: 'bold', fontSize: 14 },

  defaultBanner: { backgroundColor: 'rgba(30,30,30,0.9)', padding: 16, borderRadius: 12, width: '100%', alignItems: 'center' },
  bannerText: { color: '#ffffff', fontSize: 14, textAlign: 'center', fontWeight: '600' },
  topOverlay: { position: 'absolute', top: 50, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', zIndex: 10 },
  iconCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center', elevation: 5, borderWidth: 1, borderColor: '#333' },
});