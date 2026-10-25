import { MotoristHomeHeader } from "@/components/MotoristHomeHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import { getSharedAvatarUrl, subscribeToSharedAvatar } from "@/lib/avatarStore";
import { supabase } from "@/lib/supabase";
import {
  getCachedActiveBooking,
  setCachedActiveBooking,
  subscribeToActiveBooking,
} from "@/lib/activeBookingStore";
import { listVehicles } from "@/services/vehicleService";
import type { Vehicle } from "@/types/vehicle";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { normalizeText } from "@/lib/typography";
import { MapWebView, type MapWebViewHandle } from "@/components/MapWebView";
import EmergencyChecklistScreen from "./emergency-checklist";

const bikeIcon = require("../../assets/images/bike.png");
const motoristCallIcon = require("../../assets/images/motorist-call.png");
const recenterIcon = require("../../assets/images/recenter.png");
const mapOrientationIcon = require("../../assets/images/maporientation.png");
const clockIcon = require("../../assets/images/clock.png");
const MOTORIST_RADIUS_KEY = "motorist_search_radius_km";
const MIN_LOCATION_ACCURACY_METERS = 100;
const MIN_LOCATION_UPDATE_DISTANCE_METERS = 20;
const LOCATION_UPDATE_INTERVAL_MS = 10000;
const MAX_CACHED_LOCATION_AGE_MS = 5 * 60 * 1000;

let cachedDeviceLocation: Location.LocationObject | null = null;
const completedJobsCountCache = new Map<string, number>();
const completedJobsCountKey = (mechanicId: string) =>
  `mechanic_completed_jobs_${mechanicId}`;

const CANCELLATION_REASONS = [
  "Mechanic is taking too long",
  "Mechanic is unresponsive",
  "Pinned the wrong location/vehicle",
  "Issue was resolved locally",
  "Other",
];

function bookingStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "scheduled":
    case "pending":
      return "Waiting for mechanic to accept";
    case "accepted":
      return "Mechanic accepted your booking";
    case "arrived":
      return "Mechanic has arrived";
    case "in_transit":
      return "Mechanic is on the way";
    case "in_progress":
      return "Service is in progress";
    case "completed":
      return "Service completed";
    case "cancelled":
      return "Booking cancelled";
    default:
      return "Booking received";
  }
}

const BOOKING_STEPS = [
  ["accepted", "Accepted"],
  ["in_transit", "On the way"],
  ["arrived", "Arrived"],
  ["completed", "Completed"],
] as const;
const ACTIVE_BOOKING_STATUSES = [
  "scheduled",
  "pending",
  "accepted",
  "in_transit",
  "arrived",
  "in_progress",
];

