import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
  TextInput
} from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { listVehicles } from '@/services/vehicleService';
import type { Vehicle } from '@/types/vehicle';

const bikeIcon = require('../../assets/images/bike.png');

const CANCELLATION_REASONS = [
  "Mechanic is taking too long",
  "Mechanic is unresponsive",
  "Pinned the wrong location/vehicle",
  "Issue was resolved locally",
  "Other"
];

function bookingStatusLabel(status: string | null | undefined) {
  switch (status) {
    case 'scheduled':
    case 'pending':
      return 'Waiting for mechanic to accept';
    case 'accepted':
      return 'Mechanic accepted your booking';
    case 'arrived':
      return 'Mechanic has arrived';
    case 'in_transit':
      return 'Mechanic is on the way';
    case 'in_progress':
      return 'Service is in progress';
    case 'completed':
      return 'Service completed';
    case 'cancelled':
      return 'Booking cancelled';
    default:
      return 'Booking received';
  }
}

const BOOKING_STEPS = [
  ['accepted', 'Accepted'],
  ['in_transit', 'On the way'],
  ['arrived', 'Arrived'],
  ['completed', 'Completed'],
] as const;

function bookingStepIndex(status: string | null | undefined) {
  if (status === 'in_progress') return 2;
  const index = BOOKING_STEPS.findIndex(([value]) => value === status);
  return index;
}

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
  const { colors, isDarkMode } = useAppTheme();
  const motoristId = session?.user.id;
  
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [liveMechanics, setLiveMechanics] = useState<any[]>([]);
  const [selectedMechanic, setSelectedMechanic] = useState<any>(null);
  const [displayedMechanic, setDisplayedMechanic] = useState<any>(null);
  const [showServices, setShowServices] = useState(false);
  const [priceComparisonVisible, setPriceComparisonVisible] = useState(false);
  const [priceSearch, setPriceSearch] = useState('');
  const [mechanicProfileVisible, setMechanicProfileVisible] = useState(false);
  const [mechanicReviews, setMechanicReviews] = useState<any[]>([]);
  const [loadingMechanicReviews, setLoadingMechanicReviews] = useState(false);
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [bookingReceiptVisible, setBookingReceiptVisible] = useState(false);
  const [selectedServices, setSelectedServices] = useState<any[]>([]);
  const [vehicleType, setVehicleType] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [bookingDate, setBookingDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  });
  const [showBookingDatePicker, setShowBookingDatePicker] = useState(false);
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [mechanicPanelAnimation] = useState(() => new Animated.Value(0));
  const [activeRequest, setActiveRequest] = useState<any>(null);
  const [bookingTransition] = useState(() => new Animated.Value(1));
  const [acceptedBookingExpanded, setAcceptedBookingExpanded] = useState(true);
  const [acceptedBookingAnimation] = useState(() => new Animated.Value(1));
  const acceptedBookingPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && Math.abs(gestureState.dy) > 6,
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > 16) {
            setAcceptedBookingExpanded(false);
            Animated.timing(acceptedBookingAnimation, {
              toValue: 0,
              duration: 240,
              useNativeDriver: false,
            }).start();
          } else if (gestureState.dy < -16) {
            setAcceptedBookingExpanded(true);
            Animated.timing(acceptedBookingAnimation, {
              toValue: 1,
              duration: 240,
              useNativeDriver: false,
            }).start();
          }
        },
      }),
    [acceptedBookingAnimation],
  );
  const [completedJob, setCompletedJob] = useState<any>(null);
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [motoristAvatarUrl, setMotoristAvatarUrl] = useState<string | null>(
    typeof session?.user.user_metadata?.avatar_url === 'string'
      ? session.user.user_metadata.avatar_url
      : null,
  );
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [vehicleSelectorVisible, setVehicleSelectorVisible] = useState(false);
  const mapRef = useRef<WebView | null>(null);
  const previousBookingStatus = useRef<string | null>(null);
  const [radarRotation] = useState(() => new Animated.Value(0));
  const motoristAvatarPath = useRef<string | null>(null);
  const motoristName =
    typeof session?.user.user_metadata?.full_name === 'string'
      ? session.user.user_metadata.full_name
      : session?.user.email?.split('@')[0] || 'Motorist';

  useEffect(() => {
    if (selectedMechanic) {
      Animated.timing(mechanicPanelAnimation, {
        toValue: 1,
        duration: 240,
        useNativeDriver: true,
      }).start();
      return;
    }

    if (displayedMechanic) {
      Animated.timing(mechanicPanelAnimation, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setDisplayedMechanic(null);
      });
    }
  }, [displayedMechanic, mechanicPanelAnimation, selectedMechanic]);

  useEffect(() => {
    const radarAnimation = Animated.loop(
      Animated.timing(radarRotation, {
        toValue: 1,
        duration: 1800,
        useNativeDriver: true,
      }),
    );
    radarAnimation.start();
    return () => radarAnimation.stop();
  }, [radarRotation]);

  useEffect(() => {
    if (!activeRequest?.status) return;
    const nextStatus = activeRequest.status as string;
    const previousStatus = previousBookingStatus.current;
    const wasWaiting = previousStatus === 'scheduled' || previousStatus === 'pending';
    const isWaiting = nextStatus === 'scheduled' || nextStatus === 'pending';
    previousBookingStatus.current = nextStatus;

    if (isWaiting) {
      bookingTransition.setValue(1);
      return;
    }

    if (!wasWaiting) {
      bookingTransition.setValue(1);
      return;
    }

    bookingTransition.setValue(0);
    Animated.timing(bookingTransition, {
      toValue: 1,
      duration: 360,
      useNativeDriver: true,
    }).start();
  }, [activeRequest?.status, bookingTransition]);

  function motoristInitials(name: string) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!motoristId) return undefined;
      void supabase
        .from('profiles')
        .select('avatar_path')
        .eq('id', motoristId)
        .maybeSingle()
        .then(async ({ data }) => {
          if (!active) return;
          if (!data?.avatar_path) {
            motoristAvatarPath.current = null;
            if (!session?.user.user_metadata?.avatar_url) setMotoristAvatarUrl(null);
            return;
          }
          if (data.avatar_path === motoristAvatarPath.current && motoristAvatarUrl) {
            return;
          }
          const signed = await supabase.storage
            .from('mechanic-avatars')
            .createSignedUrl(data.avatar_path, 60 * 60);
          if (active) {
            motoristAvatarPath.current = data.avatar_path;
            setMotoristAvatarUrl(signed.data?.signedUrl ?? null);
          }
        });
      return () => {
        active = false;
      };
    }, [motoristAvatarUrl, motoristId, session?.user.user_metadata?.avatar_url]),
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!motoristId) return undefined;

      void listVehicles(motoristId).then(({ data }) => {
        if (!active) return;
        setVehicles(data);
        setSelectedVehicle((current) => {
          if (current && data.some((vehicle) => vehicle.id === current.id)) {
            return data.find((vehicle) => vehicle.id === current.id) ?? current;
          }
          return data.find((vehicle) => vehicle.is_primary) ?? data[0] ?? null;
        });
      });

      return () => {
        active = false;
      };
    }, [motoristId]),
  );

  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const fetchLiveMechanics = async (userLat: number, userLng: number) => {
    const { data, error } = await supabase.rpc('get_nearby_mechanics', {
      p_latitude: userLat,
      p_longitude: userLng,
      p_radius_km: 10,
    });
    if (error) {
      console.warn('Nearby mechanics unavailable:', error.message);
      setLiveMechanics([]);
      return;
    }
    const formattedMechanics = (data ?? []).map((mech: any) => ({
      id: mech.id,
      name: mech.full_name || 'Unnamed Mechanic',
      mobileNumber: mech.mobile_number || null,
      isOnline: mech.is_online !== false,
      rating: Number(mech.average_rating) || 5,
      price: Number(mech.base_price) || 500,
      latitude: mech.home_latitude,
      longitude: mech.home_longitude,
      avatarUrl: mech.avatar_path
        ? supabase.storage.from('mechanic-avatars').getPublicUrl(mech.avatar_path).data.publicUrl
        : null,
      skills: mech.skills || 'General motorcycle service',
      services: Array.isArray(mech.maintenance_pricing) ? mech.maintenance_pricing : [],
      distanceKm: Number(mech.distance_km) || 0,
      distance: `${Number(mech.distance_km).toFixed(1)} km`,
    }));
    setLiveMechanics(formattedMechanics);
  };

  const comparisonResults = useMemo(() => {
    const query = priceSearch.trim().toLowerCase();
    return liveMechanics
      .flatMap((mechanic: any) =>
        (mechanic.services ?? [])
          .filter((service: any) => {
            const name = String(service.service ?? '').toLowerCase();
            return !query || name.includes(query);
          })
          .map((service: any) => ({
            mechanic,
            service,
            numericPrice: Number(String(service.price ?? '').replace(/[^\d.]/g, '')) || 0,
          })),
      )
      .filter((result) => result.numericPrice > 0)
      .sort(
        (first, second) =>
          first.numericPrice - second.numericPrice ||
          second.mechanic.rating - first.mechanic.rating ||
          first.mechanic.distanceKm - second.mechanic.distanceKm,
      );
  }, [liveMechanics, priceSearch]);

  const openPriceComparison = () => {
    setPriceSearch('');
    setPriceComparisonVisible(true);
  };

  const callMechanic = async (phoneNumber: string | null) => {
    if (!phoneNumber) {
      Alert.alert('Number unavailable', 'This mechanic has not provided a contact number.');
      return;
    }
    const url = `tel:${phoneNumber.replace(/[^\d+]/g, '')}`;
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Unable to call', 'Your device cannot open the phone app.');
    }
  };

  const openMechanicProfile = async () => {
    if (!displayedMechanic) return;
    setMechanicProfileVisible(true);
    setLoadingMechanicReviews(true);
    const { data } = await supabase
      .from('mechanic_ratings')
      .select('rating,review,created_at')
      .eq('mechanic_id', displayedMechanic.id)
      .not('review', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);
    setMechanicReviews(data ?? []);
    setLoadingMechanicReviews(false);
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

  const handleRecenterLocation = async () => {
    if (Platform.OS === 'web') {
      mapRef.current?.injectJavaScript(
        `map.setView([${webLocation.coords.latitude}, ${webLocation.coords.longitude}], 15, { animate: true, duration: 0.5 }); true;`,
      );
      return;
    }

    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location Required', 'Please allow location access to recenter the map.');
      return;
    }

    const recenterMap = (currentLocation: Location.LocationObject) => {
      mapRef.current?.injectJavaScript(
        `map.setView([${currentLocation.coords.latitude}, ${currentLocation.coords.longitude}], 15, { animate: true, duration: 0.35 }); true;`,
      );
    };

    if (location) {
      recenterMap(location);
    }

    try {
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation(currentLocation);
      recenterMap(currentLocation);
      void fetchLiveMechanics(currentLocation.coords.latitude, currentLocation.coords.longitude);
    } catch {
      console.warn('Unable to refresh location after recentering the map.');
    }
  };

  const deliveryFeeFor = (distanceKm: number) =>
    100 + Math.max(0, Math.ceil(distanceKm) - 1) * 10;

  const openBooking = () => {
    if (!selectedMechanic?.services.length) {
      Alert.alert('No services available', 'This mechanic has not listed any service offerings yet.');
      return;
    }
    setSelectedServices([]);
    setVehicleType('');
    setPlateNumber('');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    setBookingDate(tomorrow);
    setBookingModalVisible(true);
  };

  const handlePlateFormat = (text: string) => {
    let formatted = text.toUpperCase().replace(/[^A-Z0-9\s-]/g, '');
    formatted = formatted.replace(/^([A-Z]{2,3})([0-9]{3,5})$/, '$1 $2');
    setPlateNumber(formatted);
  };

  const handleBookNow = async () => {
    if (!selectedMechanic || !selectedServices.length || !session?.user?.id || !location || submittingBooking) return;
    
    if (!vehicleType.trim() || !plateNumber.trim()) {
      Alert.alert('Vehicle details required', 'Please enter your vehicle model and plate number.');
      return;
    }

    const ltoRegex = /^([A-Z]{2,3}[-\s]?[0-9]{3,5}|[0-9]{4}[-\s]?[0-9]{5,7})$/;
    if (!ltoRegex.test(plateNumber.trim())) {
      Alert.alert(
        "Invalid Plate Number", 
        "Please enter a valid LTO plate number (e.g., ABC 1234) or your temporary MV File number."
      );
      return;
    }

    if (bookingDate.getTime() < Date.now()) {
      Alert.alert('Date required', 'Please choose a future date for this scheduled booking.');
      return;
    }
    
    setSubmittingBooking(true);
    const servicePrice = selectedServices.reduce(
      (total, service) => total + (Number(String(service.price).replace(/[^\d.]/g, '')) || 0),
      0,
    );
    const deliveryFee = deliveryFeeFor(selectedMechanic.distanceKm);
    const totalPrice = servicePrice + deliveryFee;
    const serviceNames = selectedServices.map((service) => service.service).join(', ');
    const { data, error } = await supabase.from('service_requests').insert([{ 
          motorist_id: session.user.id, mechanic_id: selectedMechanic.id, latitude: location.coords.latitude, 
          longitude: location.coords.longitude, status: 'scheduled', request_type: 'scheduled',
          scheduled_at: bookingDate.toISOString(),
          vehicle_type: vehicleType.trim(),
          plate_number: plateNumber.trim().toUpperCase(),
          service_name: serviceNames, service_price: servicePrice,
          delivery_fee: deliveryFee, estimated_total: totalPrice,
          vehicle_issue: serviceNames,
    }]).select().single();

    setSubmittingBooking(false);
    if (error) {
      Alert.alert("Booking Failed", error.message);
      return;
    }
    setActiveRequest({ ...data, mechanic: selectedMechanic });
    setSelectedMechanic(null);
    setDisplayedMechanic(null);
    setBookingModalVisible(false);
  };

  useEffect(() => {
    if (!session?.user.id || activeRequest?.id) return;

    let active = true;
    const loadActiveBooking = async () => {
      const { data: request, error } = await supabase
        .from('service_requests')
        .select('*')
        .eq('motorist_id', session.user.id)
        .in('status', ['scheduled', 'pending', 'accepted', 'arrived', 'in_transit', 'in_progress', 'completed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active || error || !request) return;

      const { data: mechanic } = await supabase
        .from('profiles')
        .select('id,full_name,mobile_number,average_rating,is_online')
        .eq('id', request.mechanic_id)
        .maybeSingle();

      if (active) {
        const requestWithMechanic = {
          ...request,
          mechanic: mechanic
            ? {
                id: mechanic.id,
                name: mechanic.full_name || 'Loading mechanic name...',
                mobileNumber: mechanic.mobile_number || null,
                rating: mechanic.average_rating ?? 5,
                isOnline: mechanic.is_online ?? false,
              }
            : null,
        };
        if (request.status === 'completed') {
          setCompletedJob(requestWithMechanic);
        } else {
          setActiveRequest(requestWithMechanic);
        }
      }
    };

    void loadActiveBooking();
    return () => {
      active = false;
    };
  }, [activeRequest?.id, session?.user.id]);

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
          setActiveRequest((prev: any) => {
            if (!prev) return prev;
            const updatedRequest = { ...prev, ...payload.new };
            if (payload.new.status === 'completed') {
              setCompletedJob(updatedRequest);
              return null;
            }
            return updatedRequest;
          });
        }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeRequest?.id]);

  const handleCompleteJob = async () => {
    if (!completedJob?.id || !completedJob?.mechanic_id || !session?.user.id || submittingRating) {
      return;
    }
    setSubmittingRating(true);
    const { error: ratingError } = await supabase.rpc('submit_mechanic_rating', {
      p_service_request_id: completedJob.id,
      p_mechanic_id: completedJob.mechanic_id,
      p_rating: rating,
      p_review: review.trim() || null,
    });
    if (ratingError) {
      setSubmittingRating(false);
      Alert.alert("Rating Failed", ratingError.message);
      return;
    }
    const { error: closeError } = await supabase
      .from('service_requests')
      .update({ status: 'closed' })
      .eq('id', completedJob.id)
      .eq('motorist_id', session.user.id);
    setSubmittingRating(false);
    if (closeError) {
      Alert.alert("Payment Failed", closeError.message);
      return;
    }
    Alert.alert("Transaction Closed", "Payment confirmed and review submitted!");
    setCompletedJob(null);
    setRating(5);
    setReview('');
  };

  if (!hasPermission || !location) {
    return <View style={[styles.fallbackContainer, { backgroundColor: colors.bg }]} />;
  }

  const isWaitingForMechanic = !!activeRequest && ['scheduled', 'pending'].includes(activeRequest.status);
  const isAcceptedBooking = !!activeRequest && ['accepted', 'in_transit', 'arrived', 'in_progress'].includes(activeRequest.status);
  const mapHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>body { padding: 0; margin: 0; background-color: ${colors.bg}; } #map { height: 100vh; width: 100vw; } .leaflet-tile { filter: ${isDarkMode ? 'brightness(.65) invert(1) hue-rotate(180deg)' : 'none'}; } .mechanic-marker { width: 42px; height: 42px; border: 3px solid #F0A202; border-radius: 50%; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.3); overflow: hidden; display: flex; align-items: center; justify-content: center; } .mechanic-marker img { width: 100%; height: 100%; object-fit: cover; } .mechanic-fallback { width: 18px; height: 18px; position: relative; display: block; } .mechanic-fallback:before { content: ''; position: absolute; width: 8px; height: 8px; left: 5px; top: 0; border-radius: 50%; background: #F0A202; } .mechanic-fallback:after { content: ''; position: absolute; width: 18px; height: 9px; left: 0; bottom: 0; border-radius: 10px 10px 4px 4px; background: #F0A202; } </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', { zoomControl: false }).setView([${location.coords.latitude}, ${location.coords.longitude}], 15);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

          var userIcon = L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-black.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41] });
          L.marker([${location.coords.latitude}, ${location.coords.longitude}], {icon: userIcon}).addTo(map).bindPopup("<b>You are here</b>");

          var mechanics = ${JSON.stringify(liveMechanics)};
          mechanics.forEach(function(mech) {
            if (mech.latitude && mech.longitude) {
              var markerHtml = mech.avatarUrl
                ? '<div class="mechanic-marker"><img src="' + mech.avatarUrl + '" onerror="this.parentElement.innerHTML=\\'<span class=&quot;mechanic-fallback&quot;></span>\\'"></div>'
                : '<div class="mechanic-marker"><span class="mechanic-fallback"></span></div>';
              var mechIcon = L.divIcon({ html: markerHtml, className: '', iconSize: [42, 42], iconAnchor: [21, 21] });
              var marker = L.marker([mech.latitude, mech.longitude], {icon: mechIcon}).addTo(map);
              marker.on('click', function() {
                map.setView([mech.latitude, mech.longitude], Math.max(map.getZoom(), 17), { animate: true, duration: 0.45 });
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MECHANIC_SELECTED', mechanic: mech }));
              });
            }
          });
          map.on('click', function() { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_TAPPED' })); });
        </script>
      </body>
    </html>
  `;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <WebView ref={mapRef} source={{ html: mapHtml }} style={styles.map} scrollEnabled={false} onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'MECHANIC_SELECTED' && !activeRequest) {
              setSelectedMechanic(data.mechanic);
              setDisplayedMechanic(data.mechanic);
              setShowServices(false);
            }
            if (data.type === 'MAP_TAPPED') {
              setSelectedMechanic(null);
              setShowServices(false);
            }
          } catch {}
        }}
      />

      {!activeRequest && !displayedMechanic && !selectedMechanic && !mechanicProfileVisible ? (
        <TouchableOpacity
          style={styles.recenterButton}
          onPress={() => void handleRecenterLocation()}
          accessibilityLabel="Recenter location"
        >
          <Text style={styles.recenterButtonText}>Recenter Location</Text>
          <View style={styles.recenterIcon}>
            <Ionicons name="locate-outline" size={28} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      ) : null}
      
      <View
        style={[
          styles.topContainer,
          {
            top: 0,
            paddingTop: Platform.OS === 'ios' ? 58 : 44,
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.topActions}>
          <TouchableOpacity
            style={[styles.iconCircle, { backgroundColor: '#FFF1D6', borderColor: '#F0A202' }]}
            onPress={() => router.push('/motorist-profile')}
            accessibilityLabel="Open profile"
          >
            {motoristAvatarUrl ? (
              <Image source={{ uri: motoristAvatarUrl }} style={styles.iconAvatarImage} />
            ) : (
              <Text style={[styles.iconInitials, { color: colors.text }]}>
                {motoristInitials(motoristName) || 'M'}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.vehicleSelector,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => setVehicleSelectorVisible((visible) => !visible)}
            accessibilityLabel="Select vehicle"
          >
            <Text style={[styles.vehicleSelectorLabel, { color: colors.textMuted }]}>
              Vehicle Selector
            </Text>
            <View style={styles.vehicleSelectorValue}>
              <Image
                source={require("../../assets/images/motorcycle.png")}
                resizeMode="contain"
                style={styles.vehicleSelectorIcon}
              />
              <Text
                numberOfLines={1}
                style={[styles.vehicleSelectorText, { color: colors.text }]}
              >
                {selectedVehicle
                  ? `${selectedVehicle.make} ${selectedVehicle.model} - ${selectedVehicle.plate_number}`
                  : 'Add a vehicle in My Vehicles'}
              </Text>
              <Ionicons
                name={vehicleSelectorVisible ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textMuted}
              />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.activityButton}
            onPress={() => router.push('/notifications')}
            accessibilityLabel="Open notifications"
          >
            <Ionicons name="notifications-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        {vehicleSelectorVisible && vehicles.length > 0 ? (
          <View style={[styles.vehicleMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {vehicles.map((vehicle) => (
              <TouchableOpacity
                key={vehicle.id}
                style={[
                  styles.vehicleMenuItem,
                  { borderBottomColor: colors.border },
                  { backgroundColor: selectedVehicle?.id === vehicle.id ? colors.btnSecondary : colors.card },
                ]}
                onPress={() => {
                  setSelectedVehicle(vehicle);
                  setVehicleSelectorVisible(false);
                }}
              >
                <Image
                  source={require("../../assets/images/motorcycle.png")}
                  resizeMode="contain"
                  style={styles.vehicleMenuIcon}
                />
                <View style={styles.vehicleMenuCopy}>
                  <Text style={[styles.vehicleMenuTitle, { color: colors.text }]}>
                    {vehicle.make} {vehicle.model}
                  </Text>
                  <Text style={[styles.vehicleMenuDetails, { color: colors.textMuted }]}>
                    {vehicle.plate_number}
                  </Text>
                </View>
                {selectedVehicle?.id === vehicle.id ? (
                  <Ionicons name="checkmark-circle" size={21} color={colors.primary} />
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>

      {isWaitingForMechanic ? (
        <View style={[styles.overlay, { backgroundColor: colors.card }]}>
          <TouchableOpacity style={styles.sosButton} onPress={handleEmergencySOS}>
            <View style={styles.sosContent}>
              <Image source={bikeIcon} style={styles.sosImage} />
              <Text style={styles.sosText}>EMERGENCY SOS</Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : null}

      {activeRequest ? (
        <Animated.View
          pointerEvents={isWaitingForMechanic ? 'auto' : 'none'}
          style={[
            styles.waitingRequestCard,
            { backgroundColor: colors.card, borderColor: colors.border },
            {
              opacity: isWaitingForMechanic
                ? 1
                : bookingTransition.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 0],
                  }),
              transform: [{
                translateY: bookingTransition.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -18],
                }),
              }],
            },
          ]}
        >
          <View style={styles.waitingRadar}>
            <View style={[styles.waitingRadarCircle, styles.waitingRadarCircleLarge]} />
            <View style={[styles.waitingRadarCircle, styles.waitingRadarCircleMedium]} />
            <View style={[styles.waitingRadarCircle, styles.waitingRadarCircleSmall]} />
            <Animated.View
              style={[
                styles.waitingRadarBeam,
                {
                  transform: [{
                    rotate: radarRotation.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['-45deg', '315deg'],
                    }),
                  }],
                },
              ]}
            />
            <Ionicons name="locate-outline" size={27} color="#1683D8" />
            <Text style={styles.waitingRadarTitle}>
              Waiting for the requested mechanic{'\n'}
              <Text style={styles.waitingRadarTitleStrong}>to accept your request...</Text>
            </Text>
          </View>
          <View style={[styles.waitingRequestDivider, { backgroundColor: colors.border }]} />
          <Text style={[styles.waitingRequestStatus, { color: colors.textMuted }]}>
            Status:{' '}
            <Text style={[styles.waitingRequestMetaStrong, { color: colors.text }]}>
              {activeRequest.status === 'pending' ? 'Pending acceptance...' : 'Requesting...'}
            </Text>
          </Text>
        </Animated.View>
      ) : null}

      {!isWaitingForMechanic ? <View style={[
        styles.overlay,
        { backgroundColor: colors.card },
        displayedMechanic && styles.mechanicOverlay,
        isAcceptedBooking && styles.acceptedOverlay,
      ]}>
        {activeRequest ? (
          isAcceptedBooking ? (
            <Animated.View
              {...acceptedBookingPanResponder.panHandlers}
              style={[
                styles.acceptedBookingCard,
                !acceptedBookingExpanded && styles.acceptedBookingCardMinimized,
                { backgroundColor: colors.card },
                {
                  opacity: bookingTransition,
                  transform: [{
                    translateY: bookingTransition.interpolate({
                      inputRange: [0, 1],
                      outputRange: [18, 0],
                    }),
                  }],
                },
              ]}
            >
              <TouchableOpacity
                style={styles.acceptedBookingHandleHitArea}
                onPress={() => {
                  const expanded = !acceptedBookingExpanded;
                  setAcceptedBookingExpanded(expanded);
                  Animated.timing(acceptedBookingAnimation, {
                    toValue: expanded ? 1 : 0,
                    duration: 240,
                    useNativeDriver: false,
                  }).start();
                }}
                accessibilityLabel={acceptedBookingExpanded ? 'Collapse booking details' : 'Expand booking details'}
              >
                <View style={styles.acceptedBookingHandle} />
              </TouchableOpacity>
              <View style={[
                styles.acceptedBookingBanner,
                !acceptedBookingExpanded && styles.acceptedBookingBannerMinimized,
              ]}>
                <Image source={bikeIcon} style={styles.acceptedBookingIcon} />
                <Text style={styles.acceptedBookingBannerText}>
                  {activeRequest.status === 'arrived'
                    ? 'MECHANIC HAS ARRIVED'
                    : activeRequest.status === 'in_progress'
                      ? 'SERVICE IN PROGRESS'
                      : 'ON THE WAY TO CUSTOMER'}
                </Text>
              </View>

              <Animated.View
                style={[
                  styles.acceptedBookingDetails,
                  {
                    height: acceptedBookingAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 190],
                    }),
                    opacity: acceptedBookingAnimation,
                    transform: [{
                      translateY: acceptedBookingAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-12, 0],
                      }),
                    }],
                  },
                ]}
              >
                      <Text style={[styles.acceptedSectionTitle, { color: colors.text }]}>Vehicle Details</Text>
                      <View style={styles.acceptedDetailRow}>
                        <Image source={bikeIcon} style={styles.acceptedDetailIcon} />
                        <Text style={[styles.acceptedDetailText, { color: colors.text }]}>
                          {activeRequest.vehicle_type || 'Motorcycle'}{' '}
                          <Text style={styles.acceptedDetailStrong}>| Plate: {activeRequest.plate_number || 'Not specified'}</Text>
                        </Text>
                      </View>
                      <Text style={[styles.acceptedIssueText, { color: colors.text }]}>
                        <Text style={styles.acceptedDetailStrong}>Issue:</Text> {activeRequest.vehicle_issue || activeRequest.service_name || 'Roadside assistance'}
                      </Text>

                      <Text style={[styles.acceptedSectionTitle, { color: colors.text }]}>Mechanic Information</Text>
                      <Text style={[styles.acceptedInfoText, { color: colors.text }]}>
                        <Text style={styles.acceptedDetailStrong}>Mechanic:</Text> {activeRequest.mechanic?.name || 'Mechanic'}{' '}
                        <Text style={styles.acceptedDetailStrong}>({Number(activeRequest.mechanic?.rating || 5).toFixed(1)}★)</Text>
                      </Text>
                      <Text style={[styles.acceptedInfoText, { color: colors.text }]}>
                        <Text style={styles.acceptedDetailStrong}>Phone:</Text> {activeRequest.mechanic?.mobileNumber || 'Not available'}
                      </Text>
              </Animated.View>

              <TouchableOpacity
                style={[
                  styles.cancelBookingButton,
                  !acceptedBookingExpanded && styles.cancelBookingButtonMinimized,
                ]}
                onPress={() => setCancelModalVisible(true)}
                accessibilityLabel="Cancel booking"
              >
                <Ionicons name="close" size={23} color="#FFFFFF" />
                <Text style={styles.cancelBookingButtonText}>Cancel Booking</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : (
          <View style={[styles.trackingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.trackingHeader}>
              <Text style={[styles.trackingName, { color: colors.text }]}>
                {activeRequest.mechanic?.name || 'Loading mechanic name...'}
              </Text>
              <TouchableOpacity
                style={[styles.trackingCallButton, { backgroundColor: colors.primary }]}
                onPress={() => void callMechanic(activeRequest.mechanic?.mobileNumber || null)}
                accessibilityLabel="Call mechanic"
              >
                <Ionicons name="call-outline" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <View style={[styles.trackingStatusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {['scheduled', 'pending'].includes(activeRequest.status) ? (
                <View style={styles.statusRow}>
                  <ActivityIndicator size="small" color="#1683D8" />
                  <Text style={[styles.statusText, { color: colors.primary }]}>
                    {bookingStatusLabel(activeRequest.status)}
                  </Text>
                </View>
              ) : (
                <View style={styles.bookingTimeline}>
                  {BOOKING_STEPS.map(([value, label], index) => {
                    const currentStep = bookingStepIndex(activeRequest.status);
                    const isComplete = currentStep >= index;
                    return (
                      <View key={value} style={styles.timelineItem}>
                        <View style={styles.timelineTrack}>
                          <View style={[styles.timelineDot, { backgroundColor: colors.card }, isComplete && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                            {isComplete ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : null}
                          </View>
                          {index < BOOKING_STEPS.length - 1 ? (
                            <View style={[styles.timelineConnector, currentStep > index && { backgroundColor: colors.primary }]} />
                          ) : null}
                        </View>
                        <Text style={[styles.timelineLabel, { color: isComplete ? colors.primary : colors.textMuted }]}>
                          {label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
              <TouchableOpacity
                style={[styles.receiptButton, { backgroundColor: colors.primary }]}
                onPress={() => setBookingReceiptVisible(true)}
              >
                <Ionicons name="receipt-outline" size={18} color="#FFFFFF" />
                <Text style={styles.receiptButtonText}>VIEW BOOKING INFORMATION</Text>
              </TouchableOpacity>
            </View>
          </View>
          )
        ) : displayedMechanic ? (
          <Animated.View
            style={[
              styles.card,
              { backgroundColor: colors.card },
              {
                opacity: mechanicPanelAnimation,
                transform: [{
                  translateY: mechanicPanelAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [32, 0],
                  }),
                }],
              },
            ]}
          >
            <View style={styles.profileHeader}>
              <TouchableOpacity style={styles.selectedInfo} onPress={() => void openMechanicProfile()}>
                <Text style={[styles.title, { color: colors.text }]}>{displayedMechanic.name}</Text>
                <View style={styles.statusLine}>
                  <View style={[styles.statusDot, { backgroundColor: displayedMechanic.isOnline ? '#27AE60' : '#98A2B3' }]} />
                  <Text style={[styles.statusLabel, { color: displayedMechanic.isOnline ? '#27AE60' : colors.textMuted }]}>
                    {displayedMechanic.isOnline ? 'Online' : 'Offline'}
                  </Text>
                  <Text style={styles.rating}>★ {displayedMechanic.rating.toFixed(1)}  •  {displayedMechanic.distance}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.callIconButton, { backgroundColor: colors.btnSecondary }]}
                onPress={() => void callMechanic(displayedMechanic.mobileNumber)}
                accessibilityLabel="Call mechanic"
              >
                <Ionicons name="call-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {displayedMechanic.skills}
            </Text>
            <TouchableOpacity
              style={[styles.detailRow, { borderTopColor: colors.border, borderBottomColor: colors.border }]}
              onPress={() => setShowServices((visible) => !visible)}
            >
              <View style={styles.detailRowLabel}>
                <Ionicons name="pricetag-outline" size={19} color={colors.primary} />
                <Text style={[styles.detailRowText, { color: colors.text }]}>Service offerings</Text>
              </View>
              <Ionicons name={showServices ? 'chevron-up' : 'chevron-forward'} size={19} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.compareButton, { borderColor: colors.primary }]}
              onPress={openPriceComparison}
            >
              <Ionicons name="swap-vertical-outline" size={18} color={colors.primary} />
              <Text style={[styles.compareButtonText, { color: colors.primary }]}>
                Compare prices
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bookButton} onPress={openBooking}>
              <Text style={styles.bookButtonText}>⚡ Book Now</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <TouchableOpacity style={styles.sosButton} onPress={handleEmergencySOS}>
            <View style={styles.sosContent}>
              <Image source={bikeIcon} style={styles.sosImage} />
              <Text style={styles.sosText}>EMERGENCY SOS</Text>
            </View>
          </TouchableOpacity>
        )}
      </View> : null}

      <Modal visible={showServices && !!selectedMechanic} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setShowServices(false)}>
        <SafeAreaView style={[styles.servicesScreen, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
          <View style={[styles.servicesHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity style={styles.servicesBackButton} onPress={() => setShowServices(false)} accessibilityLabel="Back to mechanic details">
              <Ionicons name="arrow-back" size={23} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.servicesTitle, { color: colors.text }]}>Service Offerings</Text>
            <View style={styles.servicesHeaderSpacer} />
          </View>
          <View style={[styles.servicesMechanic, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Text style={[styles.servicesMechanicName, { color: colors.text }]}>{selectedMechanic?.name}</Text>
            <Text style={[styles.servicesMechanicMeta, { color: colors.textMuted }]}>Available maintenance services</Text>
          </View>
          <View style={[styles.fullServicesList, { backgroundColor: colors.card }]}>
            {selectedMechanic?.services.length ? selectedMechanic.services.map((service: any, index: number) => (
              <View key={`${service.service}-${index}`} style={[styles.fullServiceItem, { borderBottomColor: colors.border }]}>
                <View style={styles.fullServiceName}>
                  <Ionicons name="construct-outline" size={19} color={colors.primary} />
                  <Text style={[styles.serviceName, { color: colors.text }]}>{service.service}</Text>
                </View>
                <Text style={[styles.servicePrice, { color: colors.primary }]}>{service.price}</Text>
              </View>
            )) : (
              <Text style={[styles.noServices, { color: colors.textMuted }]}>No service offerings listed.</Text>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={priceComparisonVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setPriceComparisonVisible(false)}
      >
        <SafeAreaView style={[styles.comparisonScreen, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
          <View style={[styles.servicesHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity
              style={styles.servicesBackButton}
              onPress={() => setPriceComparisonVisible(false)}
              accessibilityLabel="Close price comparison"
            >
              <Ionicons name="arrow-back" size={23} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.servicesTitle, { color: colors.text }]}>Compare prices</Text>
            <View style={styles.servicesHeaderSpacer} />
          </View>
          <View style={styles.comparisonContent}>
            <Text style={[styles.comparisonIntro, { color: colors.textMuted }]}>
              Search a service to compare registered mechanics by price, rating, and distance.
            </Text>
            <View style={[styles.comparisonSearch, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="search-outline" size={19} color={colors.textMuted} />
              <TextInput
                value={priceSearch}
                onChangeText={setPriceSearch}
                placeholder="e.g. Oil change"
                placeholderTextColor={colors.textMuted}
                style={[styles.comparisonInput, { color: colors.text }]}
                autoCapitalize="none"
              />
              {priceSearch ? (
                <TouchableOpacity onPress={() => setPriceSearch('')} accessibilityLabel="Clear service search">
                  <Ionicons name="close-circle" size={19} color={colors.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.comparisonList}>
              {comparisonResults.length ? comparisonResults.map((result: any, index: number) => (
                <TouchableOpacity
                  key={`${result.mechanic.id}-${result.service.service}-${index}`}
                  style={[styles.comparisonCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => {
                    setSelectedMechanic(result.mechanic);
                    setDisplayedMechanic(result.mechanic);
                    setPriceComparisonVisible(false);
                  }}
                >
                  <View style={styles.comparisonCardTop}>
                    <View style={styles.comparisonMechanicInfo}>
                      <Text style={[styles.comparisonMechanicName, { color: colors.text }]} numberOfLines={1}>
                        {result.mechanic.name}
                      </Text>
                      <Text style={[styles.comparisonServiceName, { color: colors.textMuted }]} numberOfLines={1}>
                        {result.service.service}
                      </Text>
                    </View>
                    <Text style={[styles.comparisonPrice, { color: colors.primary }]}>
                      {result.service.price}
                    </Text>
                  </View>
                  <View style={styles.comparisonMeta}>
                    <Text style={[styles.comparisonMetaText, { color: colors.textMuted }]}>
                      ★ {result.mechanic.rating.toFixed(1)}
                    </Text>
                    <Text style={[styles.comparisonMetaText, { color: colors.textMuted }]}>
                      {result.mechanic.distance}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </View>
                </TouchableOpacity>
              )) : (
                <View style={styles.comparisonEmpty}>
                  <Ionicons name="search-outline" size={30} color={colors.textMuted} />
                  <Text style={[styles.comparisonEmptyTitle, { color: colors.text }]}>
                    No matching service prices
                  </Text>
                  <Text style={[styles.comparisonEmptyText, { color: colors.textMuted }]}>
                    Try another service name or check again when mechanics add their rates.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={mechanicProfileVisible && !!displayedMechanic}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setMechanicProfileVisible(false)}
      >
        <SafeAreaView style={[styles.mechanicProfileScreen, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
          <View style={[styles.mechanicProfileHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setMechanicProfileVisible(false)} style={styles.servicesBackButton} accessibilityLabel="Close mechanic profile">
              <Ionicons name="arrow-back" size={23} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.servicesTitle, { color: colors.text }]}>Mechanic Profile</Text>
            <View style={styles.servicesHeaderSpacer} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.mechanicProfileContent}>
            {displayedMechanic?.avatarUrl ? (
              <Image source={{ uri: displayedMechanic.avatarUrl }} style={styles.mechanicProfileAvatar} />
            ) : (
              <View style={[styles.mechanicProfileAvatar, styles.mechanicProfileAvatarFallback, { backgroundColor: colors.primary }]}>
                <Text style={styles.mechanicProfileInitials}>
                  {String(displayedMechanic?.name || 'M').split(' ').map((part: string) => part[0]).join('').slice(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={[styles.mechanicProfileName, { color: colors.text }]}>{displayedMechanic?.name}</Text>
            <Text style={[styles.mechanicProfileService, { color: colors.textMuted }]}>Motorcycle mechanic</Text>
            <View style={[styles.mechanicProfileStats, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={styles.mechanicProfileStat}>
                <Text style={[styles.mechanicProfileStatValue, { color: colors.primary }]}>★ {Number(displayedMechanic?.rating || 0).toFixed(1)}</Text>
                <Text style={[styles.mechanicProfileStatLabel, { color: colors.textMuted }]}>Rating</Text>
              </View>
              <View style={[styles.mechanicProfileStatDivider, { backgroundColor: colors.border }]} />
              <View style={styles.mechanicProfileStat}>
                <Text style={[styles.mechanicProfileStatValue, { color: colors.text }]}>
                  {mechanicReviews.length}
                </Text>
                <Text style={[styles.mechanicProfileStatLabel, { color: colors.textMuted }]}>Reviews</Text>
              </View>
            </View>
            <Text style={[styles.mechanicReviewsTitle, { color: colors.text }]}>Reviews</Text>
            {loadingMechanicReviews ? (
              <ActivityIndicator color={colors.primary} style={styles.mechanicReviewsLoader} />
            ) : mechanicReviews.length ? (
              mechanicReviews.map((item, index) => (
                <View key={`${item.created_at}-${index}`} style={[styles.mechanicReviewRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.mechanicReviewStars, { color: colors.primary }]}>
                    {'★'.repeat(Number(item.rating) || 0)}
                  </Text>
                  <Text style={[styles.mechanicReviewText, { color: colors.text }]}>
                    {item.review}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[styles.noServices, { color: colors.textMuted }]}>No reviews yet.</Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={bookingModalVisible && !!selectedMechanic}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setBookingModalVisible(false)}
      >
        <SafeAreaView style={[styles.bookingScreen, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
          <View style={[styles.bookingHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.bookingTitle, { color: colors.text }]}>Choose a service</Text>
              <Text style={[styles.bookingSubtitle, { color: colors.textMuted }]}>{selectedMechanic?.name}</Text>
            </View>
            <TouchableOpacity onPress={() => setBookingModalVisible(false)} style={styles.servicesBackButton} accessibilityLabel="Close booking">
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.bookingContent}>
            <Text style={[styles.bookingSectionTitle, { color: colors.text }]}>Vehicle details</Text>
            <View style={styles.bookingVehicleRow}>
              <TextInput
                style={[styles.bookingVehicleInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
                placeholder="Vehicle model"
                placeholderTextColor={colors.textMuted}
                value={vehicleType}
                onChangeText={setVehicleType}
              />
              <TextInput
                style={[styles.bookingVehicleInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
                placeholder="e.g. ABC 1234"
                placeholderTextColor={colors.textMuted}
                value={plateNumber}
                onChangeText={handlePlateFormat}
                autoCapitalize="characters"
                maxLength={15}
              />
            </View>
            <Text style={[styles.bookingSectionTitle, { color: colors.text }]}>Service offerings</Text>
            <View style={[styles.bookingServices, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator contentContainerStyle={styles.bookingServicesContent}>
                {selectedMechanic?.services.map((service: any, index: number) => {
                  const selected = selectedServices.some(
                    (item) => item.service === service.service && item.price === service.price,
                  );
                  return (
                    <TouchableOpacity
                      key={`${service.service}-${index}`}
                      style={[styles.bookingServiceRow, { borderBottomColor: colors.border }, selected && { backgroundColor: 'rgba(255, 107, 0, 0.08)' }]}
                      onPress={() =>
                        setSelectedServices((current) =>
                          selected
                            ? current.filter(
                                (item) => item.service !== service.service || item.price !== service.price,
                              )
                            : [...current, service],
                        )
                      }
                    >
                      <View style={[styles.bookingRadio, { borderColor: selected ? colors.primary : colors.border }]}>
                        {selected ? <View style={[styles.bookingRadioDot, { backgroundColor: colors.primary }]} /> : null}
                      </View>
                      <Text style={[styles.bookingServiceName, { color: colors.text }]}>{service.service}</Text>
                      <Text style={[styles.bookingServicePrice, { color: colors.primary }]}>{service.price}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <Text style={[styles.bookingSectionTitle, styles.bookingDateTitle, { color: colors.text }]}>Scheduled date</Text>
            <TouchableOpacity
              style={[styles.bookingDateButton, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setShowBookingDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              <Text style={[styles.bookingDateText, { color: colors.text }]}>
                {bookingDate.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </TouchableOpacity>
            {showBookingDatePicker ? (
              <DateTimePicker
                value={bookingDate}
                mode="date"
                display="default"
                minimumDate={new Date()}
                onChange={(event, selectedDate) => {
                  setShowBookingDatePicker(false);
                  if (event.type === 'set' && selectedDate) {
                    const nextDate = new Date(bookingDate);
                    nextDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                    setBookingDate(nextDate);
                  }
                }}
              />
            ) : null}

            <View style={[styles.priceSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Services</Text>
                <Text style={[styles.summaryValue, { color: colors.text }]}>
                  {selectedServices.length
                    ? `₱${selectedServices.reduce(
                        (total, service) =>
                          total + (Number(String(service.price).replace(/[^\d.]/g, '')) || 0),
                        0,
                      )}`
                    : 'Select services'}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Delivery fee ({selectedMechanic?.distance})</Text>
                <Text style={[styles.summaryValue, { color: colors.text }]}>
                  ₱{selectedMechanic ? deliveryFeeFor(selectedMechanic.distanceKm) : 100}
                </Text>
              </View>
              <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.totalLabel, { color: colors.text }]}>Estimated total</Text>
                <Text style={[styles.totalValue, { color: colors.primary }]}>
                  ₱{selectedServices.length && selectedMechanic
                    ? selectedServices.reduce(
                        (total, service) =>
                          total + (Number(String(service.price).replace(/[^\d.]/g, '')) || 0),
                        0,
                      ) + deliveryFeeFor(selectedMechanic.distanceKm)
                    : 0}
                </Text>
              </View>
            </View>
            <View style={[styles.fareNotice, { backgroundColor: 'rgba(240, 162, 2, 0.12)', borderColor: 'rgba(240, 162, 2, 0.35)' }]}>
              <Ionicons name="information-circle-outline" size={19} color={colors.primary} />
              <Text style={[styles.fareNoticeText, { color: colors.textMuted }]}>
                This is an estimated fare. The price may increase if the mechanic finds additional motorcycle issues that require extra repairs or parts.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.confirmBookingButton, { backgroundColor: colors.primary }, (!selectedServices.length || submittingBooking) && styles.disabledButton]}
              onPress={() => void handleBookNow()}
              disabled={!selectedServices.length || submittingBooking}
            >
              <Text style={styles.confirmBookingText}>{submittingBooking ? 'Booking...' : 'Confirm booking'}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={bookingReceiptVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBookingReceiptVisible(false)}
      >
        <View style={styles.receiptOverlay}>
          <View style={[styles.receiptCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.receiptHeader}>
              <View>
                <Text style={[styles.receiptTitle, { color: colors.text }]}>Booking information</Text>
                <Text style={[styles.receiptSubtitle, { color: colors.textMuted }]}>
                  {activeRequest?.mechanic?.name || 'Mechanic'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setBookingReceiptVisible(false)} accessibilityLabel="Close receipt">
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={[styles.receiptDivider, { borderBottomColor: colors.border }]} />
            <View style={styles.receiptRow}>
              <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Vehicle</Text>
              <Text style={[styles.receiptValue, { color: colors.text }]}>
                {activeRequest?.vehicle_type || 'Not specified'}
              </Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Plate number</Text>
              <Text style={[styles.receiptValue, { color: colors.text }]}>
                {activeRequest?.plate_number || 'Not specified'}
              </Text>
            </View>
            <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>SERVICES</Text>
            <Text style={[styles.receiptValue, { color: colors.text }]}>
              {activeRequest?.service_name || 'Selected services'}
            </Text>
            <View style={styles.receiptRow}>
              <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Scheduled date</Text>
              <Text style={[styles.receiptValue, { color: colors.text }]}>
                {activeRequest?.scheduled_at
                  ? new Date(activeRequest.scheduled_at).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })
                  : 'Not specified'}
              </Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Services</Text>
              <Text style={[styles.receiptValue, { color: colors.text }]}>
                ₱{Number(activeRequest?.service_price || 0).toFixed(2)}
              </Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Delivery fee</Text>
              <Text style={[styles.receiptValue, { color: colors.text }]}>
                ₱{Number(activeRequest?.delivery_fee || 0).toFixed(2)}
              </Text>
            </View>
            <View style={[styles.receiptTotalRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.receiptTotalLabel, { color: colors.text }]}>Estimated total</Text>
              <Text style={[styles.receiptTotalValue, { color: colors.primary }]}>
                ₱{Number(activeRequest?.estimated_total || 0).toFixed(2)}
              </Text>
            </View>
            <Text style={[styles.receiptNote, { color: colors.textMuted }]}>
              Final price may change if additional repairs or parts are needed.
            </Text>
          </View>
        </View>
      </Modal>

      {/* RATING MODAL */}
      <Modal visible={!!completedJob} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.ratingModalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="checkmark-circle" size={42} color="#10b981" style={styles.ratingCompleteIcon} />
            <Text style={[styles.modalTitle, styles.ratingModalTitle, { color: colors.text }]}>Service Completed!</Text>
            <Text style={[styles.modalSubtitle, styles.ratingModalSubtitle, { color: colors.textMuted }]}>Rate your mechanic to complete this booking.</Text>
            <View style={[styles.ratingBox, styles.compactRatingBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Text style={[styles.ratingPrompt, styles.compactRatingPrompt, { color: colors.text }]}>Rate {completedJob?.mechanic?.name}</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity key={star} onPress={() => setRating(star)}>
                    <Ionicons name={star <= rating ? "star" : "star-outline"} size={30} color={colors.primary} style={styles.compactStar} />
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.ratingScaleText, { color: colors.textMuted }]}>
                {rating} out of 5 stars
              </Text>
            </View>
            <TextInput
              style={[styles.reviewInput, styles.compactReviewInput, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]}
              placeholder="Comment (optional, max 40 characters)"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={40}
              value={review}
              onChangeText={(value) => setReview(value.slice(0, 40))}
            />
            <Text style={[styles.reviewCounter, { color: colors.textMuted }]}>{review.length}/40</Text>
            <TouchableOpacity
              style={[styles.submitReviewBtn, styles.compactSubmitReviewBtn, submittingRating && { opacity: 0.6 }]}
              onPress={handleCompleteJob}
              disabled={submittingRating}
            >
              <Text style={styles.submitReviewText}>
                {submittingRating ? "Submitting..." : "Submit rating"}
              </Text>
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
  recenterButton: { position: 'absolute', right: 16, bottom: 94, minHeight: 54, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 4, borderRadius: 29, backgroundColor: '#FFFFFF', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.22, shadowRadius: 6, zIndex: 8 },
  recenterButtonText: { color: '#1B1B1B', fontSize: 15, fontWeight: '800' },
  recenterIcon: { width: 48, height: 48, marginLeft: 12, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1479E8', elevation: 3 },
  waitingRequestCard: { position: 'absolute', top: '27%', left: '12%', right: '12%', borderWidth: 1, borderRadius: 16, padding: 10, elevation: 9, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, zIndex: 7 },
  waitingRadar: { height: 190, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#EAF6FF' },
  waitingRadarCircle: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(22, 131, 216, 0.32)', borderRadius: 999 },
  waitingRadarCircleLarge: { width: 168, height: 168 },
  waitingRadarCircleMedium: { width: 122, height: 122 },
  waitingRadarCircleSmall: { width: 76, height: 76 },
  waitingRadarBeam: { position: 'absolute', top: 1, left: '50%', marginLeft: -42, width: 0, height: 0, borderLeftWidth: 42, borderRightWidth: 42, borderTopWidth: 150, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: 'rgba(65, 164, 239, 0.32)' },
  waitingRadarTitle: { position: 'absolute', bottom: 12, width: '100%', color: '#111111', fontSize: 15, lineHeight: 20, textAlign: 'center' },
  waitingRadarTitleStrong: { fontWeight: '800' },
  waitingRequestDivider: { height: 1, marginVertical: 9 },
  waitingRequestMetaStrong: { fontWeight: '800' },
  waitingRequestStatus: { fontSize: 13, lineHeight: 19 },
  acceptedOverlay: { bottom: -8, paddingTop: 0, paddingBottom: 5, backgroundColor: 'transparent', elevation: 0, shadowOpacity: 0 },
  mechanicOverlay: { bottom: -20, paddingTop: 0, paddingBottom: 0 },
  acceptedBookingCard: { width: '92%', paddingHorizontal: 16, paddingTop: 0, paddingBottom: 12, borderRadius: 24, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.16, shadowRadius: 7 },
  acceptedBookingCardMinimized: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 12, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  acceptedBookingHandleHitArea: { minHeight: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 0 },
  acceptedBookingHandle: { width: 54, height: 5, borderRadius: 3, backgroundColor: '#D5D9DE' },
  acceptedBookingBanner: { minHeight: 42, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#EAF2F8' },
  acceptedBookingBannerMinimized: { minHeight: 42, paddingHorizontal: 16, borderRadius: 8 },
  acceptedBookingIcon: { width: 30, height: 30, resizeMode: 'contain', marginRight: 10 },
  acceptedBookingBannerText: { flex: 1, color: '#1B1B1B', fontSize: 14, fontWeight: '800', letterSpacing: 0.1 },
  acceptedBookingDetails: { overflow: 'hidden' },
  acceptedSectionTitle: { marginTop: 12, marginBottom: 5, fontSize: 16, fontWeight: '800', letterSpacing: 0.1 },
  acceptedDetailRow: { flexDirection: 'row', alignItems: 'center' },
  acceptedDetailIcon: { width: 28, height: 28, resizeMode: 'contain', marginRight: 8 },
  acceptedDetailText: { flex: 1, fontSize: 13, lineHeight: 18 },
  acceptedDetailStrong: { fontWeight: '800' },
  acceptedIssueText: { marginLeft: 36, fontSize: 13, lineHeight: 18 },
  acceptedInfoText: { fontSize: 13, lineHeight: 19 },
  cancelBookingButton: { minHeight: 48, marginTop: 12, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F97316' },
  cancelBookingButtonMinimized: { minHeight: 48, marginTop: 12, borderRadius: 24 },
  cancelBookingButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.1 },
  overlay: { position: 'absolute', bottom: 0, width: '100%', alignItems: 'center', paddingBottom: Platform.OS === 'ios' ? 52 : 44, paddingTop: 12, backgroundColor: '#FFFFFF', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.14, shadowRadius: 7 },
  
  card: { width: '100%', padding: 18 },
  profileHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  selectedInfo: { flex: 1 },
  callIconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  statusLine: { flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 12, fontWeight: '800' },
  title: { fontSize: 20, fontWeight: 'bold' },
  rating: { color: '#FF6B00', fontSize: 14, marginTop: 4, fontWeight: '700' },
  price: { fontSize: 24, fontWeight: '900' },
  detailRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderBottomWidth: 1, marginTop: 8, marginBottom: 18 },
  detailRowLabel: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  detailRowText: { fontSize: 14, fontWeight: '800' },
  compareButton: { minHeight: 44, borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 },
  compareButtonText: { fontSize: 14, fontWeight: '800' },
  servicesList: { paddingHorizontal: 12, paddingVertical: 5 },
  serviceItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  serviceName: { flex: 1, fontSize: 14, fontWeight: '600' },
  servicePrice: { fontSize: 14, fontWeight: '800', marginLeft: 12 },
  noServices: { paddingVertical: 12, fontSize: 13 },
  servicesScreen: { flex: 1 },
  servicesHeader: { minHeight: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  servicesBackButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  servicesHeaderSpacer: { width: 40 },
  servicesTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800' },
  servicesMechanic: { paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1 },
  servicesMechanicName: { fontSize: 18, fontWeight: '800' },
  servicesMechanicMeta: { fontSize: 13, marginTop: 4 },
  comparisonScreen: { flex: 1 },
  comparisonContent: { flex: 1, padding: 16 },
  comparisonIntro: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  comparisonSearch: { minHeight: 48, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  comparisonInput: { flex: 1, fontSize: 14, paddingVertical: 10 },
  comparisonList: { paddingTop: 14, paddingBottom: 30, gap: 10 },
  comparisonCard: { borderWidth: 1, borderRadius: 12, padding: 14 },
  comparisonCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  comparisonMechanicInfo: { flex: 1 },
  comparisonMechanicName: { fontSize: 15, fontWeight: '800' },
  comparisonServiceName: { fontSize: 13, marginTop: 4 },
  comparisonPrice: { fontSize: 18, fontWeight: '900' },
  comparisonMeta: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 },
  comparisonMetaText: { fontSize: 12, fontWeight: '700' },
  comparisonEmpty: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 70 },
  comparisonEmptyTitle: { fontSize: 16, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  comparisonEmptyText: { fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' },
  fullServicesList: { marginTop: 16 },
  fullServiceItem: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderBottomWidth: 1 },
  fullServiceName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  mechanicProfileScreen: { flex: 1 },
  mechanicProfileHeader: { minHeight: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  mechanicProfileContent: { alignItems: 'center', padding: 20, paddingBottom: 40 },
  mechanicProfileAvatar: { width: 150, height: 150, borderRadius: 75, resizeMode: 'cover', marginTop: 16 },
  mechanicProfileAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  mechanicProfileInitials: { color: '#FFFFFF', fontSize: 42, fontWeight: '900' },
  mechanicProfileName: { fontSize: 24, fontWeight: '900', marginTop: 14, textAlign: 'center' },
  mechanicProfileService: { fontSize: 14, marginTop: 5 },
  mechanicProfileStats: { width: '100%', minHeight: 78, borderWidth: 1, borderRadius: 12, marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  mechanicProfileStat: { flex: 1, alignItems: 'center' },
  mechanicProfileStatValue: { fontSize: 18, fontWeight: '900' },
  mechanicProfileStatLabel: { fontSize: 12, marginTop: 3 },
  mechanicProfileStatDivider: { width: 1, height: 42 },
  mechanicReviewsTitle: { width: '100%', fontSize: 20, fontWeight: '900', marginTop: 26, marginBottom: 8 },
  mechanicReviewsLoader: { marginTop: 20 },
  mechanicReviewRow: { width: '100%', paddingVertical: 13, borderBottomWidth: 1 },
  mechanicReviewStars: { fontSize: 16, letterSpacing: 1, marginBottom: 5 },
  mechanicReviewText: { fontSize: 14, lineHeight: 20 },
  bookingScreen: { flex: 1 },
  bookingHeader: { minHeight: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  bookingTitle: { fontSize: 18, fontWeight: '800' },
  bookingSubtitle: { fontSize: 12, marginTop: 2 },
  bookingContent: { flex: 1, padding: 16 },
  bookingSectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 7 },
  bookingVehicleRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  bookingVehicleInput: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, fontSize: 13 },
  bookingServices: { height: 240, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  bookingServicesContent: { flexGrow: 1 },
  bookingServiceRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: 1 },
  bookingRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  bookingRadioDot: { width: 10, height: 10, borderRadius: 5 },
  bookingServiceName: { flex: 1, fontSize: 14, fontWeight: '700' },
  bookingServicePrice: { fontSize: 14, fontWeight: '800', marginLeft: 12 },
  bookingDateTitle: { marginTop: 12 },
  bookingDateButton: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  bookingDateText: { flex: 1, fontSize: 14, fontWeight: '700' },
  priceSummary: { marginTop: 12, borderWidth: 1, borderRadius: 12, padding: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  summaryLabel: { fontSize: 13, flex: 1 },
  summaryValue: { fontSize: 14, fontWeight: '700', marginLeft: 16 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, marginTop: 5, paddingTop: 9 },
  totalLabel: { fontSize: 15, fontWeight: '800' },
  totalValue: { fontSize: 20, fontWeight: '900' },
  fareNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 9 },
  fareNoticeText: { flex: 1, fontSize: 11, lineHeight: 15 },
  confirmBookingButton: { minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  confirmBookingText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  disabledButton: { opacity: 0.55 },
  subtitle: { fontSize: 14, marginBottom: 20 },
  
  sosButton: { backgroundColor: '#FF3800', paddingVertical: 13, width: '94%', borderRadius: 10, alignItems: 'center', marginBottom: -24, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  sosContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sosText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15, letterSpacing: 0.2 },
  bookButton: { backgroundColor: '#FF6B00', paddingVertical: 14, width: '100%', borderRadius: 5, alignItems: 'center', marginBottom: 10 },
  bookButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  cancelButton: { paddingVertical: 12, alignItems: 'center' },
  cancelButtonText: { color: '#EF4444', fontWeight: 'bold', fontSize: 14 },

  topContainer: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 10, paddingBottom: 10, borderRadius: 0, borderWidth: 1, zIndex: 10, elevation: 7, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.14, shadowRadius: 7 },
  topActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  iconCircle: { width: 50, height: 50, borderRadius: 25, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', elevation: 5, borderWidth: 1 },
  iconAvatarImage: { width: '100%', height: '100%', borderRadius: 25 },
  iconInitials: { fontSize: 18, fontWeight: '800' },
  activityButton: { width: 34, height: 50, alignItems: 'center', justifyContent: 'center' },
  vehicleSelector: { flex: 1, minHeight: 44, marginHorizontal: 10, borderWidth: 1, borderColor: '#D7D9DE', borderRadius: 3, paddingHorizontal: 14, paddingVertical: 3, justifyContent: 'center', backgroundColor: '#FFFFFF' },
  vehicleSelectorLabel: { fontSize: 11, lineHeight: 14 },
  vehicleSelectorValue: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 },
  vehicleSelectorText: { flex: 1, fontSize: 14, fontWeight: '700' },
  vehicleSelectorIcon: { width: 26, height: 26 },
  vehicleMenu: { position: 'absolute', top: 110, left: 70, right: 54, borderWidth: 1, borderRadius: 3, overflow: 'hidden', elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 5, zIndex: 20 },
  vehicleMenuItem: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: 1, backgroundColor: '#FFFFFF' },
  vehicleMenuItemSelected: { backgroundColor: '#F1F3F5' },
  vehicleMenuIcon: { width: 28, height: 28 },
  vehicleMenuCopy: { flex: 1, marginLeft: 10 },
  vehicleMenuTitle: { fontSize: 14, fontWeight: '700' },
  vehicleMenuDetails: { fontSize: 12, marginTop: 2 },
  sosImage: { width: 24, height: 24, resizeMode: 'contain' },

  trackingCard: { width: '100%', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 2 },
  trackingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  trackingName: { fontSize: 19, fontWeight: '800', letterSpacing: 0.1 },
  trackingCallButton: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  trackingStatusCard: { width: '100%', minHeight: 190, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 18, alignItems: 'center', justifyContent: 'space-between', elevation: 1 },
  statusRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  statusText: { fontSize: 14, fontWeight: '800', marginLeft: 10, textAlign: 'center', flexShrink: 1 },
  bookingTimeline: { width: '100%', flexDirection: 'row', alignItems: 'flex-start' },
  timelineItem: { flex: 1, alignItems: 'center' },
  timelineTrack: { width: '100%', height: 24, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  timelineDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: '#B8C2CC', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 2, backgroundColor: '#FFFFFF' },
  timelineConnector: { position: 'absolute', left: '50%', right: '-50%', top: 11, height: 2, backgroundColor: '#B8C2CC', zIndex: 0 },
  timelineLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 7 },
  receiptButton: { minWidth: 190, minHeight: 42, borderRadius: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18, elevation: 2 },
  receiptButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', letterSpacing: 0.3 },
  receiptOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  receiptCard: { borderWidth: 1, borderRadius: 16, padding: 20, elevation: 8 },
  receiptHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  receiptTitle: { fontSize: 20, fontWeight: '900' },
  receiptSubtitle: { fontSize: 13, marginTop: 3 },
  receiptDivider: { borderBottomWidth: 1, marginVertical: 16 },
  receiptLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  receiptValue: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  receiptRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15, gap: 12 },
  receiptTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, marginTop: 18, paddingTop: 14 },
  receiptTotalLabel: { fontSize: 16, fontWeight: '900' },
  receiptTotalValue: { fontSize: 20, fontWeight: '900' },
  receiptNote: { fontSize: 11, lineHeight: 15, marginTop: 16 },
  actionBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { borderRadius: 24, padding: 24, alignItems: 'center', elevation: 10, borderWidth: 1 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  modalSubtitle: { fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  ratingModalContent: { padding: 16, borderRadius: 18 },
  ratingCompleteIcon: { marginBottom: 7 },
  ratingModalTitle: { fontSize: 20, marginBottom: 4 },
  ratingModalSubtitle: { fontSize: 12, marginBottom: 12, lineHeight: 16 },
  ratingBox: { width: '100%', alignItems: 'center', marginBottom: 20, paddingVertical: 16, borderRadius: 16, borderWidth: 1 },
  compactRatingBox: { marginBottom: 12, paddingVertical: 10, borderRadius: 12 },
  ratingPrompt: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  compactRatingPrompt: { fontSize: 14, marginBottom: 7 },
  starsRow: { flexDirection: 'row' },
  compactStar: { marginHorizontal: 2 },
  ratingScaleText: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  reviewInput: { width: '100%', borderRadius: 12, padding: 16, height: 100, textAlignVertical: 'top', marginBottom: 20, borderWidth: 1 },
  compactReviewInput: { height: 64, padding: 10, borderRadius: 10, marginBottom: 14 },
  reviewCounter: { alignSelf: 'flex-end', fontSize: 11, marginTop: -14, marginBottom: 16 },
  submitReviewBtn: { backgroundColor: '#10b981', width: '100%', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  compactSubmitReviewBtn: { paddingVertical: 12, borderRadius: 10 },
  submitReviewText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  
  // Cancellation Styles
  reasonRow: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  reasonText: { fontSize: 14, fontWeight: '600' },
  closeCancelBtn: { flex: 1, paddingVertical: 16, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  confirmCancelBtn: { flex: 1, backgroundColor: '#EF4444', paddingVertical: 16, borderRadius: 12, alignItems: 'center' }
});