function bookingStepIndex(status: string | null | undefined) {
  if (status === "in_progress") return 2;
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

function isUsableLocation(
  nextLocation: Location.LocationObject,
  previousLocation: Location.LocationObject | null,
) {
  const { accuracy } = nextLocation.coords;
  if (
    typeof accuracy === "number" &&
    accuracy > MIN_LOCATION_ACCURACY_METERS
  ) {
    return false;
  }

  if (!previousLocation) return true;

  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const latitudeDelta = toRadians(
    nextLocation.coords.latitude - previousLocation.coords.latitude,
  );
  const longitudeDelta = toRadians(
    nextLocation.coords.longitude - previousLocation.coords.longitude,
  );
  const latitude1 = toRadians(previousLocation.coords.latitude);
  const latitude2 = toRadians(nextLocation.coords.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.sin(longitudeDelta / 2) ** 2 * Math.cos(latitude1) * Math.cos(latitude2);
  const distance = 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
  return distance >= MIN_LOCATION_UPDATE_DISTANCE_METERS;
}

function isRecentLocation(location: Location.LocationObject) {
  return (
    Date.now() - location.timestamp <= MAX_CACHED_LOCATION_AGE_MS &&
    (location.coords.accuracy === null ||
      location.coords.accuracy <= MIN_LOCATION_ACCURACY_METERS)
  );
}

export default function MotoristMap() {
  const router = useRouter();
  const { bookingId, mechanicId } = useLocalSearchParams<{
    bookingId?: string;
    mechanicId?: string;
  }>();
  const { session } = useAuth();
  const { colors, isDarkMode } = useAppTheme();
  const bookingSosColors = {
    background: colors.bg,
    card: colors.card,
    text: colors.text,
    muted: colors.textMuted,
    border: colors.border,
    primary: colors.primary,
  };
  const motoristId = session?.user.id;

  const [location, setLocation] = useState<Location.LocationObject | null>(
    cachedDeviceLocation,
  );
  const [heading, setHeading] = useState(0);
  const [liveMechanics, setLiveMechanics] = useState<any[]>([]);
  const [searchRadius, setSearchRadius] = useState(10);
  const [selectedMechanic, setSelectedMechanic] = useState<any>(null);
  const [displayedMechanic, setDisplayedMechanic] = useState<any>(null);
  const [showServices, setShowServices] = useState(false);
  const [priceComparisonVisible, setPriceComparisonVisible] = useState(false);
  const [priceSearch, setPriceSearch] = useState("");
  const [mechanicProfileVisible, setMechanicProfileVisible] = useState(false);
  const [nearbyMechanicsVisible, setNearbyMechanicsVisible] = useState(false);
  const [mechanicReviews, setMechanicReviews] = useState<any[]>([]);
  const [loadingMechanicReviews, setLoadingMechanicReviews] = useState(false);
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [bookingReceiptVisible, setBookingReceiptVisible] = useState(false);
  const [emergencyChecklistVisible, setEmergencyChecklistVisible] =
    useState(false);
  const [activeRequestLoading, setActiveRequestLoading] = useState(true);
  const [selectedServices, setSelectedServices] = useState<any[]>([]);
  const [bookingNotes, setBookingNotes] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [primaryVehicle, setPrimaryVehicle] = useState<Vehicle | null>(null);
  const [availableVehicles, setAvailableVehicles] = useState<Vehicle[]>([]);
  const [vehiclePickerVisible, setVehiclePickerVisible] = useState(false);
  const [bookingDate, setBookingDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  });
  const [showBookingDatePicker, setShowBookingDatePicker] = useState(false);
  const [showBookingTimePicker, setShowBookingTimePicker] = useState(false);
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [mechanicPanelAnimation] = useState(() => new Animated.Value(0));
  const [activeRequest, setActiveRequest] = useState<any>(() =>
    motoristId ? getCachedActiveBooking(motoristId) : null,
  );
  const [acceptedSuccessVisible, setAcceptedSuccessVisible] = useState(false);
  const handledBookAgainId = useRef<string | null>(null);
  const handledMechanicId = useRef<string | null>(null);
  const [bookingTransition] = useState(() => new Animated.Value(1));
  const [acceptedBookingExpanded, setAcceptedBookingExpanded] = useState(true);
  const [acceptedBookingAnimation] = useState(() => new Animated.Value(1));
  const [waitingLineAnimation] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!motoristId) return;
    return subscribeToActiveBooking(motoristId, (booking) => {
      setActiveRequest(booking);
      setActiveRequestLoading(false);
    });
  }, [motoristId]);
  const acceptedBookingPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) &&
          Math.abs(gestureState.dy) > 6,
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
  const [review, setReview] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);
  const [motoristAvatarUrl, setMotoristAvatarUrl] = useState<string | null>(
    () =>
      getSharedAvatarUrl() ||
      (typeof session?.user.user_metadata?.avatar_url === "string"
        ? session.user.user_metadata.avatar_url
        : null),
  );
  const mapRef = useRef<MapWebViewHandle | null>(null);
  const previousBookingStatus = useRef<string | null>(null);
  const [radarRotation] = useState(() => new Animated.Value(0));
  const motoristAvatarPath = useRef<string | null>(null);
  useEffect(() => subscribeToSharedAvatar(setMotoristAvatarUrl), []);

  useFocusEffect(
    useCallback(() => {
      return () => {
        setDisplayedMechanic(null);
        setSelectedMechanic(null);
        setShowServices(false);
        setPriceComparisonVisible(false);
        setMechanicProfileVisible(false);
        setNearbyMechanicsVisible(false);
        setBookingModalVisible(false);
        setVehiclePickerVisible(false);
      };
    }, [
      setBookingModalVisible,
      setDisplayedMechanic,
      setMechanicProfileVisible,
      setNearbyMechanicsVisible,
      setPriceComparisonVisible,
      setSelectedMechanic,
      setShowServices,
      setVehiclePickerVisible,
    ]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!motoristId) return;
      let active = true;
      void listVehicles(motoristId).then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.warn("Unable to load primary vehicle:", error);
          return;
        }
        setAvailableVehicles(data);
        setPrimaryVehicle(data.find((vehicle) => vehicle.is_primary) ?? data[0] ?? null);
      });
      return () => {
        active = false;
      };
    }, [motoristId]),
  );

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
    if (!displayedMechanic?.id) return;
    let active = true;
    const mechanicId = displayedMechanic.id;
    const loadCompletedJobs = async () => {
      const storedCount = await SecureStore.getItemAsync(
        completedJobsCountKey(mechanicId),
      );
      const cachedCount =
        completedJobsCountCache.get(mechanicId) ??
        (storedCount === null ? undefined : Number(storedCount));
      if (active && cachedCount !== undefined) {
        setDisplayedMechanic((current: any) =>
          current?.id === mechanicId
            ? { ...current, completedJobs: cachedCount }
            : current,
        );
      }

      const { count } = await supabase
        .from("service_requests")
        .select("id", { count: "exact", head: true })
        .eq("mechanic_id", mechanicId)
        .in("status", ["completed", "closed", "done", "resolved"]);
      if (!active || count === null) return;
      completedJobsCountCache.set(mechanicId, count);
      await SecureStore.setItemAsync(
        completedJobsCountKey(mechanicId),
        String(count),
      );
      if (active) {
        setDisplayedMechanic((current: any) =>
          current?.id === mechanicId
            ? { ...current, completedJobs: count }
            : current,
        );
      }
    };
    void loadCompletedJobs();
    return () => {
      active = false;
    };
  }, [displayedMechanic?.id]);

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
    const wasWaiting =
      previousStatus === "scheduled" || previousStatus === "pending";
    const isWaiting = nextStatus === "scheduled" || nextStatus === "pending";
    if (wasWaiting && nextStatus === "accepted") {
      setAcceptedSuccessVisible(true);
    }
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

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!motoristId) return undefined;
      if (getSharedAvatarUrl()) return undefined;
      void supabase
        .from("profiles")
        .select("avatar_path")
        .eq("id", motoristId)
        .maybeSingle()
        .then(async ({ data }) => {
          if (!active) return;
          if (!data?.avatar_path) {
            motoristAvatarPath.current = null;
            if (!session?.user.user_metadata?.avatar_url)
              setMotoristAvatarUrl(null);
            return;
          }
          if (
            data.avatar_path === motoristAvatarPath.current &&
            motoristAvatarUrl
          ) {
            return;
          }
          const signed = await supabase.storage
            .from("mechanic-avatars")
            .createSignedUrl(data.avatar_path, 60 * 60);
          if (active) {
            motoristAvatarPath.current = data.avatar_path;
            setMotoristAvatarUrl(signed.data?.signedUrl ?? null);
          }
        });
      return () => {
        active = false;
      };
    }, [
      motoristAvatarUrl,
      motoristId,
      session?.user.user_metadata?.avatar_url,
    ]),
  );

  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSuccessVisible, setCancelSuccessVisible] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const fetchLiveMechanics = useCallback(
    async (userLat: number, userLng: number) => {
      const { data, error } = await supabase.rpc("get_nearby_mechanics", {
        p_latitude: userLat,
        p_longitude: userLng,
        p_radius_km: searchRadius,
      });
      if (error) {
        console.warn("Nearby mechanics unavailable:", error.message);
        setLiveMechanics([]);
        return;
      }
      const formattedMechanics = (data ?? []).map((mech: any) => ({
        id: mech.id,
        name: mech.full_name || "Unnamed Mechanic",
        mobileNumber: mech.mobile_number || null,
        isOnline: mech.is_online !== false,
        rating: Number(mech.average_rating) || 5,
        price: Number(mech.base_price) || 500,
        latitude: mech.home_latitude,
        longitude: mech.home_longitude,
        avatarUrl: mech.avatar_path
          ? supabase.storage
              .from("mechanic-avatars")
              .getPublicUrl(mech.avatar_path).data.publicUrl
          : null,
        skills: mech.skills || "General motorcycle service",
        experience: mech.experience || null,
        services: Array.isArray(mech.maintenance_pricing)
          ? mech.maintenance_pricing
          : [],
        distanceKm: Number(mech.distance_km) || 0,
        distance: `${Number(mech.distance_km).toFixed(1)} km`,
      }));
      setLiveMechanics(formattedMechanics);
    },
    [searchRadius],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void SecureStore.getItemAsync(MOTORIST_RADIUS_KEY).then((storedRadius) => {
        const parsedRadius = Number(storedRadius);
        if (active && [5, 10, 15].includes(parsedRadius)) {
          setSearchRadius(parsedRadius);
        }
      });
      return () => {
        active = false;
      };
    }, []),
  );

  useEffect(() => {
    if (!location) return;
    const refreshTimer = setTimeout(() => {
      void fetchLiveMechanics(location.coords.latitude, location.coords.longitude);
    }, 500);
    return () => clearTimeout(refreshTimer);
  }, [fetchLiveMechanics, location]);

  useEffect(() => {
    if (
      !bookingId ||
      handledBookAgainId.current === bookingId ||
      !liveMechanics.length
    ) {
      return;
    }

    let active = true;
    const prepareBookAgain = async () => {
      const { data: booking, error } = await supabase
        .from("service_requests")
        .select(
          "id,mechanic_id,vehicle_type,plate_number,service_name,service_price,scheduled_at",
        )
        .eq("id", bookingId)
        .maybeSingle();
      if (!active || error || !booking?.mechanic_id) return;

      const { data: existingBooking } = await supabase
        .from("service_requests")
        .select("id")
        .eq("motorist_id", session?.user.id ?? "")
        .in("status", ACTIVE_BOOKING_STATUSES)
        .limit(1)
        .maybeSingle();
      if (!active) return;
      if (existingBooking) {
        Alert.alert(
          "Booking in progress",
          "You already have an ongoing booking. Please wait until it is completed before booking again.",
        );
        handledBookAgainId.current = bookingId;
        return;
      }

      let mechanic = liveMechanics.find(
        (item) => item.id === booking.mechanic_id,
      );
      if (!mechanic) {
        const { data: profile } = await supabase
          .from("profiles")
          .select(
            "id,full_name,mobile_number,average_rating,is_online,skills,experience,maintenance_pricing,avatar_path",
          )
          .eq("id", booking.mechanic_id)
          .maybeSingle();
        if (!active || !profile) return;
        mechanic = {
          id: profile.id,
          name: profile.full_name || "Mechanic",
          mobileNumber: profile.mobile_number || null,
          isOnline: profile.is_online !== false,
          rating: Number(profile.average_rating) || 5,
          price: 500,
          skills: profile.skills || "General motorcycle service",
          experience: profile.experience || null,
          services: Array.isArray(profile.maintenance_pricing)
            ? profile.maintenance_pricing
            : [],
          distanceKm: 0,
          distance: "Nearby",
          latitude: null,
          longitude: null,
          avatarUrl: profile.avatar_path
            ? supabase.storage
                .from("mechanic-avatars")
                .getPublicUrl(profile.avatar_path).data.publicUrl
            : null,
        };
      }

      const serviceNames = String(booking.service_name ?? "")
        .split(",")
        .map((service) => service.trim().toLowerCase())
        .filter(Boolean);
      const matchingServices = mechanic.services.filter((service: any) =>
        serviceNames.includes(
          String(service.service ?? "")
            .trim()
            .toLowerCase(),
        ),
      );
      if (!matchingServices.length) {
        Alert.alert(
          "Service unavailable",
          "The original service is no longer listed by this mechanic.",
        );
        handledBookAgainId.current = bookingId;
        return;
      }

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      setSelectedMechanic(mechanic);
      setDisplayedMechanic(mechanic);
      setSelectedServices(matchingServices);
      setVehicleType(
        primaryVehicle
          ? `${primaryVehicle.make} ${primaryVehicle.model}`.trim()
          : String(booking.vehicle_type ?? ""),
      );
      setPlateNumber(
        primaryVehicle?.plate_number ?? String(booking.plate_number ?? ""),
      );
      setBookingDate(tomorrow);
      setBookingModalVisible(true);
      handledBookAgainId.current = bookingId;
    };

    void prepareBookAgain();
    return () => {
      active = false;
    };
  }, [bookingId, liveMechanics, primaryVehicle, session?.user.id]);

  useEffect(() => {
    if (
      !mechanicId ||
      handledMechanicId.current === mechanicId ||
      !liveMechanics.length
    ) {
      return;
    }
    const mechanic = liveMechanics.find((item) => item.id === mechanicId);
    if (!mechanic) return;
    if (!mechanic.services?.length) {
      Alert.alert(
        "No services available",
        "This mechanic has not listed any service offerings yet.",
      );
      handledMechanicId.current = mechanicId;
      return;
    }
    if (activeRequest && ACTIVE_BOOKING_STATUSES.includes(String(activeRequest.status).toLowerCase())) {
      Alert.alert(
        "Booking in progress",
        "You already have an ongoing booking. Please wait until it is completed.",
      );
      handledMechanicId.current = mechanicId;
      return;
    }
    const openTimer = setTimeout(() => {
      setSelectedMechanic(mechanic);
      setDisplayedMechanic(mechanic);
      setSelectedServices([]);
      setBookingNotes("");
      setVehicleType(
        primaryVehicle ? `${primaryVehicle.make} ${primaryVehicle.model}`.trim() : "",
      );
      setPlateNumber(primaryVehicle?.plate_number ?? "");
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      setBookingDate(tomorrow);
      setBookingModalVisible(true);
      handledMechanicId.current = mechanicId;
    }, 0);
    return () => clearTimeout(openTimer);
  }, [activeRequest, liveMechanics, mechanicId, primaryVehicle]);

  const comparisonResults = useMemo(() => {
    const query = priceSearch.trim().toLowerCase();
    return liveMechanics
      .flatMap((mechanic: any) =>
        (mechanic.services ?? [])
          .filter((service: any) => {
            const name = String(service.service ?? "").toLowerCase();
            return !query || name.includes(query);
          })
          .map((service: any) => ({
            mechanic,
            service,
            numericPrice:
              Number(String(service.price ?? "").replace(/[^\d.]/g, "")) || 0,
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
    setPriceSearch("");
    setPriceComparisonVisible(true);
  };

  const callMechanic = async (phoneNumber: string | null) => {
    if (!phoneNumber) {
      Alert.alert(
        "Number unavailable",
        "This mechanic has not provided a contact number.",
      );
      return;
    }
    const url = `tel:${phoneNumber.replace(/[^\d+]/g, "")}`;
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
    } else {
      Alert.alert("Unable to call", "Your device cannot open the phone app.");
    }
  };

  const openMechanicProfile = async () => {
    if (!displayedMechanic) return;
    setMechanicProfileVisible(true);
    setLoadingMechanicReviews(true);
    const { data } = await supabase
      .from("mechanic_ratings")
      .select("rating,review,created_at")
      .eq("mechanic_id", displayedMechanic.id)
      .not("review", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);
    setMechanicReviews(data ?? []);
    setLoadingMechanicReviews(false);
  };

  useEffect(() => {
    let active = true;
    let locationSubscription: Location.LocationSubscription | null = null;
    let headingSubscription: Location.LocationSubscription | null = null;

    (async () => {
      if (Platform.OS === "web") {
        try {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (permission.status === "granted") {
            const currentLocation = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
            });
            if (!active) return;
            if (isRecentLocation(currentLocation)) {
              setLocation(currentLocation);
              void fetchLiveMechanics(
                currentLocation.coords.latitude,
                currentLocation.coords.longitude,
              );
            }
            locationSubscription = await Location.watchPositionAsync(
              {
                accuracy: Location.Accuracy.Balanced,
                distanceInterval: MIN_LOCATION_UPDATE_DISTANCE_METERS,
                timeInterval: LOCATION_UPDATE_INTERVAL_MS,
              },
              (nextLocation) => {
                if (!active || !isUsableLocation(nextLocation, currentLocation)) {
                  return;
                }
                setLocation(nextLocation);
              },
            );
            return;
          }
        } catch (error) {
          console.warn("Unable to read browser location:", error);
        }
        if (!active) return;
        setLocation(webLocation);
        void fetchLiveMechanics(
          webLocation.coords.latitude,
          webLocation.coords.longitude,
        );
        return;
      }

      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") {
        const permission = await Location.requestForegroundPermissionsAsync();
        status = permission.status;
      }
      if (status === "granted") {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown && active && isRecentLocation(lastKnown)) {
          cachedDeviceLocation = lastKnown;
          setLocation(lastKnown);
          void fetchLiveMechanics(
            lastKnown.coords.latitude,
            lastKnown.coords.longitude,
          );
        }
        const currentLoc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });
        if (!active) return;
        if (isRecentLocation(currentLoc)) {
          cachedDeviceLocation = currentLoc;
          setLocation(currentLoc);
          void fetchLiveMechanics(
            currentLoc.coords.latitude,
            currentLoc.coords.longitude,
          );
        }
        
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: MIN_LOCATION_UPDATE_DISTANCE_METERS,
            timeInterval: LOCATION_UPDATE_INTERVAL_MS,
          },
          (nextLocation) => {
            if (!active) return;
            if (!isUsableLocation(nextLocation, cachedDeviceLocation)) return;
            cachedDeviceLocation = nextLocation;
            setLocation(nextLocation);
          }
        );

        // This activates the device compass
        headingSubscription = await Location.watchHeadingAsync((headingData) => {
          if (!active) return;
          setHeading(headingData.trueHeading >= 0 ? headingData.trueHeading : headingData.magHeading);
        });

      } else if (active) {
        Alert.alert(
          "Location permission required",
          "Allow location access so the map can show your actual live position.",
        );
      }
    })();
    return () => {
      active = false;
      locationSubscription?.remove();
      headingSubscription?.remove();
    };
  }, [fetchLiveMechanics]);

  const handleEmergencySOS = () => {
    const hasActiveBooking = [
      "pending",
      "scheduled",
      "accepted",
      "in_transit",
      "arrived",
      "in_progress",
    ].includes(activeRequestStatus);
    if (activeRequest && hasActiveBooking) {
      Alert.alert(
        "Ongoing order in progress",
        "You cannot send a new Emergency SOS while you have an ongoing order. Please use your current booking or wait until it is finished.",
      );
      return;
    }
    const sosLocation =
      location ?? (Platform.OS === "web" ? webLocation : null);
    if (!sosLocation)
      return Alert.alert(
        "Location Required",
        "Please wait while we pinpoint your location.",
      );
    setEmergencyChecklistVisible(true);
  };

  const handleRecenterLocation = async () => {
    if (Platform.OS === "web") {
      mapRef.current?.injectJavaScript(
        `map.setView([${webLocation.coords.latitude}, ${webLocation.coords.longitude}], 17, { animate: true, duration: 0.5 }); true;`,
      );
      return;
    }

    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Location Required",
        "Please allow location access to recenter the map.",
      );
      return;
    }

    const recenterMap = (currentLocation: Location.LocationObject) => {
      mapRef.current?.injectJavaScript(
        `map.setView([${currentLocation.coords.latitude}, ${currentLocation.coords.longitude}], 17, { animate: true, duration: 0.35 }); true;`,
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
      void fetchLiveMechanics(
        currentLocation.coords.latitude,
        currentLocation.coords.longitude,
      );
    } catch {
      console.warn("Unable to refresh location after recentering the map.");
    }
  };

  const handleMapOrientation = async () => {
    const currentLocation = location ?? webLocation;
    let heading = currentLocation.coords.heading;
    if (Platform.OS !== "web") {
      try {
        const headingData = await Location.getHeadingAsync();
        heading =
          headingData.trueHeading >= 0
            ? headingData.trueHeading
            : headingData.magHeading;
      } catch {
        heading = currentLocation.coords.heading;
      }
    }
    const rotation = typeof heading === "number" && heading >= 0 ? -heading : 0;
    mapRef.current?.injectJavaScript(
      `map.setView([${currentLocation.coords.latitude}, ${currentLocation.coords.longitude}], Math.max(map.getZoom(), 17), { animate: true, duration: 0.35 }); map.setBearing(${rotation}); true;`,
    );
  };

  const deliveryFeeFor = (distanceKm: number) =>
    100 + Math.max(0, Math.ceil(distanceKm) - 1) * 10;

  const openBooking = () => {
    if (
      activeRequest &&
      ACTIVE_BOOKING_STATUSES.includes(
        String(activeRequest.status).toLowerCase(),
      )
    ) {
      Alert.alert(
        "Booking in progress",
        "You already have an ongoing booking. Please wait until it is completed before booking another service.",
      );
      return;
    }
    if (!selectedMechanic?.services.length) {
      Alert.alert(
        "No services available",
        "This mechanic has not listed any service offerings yet.",
      );
      return;
    }
    if (!primaryVehicle) {
      Alert.alert(
        "Primary vehicle required",
        "Please choose a primary vehicle in Profile > My Garage before scheduling a booking.",
      );
      return;
    }
    setSelectedServices([]);
    setBookingNotes("");
    setVehicleType(`${primaryVehicle.make} ${primaryVehicle.model}`.trim());
    setPlateNumber(primaryVehicle.plate_number);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    setBookingDate(tomorrow);
    setBookingModalVisible(true);
  };

  const chooseBookingVehicle = () => {
    if (availableVehicles.length < 2) {
      Alert.alert(
        "No other vehicles",
        "Add another vehicle in Profile > My Garage to switch vehicles.",
      );
      return;
    }
    setVehiclePickerVisible(true);
  };

  const selectBookingVehicle = (vehicle: Vehicle) => {
    setVehicleType(`${vehicle.make} ${vehicle.model}`.trim());
    setPlateNumber(vehicle.plate_number);
    setVehiclePickerVisible(false);
  };

  const handleBookNow = async () => {
    if (
      !selectedMechanic ||
      !selectedServices.length ||
      !session?.user?.id ||
      !location ||
      submittingBooking
    )
      return;

    if (!vehicleType.trim() || !plateNumber.trim()) {
      Alert.alert(
        "Vehicle details required",
        "Please enter your vehicle model and plate number.",
      );
      return;
    }

    const ltoRegex = /^([A-Z]{2,3}[-\s]?[0-9]{3,5}|[0-9]{4}[-\s]?[0-9]{5,7})$/;
    if (!ltoRegex.test(plateNumber.trim())) {
      Alert.alert(
        "Invalid Plate Number",
        "Please enter a valid LTO plate number (e.g., ABC 1234) or your temporary MV File number.",
      );
      return;
    }

    if (bookingDate.getTime() < Date.now()) {
      Alert.alert(
        "Date required",
        "Please choose a future date for this scheduled booking.",
      );
      return;
    }

    setSubmittingBooking(true);
    const { data: existingBooking, error: existingBookingError } =
      await supabase
        .from("service_requests")
        .select("id")
        .eq("motorist_id", session.user.id)
        .in("status", ACTIVE_BOOKING_STATUSES)
        .limit(1)
        .maybeSingle();
    if (existingBookingError) {
      setSubmittingBooking(false);
      Alert.alert("Booking unavailable", existingBookingError.message);
      return;
    }
    if (existingBooking) {
      setSubmittingBooking(false);
      Alert.alert(
        "Booking in progress",
        "You already have an ongoing booking. Please wait until it is completed before booking another service.",
      );
      setBookingModalVisible(false);
      return;
    }

    const servicePrice = selectedServices.reduce(
      (total, service) =>
        total + (Number(String(service.price).replace(/[^\d.]/g, "")) || 0),
      0,
    );
    const deliveryFee = deliveryFeeFor(selectedMechanic.distanceKm);
    const totalPrice = servicePrice + deliveryFee;
    const serviceNames = selectedServices
      .map((service) => service.service)
      .join(", ");
    const { data, error } = await supabase
      .from("service_requests")
      .insert([
        {
          motorist_id: session.user.id,
          mechanic_id: selectedMechanic.id,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          status: "scheduled",
          request_type: "scheduled",
          scheduled_at: bookingDate.toISOString(),
          vehicle_type: vehicleType.trim(),
          plate_number: plateNumber.trim().toUpperCase(),
          service_name: serviceNames,
          service_price: servicePrice,
          delivery_fee: deliveryFee,
          estimated_total: totalPrice,
          vehicle_issue: bookingNotes.trim()
            ? `${serviceNames}\nNotes: ${bookingNotes.trim()}`
            : serviceNames,
        },
      ])
      .select()
      .single();

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

  useFocusEffect(
    useCallback(() => {
      if (!session?.user.id) {
        setActiveRequestLoading(false);
        return undefined;
      }
      if (activeRequest?.id) {
        setActiveRequestLoading(false);
        return undefined;
      }

      let active = true;
      const cachedBooking = getCachedActiveBooking(session.user.id);
      if (cachedBooking) {
        setActiveRequest(cachedBooking);
        setActiveRequestLoading(false);
        return undefined;
      }
      setActiveRequestLoading(true);
      const loadActiveBooking = async () => {
      const { data: request, error } = await supabase
        .from("service_requests")
        .select("*")
        .eq("motorist_id", session.user.id)
        .in("status", [
          "scheduled",
          "pending",
          "accepted",
          "arrived",
          "in_transit",
          "in_progress",
          "completed",
        ])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active) return;
      if (error || !request) {
        setActiveRequestLoading(false);
        return;
      }

      const { data: mechanic } = await supabase
        .from("profiles")
        .select("id,full_name,mobile_number,average_rating,is_online")
        .eq("id", request.mechanic_id)
        .maybeSingle();

      if (active) {
        const requestWithMechanic = {
          ...request,
          mechanic: mechanic
            ? {
                id: mechanic.id,
                name: mechanic.full_name || "Loading mechanic name...",
                mobileNumber: mechanic.mobile_number || null,
                rating: mechanic.average_rating ?? 5,
                isOnline: mechanic.is_online ?? false,
              }
            : null,
        };
        if (request.status === "completed") {
          setCompletedJob(requestWithMechanic);
        } else {
          setActiveRequest(requestWithMechanic);
          setCachedActiveBooking(session.user.id, requestWithMechanic);
        }
      }
      setActiveRequestLoading(false);
      };

      void loadActiveBooking();
      return () => {
        active = false;
      };
    }, [activeRequest?.id, session]),
  );

  const confirmCancel = async () => {
    if (!cancelReason) {
      Alert.alert("Reason Required", "Please select a reason for cancelling.");
      return;
    }

    setIsCancelling(true);

    if (activeRequest?.id) {
      await supabase
        .from("service_requests")
        .update({
          status: "cancelled",
          cancelled_by: "motorist",
          cancellation_reason: cancelReason,
        })
        .eq("id", activeRequest.id);

      if (
        cancelReason === "Issue was resolved locally" ||
        cancelReason === "Other"
      ) {
        Alert.alert(
          "⚠️ Warning Recorded",
          "Cancelling because the issue was resolved locally wastes the dispatched mechanic's time and fuel. Repeated cancellations will result in a temporary account suspension.",
        );
      } else {
        setCancelSuccessVisible(true);
      }
    }

    setActiveRequest(null);
    if (session?.user.id) {
      setCachedActiveBooking(session.user.id, null);
    }
    setCancelModalVisible(false);
    setCancelReason("");
    setIsCancelling(false);
  };

  useEffect(() => {
    if (!activeRequest?.id) return;
    const channel = supabase
      .channel(`track_request_${activeRequest.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "service_requests",
          filter: `id=eq.${activeRequest.id}`,
        },
        (payload) => {
          setActiveRequest((prev: any) => {
            if (!prev) return prev;
            const updatedRequest = { ...prev, ...payload.new };
            if (payload.new.status === "completed") {
              setCompletedJob(updatedRequest);
              if (session?.user.id) {
                setCachedActiveBooking(session.user.id, null);
              }
              return null;
            }
            if (
              ["cancelled", "canceled"].includes(
                String(payload.new.status ?? "").toLowerCase(),
              )
            ) {
              if (session?.user.id) {
                setCachedActiveBooking(session.user.id, null);
              }
              return null;
            }
            if (session?.user.id) {
              setCachedActiveBooking(session.user.id, updatedRequest);
            }
            return updatedRequest;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeRequest?.id, session?.user.id]);

  const handleCompleteJob = async () => {
    if (
      !completedJob?.id ||
      !completedJob?.mechanic_id ||
      !session?.user.id ||
      submittingRating
    ) {
      return;
    }
    setSubmittingRating(true);
    const { error: ratingError } = await supabase.rpc(
      "submit_mechanic_rating",
      {
        p_service_request_id: completedJob.id,
        p_mechanic_id: completedJob.mechanic_id,
        p_rating: rating,
        p_review: review.trim() || null,
      },
    );
    if (ratingError) {
      setSubmittingRating(false);
      Alert.alert("Rating Failed", ratingError.message);
      return;
    }
    const { error: closeError } = await supabase
      .from("service_requests")
      .update({ status: "closed" })
      .eq("id", completedJob.id)
      .eq("motorist_id", session.user.id);
    setSubmittingRating(false);
    if (closeError) {
      Alert.alert("Payment Failed", closeError.message);
      return;
    }
    Alert.alert(
      "Transaction Closed",
      "Payment confirmed and review submitted!",
    );
    setCompletedJob(null);
    setRating(5);
    setReview("");
  };

  const displayLocation = location ?? webLocation;
  const [initialMapLocation] = useState(displayLocation);
  const { width: screenWidth } = useWindowDimensions();

  useEffect(() => {
    if (!location || !mapRef.current) return;
    const latitude = location.coords.latitude;
    const longitude = location.coords.longitude;
    // Pass the heading into the updateUserLocation function
    mapRef.current.injectJavaScript(
      `if (window.updateUserLocation) { window.updateUserLocation(${latitude}, ${longitude}, ${heading}); } true;`,
    );
  }, [location, heading]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.injectJavaScript(
      `if (window.updateMechanics) { window.updateMechanics(${JSON.stringify(liveMechanics)}); } true;`,
    );
  }, [liveMechanics]);

  const activeRequestStatus = String(activeRequest?.status ?? "")
    .trim()
    .toLowerCase();
  const isWaitingForMechanic =
    !!activeRequest && ["scheduled", "pending"].includes(activeRequestStatus);
  const isEmergencyRequest =
    String(activeRequest?.request_type ?? "").toLowerCase() === "emergency";
  const isAcceptedBooking =
    !!activeRequest &&
    ["accepted", "in_transit", "arrived", "in_progress"].includes(
      activeRequestStatus,
    );
  const hasOngoingOrder =
    !!activeRequest &&
    [
      "pending",
      "scheduled",
      "accepted",
      "in_transit",
      "arrived",
      "in_progress",
    ].includes(activeRequestStatus);

  useEffect(() => {
    waitingLineAnimation.stopAnimation();
    waitingLineAnimation.setValue(0);
    if (!isWaitingForMechanic) return;

    const animation = Animated.loop(
      Animated.timing(waitingLineAnimation, {
        toValue: 1,
        duration: 2400,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [isWaitingForMechanic, waitingLineAnimation]);
  const mapHtml = useMemo(() => `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.js"></script>
        <script src="https://unpkg.com/leaflet-rotate@0.2.8/dist/leaflet-rotate-src.js"></script>
        <style>body { padding: 0; margin: 0; background-color: ${colors.bg}; } #map { height: 100vh; width: 100vw; } .leaflet-tile { filter: ${isDarkMode ? "brightness(.65) invert(1) hue-rotate(180deg)" : "none"}; } .user-marker-wrap { position: relative; width: 240px; height: 135px; } .user-pulse-ring { position: absolute; z-index: 1; left: 91px; bottom: 15px; width: 58px; height: 58px; border-radius: 50%; background: rgba(66, 165, 245, .32); border: 2px solid rgba(66, 165, 245, .7); box-shadow: 0 0 0 3px rgba(66, 165, 245, .18); animation: user-pulse 1.4s ease-out infinite; } .user-marker { position: absolute; z-index: 2; left: 101px; bottom: 25px; width: 38px; height: 38px; border-radius: 50%; background: #2450D8; border: 3px solid #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,.3); display: flex; align-items: center; justify-content: center; } .user-nav-icon { width: 22px; height: 22px; object-fit: contain; } .user-location-card { display: none; position: absolute; left: 50%; bottom: -30px; width: max-content; max-width: 220px; min-height: 0; padding: 6px 10px; border-radius: 26px; background: #FFFFFF; box-shadow: 0 4px 12px rgba(0,0,0,.18); box-sizing: border-box; text-align: center; transform: translateX(-50%); } .user-location-card.visible { display: block; } .user-location-title { color: #172033; font-size: 15px; font-weight: 800; line-height: 19px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .user-location-subtitle { color: #4B5568; font-size: 13px; line-height: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } @keyframes user-pulse { 0% { transform: scale(.7); opacity: .95; } 70% { transform: scale(1.35); opacity: .3; } 100% { transform: scale(1.55); opacity: 0; } } .mechanic-marker { width: 42px; height: 42px; border: 3px solid #F0A202; border-radius: 50%; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.3); overflow: hidden; display: flex; align-items: center; justify-content: center; } .mechanic-marker img { width: 100%; height: 100%; object-fit: cover; } .mechanic-fallback { width: 18px; height: 18px; position: relative; display: block; } .mechanic-fallback:before { content: ''; position: absolute; width: 8px; height: 8px; left: 5px; top: 0; border-radius: 50%; background: #F0A202; } .mechanic-fallback:after { content: ''; position: absolute; width: 18px; height: 9px; left: 0; bottom: 0; border-radius: 10px 10px 4px 4px; background: #F0A202; } </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var mapCenter = [${initialMapLocation.coords.latitude}, ${initialMapLocation.coords.longitude}];
          var map = L.map('map', {
            zoomControl: false,
            rotate: true,
            touchRotate: true,
            touchGestures: true,
            rotateControl: false,
            bearing: 0
          }).setView([${initialMapLocation.coords.latitude}, ${initialMapLocation.coords.longitude}], 15);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
          
          var userIcon = L.divIcon({
            html: '<div class="user-marker-wrap"><div class="user-location-card"><div class="user-location-title">Current location (You)</div><div class="user-location-subtitle">Current location</div></div><div class="user-pulse-ring"></div><div class="user-marker"><div id="user-nav-compass" style="transform: rotate(0deg); transition: transform 0.2s ease-out; display: flex; align-items: center; justify-content: center;"><svg viewBox="0 0 24 24" width="22" height="22" fill="white"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg></div></div></div>',
            className: '',
            iconSize: [240, 135],
            iconAnchor: [120, 91]
          });
          
          var userMarker = L.marker([${initialMapLocation.coords.latitude}, ${initialMapLocation.coords.longitude}], {icon: userIcon}).addTo(map);
          var hasCenteredOnLiveLocation = false;
          
          window.updateUserLocation = function(lat, lng, heading) {
            mapCenter = [lat, lng];
            userMarker.setLatLng(mapCenter);
            if (!hasCenteredOnLiveLocation) {
              map.setView(mapCenter, Math.max(map.getZoom(), 15), { animate: false });
              hasCenteredOnLiveLocation = true;
            }
            var compass = document.getElementById('user-nav-compass');
            if (compass) {
              compass.style.transform = 'rotate(0deg)';
            }
          };
          
          function updateLocationCardVisibility() {
            var card = document.querySelector('.user-location-card');
            if (card) card.classList.toggle('visible', map.getZoom() >= 17);
          }
          updateLocationCardVisibility();
          map.on('zoomend', updateLocationCardVisibility);

          var mechanicLayer = L.layerGroup().addTo(map);
          window.updateMechanics = function(mechanics) {
            mechanicLayer.clearLayers();
            mechanics.forEach(function(mech) {
            if (mech.latitude && mech.longitude) {
              var markerHtml = mech.avatarUrl
                ? '<div class="mechanic-marker"><img src="' + mech.avatarUrl + '" onerror="this.parentElement.innerHTML=\\'<span class=&quot;mechanic-fallback&quot;></span>\\'"></div>'
                : '<div class="mechanic-marker"><span class="mechanic-fallback"></span></div>';
              var mechIcon = L.divIcon({ html: markerHtml, className: '', iconSize: [42, 42], iconAnchor: [21, 21] });
              var marker = L.marker([mech.latitude, mech.longitude], {icon: mechIcon}).addTo(mechanicLayer);
              marker.on('click', function(event) {
                L.DomEvent.stop(event);
                map.setView([mech.latitude, mech.longitude], Math.max(map.getZoom(), 17), { animate: true, duration: 0.45 });
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MECHANIC_SELECTED', mechanic: mech }));
              });
            }
            });
          };
          window.updateMechanics([]);
          map.on('click', function(event) {
            var target = event.originalEvent && event.originalEvent.target;
            if (target && target.closest && target.closest('.mechanic-marker')) return;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_TAPPED' }));
          });
        </script>
      </body>
    </html>
  `, [colors.bg, initialMapLocation, isDarkMode]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <MapWebView
        ref={mapRef}
        source={{ html: mapHtml }}
        style={styles.map}
        scrollEnabled={false}
        onLoad={() => {
          const locationScript = location
            ? `if (window.updateUserLocation) { window.updateUserLocation(${location.coords.latitude}, ${location.coords.longitude}, ${heading}); }`
            : "";
          mapRef.current?.injectJavaScript(
            `${locationScript}; if (window.updateMechanics) { window.updateMechanics(${JSON.stringify(liveMechanics)}); } true;`,
          );
        }}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === "MECHANIC_SELECTED") {
              setSelectedMechanic(data.mechanic);
              setDisplayedMechanic(data.mechanic);
              setShowServices(false);
            }
            if (data.type === "MAP_TAPPED") {
              setSelectedMechanic(null);
              setShowServices(false);
            }
          } catch {}
        }}
      />

      <MotoristHomeHeader title="Home" floating />
      <Modal
        visible={emergencyChecklistVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setEmergencyChecklistVisible(false)}
      >
        <EmergencyChecklistScreen
          embedded
          initialLocation={{
            lat: (location ?? webLocation).coords.latitude,
            lng: (location ?? webLocation).coords.longitude,
          }}
          initialVehicle={primaryVehicle}
          onClose={() => setEmergencyChecklistVisible(false)}
        />
      </Modal>
      <TouchableOpacity
        onPress={() => setNearbyMechanicsVisible(true)}
        style={[
          styles.nearbyMechanicsSummary,
          { top: Platform.OS === "ios" ? 106 : 92 },
        ]}
        accessibilityLabel="Show mechanics near you"
      >
        <View
          style={[styles.nearbyMechanicsPill, { backgroundColor: colors.card }]}
        >
          <Ionicons name="people-outline" size={18} color="#0037B0" />
          <Text style={[styles.nearbyMechanicsCount, { color: colors.text }]}>
            Mechanics Near You
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#536078" />
        </View>
      </TouchableOpacity>
      {activeRequest &&
      ["accepted", "in_transit", "arrived", "in_progress"].includes(
        String(activeRequest.status).toLowerCase(),
      ) ? (
        <TouchableOpacity
          style={styles.ongoingOrderTopNotice}
          onPress={() => router.push("/motorist-activity")}
          accessibilityLabel="Open ongoing booking"
        >
          <Text style={styles.ongoingOrderTitle}>
            You have an ongoing order
          </Text>
        </TouchableOpacity>
      ) : null}
      <View style={[styles.mapControlStack, { top: 190 }]}>
        <TouchableOpacity
          style={styles.mapControlButton}
          onPress={() => void handleRecenterLocation()}
          accessibilityLabel="Recenter map"
          hitSlop={8}
        >
          <Image source={recenterIcon} style={styles.mapControlImage} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.mapControlButton}
          onPress={handleMapOrientation}
          accessibilityLabel="Orient map"
          hitSlop={8}
        >
          <Image source={mapOrientationIcon} style={styles.mapControlImage} />
        </TouchableOpacity>
      </View>

      {!activeRequestLoading && !displayedMechanic && !selectedMechanic ? (
        <View style={[styles.overlay, styles.sosOnlyOverlay]}>
          <TouchableOpacity
            style={[styles.sosButton, hasOngoingOrder && styles.sosButtonDisabled]}
            onPress={handleEmergencySOS}
            accessibilityState={{ disabled: hasOngoingOrder }}
            hitSlop={12}
          >
            <View style={styles.sosContent}>
              <Image source={motoristCallIcon} style={styles.sosImage} />
              <Text style={styles.sosText}>Emergency SOS</Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : null}

      {isWaitingForMechanic ? (
        <Animated.View
          pointerEvents="auto"
          style={[
            styles.waitingRequestCard,
            { backgroundColor: colors.card, borderColor: colors.border },
            {
              opacity: 1,
              transform: [
                {
                  translateY: bookingTransition.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -18],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.dispatchHeader}>
            <View style={styles.dispatchClock}>
              <Image
                source={clockIcon}
                resizeMode="contain"
                style={styles.dispatchClockImage}
              />
            </View>
            <View style={styles.dispatchCopy}>
              <Text style={styles.dispatchEyebrow}>
                {isEmergencyRequest ? "EMERGENCY SOS DISPATCHED" : "DISPATCH REQUESTING"}
              </Text>
              <Text style={[styles.dispatchTitle, { color: colors.text }]}>
                {isEmergencyRequest
                  ? "Waiting for a mechanic to accept..."
                  : "Waiting for the mechanic to accept..."}
              </Text>
              <Text
                style={[styles.dispatchSubtitle, { color: colors.textMuted }]}
              >
                {isEmergencyRequest
                  ? "Your request is visible to nearby mechanics"
                  : "Mechanic typically responds\nwithin the day"}
              </Text>
            </View>
          </View>
          <View style={styles.dispatchProgressTrack}>
            <Animated.View
              style={[
                styles.dispatchProgressLine,
                {
                  width: Math.max(70, screenWidth * 0.28),
                  transform: [
                    {
                      translateX: waitingLineAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [
                          -Math.max(70, screenWidth * 0.28),
                          screenWidth * 0.66,
                        ],
                      }),
                    },
                  ],
                },
              ]}
            />
          </View>
          <TouchableOpacity
            style={styles.waitingCancelButton}
            onPress={() => setCancelModalVisible(true)}
            accessibilityLabel="Cancel booking while waiting for mechanic"
          >
            <Ionicons name="close-circle-outline" size={18} color="#C44A00" />
            <Text style={styles.waitingCancelButtonText}>Cancel Booking</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      <Modal
        visible={nearbyMechanicsVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setNearbyMechanicsVisible(false)}
      >
        <Pressable
          style={styles.nearbyMechanicsModalOverlay}
          onPress={() => setNearbyMechanicsVisible(false)}
        >
          <View
            style={[
              styles.nearbyMechanicsSheet,
              { backgroundColor: colors.card },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.nearbyMechanicsSheetHeader}>
              <View>
                <Text
                  style={[
                    styles.nearbyMechanicsSheetTitle,
                    { color: colors.text },
                  ]}
                >
                  Mechanics Near You
                </Text>
                <Text
                  style={[
                    styles.nearbyMechanicsSheetSubtitle,
                    { color: bookingSosColors.muted },
                  ]}
                >
                  {liveMechanics.length} mechanic
                  {liveMechanics.length === 1 ? "" : "s"} within your radius
                </Text>
              </View>
              <TouchableOpacity
                style={styles.nearbyMechanicsClose}
                onPress={() => setNearbyMechanicsVisible(false)}
                accessibilityLabel="Close nearby mechanics"
              >
                <Ionicons name="close" size={20} color="#536078" />
              </TouchableOpacity>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.nearbyMechanicsList}
            >
              {liveMechanics.length ? (
                liveMechanics.map((mechanic) => (
                  <TouchableOpacity
                    key={mechanic.id}
                    style={styles.nearbyMechanicItem}
                    onPress={() => {
                      setNearbyMechanicsVisible(false);
                      setSelectedMechanic(mechanic);
                      setDisplayedMechanic(mechanic);
                    }}
                  >
                    {mechanic.avatarUrl ? (
                      <Image
                        source={{ uri: mechanic.avatarUrl }}
                        style={styles.nearbyMechanicAvatar}
                      />
                    ) : (
                      <View style={styles.nearbyMechanicAvatarFallback}>
                        <Ionicons name="person" size={24} color="#FFFFFF" />
                      </View>
                    )}
                    <View style={styles.nearbyMechanicCopy}>
                      <Text
                        style={[
                          styles.nearbyMechanicName,
                          { color: colors.text },
                        ]}
                        numberOfLines={1}
                      >
                        {mechanic.name}
                      </Text>
                      <View style={styles.nearbyMechanicMeta}>
                        <View
                          style={[
                            styles.nearbyMechanicsDot,
                            {
                              backgroundColor: mechanic.isOnline
                                ? "#27AE60"
                                : "#98A2B3",
                            },
                          ]}
                        />
                        <Text
                          style={[
                            styles.nearbyMechanicMetaText,
                            { color: colors.textMuted },
                          ]}
                        >
                          {mechanic.isOnline ? "Online" : "Offline"} · ★{" "}
                          {mechanic.rating.toFixed(1)} · {mechanic.distance}
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color="#536078"
                    />
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.nearbyMechanicsEmpty}>
                  <Ionicons
                    name="people-outline"
                    size={40}
                    color={colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.nearbyMechanicsEmptyText,
                      { color: colors.textMuted },
                    ]}
                  >
                    No mechanics found within your radius.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {displayedMechanic && !isWaitingForMechanic ? (
        <View
          style={[
            styles.overlay,
            { backgroundColor: colors.card },
            !activeRequest &&
              !displayedMechanic &&
              !selectedMechanic &&
              styles.sosOnlyOverlay,
            displayedMechanic && styles.mechanicOverlay,
            isAcceptedBooking && styles.acceptedOverlay,
          ]}
        >
          {false ? (
            isAcceptedBooking ? (
              <Animated.View
                {...acceptedBookingPanResponder.panHandlers}
                style={[
                  styles.acceptedBookingCard,
                  !acceptedBookingExpanded &&
                    styles.acceptedBookingCardMinimized,
                  { backgroundColor: colors.card },
                  {
                    opacity: bookingTransition,
                    transform: [
                      {
                        translateY: bookingTransition.interpolate({
                          inputRange: [0, 1],
                          outputRange: [18, 0],
                        }),
                      },
                    ],
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
                  accessibilityLabel={
                    acceptedBookingExpanded
                      ? "Collapse booking details"
                      : "Expand booking details"
                  }
                >
                  <View style={styles.acceptedBookingHandle} />
                </TouchableOpacity>
                <View
                  style={[
                    styles.acceptedBookingBanner,
                    !acceptedBookingExpanded &&
                      styles.acceptedBookingBannerMinimized,
                  ]}
                >
                  <Image source={bikeIcon} style={styles.acceptedBookingIcon} />
                  <Text style={styles.acceptedBookingBannerText}>
                    {activeRequest.status === "arrived"
                      ? "MECHANIC HAS ARRIVED"
                      : activeRequest.status === "in_progress"
                        ? "SERVICE IN PROGRESS"
                        : "ON THE WAY TO CUSTOMER"}
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
                      transform: [
                        {
                          translateY: acceptedBookingAnimation.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-12, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.acceptedSectionTitle,
                      { color: colors.text },
                    ]}
                  >
                    Vehicle Details
                  </Text>
                  <View style={styles.acceptedDetailRow}>
                    <Image
                      source={bikeIcon}
                      style={styles.acceptedDetailIcon}
                    />
                    <Text
                      style={[
                        styles.acceptedDetailText,
                        { color: colors.text },
                      ]}
                    >
                      {activeRequest.vehicle_type || "Motorcycle"}{" "}
                      <Text style={styles.acceptedDetailStrong}>
                        | Plate: {activeRequest.plate_number || "Not specified"}
                      </Text>
                    </Text>
                  </View>
                  <Text
                    style={[styles.acceptedIssueText, { color: colors.text }]}
                  >
                    <Text style={styles.acceptedDetailStrong}>Issue:</Text>{" "}
                    {activeRequest.vehicle_issue ||
                      activeRequest.service_name ||
                      "Roadside assistance"}
                  </Text>

                  <Text
                    style={[
                      styles.acceptedSectionTitle,
                      { color: colors.text },
                    ]}
                  >
                    Mechanic Information
                  </Text>
                  <Text
                    style={[styles.acceptedInfoText, { color: colors.text }]}
                  >
                    <Text style={styles.acceptedDetailStrong}>Mechanic:</Text>{" "}
                    {activeRequest.mechanic?.name || "Mechanic"}{" "}
                    <Text style={styles.acceptedDetailStrong}>
                      ({Number(activeRequest.mechanic?.rating || 5).toFixed(1)}
                      ★)
                    </Text>
                  </Text>
                  <Text
                    style={[styles.acceptedInfoText, { color: colors.text }]}
                  >
                    <Text style={styles.acceptedDetailStrong}>Phone:</Text>{" "}
                    {activeRequest.mechanic?.mobileNumber || "Not available"}
                  </Text>
                </Animated.View>

                <TouchableOpacity
                  style={[
                    styles.cancelBookingButton,
                    !acceptedBookingExpanded &&
                      styles.cancelBookingButtonMinimized,
                  ]}
                  onPress={() => setCancelModalVisible(true)}
                  accessibilityLabel="Cancel booking"
                >
                  <Ionicons name="close" size={24} color="#FFFFFF" />
                  <Text style={styles.cancelBookingButtonText}>
                    Cancel Booking
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            ) : (
              <View
                style={[
                  styles.trackingCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={styles.trackingHeader}>
                  <Text style={[styles.trackingName, { color: colors.text }]}>
                    {activeRequest.mechanic?.name || "Loading mechanic name..."}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.trackingCallButton,
                      { backgroundColor: colors.primary },
                    ]}
                    onPress={() =>
                      void callMechanic(
                        activeRequest.mechanic?.mobileNumber || null,
                      )
                    }
                    accessibilityLabel="Call mechanic"
                  >
                    <Ionicons name="call-outline" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
                <View
                  style={[
                    styles.trackingStatusCard,
                    {
                      backgroundColor: bookingSosColors.card,
                      borderColor: bookingSosColors.border,
                    },
                  ]}
                >
                  {["scheduled", "pending"].includes(activeRequest.status) ? (
                    <View style={styles.statusRow}>
                      <ActivityIndicator size="small" color="#1683D8" />
                      <Text
                        style={[styles.statusText, { color: colors.primary }]}
                      >
                        {bookingStatusLabel(activeRequest.status)}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.bookingTimeline}>
                      {BOOKING_STEPS.map(([value, label], index) => {
                        const currentStep = bookingStepIndex(
                          activeRequest.status,
                        );
                        const isComplete = currentStep >= index;
                        return (
                          <View key={value} style={styles.timelineItem}>
                            <View style={styles.timelineTrack}>
                              <View
                                style={[
                                  styles.timelineDot,
                                  { backgroundColor: colors.card },
                                  isComplete && {
                                    backgroundColor: colors.primary,
                                    borderColor: colors.primary,
                                  },
                                ]}
                              >
                                {isComplete ? (
                                  <Ionicons
                                    name="checkmark"
                                    size={14}
                                    color="#FFFFFF"
                                  />
                                ) : null}
                              </View>
                              {index < BOOKING_STEPS.length - 1 ? (
                                <View
                                  style={[
                                    styles.timelineConnector,
                                    currentStep > index && {
                                      backgroundColor: colors.primary,
                                    },
                                  ]}
                                />
                              ) : null}
                            </View>
                            <Text
                              style={[
                                styles.timelineLabel,
                                {
                                  color: isComplete
                                    ? colors.primary
                                    : colors.textMuted,
                                },
                              ]}
                            >
                              {label}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.receiptButton,
                      { backgroundColor: colors.primary },
                    ]}
                    onPress={() => setBookingReceiptVisible(true)}
                  >
                    <Ionicons
                      name="receipt-outline"
                      size={20}
                      color="#FFFFFF"
                    />
                    <Text style={styles.receiptButtonText}>
                      VIEW BOOKING INFORMATION
                    </Text>
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
                  transform: [
                    {
                      translateY: mechanicPanelAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [32, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.mechanicPanelEyebrow}>
                <View style={styles.mechanicPanelEyebrowLabel}>
                  <Ionicons name="settings" size={15} color="#0037B0" />
                  <Text style={styles.mechanicPanelEyebrowText}>
                    MECHANIC PROFILE & PRICING
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.mechanicPanelClose}
                  onPress={() => setSelectedMechanic(null)}
                  accessibilityLabel="Close mechanic details"
                >
                  <Ionicons name="close" size={18} color="#536078" />
                </TouchableOpacity>
              </View>
              <View style={styles.profileHeader}>
                <TouchableOpacity
                  style={styles.mechanicIdentity}
                  onPress={() => void openMechanicProfile()}
                >
                  {displayedMechanic.avatarUrl ? (
                    <Image
                      source={{ uri: displayedMechanic.avatarUrl }}
                      style={styles.mechanicAvatar}
                    />
                  ) : (
                    <View style={styles.mechanicAvatarFallback}>
                      <Ionicons name="person" size={26} color="#FFFFFF" />
                    </View>
                  )}
                  <View style={styles.selectedInfo}>
                    <Text style={[styles.title, { color: colors.text }]}>
                      {displayedMechanic.name}
                    </Text>
                    <Text style={styles.mechanicServiceSummary}>
                      {displayedMechanic.skills || "Specialist"}
                      {displayedMechanic.experience
                        ? ` • ${displayedMechanic.experience}`
                        : ""}
                    </Text>
                    <View style={styles.statusLine}>
                      <View
                        style={[
                          styles.statusDot,
                          {
                            backgroundColor: displayedMechanic.isOnline
                              ? "#27AE60"
                              : "#98A2B3",
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.statusLabel,
                          {
                            color: displayedMechanic.isOnline
                              ? "#27AE60"
                              : colors.textMuted,
                          },
                        ]}
                      >
                        {displayedMechanic.isOnline ? "Online" : "Offline"}
                      </Text>
                      <Text style={[styles.rating, { color: colors.textMuted }]}>
                        ★ {displayedMechanic.rating.toFixed(1)}
                        {displayedMechanic.completedJobs !== undefined
                          ? ` • ${displayedMechanic.completedJobs} completed jobs`
                          : ""}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.bookmarkButton}
                  accessibilityLabel="Save mechanic"
                >
                  <Ionicons name="bookmark-outline" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={styles.mechanicStatsRow}>
                <View style={styles.mechanicStatBox}>
                  <Text style={[styles.mechanicStatLabel, { color: colors.textMuted }]}>STATUS</Text>
                  <Text style={[styles.mechanicStatValue, { color: colors.primary }]}>
                    {displayedMechanic.isOnline ? "Online" : "Offline"}
                  </Text>
                </View>
                <View style={styles.mechanicStatBox}>
                  <Text style={[styles.mechanicStatLabel, { color: colors.textMuted }]}>DISTANCE</Text>
                  <Text style={[styles.mechanicStatValue, { color: colors.primary }]}>
                    {displayedMechanic.distance}
                  </Text>
                </View>
                <View style={styles.mechanicStatBox}>
                  <Text style={[styles.mechanicStatLabel, { color: colors.textMuted }]}>EST. ARRIVAL</Text>
                  <Text style={[styles.mechanicStatValue, { color: colors.primary }]}>
                    ~{Math.max(2, Math.ceil(displayedMechanic.distanceKm * 4))}{" "}
                    mins
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.detailRow,
                  {
                    borderTopColor: colors.border,
                    borderBottomColor: colors.border,
                  },
                ]}
                onPress={() => setShowServices((visible) => !visible)}
              >
                <View style={styles.detailRowLabel}>
                  <Ionicons
                    name="pricetag-outline"
                    size={21}
                    color={bookingSosColors.primary}
                  />
                  <Text style={[styles.detailRowText, { color: colors.text }]}>
                    Offered Services & Base Prices
                  </Text>
                </View>
                {displayedMechanic.services?.[0] ? (
                  <Text style={[styles.basePrice, { color: colors.primary }]}>
                    ₱
                    {Number(
                      String(displayedMechanic.services[0].price).replace(
                        /[^\d.]/g,
                        "",
                      ) || 0,
                    ).toLocaleString()}
                  </Text>
                ) : null}
                <Ionicons
                  name={showServices ? "chevron-up" : "chevron-forward"}
                  size={21}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.requestServiceButton, { backgroundColor: colors.primary }]}
                onPress={openBooking}
              >
                <Ionicons name="location-outline" size={19} color="#FFFFFF" />
                <Text style={styles.requestServiceButtonText}>
                  Request Service
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.compareButton, { backgroundColor: colors.btnSecondary }]}
                onPress={openPriceComparison}
              >
                <Ionicons
                  name="swap-vertical-outline"
                  size={20}
                  color={colors.text}
                />
                <Text style={[styles.compareButtonText, { color: colors.text }]}>Compare Pricing</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : null}
        </View>
      ) : null}

      <Modal
        visible={showServices && !!selectedMechanic}
        animationType="slide"
        transparent
        onRequestClose={() => setShowServices(false)}
      >
        <View style={[styles.servicesModalOverlay, { backgroundColor: colors.overlay }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowServices(false)}
            accessibilityLabel="Close service offerings"
          />
          <SafeAreaView
            style={[styles.servicesSheet, { backgroundColor: colors.card }]}
            edges={[]}
          >
            <View style={[styles.servicesSheetHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity
                style={styles.servicesBackButton}
                onPress={() => setShowServices(false)}
                accessibilityLabel="Back to mechanic details"
              >
                <Ionicons name="arrow-back" size={24} color={colors.text} />
              </TouchableOpacity>
              <View style={styles.servicesSheetTitleRow}>
                <Ionicons name="settings" size={14} color={colors.primary} />
                <Text style={[styles.servicesSheetTitle, { color: colors.primary }]}>
                  OFFERED SERVICES & BASE PRICES
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.servicesCloseButton, { backgroundColor: colors.btnSecondary }]}
                onPress={() => setShowServices(false)}
                accessibilityLabel="Close service offerings"
              >
                <Ionicons name="close" size={19} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.fullServicesList}
              contentContainerStyle={styles.fullServicesContent}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {selectedMechanic?.services.length ? (
                selectedMechanic.services.map((service: any, index: number) => (
                  <View
                    key={`${service.service}-${index}`}
                    style={[
                      styles.fullServiceItem,
                      { backgroundColor: colors.softCard },
                    ]}
                  >
                    <View style={styles.fullServiceName}>
                      <View style={[styles.serviceIconBox, { backgroundColor: colors.card }]}>
                        <Ionicons
                          name="construct-outline"
                          size={19}
                          color={colors.primary}
                        />
                      </View>
                      <View style={styles.serviceCopy}>
                        <Text
                          style={[styles.serviceName, { color: colors.text }]}
                        >
                          {service.service}
                        </Text>
                        <Text style={[styles.serviceDescription, { color: colors.textMuted }]}>
                          {service.description || service.details || ""}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.servicePriceColumn}>
                      <Text
                        style={[styles.servicePrice, { color: colors.primary }]}
                      >
                        {service.price}
                      </Text>
                      <Text style={[styles.baseRateLabel, { color: colors.textMuted }]}>Base rate</Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={[styles.noServices, { color: colors.textMuted }]}>
                  No service offerings listed.
                </Text>
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal
        visible={priceComparisonVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setPriceComparisonVisible(false)}
      >
        <SafeAreaView
          style={[styles.comparisonScreen, { backgroundColor: colors.bg }]}
          edges={["top", "bottom"]}
        >
          <View
            style={[
              styles.servicesHeader,
              {
                backgroundColor: colors.card,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <TouchableOpacity
              style={styles.servicesBackButton}
              onPress={() => setPriceComparisonVisible(false)}
              accessibilityLabel="Close price comparison"
            >
              <Ionicons name="arrow-back" size={26} color="#000000" />
            </TouchableOpacity>
            <Text style={[styles.servicesTitle, { color: colors.text }]}>
              Compare prices
            </Text>
            <View style={styles.servicesHeaderSpacer} />
          </View>
          <View style={styles.comparisonContent}>
            <Text style={[styles.comparisonIntro, { color: colors.textMuted }]}>
              Search a service to compare registered mechanics by price, rating,
              and distance.
            </Text>
            <View
              style={[
                styles.comparisonSearch,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Ionicons
                name="search-outline"
                size={22}
                color={colors.textMuted}
              />
              <TextInput
                value={priceSearch}
                onChangeText={setPriceSearch}
                placeholder="e.g. Oil change"
                placeholderTextColor={colors.textMuted}
                style={[styles.comparisonInput, { color: colors.text }]}
                autoCapitalize="none"
              />
              {priceSearch ? (
                <TouchableOpacity
                  onPress={() => setPriceSearch("")}
                  accessibilityLabel="Clear service search"
                >
                  <Ionicons
                    name="close-circle"
                    size={22}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
              ) : null}
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.comparisonList}
            >
              {comparisonResults.length ? (
                comparisonResults.map((result: any, index: number) => (
                  <TouchableOpacity
                    key={`${result.mechanic.id}-${result.service.service}-${index}`}
                    style={[
                      styles.comparisonCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() => {
                      setSelectedMechanic(result.mechanic);
                      setDisplayedMechanic(result.mechanic);
                      setPriceComparisonVisible(false);
                    }}
                  >
                    <View style={styles.comparisonCardTop}>
                      <View style={styles.comparisonMechanicInfo}>
                        <Text
                          style={[
                            styles.comparisonMechanicName,
                            { color: colors.text },
                          ]}
                          numberOfLines={1}
                        >
                          {result.mechanic.name}
                        </Text>
                        <Text
                          style={[
                            styles.comparisonServiceName,
                            { color: colors.textMuted },
                          ]}
                          numberOfLines={1}
                        >
                          {result.service.service}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.comparisonPrice,
                          { color: colors.primary },
                        ]}
                      >
                        {result.service.price}
                      </Text>
                    </View>
                    <View style={styles.comparisonMeta}>
                      <Text
                        style={[
                          styles.comparisonMetaText,
                          { color: colors.textMuted },
                        ]}
                      >
                        ★ {result.mechanic.rating.toFixed(1)}
                      </Text>
                      <Text
                        style={[
                          styles.comparisonMetaText,
                          { color: colors.textMuted },
                        ]}
                      >
                        {result.mechanic.distance}
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={colors.textMuted}
                      />
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.comparisonEmpty}>
                  <Ionicons
                    name="search-outline"
                    size={36}
                    color={colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.comparisonEmptyTitle,
                      { color: colors.text },
                    ]}
                  >
                    No matching service prices
                  </Text>
                  <Text
                    style={[
                      styles.comparisonEmptyText,
                      { color: colors.textMuted },
                    ]}
                  >
                    Try another service name or check again when mechanics add
                    their rates.
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
        <SafeAreaView
          style={[styles.mechanicProfileScreen, { backgroundColor: colors.bg }]}
          edges={["top", "bottom"]}
        >
          <View
            style={[
              styles.mechanicProfileHeader,
              {
                backgroundColor: colors.card,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <TouchableOpacity
              onPress={() => setMechanicProfileVisible(false)}
              style={styles.servicesBackButton}
              accessibilityLabel="Close mechanic profile"
            >
              <Ionicons name="arrow-back" size={26} color="#000000" />
            </TouchableOpacity>
            <Text style={[styles.servicesTitle, { color: colors.text }]}>
              Mechanic Profile
            </Text>
            <View style={styles.servicesHeaderSpacer} />
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.mechanicProfileContent}
          >
            {displayedMechanic?.avatarUrl ? (
              <Image
                source={{ uri: displayedMechanic.avatarUrl }}
                style={styles.mechanicProfileAvatar}
              />
            ) : (
              <View
                style={[
                  styles.mechanicProfileAvatar,
                  styles.mechanicProfileAvatarFallback,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Text style={styles.mechanicProfileInitials}>
                  {String(displayedMechanic?.name || "M")
                    .split(" ")
                    .map((part: string) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={[styles.mechanicProfileName, { color: colors.text }]}>
              {displayedMechanic?.name}
            </Text>
            <Text
              style={[
                styles.mechanicProfileService,
                { color: colors.textMuted },
              ]}
            >
              Motorcycle mechanic
            </Text>
            <View
              style={[
                styles.mechanicProfileStats,
                { borderColor: colors.border, backgroundColor: colors.card },
              ]}
            >
              <View style={styles.mechanicProfileStat}>
                <Text
                  style={[
                    styles.mechanicProfileStatValue,
                    { color: colors.primary },
                  ]}
                >
                  ★ {Number(displayedMechanic?.rating || 0).toFixed(1)}
                </Text>
                <Text
                  style={[
                    styles.mechanicProfileStatLabel,
                    { color: colors.textMuted },
                  ]}
                >
                  Rating
                </Text>
              </View>
              <View
                style={[
                  styles.mechanicProfileStatDivider,
                  { backgroundColor: colors.border },
                ]}
              />
              <View style={styles.mechanicProfileStat}>
                <Text
                  style={[
                    styles.mechanicProfileStatValue,
                    { color: colors.text },
                  ]}
                >
                  {mechanicReviews.length}
                </Text>
                <Text
                  style={[
                    styles.mechanicProfileStatLabel,
                    { color: colors.textMuted },
                  ]}
                >
                  Reviews
                </Text>
              </View>
            </View>
            <Text style={[styles.mechanicReviewsTitle, { color: colors.text }]}>
              Reviews
            </Text>
            {loadingMechanicReviews ? (
              <ActivityIndicator
                color={colors.primary}
                style={styles.mechanicReviewsLoader}
              />
            ) : mechanicReviews.length ? (
              mechanicReviews.map((item, index) => (
                <View
                  key={`${item.created_at}-${index}`}
                  style={[
                    styles.mechanicReviewRow,
                    { borderBottomColor: colors.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.mechanicReviewStars,
                      { color: colors.primary },
                    ]}
                  >
                    {"★".repeat(Number(item.rating) || 0)}
                  </Text>
                  <Text
                    style={[styles.mechanicReviewText, { color: colors.text }]}
                  >
                    {item.review}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[styles.noServices, { color: colors.textMuted }]}>
                No reviews yet.
              </Text>
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
        <SafeAreaView
          style={[styles.bookingScreen, { backgroundColor: bookingSosColors.background }]
          }
          edges={["top", "bottom"]}
        >
          <View style={styles.bookingTitleRow}>
            <TouchableOpacity
              onPress={() => setBookingModalVisible(false)}
              style={styles.bookingBackButton}
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={24} color={bookingSosColors.text} />
            </TouchableOpacity>
            <View style={styles.bookingTitleCopy}>
              <Text style={[styles.bookingTitle, { color: bookingSosColors.text }]}>
                BOOKING FORM
              </Text>
            </View>
          </View>
          <ScrollView
            style={styles.bookingContent}
            contentContainerStyle={styles.bookingContentContainer}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.bookingSectionTitle, { color: bookingSosColors.text }]}>
              YOUR VEHICLE
            </Text>
            <TouchableOpacity
              style={[
                styles.bookingVehicleCard,
                { backgroundColor: bookingSosColors.card, borderColor: bookingSosColors.border },
              ]}
              onPress={chooseBookingVehicle}
              activeOpacity={0.8}
            >
              <View style={styles.bookingVehicleIcon}>
                <Ionicons name="car" size={23} color={bookingSosColors.primary} />
              </View>
              <View style={styles.bookingVehicleCopy}>
                <Text style={[styles.bookingVehicleLabel, { color: bookingSosColors.muted }]}>
                  PRIMARY VEHICLE
                </Text>
                <Text style={[styles.bookingVehicleName, { color: bookingSosColors.text }]}>
                  {vehicleType || "Primary vehicle not set"}
                </Text>
                <Text style={[styles.bookingVehiclePlate, { color: bookingSosColors.muted }]}>
                  PLATE: {plateNumber || "NOT SET"}
                </Text>
              </View>
              <Ionicons name="checkmark-circle" size={22} color={bookingSosColors.primary} />
            </TouchableOpacity>

            <View style={styles.bookingSectionHeading}>
              <Text style={[styles.bookingSectionTitle, { color: bookingSosColors.text }]}>
                CHOOSE A SERVICE
              </Text>
              <Text style={[styles.bookingSelectionHint, { color: bookingSosColors.muted }]}>
                Select one or more services
              </Text>
            </View>
            <View style={styles.bookingServicesGrid}>
              {selectedMechanic?.services.map(
                  (service: any, index: number) => {
                    const selected = selectedServices.some(
                      (item) =>
                        item.service === service.service &&
                        item.price === service.price,
                    );
                    return (
                      <TouchableOpacity
                        key={`${service.service}-${index}`}
                        style={[
                          styles.bookingServiceCard,
                          { backgroundColor: bookingSosColors.card, borderColor: bookingSosColors.border },
                          selected && {
                            backgroundColor: bookingSosColors.background,
                            borderLeftColor: bookingSosColors.primary,
                            borderLeftWidth: 3,
                          },
                        ]}
                        onPress={() =>
                          setSelectedServices((current) =>
                            selected
                              ? current.filter(
                                  (item) =>
                                    item.service !== service.service ||
                                    item.price !== service.price,
                                )
                              : [...current, service],
                          )
                        }
                      >
                        <View style={styles.bookingServiceCardTop}>
                          <View style={[styles.bookingServiceIcon, { backgroundColor: selected ? bookingSosColors.primary : bookingSosColors.background }]}>
                            <Ionicons name="construct-outline" size={19} color={selected ? "#FFFFFF" : bookingSosColors.primary} />
                          </View>
                          <Ionicons
                            name={selected ? "checkmark-circle" : "ellipse-outline"}
                            size={22}
                            color={selected ? bookingSosColors.primary : bookingSosColors.muted}
                          />
                        </View>
                        <Text style={[styles.bookingServiceName, { color: selected ? bookingSosColors.primary : bookingSosColors.text }]}>
                          {service.service}
                        </Text>
                        <View style={styles.bookingServiceBottom}>
                          <Text style={[styles.bookingServiceCaption, { color: bookingSosColors.muted }]}>
                            {selected ? "Added to booking" : "Tap to select"}
                          </Text>
                          <Text style={[styles.bookingServicePrice, { color: bookingSosColors.primary }]}>
                            {service.price}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  },
                )}
            </View>

            <Text style={[styles.bookingSectionTitle, styles.bookingScheduleHeading, { color: colors.text }]}>
              SCHEDULE YOUR VISIT
            </Text>
            <View style={styles.bookingScheduleRow}>
              <View style={styles.bookingScheduleField}>
                <Text
                  style={[
                    styles.bookingScheduleLabel,
                    { color: colors.textMuted },
                  ]}
                >
                  Date
                </Text>
                <TouchableOpacity
                  style={[
                    styles.bookingDateButton,
                    {
                      backgroundColor: bookingSosColors.card,
                      borderColor: bookingSosColors.border,
                    },
                  ]}
                  onPress={() => setShowBookingDatePicker(true)}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={20}
                    color={bookingSosColors.primary}
                  />
                  <Text
                    numberOfLines={1}
                    style={[styles.bookingDateText, { color: bookingSosColors.text }]}
                  >
                    {bookingDate.toLocaleDateString([], {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </Text>
                </TouchableOpacity>
              </View>
              {showBookingDatePicker ? (
                <DateTimePicker
                  value={bookingDate}
                  mode="date"
                  display="default"
                  minimumDate={new Date()}
                  onValueChange={(_, selectedDate) => {
                    if (!selectedDate) return;
                    const nextDate = new Date(bookingDate);
                    nextDate.setFullYear(
                      selectedDate.getFullYear(),
                      selectedDate.getMonth(),
                      selectedDate.getDate(),
                    );
                    setBookingDate(nextDate);
                  }}
                  onDismiss={() => {
                    setShowBookingDatePicker(false);
                  }}
                />
              ) : null}
              <View style={styles.bookingScheduleField}>
                <Text
                  style={[
                    styles.bookingScheduleLabel,
                    { color: bookingSosColors.muted },
                  ]}
                >
                  Time
                </Text>
                <TouchableOpacity
                  style={[
                    styles.bookingDateButton,
                    {
                      backgroundColor: bookingSosColors.card,
                      borderColor: bookingSosColors.border,
                    },
                  ]}
                  onPress={() => setShowBookingTimePicker(true)}
                >
                  <Ionicons
                    name="time-outline"
                    size={20}
                    color={bookingSosColors.primary}
                  />
                  <Text
                    numberOfLines={1}
                    style={[styles.bookingDateText, { color: bookingSosColors.text }]}
                  >
                    {bookingDate.toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </Text>
                </TouchableOpacity>
              </View>
              {showBookingTimePicker ? (
                <DateTimePicker
                  value={bookingDate}
                  mode="time"
                  display="default"
                  onValueChange={(_, selectedTime) => {
                    if (!selectedTime) return;
                    const nextDate = new Date(bookingDate);
                    nextDate.setHours(
                      selectedTime.getHours(),
                      selectedTime.getMinutes(),
                      0,
                      0,
                    );
                    setBookingDate(nextDate);
                  }}
                  onDismiss={() => {
                    setShowBookingTimePicker(false);
                  }}
                />
              ) : null}
            </View>

            <Text style={[styles.bookingSectionTitle, styles.bookingNotesHeading, { color: bookingSosColors.text }]}>
              ADDITIONAL NOTES
            </Text>
            <Text style={[styles.bookingNotesHint, { color: bookingSosColors.muted }]}>
              Share anything the mechanic should know before the visit.
            </Text>
            <View style={[styles.bookingNotesCard, { backgroundColor: bookingSosColors.card, borderColor: bookingSosColors.border }]}>
              <Ionicons name="create-outline" size={20} color={bookingSosColors.primary} style={styles.bookingNotesIcon} />
              <TextInput
                style={[styles.bookingNotesInput, { color: bookingSosColors.text }]}
                placeholder="e.g., Please bring a replacement battery..."
                placeholderTextColor={bookingSosColors.muted}
                multiline
                textAlignVertical="top"
                maxLength={500}
                value={bookingNotes}
                onChangeText={setBookingNotes}
              />
            </View>
            <Text style={[styles.bookingNotesCount, { color: bookingSosColors.muted }]}>{bookingNotes.length}/500</Text>

            <View
              style={[
                styles.priceSummary,
                { backgroundColor: bookingSosColors.card, borderColor: bookingSosColors.border },
              ]}
            >
              <View style={styles.priceSummaryHeader}>
                <Text style={[styles.priceSummaryTitle, { color: bookingSosColors.text }]}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={bookingSosColors.primary} /> Service estimate
                </Text>
                <Text style={[styles.priceSummaryBadge, { color: bookingSosColors.primary }]}>
                  ESTIMATED
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text
                  style={[styles.summaryLabel, { color: bookingSosColors.muted }]}
                >
                  Services
                </Text>
                <Text style={[styles.summaryValue, { color: bookingSosColors.text }]}>
                  {selectedServices.length
                    ? `₱${selectedServices.reduce(
                        (total, service) =>
                          total +
                          (Number(
                            String(service.price).replace(/[^\d.]/g, ""),
                          ) || 0),
                        0,
                      )}`
                    : "Select services"}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text
                  style={[styles.summaryLabel, { color: bookingSosColors.muted }]}
                >
                  Delivery fee ({selectedMechanic?.distance})
                </Text>
                <Text style={[styles.summaryValue, { color: bookingSosColors.text }]}>
                  ₱
                  {selectedMechanic
                    ? deliveryFeeFor(selectedMechanic.distanceKm)
                    : 100}
                </Text>
              </View>
              <View
                style={[styles.totalRow, { borderTopColor: bookingSosColors.border }]}
              >
                <Text style={[styles.totalLabel, { color: bookingSosColors.text }]}>
                  Estimated total
                </Text>
                <Text style={[styles.totalValue, { color: bookingSosColors.primary }]}>
                  ₱
                  {selectedServices.length && selectedMechanic
                    ? selectedServices.reduce(
                        (total, service) =>
                          total +
                          (Number(
                            String(service.price).replace(/[^\d.]/g, ""),
                          ) || 0),
                        0,
                      ) + deliveryFeeFor(selectedMechanic.distanceKm)
                    : 0}
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.fareNotice,
                {
                  backgroundColor: "rgba(240, 162, 2, 0.12)",
                  borderColor: "rgba(240, 162, 2, 0.35)",
                },
              ]}
            >
              <Ionicons
                name="information-circle-outline"
                size={22}
                color={bookingSosColors.primary}
              />
              <Text
                style={[styles.fareNoticeText, { color: bookingSosColors.muted }]}
              >
                This is an estimated fare. The price may increase if the
                mechanic finds additional motorcycle issues that require extra
                repairs or parts.
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.confirmBookingButton,
                { backgroundColor: bookingSosColors.primary },
                (!selectedServices.length || submittingBooking) &&
                  styles.disabledButton,
              ]}
              onPress={() => void handleBookNow()}
              disabled={!selectedServices.length || submittingBooking}
            >
              <Text style={styles.confirmBookingText}>
                {submittingBooking ? "Booking..." : "Confirm booking"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={vehiclePickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setVehiclePickerVisible(false)}
      >
        <View style={styles.vehiclePickerOverlay}>
          <View style={[styles.vehiclePickerCard, { backgroundColor: bookingSosColors.card }]}>
            <View style={styles.vehiclePickerHeader}>
              <View style={styles.vehiclePickerTitleCopy}>
                <Text style={[styles.vehiclePickerTitle, { color: bookingSosColors.text }]}>
                  Choose a vehicle
                </Text>
                <Text style={[styles.vehiclePickerSubtitle, { color: bookingSosColors.muted }]}>
                  Select the vehicle for this booking
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setVehiclePickerVisible(false)}
                style={styles.vehiclePickerClose}
                accessibilityLabel="Close vehicle picker"
              >
                <Ionicons name="close" size={22} color={bookingSosColors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {availableVehicles.map((vehicle) => {
                const isSelected =
                  vehicleType === `${vehicle.make} ${vehicle.model}`.trim() &&
                  plateNumber === vehicle.plate_number;
                return (
                  <TouchableOpacity
                    key={vehicle.id}
                    style={[
                      styles.vehiclePickerOption,
                      {
                        backgroundColor: isSelected
                          ? "#F0F3FF"
                          : bookingSosColors.card,
                        borderColor: isSelected
                          ? bookingSosColors.primary
                          : bookingSosColors.border,
                      },
                    ]}
                    onPress={() => selectBookingVehicle(vehicle)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.vehiclePickerIcon}>
                      <Ionicons name="car" size={22} color={bookingSosColors.primary} />
                    </View>
                    <View style={styles.vehiclePickerOptionCopy}>
                      <View style={styles.vehiclePickerMeta}>
                        <Text style={[styles.vehiclePickerBadge, { color: bookingSosColors.primary }]}>
                          {vehicle.is_primary ? "PRIMARY" : "GARAGE"}
                        </Text>
                        {vehicle.is_primary ? (
                          <Text style={[styles.vehiclePickerDefault, { color: bookingSosColors.muted }]}>
                            Garage default
                          </Text>
                        ) : null}
                      </View>
                      <Text style={[styles.vehiclePickerName, { color: bookingSosColors.text }]}>
                        {vehicle.make} {vehicle.model}
                      </Text>
                      <Text style={[styles.vehiclePickerPlate, { color: bookingSosColors.muted }]}>
                        PLATE: {vehicle.plate_number}
                      </Text>
                    </View>
                    <Ionicons
                      name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                      size={23}
                      color={isSelected ? bookingSosColors.primary : bookingSosColors.muted}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={bookingReceiptVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBookingReceiptVisible(false)}
      >
        <View style={styles.receiptOverlay}>
          <View
            style={[
              styles.receiptCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.receiptHeader}>
              <View>
                <Text style={[styles.receiptTitle, { color: colors.text }]}>
                  Booking information
                </Text>
                <Text
                  style={[styles.receiptSubtitle, { color: colors.textMuted }]}
                >
                  {activeRequest?.mechanic?.name || "Mechanic"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setBookingReceiptVisible(false)}
                accessibilityLabel="Close receipt"
              >
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View
              style={[
                styles.receiptDivider,
                { borderBottomColor: colors.border },
              ]}
            />
            <View style={styles.receiptRow}>
              <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>
                Vehicle
              </Text>
              <Text style={[styles.receiptValue, { color: colors.text }]}>
                {activeRequest?.vehicle_type || "Not specified"}
              </Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>
                Plate number
              </Text>
              <Text style={[styles.receiptValue, { color: colors.text }]}>
                {activeRequest?.plate_number || "Not specified"}
              </Text>
            </View>
            <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>
              SERVICES
            </Text>
            <Text style={[styles.receiptValue, { color: colors.text }]}>
              {activeRequest?.service_name || "Selected services"}
            </Text>
            <View style={styles.receiptRow}>
              <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>
                Scheduled date
              </Text>
              <Text style={[styles.receiptValue, { color: colors.text }]}>
                {activeRequest?.scheduled_at
                  ? new Date(activeRequest.scheduled_at).toLocaleDateString(
                      [],
                      { year: "numeric", month: "long", day: "numeric" },
                    )
                  : "Not specified"}
              </Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>
                Scheduled time
              </Text>
              <Text style={[styles.receiptValue, { color: colors.text }]}>
                {activeRequest?.scheduled_at
                  ? new Date(activeRequest.scheduled_at).toLocaleTimeString(
                      [],
                      { hour: "numeric", minute: "2-digit" },
                    )
                  : "Not specified"}
              </Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>
                Services
              </Text>
              <Text style={[styles.receiptValue, { color: colors.text }]}>
                ₱{Number(activeRequest?.service_price || 0).toFixed(2)}
              </Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>
                Delivery fee
              </Text>
              <Text style={[styles.receiptValue, { color: colors.text }]}>
                ₱{Number(activeRequest?.delivery_fee || 0).toFixed(2)}
              </Text>
            </View>
            <View
              style={[
                styles.receiptTotalRow,
                { borderTopColor: colors.border },
              ]}
            >
              <Text style={[styles.receiptTotalLabel, { color: colors.text }]}>
                Estimated total
              </Text>
              <Text
                style={[styles.receiptTotalValue, { color: colors.primary }]}
              >
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
          <View
            style={[
              styles.modalContent,
              styles.ratingModalContent,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Ionicons
              name="checkmark-circle"
              size={46}
              color="#10b981"
              style={styles.ratingCompleteIcon}
            />
            <Text
              style={[
                styles.modalTitle,
                styles.ratingModalTitle,
                { color: colors.text },
              ]}
            >
              Service Completed!
            </Text>
            <Text
              style={[
                styles.modalSubtitle,
                styles.ratingModalSubtitle,
                { color: colors.textMuted },
              ]}
            >
              Rate your mechanic to complete this booking.
            </Text>
            <View
              style={[
                styles.ratingBox,
                styles.compactRatingBox,
                { backgroundColor: colors.bg, borderColor: colors.border },
              ]}
            >
              <Text
                style={[
                  styles.ratingPrompt,
                  styles.compactRatingPrompt,
                  { color: colors.text },
                ]}
              >
                Rate {completedJob?.mechanic?.name}
              </Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity key={star} onPress={() => setRating(star)}>
                    <Ionicons
                      name={star <= rating ? "star" : "star-outline"}
                      size={34}
                      color={colors.primary}
                      style={styles.compactStar}
                    />
                  </TouchableOpacity>
                ))}
              </View>
              <Text
                style={[styles.ratingScaleText, { color: colors.textMuted }]}
              >
                {rating} out of 5 stars
              </Text>
            </View>
            <TextInput
              style={[
                styles.reviewInput,
                styles.compactReviewInput,
                {
                  backgroundColor: colors.bg,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              placeholder="Comment (optional, max 40 characters)"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={40}
              value={review}
              onChangeText={(value) => setReview(value.slice(0, 40))}
            />
            <Text style={[styles.reviewCounter, { color: colors.textMuted }]}>
              {review.length}/40
            </Text>
            <TouchableOpacity
              style={[
                styles.submitReviewBtn,
                styles.compactSubmitReviewBtn,
                submittingRating && { opacity: 0.6 },
              ]}
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

      <Modal
        visible={acceptedSuccessVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setAcceptedSuccessVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              styles.acceptedSuccessCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.acceptedSuccessIcon}>
              <Ionicons name="checkmark" size={36} color="#FFFFFF" />
            </View>
            <Text style={[styles.acceptedSuccessTitle, { color: colors.text }]}>
              Booking accepted
            </Text>
            <Text
              style={[
                styles.acceptedSuccessMessage,
                { color: colors.textMuted },
              ]}
            >
              Your mechanic got the booking.
            </Text>
            <TouchableOpacity
              style={styles.acceptedSuccessButton}
              onPress={() => setAcceptedSuccessVisible(false)}
            >
              <Text style={styles.actionBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* CANCELLATION MODAL */}
      <Modal
        visible={cancelSuccessVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setCancelSuccessVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              styles.cancelSuccessCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.cancelSuccessIcon}>
              <Ionicons name="checkmark" size={32} color="#FFFFFF" />
            </View>
            <Text style={[styles.cancelSuccessTitle, { color: colors.text }]}>
              Booking Cancelled
            </Text>
            <Text
              style={[styles.cancelSuccessMessage, { color: colors.textMuted }]}
            >
              Your service request has been cancelled successfully.
            </Text>
            <TouchableOpacity
              style={styles.cancelSuccessButton}
              onPress={() => setCancelSuccessVisible(false)}
            >
              <Text style={styles.actionBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={cancelModalVisible}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Cancel Booking
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
              Please select a reason for cancelling. Frequent cancellations may
              lead to account penalties.
            </Text>

            <View style={{ width: "100%", marginBottom: 20 }}>
              {CANCELLATION_REASONS.map((reason, index) => {
                const isSelected = cancelReason === reason;
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.reasonRow,
                      {
                        backgroundColor: colors.bg,
                        borderColor: colors.border,
                      },
                      isSelected && {
                        borderColor: "#EF4444",
                        backgroundColor: "rgba(239, 68, 68, 0.05)",
                      },
                    ]}
                    onPress={() => setCancelReason(reason)}
                  >
                    <Text
                      style={[
                        styles.reasonText,
                        { color: isSelected ? "#EF4444" : colors.text },
                      ]}
                    >
                      {reason}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
              <TouchableOpacity
                style={[
                  styles.closeCancelBtn,
                  { backgroundColor: colors.btnSecondary },
                ]}
                onPress={() => setCancelModalVisible(false)}
                disabled={isCancelling}
              >
                <Text style={[styles.actionBtnText, { color: colors.text }]}>
                  Back
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmCancelBtn,
                  isCancelling && { opacity: 0.7 },
                ]}
                onPress={confirmCancel}
                disabled={isCancelling}
              >
                <Text style={styles.actionBtnText}>
                  {isCancelling ? "Processing..." : "Confirm Cancel"}
                </Text>
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
  map: { width: "100%", height: "100%" },
  fallbackContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  fallbackText: {
    fontSize: normalizeText(17),
    textAlign: "center",
    marginBottom: 24,
    lineHeight: normalizeText(24),
  },
  recenterButton: {
    position: "absolute",
    right: 16,
    bottom: 94,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 4,
    borderRadius: 29,
    backgroundColor: "#FFFFFF",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    zIndex: 8,
  },
  recenterButtonText: { color: "#1B1B1B", fontSize: normalizeText(16), fontWeight: "800" },
  recenterIcon: {
    width: 48,
    height: 48,
    marginLeft: 12,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1479E8",
    elevation: 3,
  },
  waitingRequestCard: {
    position: "absolute",
    bottom: -10,
    left: "4%",
    right: "4%",
    minHeight: 160,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    elevation: 9,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    zIndex: 7,
  },
  waitingRadar: {
    height: 190,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#EAF6FF",
  },
  waitingRadarCircle: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "rgba(22, 131, 216, 0.32)",
    borderRadius: 999,
  },
  waitingRadarCircleLarge: { width: 168, height: 168 },
  waitingRadarCircleMedium: { width: 122, height: 122 },
  waitingRadarCircleSmall: { width: 76, height: 76 },
  waitingRadarBeam: {
    position: "absolute",
    top: 1,
    left: "50%",
    marginLeft: -42,
    width: 0,
    height: 0,
    borderLeftWidth: 42,
    borderRightWidth: 42,
    borderTopWidth: 150,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "rgba(65, 164, 239, 0.32)",
  },
  waitingRadarTitle: {
    position: "absolute",
    bottom: 12,
    width: "100%",
    color: "#111111",
    fontSize: normalizeText(16),
    lineHeight: normalizeText(22),
    textAlign: "center",
  },
  waitingRadarTitleStrong: { fontWeight: "800" },
  waitingRequestDivider: { height: 1, marginVertical: 9 },
  waitingRequestMetaStrong: { fontWeight: "800" },
  waitingRequestStatus: { fontSize: normalizeText(14), lineHeight: normalizeText(20) },
  dispatchHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    height: 84,
  },
  dispatchClock: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0D7D9",
    borderWidth: 7,
    borderColor: "#E9C9CB",
    marginRight: 12,
  },
  dispatchClockImage: { width: 36, height: 36 },
  dispatchCopy: { flex: 1 },
  dispatchEyebrow: {
    color: "#AD3F08",
    fontSize: normalizeText(13),
    fontWeight: "900",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  dispatchTitle: {
    fontSize: normalizeText(17),
    lineHeight: normalizeText(20),
    fontWeight: "700",
  },
  dispatchSubtitle: {
    fontSize: normalizeText(13),
    lineHeight: normalizeText(16),
    marginTop: 4,
  },
  dispatchProgressTrack: {
    height: 12,
    borderRadius: 7,
    overflow: "hidden",
    backgroundColor: "#E7EAFE",
    marginHorizontal: 0,
    marginBottom: 0,
  },
  dispatchProgressLine: {
    height: "100%",
    borderRadius: 7,
    backgroundColor: "#FF5A1F",
  },
  waitingCancelButton: {
    height: 32,
    marginTop: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#FFF3ED",
  },
  waitingCancelButtonText: {
    color: "#C44A00",
    fontSize: normalizeText(13),
    fontWeight: "800",
  },
  acceptedOverlay: {
    bottom: -8,
    paddingTop: 0,
    paddingBottom: 5,
    backgroundColor: "transparent",
    elevation: 20,
    shadowOpacity: 0,
    zIndex: 20,
  },
  mechanicOverlay: {
    bottom: 0,
    paddingTop: 0,
    paddingBottom: 0,
    backgroundColor: "transparent",
    shadowOpacity: 0,
    elevation: 0,
    zIndex: 10,
  },
  acceptedBookingCard: {
    width: "92%",
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 12,
    borderRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.16,
    shadowRadius: 7,
  },
  acceptedBookingCardMinimized: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 12,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  acceptedBookingHandleHitArea: {
    minHeight: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0,
  },
  acceptedBookingHandle: {
    width: 54,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#D5D9DE",
  },
  acceptedBookingBanner: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#EAF2F8",
  },
  acceptedBookingBannerMinimized: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  acceptedBookingIcon: {
    width: 32,
    height: 32,
    resizeMode: "contain",
    marginRight: 10,
  },
  acceptedBookingBannerText: {
    flex: 1,
    color: "#1B1B1B",
    fontSize: normalizeText(15),
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  acceptedBookingDetails: { overflow: "hidden" },
  acceptedSectionTitle: {
    marginTop: 12,
    marginBottom: 5,
    fontSize: normalizeText(17),
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  acceptedDetailRow: { flexDirection: "row", alignItems: "center" },
  acceptedDetailIcon: {
    width: 30,
    height: 30,
    resizeMode: "contain",
    marginRight: 8,
  },
  acceptedDetailText: { flex: 1, fontSize: normalizeText(14), lineHeight: normalizeText(20) },
  acceptedDetailStrong: { fontWeight: "800" },
  acceptedIssueText: { marginLeft: 38, fontSize: normalizeText(14), lineHeight: normalizeText(20) },
  acceptedInfoText: { fontSize: normalizeText(14), lineHeight: normalizeText(21) },
  cancelBookingButton: {
    minHeight: 52,
    marginTop: 14,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F97316",
  },
  cancelBookingButtonMinimized: {
    minHeight: 52,
    marginTop: 14,
    borderRadius: 24,
  },
  cancelBookingButtonText: {
    color: "#FFFFFF",
    fontSize: normalizeText(17),
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  overlay: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    alignItems: "center",
    paddingBottom: Platform.OS === "ios" ? 52 : 44,
    paddingTop: 12,
    backgroundColor: "#FFFFFF",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.14,
    shadowRadius: 7,
  },
  sosOnlyOverlay: {
    position: "absolute",
    bottom: -25,
    left: 0,
    right: 0,
    alignItems: "center",
    backgroundColor: "transparent",
    elevation: 0,
    shadowOpacity: 0,
  },

  card: {
    width: 390,
    height: 400,
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingTop: 18,
    paddingBottom: 14,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: "hidden",
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
  },
  ongoingOrderTopNotice: {
    position: "absolute",
    top: Platform.OS === "ios" ? 124 : 110,
    left: 0,
    right: 0,
    minHeight: 52,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#B8C9F5",
    backgroundColor: "#E8EEFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 15,
  },
  ongoingOrderTitle: {
    color: "#0037B0",
    fontSize: normalizeText(16),
    fontWeight: "800",
    letterSpacing: 0.15,
    textAlign: "center",
  },
  profileHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  mechanicPanelEyebrow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  mechanicPanelEyebrowLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  mechanicPanelEyebrowText: {
    color: "#0037B0",
    fontSize: normalizeText(12),
    fontWeight: "900",
    letterSpacing: 0.25,
  },
  mechanicPanelClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9EDFA",
  },
  mechanicIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  mechanicAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 10,
    borderWidth: 2,
    borderColor: "#E5A13A",
  },
  mechanicAvatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2450D8",
  },
  mechanicServiceSummary: {
    color: "#657085",
    fontSize: normalizeText(12),
    marginTop: 2,
  },
  bookmarkButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F2F8",
    marginLeft: 8,
  },
  selectedInfo: { flex: 1 },
  callIconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  statusLine: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
    gap: 6,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { fontSize: normalizeText(13), fontWeight: "800" },
  title: { fontSize: normalizeText(20), fontWeight: "bold" },
  rating: { color: "#FF6B00", fontSize: normalizeText(15), marginTop: 4, fontWeight: "700" },
  mechanicStatsRow: {
    flexDirection: "row",
    gap: 7,
    marginTop: 10,
    marginBottom: 10,
  },
  mechanicStatBox: {
    flex: 1,
    minHeight: 50,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F2FA",
  },
  mechanicStatLabel: {
    color: "#6E778C",
    fontSize: normalizeText(9),
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  mechanicStatValue: {
    color: "#0037B0",
    fontSize: normalizeText(13),
    fontWeight: "800",
    marginTop: 3,
  },
  price: { fontSize: normalizeText(26), fontWeight: "900" },
  detailRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginTop: 8,
    marginBottom: 18,
  },
  detailRowLabel: { flexDirection: "row", alignItems: "center", gap: 10 },
  detailRowText: { fontSize: normalizeText(15), fontWeight: "800" },
  basePrice: {
    color: "#0037B0",
    fontSize: normalizeText(13),
    fontWeight: "900",
    marginLeft: "auto",
    marginRight: 8,
  },
  compareButton: {
    minHeight: 46,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
    backgroundColor: "#E8ECFF",
  },
  compareButtonText: { fontSize: normalizeText(15), fontWeight: "800" },
  requestServiceButton: {
    minHeight: 52,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 2,
    backgroundColor: "#0037B0",
  },
  requestServiceButtonText: {
    color: "#FFFFFF",
    fontSize: normalizeText(16),
    fontWeight: "800",
  },
  servicesList: { paddingHorizontal: 12, paddingVertical: 5 },
  serviceItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  serviceName: {
    flex: 1,
    fontSize: normalizeText(15),
    fontWeight: "600",
    textAlign: "left",
  },
  servicePrice: { fontSize: normalizeText(15), fontWeight: "800", marginLeft: 12 },
  noServices: { paddingVertical: 14, fontSize: normalizeText(14) },
  servicesScreen: { flex: 1 },
  servicesModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "rgba(16, 27, 52, 0.18)",
  },
  servicesSheet: {
    width: 390,
    height: "70%",
    minHeight: 320,
    maxHeight: 560,
    maxWidth: "100%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: "hidden",
    elevation: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  servicesSheetHeader: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E6EAF5",
  },
  servicesSheetTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  servicesSheetTitle: {
    color: "#0037B0",
    fontSize: normalizeText(13),
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  servicesCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9EDFA",
  },
  servicesHeader: {
    minHeight: 64,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  servicesBackButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  servicesHeaderSpacer: { width: 44 },
  servicesTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: normalizeText(19),
    fontWeight: "800",
  },
  servicesMechanic: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
  },
  servicesMechanicName: { fontSize: normalizeText(19), fontWeight: "800" },
  servicesMechanicMeta: { fontSize: normalizeText(14), marginTop: 4 },
  comparisonScreen: { flex: 1 },
  comparisonContent: { flex: 1, padding: 18 },
  comparisonIntro: { fontSize: normalizeText(14), lineHeight: normalizeText(20), marginBottom: 14 },
  comparisonSearch: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 8,
  },
  comparisonInput: { flex: 1, fontSize: normalizeText(15), paddingVertical: 12 },
  comparisonList: { paddingTop: 16, paddingBottom: 30, gap: 12 },
  comparisonCard: { borderWidth: 1, borderRadius: 12, padding: 16 },
  comparisonCardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  comparisonMechanicInfo: { flex: 1 },
  comparisonMechanicName: { fontSize: normalizeText(16), fontWeight: "800" },
  comparisonServiceName: { fontSize: normalizeText(14), marginTop: 4 },
  comparisonPrice: { fontSize: normalizeText(19), fontWeight: "900" },
  comparisonMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 14,
  },
  comparisonMetaText: { fontSize: normalizeText(13), fontWeight: "700" },
  comparisonEmpty: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 80,
  },
  comparisonEmptyTitle: {
    fontSize: normalizeText(17),
    fontWeight: "800",
    marginTop: 14,
    textAlign: "center",
  },
  comparisonEmptyText: {
    fontSize: normalizeText(14),
    lineHeight: normalizeText(20),
    marginTop: 8,
    textAlign: "center",
  },
  fullServicesList: { flex: 1, marginTop: 0 },
  fullServicesContent: { paddingTop: 5, paddingBottom: 12 },
  fullServiceItem: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 10,
    marginVertical: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#F0F2FA",
  },
  fullServiceName: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  serviceIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  serviceCopy: {
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "flex-end",
    paddingBottom: 2,
  },
  serviceDescription: {
    color: "#657085",
    fontSize: normalizeText(10),
    lineHeight: normalizeText(13),
    marginTop: 2,
    textAlign: "left",
  },
  servicePriceColumn: {
    alignItems: "flex-end",
    marginLeft: 8,
  },
  baseRateLabel: {
    color: "#657085",
    fontSize: normalizeText(9),
    marginTop: 1,
  },
  mechanicProfileScreen: { flex: 1 },
  mechanicProfileHeader: {
    minHeight: 64,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  mechanicProfileContent: {
    alignItems: "center",
    padding: 22,
    paddingBottom: 40,
  },
  mechanicProfileAvatar: {
    width: 160,
    height: 160,
    borderRadius: 80,
    resizeMode: "cover",
    marginTop: 18,
  },
  mechanicProfileAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  mechanicProfileInitials: {
    color: "#FFFFFF",
    fontSize: normalizeText(44),
    fontWeight: "900",
  },
  mechanicProfileName: {
    fontSize: normalizeText(26),
    fontWeight: "900",
    marginTop: 16,
    textAlign: "center",
  },
  mechanicProfileService: { fontSize: normalizeText(15), marginTop: 5 },
  mechanicProfileStats: {
    width: "100%",
    minHeight: 84,
    borderWidth: 1,
    borderRadius: 14,
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
  },
  mechanicProfileStat: { flex: 1, alignItems: "center" },
  mechanicProfileStatValue: { fontSize: normalizeText(19), fontWeight: "900" },
  mechanicProfileStatLabel: { fontSize: normalizeText(13), marginTop: 4 },
  mechanicProfileStatDivider: { width: 1, height: 46 },
  mechanicReviewsTitle: {
    width: "100%",
    fontSize: normalizeText(22),
    fontWeight: "900",
    marginTop: 28,
    marginBottom: 10,
  },
  mechanicReviewsLoader: { marginTop: 22 },
  mechanicReviewRow: {
    width: "100%",
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  mechanicReviewStars: { fontSize: normalizeText(17), letterSpacing: 1, marginBottom: 6 },
  mechanicReviewText: { fontSize: normalizeText(15), lineHeight: normalizeText(22) },
  bookingScreen: { flex: 1 },
  bookingTitleRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, marginBottom: 24 },
  bookingBackButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", marginRight: 10 },
  bookingTitleCopy: { flex: 1 },
  bookingTitle: { fontSize: normalizeText(19), fontWeight: "900", letterSpacing: 0.5 },
  bookingSubtitle: { fontSize: normalizeText(13), marginTop: 2 },
  bookingContent: { flex: 1 },
  bookingContentContainer: { padding: 16, paddingBottom: 28 },
  bookingIntro: { borderRadius: 18, padding: 16, flexDirection: "row", alignItems: "center", marginBottom: 24 },
  bookingIntroIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", marginRight: 12 },
  bookingIntroCopy: { flex: 1 },
  bookingIntroTitle: { color: "#FFFFFF", fontSize: normalizeText(16), fontWeight: "900", marginBottom: 4 },
  bookingIntroText: { color: "#E8EEFF", fontSize: normalizeText(12), lineHeight: normalizeText(17) },
  bookingSectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 },
  bookingSectionTitle: { fontSize: normalizeText(13), fontWeight: "900", letterSpacing: 0.8, marginBottom: 8 },
  bookingSelectionHint: { fontSize: normalizeText(12), marginBottom: 8 },
  primaryVehicleNotice: { fontSize: normalizeText(13), marginTop: -4, marginBottom: 10 },
  bookingVehicleCard: { minHeight: 86, borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", marginTop: 2, marginBottom: 24, borderWidth: 1 },
  bookingVehicleIcon: { width: 54, height: 54, borderRadius: 12, backgroundColor: "#E8ECFF", alignItems: "center", justifyContent: "center", marginRight: 13 },
  bookingVehicleCopy: { flex: 1 },
  bookingVehicleLabel: { fontSize: normalizeText(10), fontWeight: "900", letterSpacing: 0.6, marginBottom: 5 },
  bookingVehicleName: { fontSize: normalizeText(18), fontWeight: "900" },
  bookingVehiclePlate: { fontSize: normalizeText(12), fontWeight: "700", letterSpacing: 0.7, marginTop: 3 },
  vehiclePickerOverlay: { flex: 1, backgroundColor: "rgba(15, 23, 50, 0.45)", justifyContent: "flex-end" },
  vehiclePickerCard: { maxHeight: "82%", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: Platform.OS === "ios" ? 30 : 20 },
  vehiclePickerHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 },
  vehiclePickerTitleCopy: { flex: 1 },
  vehiclePickerTitle: { fontSize: normalizeText(20), fontWeight: "900" },
  vehiclePickerSubtitle: { fontSize: normalizeText(13), marginTop: 4 },
  vehiclePickerClose: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#F0F2F8" },
  vehiclePickerOption: { minHeight: 88, borderWidth: 1, borderRadius: 16, padding: 13, flexDirection: "row", alignItems: "center", marginBottom: 10 },
  vehiclePickerIcon: { width: 46, height: 46, borderRadius: 13, backgroundColor: "#E8ECFF", alignItems: "center", justifyContent: "center", marginRight: 12 },
  vehiclePickerOptionCopy: { flex: 1 },
  vehiclePickerMeta: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 3 },
  vehiclePickerBadge: { fontSize: normalizeText(10), fontWeight: "900", letterSpacing: 0.6 },
  vehiclePickerDefault: { fontSize: normalizeText(11) },
  vehiclePickerName: { fontSize: normalizeText(16), fontWeight: "900" },
  vehiclePickerPlate: { fontSize: normalizeText(11), fontWeight: "700", letterSpacing: 0.7, marginTop: 3 },
  bookingVehicleRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  bookingVehicleInput: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: normalizeText(14),
  },
  bookingServicesGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 22 },
  bookingServiceCard: {
    width: "48.5%",
    minHeight: 132,
    justifyContent: "space-between",
    padding: 14,
    borderWidth: 1,
    borderRadius: 15,
    marginBottom: 10,
  },
  bookingServiceCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  bookingServiceIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  bookingRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  bookingRadioDot: { width: 12, height: 12, borderRadius: 6 },
  bookingServiceName: { fontSize: normalizeText(14), lineHeight: normalizeText(18), fontWeight: "800", marginBottom: 6 },
  bookingServiceBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 6 },
  bookingServiceCaption: { flex: 1, fontSize: normalizeText(10), lineHeight: normalizeText(13) },
  bookingServicePrice: { fontSize: normalizeText(13), fontWeight: "900" },
  bookingScheduleHeading: { marginTop: 2, marginBottom: 10 },
  bookingNotesHeading: { marginTop: 4, marginBottom: 4 },
  bookingNotesHint: { color: "#7D8295", fontSize: normalizeText(12), lineHeight: normalizeText(17), marginBottom: 10 },
  bookingNotesCard: { minHeight: 112, flexDirection: "row", alignItems: "flex-start", padding: 14, borderRadius: 14, borderWidth: 1, borderColor: "#E4E5EC", backgroundColor: "#FFFFFF" },
  bookingNotesIcon: { marginTop: 2, marginRight: 10 },
  bookingNotesInput: { flex: 1, minHeight: 82, padding: 0, color: "#30323D", fontSize: normalizeText(14), lineHeight: normalizeText(20) },
  bookingNotesCount: { color: "#7D8295", textAlign: "right", fontSize: normalizeText(11), marginTop: 6, marginBottom: 12 },
  bookingScheduleRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  bookingScheduleField: { flex: 1 },
  bookingScheduleLabel: { fontSize: normalizeText(16), fontWeight: "800", marginBottom: 6 },
  bookingDateTitle: { marginTop: 14 },
  bookingTimeTitle: { marginTop: 14 },
  bookingDateButton: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bookingDateText: { flex: 1, fontSize: normalizeText(15), fontWeight: "700" },
  priceSummary: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 106,
    padding: 12,
    marginBottom: 10,
  },
  priceSummaryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 },
  priceSummaryTitle: { fontSize: normalizeText(14), fontWeight: "900", flex: 1 },
  priceSummaryBadge: { backgroundColor: "#C7D4FF", paddingHorizontal: 7, paddingVertical: 5, borderRadius: 5, fontSize: normalizeText(10), fontWeight: "900" },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
  },
  summaryLabel: { fontSize: normalizeText(14), flex: 1 },
  summaryValue: { fontSize: normalizeText(15), fontWeight: "700", marginLeft: 18 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    marginTop: 6,
    paddingTop: 10,
  },
  totalLabel: { fontSize: normalizeText(16), fontWeight: "800" },
  totalValue: { fontSize: normalizeText(22), fontWeight: "900" },
  fareNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  fareNoticeText: { flex: 1, fontSize: normalizeText(12), lineHeight: normalizeText(16) },
  confirmBookingButton: {
    minHeight: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  confirmBookingText: { color: "#FFFFFF", fontSize: normalizeText(17), fontWeight: "800" },
  disabledButton: { opacity: 0.55 },
  subtitle: { fontSize: normalizeText(15), marginBottom: 20 },

  sosButton: {
    backgroundColor: "#FF3800",
    width: 310,
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  sosButtonDisabled: {
    opacity: 0.45,
  },
  sosContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  sosText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: normalizeText(16),
    letterSpacing: 0.2,
  },
  bookButton: {
    backgroundColor: "#FF6B00",
    paddingVertical: 15,
    width: "100%",
    borderRadius: 6,
    alignItems: "center",
    marginBottom: 10,
  },
  bookButtonText: { color: "#FFFFFF", fontWeight: "bold", fontSize: normalizeText(17) },
  cancelButton: { paddingVertical: 14, alignItems: "center" },
  cancelButtonText: { color: "#EF4444", fontWeight: "bold", fontSize: normalizeText(15) },

  topContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderRadius: 0,
    borderWidth: 1,
    zIndex: 10,
    elevation: 7,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 7,
  },
  headerRow: { minHeight: 58, flexDirection: "row", alignItems: "center" },
  appLogo: { width: 74, height: 58 },
  screenTitle: { flex: 1, marginLeft: 8, fontSize: normalizeText(24), fontWeight: "800" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  nearbyMechanicsSummary: {
    position: "absolute",
    left: 18,
    minWidth: 190,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    zIndex: 9,
  },
  nearbyMechanicsPill: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  nearbyMechanicsSummaryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  nearbyMechanicsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  nearbyMechanicsCount: {
    fontSize: normalizeText(13),
    fontWeight: "900",
    fontFamily: "PlusJakartaSansBold",
  },
  nearbyMechanicsModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(16, 27, 52, 0.2)",
  },
  nearbyMechanicsSheet: {
    width: "100%",
    maxHeight: "68%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 24,
    elevation: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  nearbyMechanicsSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingBottom: 14,
  },
  nearbyMechanicsSheetTitle: {
    fontSize: normalizeText(22),
    fontWeight: "900",
    fontFamily: "PlusJakartaSansBold",
  },
  nearbyMechanicsSheetSubtitle: {
    fontSize: normalizeText(13),
    marginTop: 4,
    fontFamily: "PlusJakartaSans",
  },
  nearbyMechanicsClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9EDFA",
  },
  nearbyMechanicsList: {
    paddingTop: 6,
    paddingBottom: 10,
    gap: 10,
  },
  nearbyMechanicItem: {
    minHeight: 74,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F2FA",
  },
  nearbyMechanicAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 12,
    borderWidth: 2,
    borderColor: "#E5A13A",
  },
  nearbyMechanicAvatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2450D8",
  },
  nearbyMechanicCopy: { flex: 1 },
  nearbyMechanicName: {
    fontSize: normalizeText(15),
    fontWeight: "800",
    fontFamily: "PlusJakartaSansBold",
  },
  nearbyMechanicMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 6,
  },
  nearbyMechanicMetaText: {
    fontSize: normalizeText(12),
    fontFamily: "PlusJakartaSans",
  },
  nearbyMechanicsEmpty: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  nearbyMechanicsEmptyText: {
    fontSize: normalizeText(14),
    textAlign: "center",
    fontFamily: "PlusJakartaSans",
  },
  mapControlStack: {
    position: "absolute",
    right: 18,
    alignItems: "center",
    gap: 8,
    zIndex: 8,
  },
  mapControlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  mapControlImage: { width: 19, height: 19, resizeMode: "contain" },
  topActions: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
    borderWidth: 1,
  },
  iconAvatarImage: { width: "100%", height: "100%", borderRadius: 26 },
  iconInitials: { fontSize: normalizeText(19), fontWeight: "800" },
  activityButton: {
    width: 36,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  notificationBadge: {
    position: "absolute",
    top: 4,
    right: -2,
    minWidth: 23,
    height: 23,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: "#B84B00",
    alignItems: "center",
    justifyContent: "center",
  },
  notificationBadgeText: { color: "#FFFFFF", fontSize: normalizeText(13), fontWeight: "800" },
  vehicleSelector: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#D7D9DE",
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 4,
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  vehicleSelectorLabel: { fontSize: normalizeText(12), lineHeight: normalizeText(15) },
  vehicleSelectorValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  vehicleSelectorText: { flex: 1, fontSize: normalizeText(15), fontWeight: "700" },
  vehicleSelectorIcon: { width: 28, height: 28 },
  vehicleMenu: {
    position: "absolute",
    top: 110,
    left: 70,
    right: 54,
    borderWidth: 1,
    borderRadius: 4,
    overflow: "hidden",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    zIndex: 20,
  },
  vehicleMenuItem: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    backgroundColor: "#FFFFFF",
  },
  vehicleMenuItemSelected: { backgroundColor: "#F1F3F5" },
  vehicleMenuIcon: { width: 30, height: 30 },
  vehicleMenuCopy: { flex: 1, marginLeft: 12 },
  vehicleMenuTitle: { fontSize: normalizeText(15), fontWeight: "700" },
  vehicleMenuDetails: { fontSize: normalizeText(13), marginTop: 2 },
  sosImage: { width: 20, height: 20, resizeMode: "contain" },

  trackingCard: {
    width: "100%",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
  },
  trackingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  trackingName: { fontSize: normalizeText(20), fontWeight: "800", letterSpacing: 0.1 },
  trackingCallButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
  },
  trackingStatusCard: {
    width: "100%",
    minHeight: 200,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "space-between",
    elevation: 1,
  },
  statusRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
  },
  statusText: {
    fontSize: normalizeText(15),
    fontWeight: "800",
    marginLeft: 12,
    textAlign: "center",
    flexShrink: 1,
  },
  bookingTimeline: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  timelineItem: { flex: 1, alignItems: "center" },
  timelineTrack: {
    width: "100%",
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#B8C2CC",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    zIndex: 2,
    backgroundColor: "#FFFFFF",
  },
  timelineConnector: {
    position: "absolute",
    left: "50%",
    right: "-50%",
    top: 12,
    height: 2,
    backgroundColor: "#B8C2CC",
    zIndex: 0,
  },
  timelineLabel: {
    fontSize: normalizeText(12),
    fontWeight: "700",
    textAlign: "center",
    marginTop: 8,
  },
  receiptButton: {
    minWidth: 200,
    minHeight: 46,
    borderRadius: 23,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 20,
    elevation: 2,
  },
  receiptButtonText: {
    color: "#FFFFFF",
    fontSize: normalizeText(13),
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  receiptOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 22,
  },
  receiptCard: { borderWidth: 1, borderRadius: 18, padding: 22, elevation: 8 },
  receiptHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  receiptTitle: { fontSize: normalizeText(21), fontWeight: "900" },
  receiptSubtitle: { fontSize: normalizeText(14), marginTop: 4 },
  receiptDivider: { borderBottomWidth: 1, marginVertical: 18 },
  receiptLabel: { fontSize: normalizeText(12), fontWeight: "700", letterSpacing: 0.4 },
  receiptValue: { fontSize: normalizeText(15), fontWeight: "700", marginTop: 5 },
  receiptRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    gap: 14,
  },
  receiptTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    marginTop: 20,
    paddingTop: 16,
  },
  receiptTotalLabel: { fontSize: normalizeText(17), fontWeight: "900" },
  receiptTotalValue: { fontSize: normalizeText(21), fontWeight: "900" },
  receiptNote: { fontSize: normalizeText(12), lineHeight: normalizeText(16), marginTop: 18 },
  actionBtnText: { color: "#FFFFFF", fontWeight: "bold", fontSize: normalizeText(16) },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 22,
  },
  modalContent: {
    borderRadius: 26,
    padding: 26,
    alignItems: "center",
    elevation: 10,
    borderWidth: 1,
  },
  modalTitle: { fontSize: normalizeText(25), fontWeight: "bold", marginBottom: 10 },
  modalSubtitle: {
    fontSize: normalizeText(15),
    textAlign: "center",
    marginBottom: 26,
    lineHeight: normalizeText(22),
  },
  ratingModalContent: { padding: 18, borderRadius: 20 },
  ratingCompleteIcon: { marginBottom: 8 },
  ratingModalTitle: { fontSize: normalizeText(21), marginBottom: 5 },
  ratingModalSubtitle: { fontSize: normalizeText(13), marginBottom: 14, lineHeight: normalizeText(18) },
  ratingBox: {
    width: "100%",
    alignItems: "center",
    marginBottom: 22,
    paddingVertical: 18,
    borderRadius: 18,
    borderWidth: 1,
  },
  compactRatingBox: { marginBottom: 14, paddingVertical: 12, borderRadius: 14 },
  ratingPrompt: { fontSize: normalizeText(17), fontWeight: "600", marginBottom: 14 },
  compactRatingPrompt: { fontSize: normalizeText(15), marginBottom: 8 },
  starsRow: { flexDirection: "row" },
  compactStar: { marginHorizontal: 2 },
  ratingScaleText: { fontSize: normalizeText(13), fontWeight: "700", marginTop: 10 },
  reviewInput: {
    width: "100%",
    borderRadius: 14,
    padding: 18,
    height: 110,
    textAlignVertical: "top",
    marginBottom: 22,
    borderWidth: 1,
    fontSize: normalizeText(15),
  },
  compactReviewInput: {
    height: 70,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    fontSize: normalizeText(15),
  },
  reviewCounter: {
    alignSelf: "flex-end",
    fontSize: normalizeText(12),
    marginTop: -16,
    marginBottom: 18,
  },
  submitReviewBtn: {
    backgroundColor: "#10b981",
    width: "100%",
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: "center",
  },
  compactSubmitReviewBtn: { paddingVertical: 14, borderRadius: 12 },
  submitReviewText: { color: "#FFFFFF", fontWeight: "bold", fontSize: normalizeText(17) },

  reasonRow: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  reasonText: { fontSize: normalizeText(15), fontWeight: "600" },
  closeCancelBtn: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  confirmCancelBtn: {
    flex: 1,
    backgroundColor: "#EF4444",
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: "center",
  },
  cancelSuccessCard: { alignItems: "center", paddingTop: 30 },
  cancelSuccessIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#18A957",
    marginBottom: 16,
  },
  cancelSuccessTitle: {
    fontSize: normalizeText(21),
    fontWeight: "800",
    marginBottom: 10,
  },
  cancelSuccessMessage: {
    fontSize: normalizeText(15),
    lineHeight: normalizeText(22),
    textAlign: "center",
    marginBottom: 24,
  },
  cancelSuccessButton: {
    width: "100%",
    alignItems: "center",
    backgroundColor: "#172B66",
    borderRadius: 14,
    paddingVertical: 16,
  },
  acceptedSuccessCard: { alignItems: "center", paddingTop: 30 },
  acceptedSuccessIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#18A957",
    marginBottom: 16,
  },
  acceptedSuccessTitle: {
    fontSize: normalizeText(22),
    fontWeight: "800",
    marginBottom: 10,
  },
  acceptedSuccessMessage: {
    fontSize: normalizeText(16),
    lineHeight: normalizeText(24),
    textAlign: "center",
    marginBottom: 24,
  },
  acceptedSuccessButton: {
    width: "100%",
    alignItems: "center",
    backgroundColor: "#172B66",
    borderRadius: 14,
    paddingVertical: 16,
  },
});