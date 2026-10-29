import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Asset, requestPermissionsAsync } from "expo-media-library";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import ViewShot, { type ViewShotRef } from "react-native-view-shot";

import { MechanicScreen } from "@/components/mechanic/MechanicScreen";
import { MiniMapPreview } from "@/components/mechanic/MiniMapPreview";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { imageAssetToBytes, refreshChatImageUrl } from "@/lib/chatMedia";
import { supabase } from "@/lib/supabase";
import { colors, spacing } from "@/lib/theme";

type JobStatus = "ongoing" | "resolved" | "dropped";

type ServiceRequest = {
  id: string;
  motorist_id: string;
  mechanic_id: string | null;
  vehicle_type: string | null;
  plate_number: string | null;
  vehicle_issue: string | null;
  service_name: string | null;
  service_price: number | null;
  service_breakdown: ServiceBreakdownItem[] | null;
  delivery_fee: number | null;
  estimated_total: number | null;
  additional_charges: AdditionalCharge[] | null;
  request_type: string | null;
  status: string | null;
  cancelled_by: "mechanic" | "motorist" | null;
  latitude: number | null;
  longitude: number | null;
  mechanic_latitude: number | null;
  mechanic_longitude: number | null;
  created_at: string;
  scheduled_at: string | null;
  customer_name: string;
  customer_contact: string;
  customer_avatar_url: string | null;
};

type ChatMessage = {
  id: string;
  sender_id: string;
  body: string | null;
  image_url?: string | null;
  created_at: string;
};

type CustomerContactRow = {
  customer_id: string;
  mobile_number: string | null;
};

type AdditionalCharge = {
  id: string;
  description: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
};

type ServiceBreakdownItem = {
  service: string;
  price: number;
};

type MechanicServicePrice = {
  service: string;
  price: string | number;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

function getPayableTotal(job: Pick<ServiceRequest, "estimated_total" | "service_price" | "additional_charges">) {
  const approvedCharges = (job.additional_charges ?? [])
    .filter((charge) => charge.status === "approved")
    .reduce((sum, charge) => sum + Number(charge.amount || 0), 0);
  return Number(job.estimated_total ?? job.service_price ?? 0) + approvedCharges;
}

function parseServicePrice(price: string | number) {
  return Number(String(price).replace(/[^\d.]/g, "")) || 0;
}

function getReceiptServiceBreakdown(
  job: Pick<
    ServiceRequest,
    "service_name" | "service_price" | "estimated_total" | "delivery_fee" | "service_breakdown"
  >,
  mechanicServicePrices: MechanicServicePrice[],
): ServiceBreakdownItem[] {
  if (job.service_breakdown?.length) return job.service_breakdown;

  const serviceNames = (job.service_name ?? "")
    .split(",")
    .map((service) => service.trim())
    .filter(Boolean);
  const estimatedTotal = Number(job.estimated_total ?? job.service_price ?? 0);
  const deliveryFee = Number(job.delivery_fee ?? 0);
  const serviceTotal = Number(
    job.service_price ?? Math.max(0, estimatedTotal - deliveryFee),
  );
  const pricingByName = new Map(
    mechanicServicePrices.map((item) => [
      item.service.trim().toLowerCase(),
      parseServicePrice(item.price),
    ]),
  );
  const currentPriceBreakdown: ServiceBreakdownItem[] = [];
  for (const service of serviceNames) {
    const price = pricingByName.get(service.toLowerCase());
    if (price === undefined) {
      currentPriceBreakdown.length = 0;
      break;
    }
    currentPriceBreakdown.push({ service, price });
  }
  const currentPriceTotal = currentPriceBreakdown.reduce(
    (total, item) => total + item.price,
    0,
  );
  if (
    currentPriceBreakdown.length > 0 &&
    Math.abs(currentPriceTotal - serviceTotal) < 0.01
  ) {
    return currentPriceBreakdown;
  }

  return [
    {
      service: serviceNames.join(", ") || "Service",
      price: serviceTotal,
    },
  ];
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function getReceiptHtml(
  job: ServiceRequest,
  mechanicServicePrices: MechanicServicePrice[],
  mechanicName: string,
) {
  const reference = `#${job.id.slice(0, 8).toUpperCase()}`;
  const serviceRows = getReceiptServiceBreakdown(job, mechanicServicePrices)
    .map(
      (item) => `
        <tr><td>${escapeHtml(item.service)}</td><td>₱${item.price.toFixed(2)}</td></tr>
      `,
    )
    .join("");
  const distanceFee = Number(job.delivery_fee ?? 0);
  const distanceRow =
    distanceFee > 0
      ? `<tr><td>Distance fee</td><td>₱${distanceFee.toFixed(2)}</td></tr>`
      : "";
  const chargeRows = (job.additional_charges ?? [])
    .map((charge) => {
      const value =
        charge.status === "rejected"
          ? "Declined"
          : `₱${Number(charge.amount).toFixed(2)}${
              charge.status === "pending" ? " (Pending)" : ""
            }`;
      return `<tr><td>${escapeHtml(charge.description)}</td><td>${value}</td></tr>`;
    })
    .join("");
  const total = getPayableTotal(job);
  const createdAt = new Date(job.created_at).toLocaleString("en-PH");

  return `
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          body { font-family: Arial, sans-serif; color: #172033; padding: 28px; }
          h1 { font-size: 22px; margin: 0 0 8px; }
          .muted { color: #667085; font-size: 13px; }
          .reference { font-size: 18px; font-weight: 700; margin: 0 0 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 24px; }
          td { padding: 12px 0; border-bottom: 1px solid #e4e7ec; font-size: 14px; }
          td:last-child { text-align: right; font-weight: 700; }
          .total td { border-top: 2px solid #d0d5dd; border-bottom: 0; font-size: 17px; font-weight: 700; }
        </style>
      </head>
      <body>
        <h1>Mechaniko Receipt</h1>
        <p class="reference">Booking reference ${reference}</p>
        <p class="muted">Mechanic: ${escapeHtml(mechanicName)}</p>
        <p class="muted">Customer: ${escapeHtml(job.customer_name)} · ${escapeHtml(createdAt)}</p>
        <table>
          ${serviceRows}
          ${distanceRow}
          ${chargeRows}
          <tr class="total"><td>Total</td><td>₱${total.toFixed(2)}</td></tr>
        </table>
      </body>
    </html>
  `;
}

function distanceInKm(from: Coordinates, to: Coordinates) {
  const earthRadiusKm = 6371;
  const latitudeDelta = ((to.latitude - from.latitude) * Math.PI) / 180;
  const longitudeDelta = ((to.longitude - from.longitude) * Math.PI) / 180;
  const latitude1 = (from.latitude * Math.PI) / 180;
  const latitude2 = (to.latitude * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.sin(longitudeDelta / 2) ** 2 *
      Math.cos(latitude1) *
      Math.cos(latitude2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function formatTripDistance(from: Coordinates | null, to: Coordinates | null) {
  if (!from || !to) return "Waiting for live location";
  const distance = distanceInKm(from, to);
  return distance < 1
    ? `${Math.max(1, Math.round(distance * 1000))} m away from you`
    : `${distance.toFixed(1)} km away from you`;
}

function getChatImageDisplaySize(width: number, height: number) {
  const aspectRatio = width / height;
  const displayHeight = Math.min(300, 220 / aspectRatio);
  return {
    width: displayHeight * aspectRatio,
    height: displayHeight,
  };
}

function formatDistanceAway(from: Coordinates | null, to: Coordinates | null) {
  if (!from || !to) return "Distance unavailable";
  const distance = distanceInKm(from, to);
  if (distance < 1) {
    const meters = Math.round(distance * 1000);
    return meters === 0 ? "< 1 m away" : `${meters} m away`;
  }
  return `${distance.toFixed(1)} km away`;
}

function getJobStatus(status: string | null): JobStatus | null {
  const normalized = status?.trim().toLowerCase();
  if (["accepted", "arrived", "in_transit", "in_progress", "ongoing"].includes(normalized ?? "")) {
    return "ongoing";
  }
  if (
    normalized === "completed" ||
    normalized === "done" ||
    normalized === "resolved" ||
    normalized === "closed"
  ) {
    return "resolved";
  }
  if (normalized === "cancelled" || normalized === "canceled" || normalized === "revoked" || normalized === "rejected" || normalized === "dropped") {
    return "dropped";
  }
  return null;
}

function isChatActiveStatus(status: string | null) {
  return [
    "scheduled",
    "pending",
    "accepted",
    "arrived",
    "in_transit",
    "in_progress",
    "ongoing",
  ].includes(status?.trim().toLowerCase() ?? "");
}

function hasTripStarted(status: string | null) {
  return ["in_transit", "arrived", "in_progress", "ongoing"].includes(
    status?.trim().toLowerCase() ?? "",
  );
}

function formatChatDate(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function startsNewChatDate(messages: ChatMessage[], index: number) {
  if (index === 0) return true;
  return (
    new Date(messages[index - 1].created_at).toDateString() !==
    new Date(messages[index].created_at).toDateString()
  );
}

function formatSchedule(value: string | null) {
  if (!value) return "As soon as possible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Schedule unavailable";

  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const dayDifference = Math.round(
    (startOfDate.getTime() - startOfToday.getTime()) / 86400000,
  );
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (dayDifference === 0) return `Today, ${time}`;
  if (dayDifference === 1) return `Tomorrow, ${time}`;

  return `${date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  })}, ${time}`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export default function JobsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { filter: filterParam } = useLocalSearchParams<{ filter?: string }>();
  const [jobs, setJobs] = useState<ServiceRequest[]>([]);
  const [mechanicServicePrices, setMechanicServicePrices] = useState<
    MechanicServicePrice[]
  >([]);
  const [mechanicName, setMechanicName] = useState("Mechanic");
  const jobsRef = useRef<ServiceRequest[]>([]);
  jobsRef.current = jobs;
  const [unreadChatCounts, setUnreadChatCounts] = useState<Record<string, number>>({});
  const [localFilter, setLocalFilter] = useState<JobStatus>("ongoing");
  const activeFilter: JobStatus =
    filterParam === "ongoing" ||
    filterParam === "resolved" ||
    filterParam === "dropped"
      ? filterParam
      : localFilter;
  const [statusUpdatingJobId, setStatusUpdatingJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mechanicId = session?.user.id;
  const [chatJob, setChatJob] = useState<ServiceRequest | null>(null);
  const activeChatJobId = chatJob?.id ?? null;
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const chatMessagesJobIdRef = useRef<string | null>(null);
  const chatListRef = useRef<FlatList<ChatMessage>>(null);
  const chatShouldScrollToEndRef = useRef(true);
  const chatHasInitiallyScrolledRef = useRef(false);
  const [chatImageSizes, setChatImageSizes] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const [chatImageErrors, setChatImageErrors] = useState<
    Record<string, boolean>
  >({});
  const chatImageSizeRequests = useRef(new Set<string>());
  const chatImageRefreshRequests = useRef(new Set<string>());
  const [chatText, setChatText] = useState("");
  const [chatUploadingImage, setChatUploadingImage] = useState(false);
  const [chatPhotoPickerVisible, setChatPhotoPickerVisible] = useState(false);
  const [viewingChatImage, setViewingChatImage] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [issueJob, setIssueJob] = useState<ServiceRequest | null>(null);
  const [chargeJob, setChargeJob] = useState<ServiceRequest | null>(null);
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeSubmitting, setChargeSubmitting] = useState(false);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);
  const receiptCaptureRef = useRef<ViewShotRef>(null);
  const [otherIssueReason, setOtherIssueReason] = useState("");
  const [enteringOtherReason, setEnteringOtherReason] = useState(false);
  const [pendingCancellationJob, setPendingCancellationJob] =
    useState<ServiceRequest | null>(null);
  const [pendingCancellationReason, setPendingCancellationReason] = useState("");
  const [cancelSuccessVisible, setCancelSuccessVisible] = useState(false);
  const [cannotCancelBookingVisible, setCannotCancelBookingVisible] =
    useState(false);
  const [customerAddress, setCustomerAddress] = useState<{
    key: string;
    value: string;
  } | null>(null);
  const [mapChoice, setMapChoice] = useState<{
    googleMapsUrl: string;
    wazeUrl: string;
  } | null>(null);
  const [mapChoiceError, setMapChoiceError] = useState<string | null>(null);
  const [trackedMechanicLocation, setTrackedMechanicLocation] = useState<{
    jobId: string;
    coordinates: Coordinates;
  } | null>(null);
  const [locationTrackingError, setLocationTrackingError] =
    useState<string | null>(null);

  const issueOptions = [
    "Vehicle or service issue changed",
    "Customer is unavailable",
    "Unsafe pickup location",
    "Unable to reach the customer",
    "Others",
  ];

  const jobsRequestId = useRef(0);
  const hasLoadedJobs = useRef(false);
  const notifiedMotoristCancellations = useRef(new Set<string>());
  const loadJobs = useCallback(async (showRefreshState = false) => {
    if (!mechanicId) return;
    const requestId = ++jobsRequestId.current;
    if (showRefreshState) setRefreshing(true);
    else if (!hasLoadedJobs.current) setLoading(true);

    const { data, error: queryError } = await supabase
      .from("service_requests")
      .select(
        "id,motorist_id,mechanic_id,vehicle_type,plate_number,vehicle_issue,service_name,service_price,service_breakdown,delivery_fee,estimated_total,additional_charges,request_type,status,cancelled_by,latitude,longitude,mechanic_latitude,mechanic_longitude,created_at,scheduled_at",
      )
      .or(`mechanic_id.is.null,mechanic_id.eq.${mechanicId}`)
      .order("created_at", { ascending: false });

    if (requestId !== jobsRequestId.current) return;
    if (queryError) {
      setError(queryError.message);
    } else {
      const requests = (data ?? []) as Omit<
        ServiceRequest,
        "customer_name" | "customer_contact" | "customer_avatar_url"
      >[];
      const motoristIds = [...new Set(requests.map((job) => job.motorist_id))];
      const profileIds = motoristIds.filter(isUuid);
      const [
        { data: profiles, error: profilesError },
        { data: contactRows, error: contactError },
        { data: mechanicProfile, error: mechanicProfileError },
      ] = await Promise.all([
        profileIds.length
          ? supabase
              .from("profiles")
              .select("id,full_name,mobile_number,email,avatar_path")
              .in("id", profileIds)
          : Promise.resolve({ data: [], error: null }),
        profileIds.length
          ? supabase.rpc("get_customer_mobile_numbers", {
              p_customer_ids: profileIds,
            })
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("profiles")
          .select("full_name,maintenance_pricing")
          .eq("id", mechanicId)
          .maybeSingle(),
      ]);
      if (requestId !== jobsRequestId.current) return;
      setMechanicServicePrices(
        Array.isArray(mechanicProfile?.maintenance_pricing)
          ? (mechanicProfile.maintenance_pricing as MechanicServicePrice[])
          : [],
      );
      setMechanicName(mechanicProfile?.full_name?.trim() || "Mechanic");
      const typedContactRows = (contactRows ?? []) as CustomerContactRow[];
      const contactMap = new Map(
        typedContactRows.map((profile) => [
          profile.customer_id,
          profile.mobile_number,
        ]),
      );
      const profileMap = new Map(
        (profiles ?? []).map((profile) => [
          profile.id,
          {
            name: profile.full_name || "Customer",
            contact:
              profile.mobile_number ||
              contactMap.get(profile.id) ||
              "Not provided",
            avatarUrl: profile.avatar_path
              ? supabase.storage
                  .from("mechanic-avatars")
                  .getPublicUrl(profile.avatar_path).data.publicUrl
              : null,
          },
        ]),
      );
      for (const contact of typedContactRows) {
        if (!profileMap.has(contact.customer_id)) {
          profileMap.set(contact.customer_id, {
            name: "Customer",
            contact: contact.mobile_number || "Not provided",
            avatarUrl: null,
          });
        }
      }
      setJobs(
        requests.map((job) => ({
          ...job,
          customer_name: profileMap.get(job.motorist_id)?.name || "Customer",
          customer_contact:
            profileMap.get(job.motorist_id)?.contact || "Not provided",
          customer_avatar_url:
            profileMap.get(job.motorist_id)?.avatarUrl ?? null,
        })),
      );
      setError(
        profilesError?.message ??
          contactError?.message ??
          mechanicProfileError?.message ??
          null,
      );
    }
    hasLoadedJobs.current = true;
    setLoading(false);
    setRefreshing(false);
  }, [mechanicId]);

  const loadUnreadChatCounts = useCallback(async () => {
    if (!mechanicId) return;
    const requestIds = jobsRef.current.map((job) => job.id);
    if (requestIds.length === 0) {
      setUnreadChatCounts({});
      return;
    }

    const { data, error: unreadError } = await supabase
      .from("app_notifications")
      .select("service_request_id")
      .eq("user_id", mechanicId)
      .eq("type", "chat_message")
      .is("read_at", null)
      .in("service_request_id", requestIds);
    if (unreadError) {
      console.warn("Could not load unread chat messages:", unreadError.message);
      return;
    }

    const nextCounts: Record<string, number> = {};
    for (const notification of data ?? []) {
      const requestId = notification.service_request_id;
      if (requestId) nextCounts[requestId] = (nextCounts[requestId] ?? 0) + 1;
    }
    setUnreadChatCounts(nextCounts);
  }, [mechanicId]);

  useEffect(() => {
    void loadUnreadChatCounts();
  }, [jobs, loadUnreadChatCounts]);

  useEffect(() => {
    if (!mechanicId) return;
    const channel = supabase
      .channel(`mechanic_unread_chats_${mechanicId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_notifications",
          filter: `user_id=eq.${mechanicId}`,
        },
        () => void loadUnreadChatCounts(),
      )
      .subscribe((status, subscribeError) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(
            "Unread chat updates unavailable:",
            subscribeError?.message ?? status,
          );
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadUnreadChatCounts, mechanicId]);

  useFocusEffect(
    useCallback(() => {
      void loadJobs();
      return () => {
        jobsRequestId.current += 1;
      };
    }, [loadJobs]),
  );

  const [selectedJob, setSelectedJob] = useState<ServiceRequest | null>(null);
  const [scheduledMechanicLocation, setScheduledMechanicLocation] = useState<{
    jobId: string;
    coordinates: Coordinates;
  } | null>(null);
  const [scheduledLocationError, setScheduledLocationError] = useState<string | null>(null);
  const trackingJob = jobs.find(
    (job) => job.status?.trim().toLowerCase() === "in_transit",
  );
  const trackingJobId = trackingJob?.id;

  function openJobDetails(job: ServiceRequest) {
    setSelectedJob(job);
    setScheduledLocationError(null);
  }

  async function openCustomerChat(job: ServiceRequest) {
    setChatJob(job);
    const unreadCount = unreadChatCounts[job.id] ?? 0;
    if (!mechanicId || unreadCount === 0) return;

    const { error: markReadError } = await supabase
      .from("app_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", mechanicId)
      .eq("service_request_id", job.id)
      .eq("type", "chat_message")
      .is("read_at", null);
    if (markReadError) {
      setError(`Could not mark chat messages as read: ${markReadError.message}`);
      return;
    }
    setUnreadChatCounts((current) => {
      const next = { ...current };
      delete next[job.id];
      return next;
    });
  }

  function getMechanicCoordinatesForJob(job: ServiceRequest) {
    if (trackedMechanicLocation?.jobId === job.id) {
      return trackedMechanicLocation.coordinates;
    }
    if (scheduledMechanicLocation?.jobId === job.id) {
      return scheduledMechanicLocation.coordinates;
    }
    if (job.mechanic_latitude !== null && job.mechanic_longitude !== null) {
      return {
        latitude: job.mechanic_latitude,
        longitude: job.mechanic_longitude,
      };
    }
    return null;
  }

  const selectedJobId = selectedJob?.id;
  const selectedJobLatitude = selectedJob?.latitude;
  const selectedJobLongitude = selectedJob?.longitude;

  useEffect(() => {
    if (
      !selectedJobId ||
      selectedJobLatitude == null ||
      selectedJobLongitude == null
    ) return;

    let active = true;
    const jobId = selectedJobId;
    const setLocation = (location: Location.LocationObject) => {
      if (!active) return;
      setScheduledMechanicLocation({
        jobId,
        coordinates: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        },
      });
    };

    const loadMechanicLocation = async () => {
      try {
        let permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          permission = await Location.requestForegroundPermissionsAsync();
        }
        if (!active) return;
        if (permission.status !== "granted") {
          setScheduledLocationError(
            "Allow location access to see your distance from the customer.",
          );
          return;
        }

        const lastKnownLocation = await Location.getLastKnownPositionAsync({
          maxAge: 60_000,
          requiredAccuracy: 1_000,
        });
        if (lastKnownLocation) setLocation(lastKnownLocation);

        const currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setLocation(currentLocation);
        setScheduledLocationError(null);
      } catch (locationError) {
        if (active) {
          setScheduledLocationError(
            locationError instanceof Error
              ? locationError.message
              : "Unable to get your current location.",
          );
        }
      }
    };

    void loadMechanicLocation();
    return () => {
      active = false;
    };
  }, [
    selectedJobId,
    selectedJobLatitude,
    selectedJobLongitude,
  ]);

  useEffect(() => {
    if (!trackingJobId || !mechanicId) return;

    const jobId = trackingJobId;
    let active = true;
    let locationSubscription: Location.LocationSubscription | null = null;

    const publishLocation = async (nextLocation: Location.LocationObject) => {
      if (!active) return;
      const coordinates = {
        latitude: nextLocation.coords.latitude,
        longitude: nextLocation.coords.longitude,
      };
      const { error: locationError } = await supabase
        .from("service_requests")
        .update({
          mechanic_latitude: nextLocation.coords.latitude,
          mechanic_longitude: nextLocation.coords.longitude,
        })
        .eq("id", jobId)
        .eq("mechanic_id", mechanicId);
      if (locationError) {
        setLocationTrackingError(locationError.message);
        return;
      }
      setLocationTrackingError(null);
      setTrackedMechanicLocation({ jobId, coordinates });
      setJobs((current) =>
        current.map((job) =>
          job.id === jobId
            ? {
                ...job,
                mechanic_latitude: coordinates.latitude,
                mechanic_longitude: coordinates.longitude,
              }
            : job,
        ),
      );
      setSelectedJob((current) =>
        current?.id === jobId
          ? {
              ...current,
              mechanic_latitude: coordinates.latitude,
              mechanic_longitude: coordinates.longitude,
            }
          : current,
      );
    };

    const startTracking = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!active) return;
        if (status !== "granted") {
          setLocationTrackingError(
            "Location permission is required to share your trip location.",
          );
          return;
        }
        const currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });
        await publishLocation(currentLocation);
        if (!active) return;
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Highest,
            distanceInterval: 10,
            timeInterval: 5000,
          },
          (nextLocation) => {
            void publishLocation(nextLocation);
          },
        );
      } catch (trackingError) {
        if (active) {
          setLocationTrackingError(
            trackingError instanceof Error
              ? trackingError.message
              : "Unable to start live location sharing.",
          );
        }
      }
    };

    void startTracking();
    return () => {
      active = false;
      locationSubscription?.remove();
    };
  }, [mechanicId, trackingJobId]);

  useEffect(() => {
    if (!mechanicId) return;
    const channel = supabase
      .channel(`mechanic_booking_updates_${mechanicId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "service_requests",
          filter: `mechanic_id=eq.${mechanicId}`,
        },
        (payload) => {
          const updated = payload.new as Partial<ServiceRequest> & { id: string };
          const previousStatus = String(payload.old.status ?? "")
            .trim()
            .toLowerCase();
          const updatedStatus = String(updated.status ?? "")
            .trim()
            .toLowerCase();
          const wasAlreadyCancelled = ["cancelled", "canceled"].includes(
            previousStatus,
          );
          const cancelledByMotorist =
            ["cancelled", "canceled"].includes(updatedStatus) &&
            updated.cancelled_by === "motorist" &&
            !wasAlreadyCancelled &&
            !notifiedMotoristCancellations.current.has(updated.id);

          setJobs((current) =>
            current.map((job) =>
              job.id === updated.id ? { ...job, ...updated } : job,
            ),
          );
          setSelectedJob((current) =>
            current?.id === updated.id ? { ...current, ...updated } : current,
          );

          if (cancelledByMotorist) {
            notifiedMotoristCancellations.current.add(updated.id);
            setLocalFilter("dropped");
            router.setParams({ filter: "dropped" });
            setSelectedJob((current) =>
              current?.id === updated.id ? null : current,
            );
          }
        },
      )
      .subscribe((status, subscribeError) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(
            "Mechanic booking realtime connection failed:",
            subscribeError?.message ?? status,
          );
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [mechanicId]);

  useEffect(() => {
    if (!activeChatJobId || !mechanicId) return;
    const chatJobId = activeChatJobId;
    let active = true;
    chatShouldScrollToEndRef.current = true;
    chatHasInitiallyScrolledRef.current = false;
    async function loadMessages() {
      if (chatMessagesJobIdRef.current !== chatJobId) {
        setChatMessages([]);
        chatMessagesJobIdRef.current = chatJobId;
      }
      setChatLoading(true);
      let { data, error: queryError } = await supabase
        .from("chat_messages")
        .select("id,sender_id,body,image_url,created_at")
        .eq("service_request_id", chatJobId)
        .order("created_at", { ascending: true });
      if (queryError?.message.includes("image_url does not exist")) {
        const fallback = await supabase
          .from("chat_messages")
          .select("id,sender_id,body,created_at")
          .eq("service_request_id", chatJobId)
          .order("created_at", { ascending: true });
        data = fallback.data?.map((message) => ({
          ...message,
          image_url: null,
        })) ?? null;
        queryError = fallback.error;
      }
      if (!active) return;
      if (queryError) setError(queryError.message);
      else {
        setChatMessages((data ?? []) as ChatMessage[]);
      }
      setChatLoading(false);
    }

    const channel = supabase
      .channel(`mechanic_chat_${chatJobId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `service_request_id=eq.${chatJobId}`,
        },
        (payload) => {
          const incoming = payload.new as ChatMessage;
          setChatMessages((messages) =>
            messages.some((message) => message.id === incoming.id)
              ? messages
              : [...messages, incoming],
          );
        },
      )
      .subscribe();

    void loadMessages();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [activeChatJobId, mechanicId]);

  useEffect(() => {
    const imageUrls = chatMessages
      .map((message) => message.image_url)
      .filter((url): url is string => Boolean(url));

    for (const url of imageUrls) {
      if (chatImageSizes[url] || chatImageSizeRequests.current.has(url)) {
        continue;
      }
      chatImageSizeRequests.current.add(url);
      Image.getSize(
        url,
        (width, height) => {
          if (width > 0 && height > 0) {
            setChatImageSizes((current) => ({
              ...current,
              [url]: { width, height },
            }));
          }
          chatImageSizeRequests.current.delete(url);
        },
        () => {
          chatImageSizeRequests.current.delete(url);
          const message = chatMessages.find((item) => item.image_url === url);
          if (message) void refreshChatImage(message.id, url);
        },
      );
    }
  }, [chatImageSizes, chatMessages]);

  async function refreshChatImage(messageId: string, imageUrl: string) {
    if (chatImageRefreshRequests.current.has(messageId)) return;
    chatImageRefreshRequests.current.add(messageId);
    try {
      const refreshedUrl = await refreshChatImageUrl(imageUrl);
      if (refreshedUrl === imageUrl) {
        setChatImageErrors((current) => ({ ...current, [imageUrl]: true }));
        return;
      }
      setChatImageErrors((current) => ({ ...current, [imageUrl]: false }));
      setChatMessages((messages) =>
        messages.map((message) =>
          message.id === messageId
            ? { ...message, image_url: refreshedUrl }
            : message,
        ),
      );
    } catch (imageError) {
      setChatImageErrors((current) => ({ ...current, [imageUrl]: true }));
      setError(
        imageError instanceof Error
          ? imageError.message
          : "Unable to reload this chat photo.",
      );
    } finally {
      chatImageRefreshRequests.current.delete(messageId);
    }
  }

  async function retryChatImage(messageId: string, imageUrl: string) {
    await refreshChatImage(messageId, imageUrl);
  }

  useEffect(() => {
    if (
      !selectedJob ||
      selectedJob.latitude === null ||
      selectedJob.longitude === null
    ) return;

    let active = true;
    const key = `${selectedJob.latitude},${selectedJob.longitude}`;
    void Location.reverseGeocodeAsync({
      latitude: selectedJob.latitude,
      longitude: selectedJob.longitude,
    })
      .then(([address]) => {
        if (!active) return;
        if (!address) {
          setCustomerAddress({ key, value: "Address unavailable" });
          return;
        }
        const formatted = [
          address.name,
          address.street,
          address.district,
          address.city,
          address.region,
          address.postalCode,
          address.country,
        ]
          .filter(Boolean)
          .filter((part, index, parts) => parts.indexOf(part) === index)
          .join(", ");
        setCustomerAddress({ key, value: formatted || "Address unavailable" });
      })
      .catch(() => {
        if (active) setCustomerAddress({ key, value: "Address unavailable" });
      });

    return () => {
      active = false;
    };
  }, [selectedJob]);

  async function sendMessage() {
    const body = chatText.trim();
    if (!body || !mechanicId || !chatJob || !isChatActiveStatus(chatJob.status)) return;
    setSendingMessage(true);
    let { data, error: insertError } = await supabase
      .from("chat_messages")
      .insert({
        service_request_id: chatJob.id,
        sender_id: mechanicId,
        recipient_id: chatJob.motorist_id,
        body,
      })
      .select("id,sender_id,body,image_url,created_at")
      .single();
    if (insertError?.message.includes("image_url does not exist")) {
      const fallback = await supabase
        .from("chat_messages")
        .insert({
          service_request_id: chatJob.id,
          sender_id: mechanicId,
          recipient_id: chatJob.motorist_id,
          body,
        })
        .select("id,sender_id,body,created_at")
        .single();
      data = fallback.data
        ? { ...fallback.data, image_url: null }
        : null;
      insertError = fallback.error;
    }
    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setChatMessages((messages) =>
        messages.some((message) => message.id === data.id)
          ? messages
          : [...messages, data as ChatMessage],
      );
      setChatText("");
    }
    setSendingMessage(false);
  }

  async function sendChatImage(asset: ImagePicker.ImagePickerAsset) {
    if (
      !mechanicId ||
      !chatJob ||
      !isChatActiveStatus(chatJob.status) ||
      chatUploadingImage
    ) return;
    setChatUploadingImage(true);
    try {
      const { body, contentType } = await imageAssetToBytes(asset);
      const path = `${mechanicId}/${chatJob.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(path, body, { contentType, upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      const { data: signedImage, error: signedError } = await supabase.storage
        .from("chat-media")
        .createSignedUrl(path, 60 * 60 * 24);
      if (signedError || !signedImage?.signedUrl) {
        throw new Error(signedError?.message || "Unable to prepare the image.");
      }
      const { data, error: sendError } = await supabase
        .from("chat_messages")
        .insert({
          service_request_id: chatJob.id,
          sender_id: mechanicId,
          recipient_id: chatJob.motorist_id,
          body: null,
          image_url: signedImage.signedUrl,
        })
        .select("id,sender_id,body,image_url,created_at")
        .single();
      if (sendError) throw new Error(sendError.message);
      if (data) {
        setChatMessages((messages) => [...messages, data as ChatMessage]);
      }
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : "Unable to send the image.");
    } finally {
      setChatUploadingImage(false);
    }
  }

  function chooseChatImage() {
    setChatPhotoPickerVisible(true);
  }

  async function selectChatPhotoSource(source: "camera" | "gallery") {
    setChatPhotoPickerVisible(false);
    try {
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ["images"],
              quality: 0.8,
              base64: true,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              quality: 0.8,
              base64: true,
            });
      if (!result.canceled && result.assets[0]) {
        await sendChatImage(result.assets[0]);
      }
    } catch (pickerError) {
      setError(
        pickerError instanceof Error
          ? pickerError.message
          : "Unable to open the photo picker.",
      );
    }
  }

  async function updateJobStatus(id: string, status: "in_transit" | "arrived" | "in_progress" | "completed") {
    if (!mechanicId || statusUpdatingJobId) return;
    const job = jobs.find((item) => item.id === id);
    const currentStatus = job?.status?.trim().toLowerCase();
    const allowedNextStatuses: Record<string, string[]> = {
      accepted: ["in_transit"],
      in_transit: ["arrived"],
      arrived: ["in_progress"],
      in_progress: ["completed"],
    };
    if (!currentStatus || !allowedNextStatuses[currentStatus]?.includes(status)) {
      setError("This booking must be accepted before its status can be advanced.");
      return;
    }

    setStatusUpdatingJobId(id);
    try {
      const updatePayload =
        status === "completed"
          ? { status, completed_at: new Date().toISOString() }
          : { status };
      const { data: updatedJob, error: updateError } = await supabase
        .from("service_requests")
        .update(updatePayload)
        .eq("id", id)
        .eq("mechanic_id", mechanicId)
        .eq("status", currentStatus)
        .select("id,status")
        .maybeSingle();
      if (updateError) {
        setError(updateError.message);
        return;
      }
      if (!updatedJob) {
        setError("This booking changed. Refresh the job list and try again.");
        return;
      }

      setJobs((currentJobs) =>
        currentJobs.map((item) =>
          item.id === id ? { ...item, status: updatedJob.status } : item,
        ),
      );
      if (status === "completed") {
        setSelectedJob(null);
        setLocalFilter("resolved");
        router.setParams({ filter: "resolved" });
      } else {
        setSelectedJob((currentJob) =>
          currentJob ? { ...currentJob, status: updatedJob.status } : currentJob,
        );
      }

      await loadJobs(true);
      if (status === "completed") {
        setLocalFilter("resolved");
        router.setParams({ filter: "resolved" });
      }
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Unable to update this booking status.",
      );
    } finally {
      setStatusUpdatingJobId(null);
    }
  }

  async function submitAdditionalCharge() {
    if (!chargeJob || !mechanicId || chargeSubmitting) return;
    const description = chargeDescription.trim();
    const amount = Number(chargeAmount);
    if (!description || !Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Invalid charge", "Enter a description and a valid amount.");
      return;
    }
    setChargeSubmitting(true);
    try {
      const charges = Array.isArray(chargeJob.additional_charges)
        ? chargeJob.additional_charges
        : [];
      const newCharge: AdditionalCharge = {
        id: `${Date.now()}`,
        description,
        amount,
        status: "pending",
      };
      const { data, error: updateError } = await supabase
        .from("service_requests")
        .update({ additional_charges: [...charges, newCharge] })
        .eq("id", chargeJob.id)
        .eq("mechanic_id", mechanicId)
        .select("id,additional_charges")
        .single();
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setSelectedJob((job) =>
        job && data
          ? { ...job, additional_charges: data.additional_charges as AdditionalCharge[] }
          : job,
      );
      setChargeJob(null);
      setChargeDescription("");
      setChargeAmount("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to send this repair charge for approval.",
      );
    } finally {
      setChargeSubmitting(false);
    }
  }

  function callCustomer(job: ServiceRequest) {
    if (!job.customer_contact || job.customer_contact === "Not provided") {
      setError("Customer contact number is not available.");
      return;
    }

    const phoneNumber = job.customer_contact.replace(/[^\d+]/g, "");
    void Linking.canOpenURL(`tel:${phoneNumber}`).then((canCall) => {
      if (!canCall) {
        setError("Calling is not available on this device.");
        return;
      }
      return Linking.openURL(`tel:${phoneNumber}`);
    }).catch(() => {
      setError("Unable to open the phone app.");
    });
  }

  function openCustomerLocation(job: ServiceRequest) {
    if (job.latitude === null || job.longitude === null) {
      setError("Customer location is not available.");
      return;
    }
    const coordinates = `${job.latitude},${job.longitude}`;
    setMapChoiceError(null);
    setMapChoice({
      googleMapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coordinates)}`,
      wazeUrl: `https://waze.com/ul?ll=${encodeURIComponent(coordinates)}&navigate=yes`,
    });
  }

  async function selectMapApp(url: string) {
    try {
      await Linking.openURL(url);
      setMapChoice(null);
      setMapChoiceError(null);
    } catch {
      setMapChoiceError("Unable to open that map app. Please try the other option.");
    }
  }

  async function cancelJob(job: ServiceRequest, reason: string) {
    if (!mechanicId || !reason.trim()) return;
    if (hasTripStarted(job.status)) {
      setPendingCancellationJob(null);
      setPendingCancellationReason("");
      setCannotCancelBookingVisible(true);
      return;
    }

    setRefreshing(true);
    const { data: cancelledJob, error: updateError } = await supabase
      .from("service_requests")
      .update({
        status: "cancelled",
        cancelled_by: "mechanic",
        cancellation_reason: reason.trim(),
      })
      .eq("id", job.id)
      .eq("mechanic_id", mechanicId)
      .in("status", ["pending", "scheduled", "accepted"])
      .select("id")
      .maybeSingle();

    if (updateError) {
      setError(updateError.message);
    } else if (!cancelledJob) {
      const { data: latestJob, error: latestJobError } = await supabase
        .from("service_requests")
        .select("status")
        .eq("id", job.id)
        .eq("mechanic_id", mechanicId)
        .maybeSingle();
      if (latestJobError) {
        setError(latestJobError.message);
      } else if (latestJob && hasTripStarted(latestJob.status)) {
        setPendingCancellationJob(null);
        setPendingCancellationReason("");
        setCannotCancelBookingVisible(true);
      } else {
        setError("This booking has changed. Refresh the job list and try again.");
      }
      await loadJobs(true);
    } else {
      setSelectedJob(null);
      setEnteringOtherReason(false);
      setOtherIssueReason("");
      setPendingCancellationJob(null);
      setPendingCancellationReason("");
      setCancelSuccessVisible(true);
      await loadJobs(true);
    }
    setRefreshing(false);
  }

  async function downloadReceipt(job: ServiceRequest) {
    if (downloadingReceipt) return;
    setDownloadingReceipt(true);
    try {
      const html = getReceiptHtml(job, mechanicServicePrices, mechanicName);
      if (Platform.OS === "web") {
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
          throw new Error(
            "Allow pop-ups in your browser to print the receipt.",
          );
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        printWindow.onafterprint = () => printWindow.close();
        printWindow.setTimeout(() => printWindow.print(), 250);
        return;
      }

      const permission = await requestPermissionsAsync(true, ["photo"]);
      if (permission.status !== "granted") {
        Alert.alert(
          "Gallery permission required",
          "Allow photo access to save the receipt image to your gallery.",
        );
        return;
      }

      const imageUri = await receiptCaptureRef.current?.capture();
      if (!imageUri) {
        throw new Error("The receipt image could not be created.");
      }
      await Asset.create(imageUri);
      Alert.alert("Receipt saved", "The receipt image is now in your gallery.");
    } catch (receiptError) {
      Alert.alert(
        "Receipt download failed",
        receiptError instanceof Error
          ? receiptError.message
          : "Please try again.",
      );
    } finally {
      setDownloadingReceipt(false);
    }
  }

  function openIssueReport(job: ServiceRequest) {
    if (hasTripStarted(job.status)) {
      setCannotCancelBookingVisible(true);
      return;
    }
    setIssueJob(job);
  }

  function selectIssue(reason: string) {
    if (!issueJob) return;
    setPendingCancellationJob(issueJob);
    setPendingCancellationReason(reason);
    setIssueJob(null);
  }

  function submitOtherIssue() {
    const reason = otherIssueReason.trim();
    if (!reason) {
      setError("Please explain the issue before cancelling the booking.");
      return;
    }
    if (!issueJob) return;
    setPendingCancellationJob(issueJob);
    setPendingCancellationReason(reason);
    setIssueJob(null);
  }

  const visibleJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          job.mechanic_id === mechanicId &&
          getJobStatus(job.status) === activeFilter,
      ),
    [activeFilter, jobs, mechanicId],
  );

  return (
    <MechanicScreen back title="Jobs" profileHeader>
      <FlatList
        data={visibleJobs}
        keyExtractor={(job) => job.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        ItemSeparatorComponent={() => <View style={styles.jobSeparator} />}
        ListHeaderComponent={
          <>
            <View style={styles.toolbar}>
              <View style={styles.filters}>
                {([
                  ["ongoing", "Ongoing"],
                  ["resolved", "Resolved"],
                  ["dropped", "Dropped"],
                ] as const).map(([value, label]) => (
                  <Pressable
                    key={value}
                    onPress={() => {
                      setLocalFilter(value);
                      router.setParams({ filter: value });
                    }}
                    style={[styles.filterButton, activeFilter === value && styles.filterButtonActive]}
                  >
                    <Text style={[styles.filterText, activeFilter === value && styles.filterTextActive]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={() => void loadJobs(true)} style={styles.refreshButton} disabled={refreshing}>
                <Ionicons name="refresh-outline" size={18} color={colors.amber} />
                <Text style={styles.refreshText}>{refreshing ? "Refreshing..." : "Refresh"}</Text>
              </Pressable>
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.amber} style={styles.loader} />
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="briefcase-outline" size={34} color={colors.textDim} />
              <Text style={styles.emptyText}>No {activeFilter} jobs yet.</Text>
              <Text style={styles.emptySubtext}>Jobs from customer service requests will appear here.</Text>
            </View>
          )
        }
        renderItem={({ item: job }) => {
          const isReadOnly = activeFilter !== "ongoing";
          const isRevoked = ["cancelled", "canceled", "revoked"].includes(
            job.status?.trim().toLowerCase() ?? "",
          );
          const terminalDate = job.created_at;
          const isEmergency = job.request_type === "emergency";
          const amount = getPayableTotal(job);
          const recordContent = (
            <>
              <View style={styles.bookingTopRow}>
                <View>
                  <Text style={styles.bookingReferenceLabel}>
                    BOOKING REFERENCE
                  </Text>
                  <Text style={styles.bookingReference}>
                    #{String(job.id).slice(0, 8).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.bookingAmount}>
                  <Text style={styles.bookingAmountValue}>
                    {isRevoked
                      ? "₱0.00"
                      : amount === null
                      ? "—"
                      : `₱${Number(amount).toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                        })}`}
                  </Text>
                  <Text style={styles.bookingAmountLabel}>Estimated</Text>
                </View>
              </View>
              <Text style={styles.bookingDate}>
                {formatSchedule(job.scheduled_at || terminalDate)}
              </Text>
              {!isRevoked ? (
                <>
                  <View style={styles.bookingCustomerRow}>
                    <Text style={styles.bookingCustomer} numberOfLines={1}>
                      {job.customer_name}
                    </Text>
                    {(unreadChatCounts[job.id] ?? 0) > 0 ? (
                      <View style={styles.newMessageBadge}>
                        <Ionicons
                          name="chatbubble"
                          size={12}
                          color={colors.white}
                        />
                        <Text style={styles.newMessageBadgeText}>
                          New message
                          {(unreadChatCounts[job.id] ?? 0) > 1
                            ? ` · ${unreadChatCounts[job.id]}`
                            : ""}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.bookingVehicle}>
                    {[job.vehicle_type, job.plate_number]
                      .filter(Boolean)
                      .join(" • ") || "Vehicle details unavailable"}
                  </Text>
                </>
              ) : null}
              <View style={styles.serviceStrip}>
                <Ionicons
                  name={isEmergency ? "warning-outline" : "location-outline"}
                  size={17}
                  color={isEmergency ? colors.sos : colors.blue}
                />
                <Text style={styles.serviceStripText} numberOfLines={2}>
                  {job.service_name ||
                    (isEmergency ? "Emergency roadside assistance" : job.vehicle_issue) ||
                    "Service details unavailable"}
                </Text>
              </View>
              {!isReadOnly ? (
                <View style={styles.compactCardFooter}>
                  <Text style={styles.compactHint}>Tap to view booking details</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.blue} />
                </View>
              ) : null}
            </>
          );

          return isReadOnly ? (
            <View
              style={[
                styles.card,
                job.request_type === "emergency"
                  ? styles.emergencyCard
                  : styles.scheduledCard,
                activeFilter === "resolved" && styles.resolvedStatusCard,
                activeFilter === "dropped" && styles.droppedStatusCard,
              ]}
            >
              {recordContent}
            </View>
          ) : (
            <Pressable
              style={[
                styles.card,
                styles.ongoingCard,
                job.request_type === "emergency"
                  ? styles.emergencyCard
                  : styles.scheduledCard,
                styles.ongoingStatusCard,
              ]}
              onPress={() => openJobDetails(job)}
            >
              {recordContent}
            </Pressable>
          );
        }}
      />
      <Modal
        visible={selectedJob !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSelectedJob(null)}
      >
        {selectedJob ? (
          <SafeAreaView style={styles.detailScreen} edges={["top", "bottom"]}>
            <View
              style={[
                styles.detailHeader,
                selectedJob.request_type?.trim().toLowerCase() === "emergency" &&
                  styles.detailEmergencyHeader,
                selectedJob.request_type?.trim().toLowerCase() === "scheduled" &&
                  styles.detailScheduledHeader,
              ]}
            >
              <Pressable
                onPress={() => setSelectedJob(null)}
                style={styles.backButton}
                accessibilityLabel="Close booking details"
              >
                <Ionicons name="arrow-back" size={24} color={colors.white} />
              </Pressable>
              <Text style={styles.detailHeaderTitle}>Ongoing booking</Text>
              <View style={styles.headerSpacer} />
            </View>
            <ScrollView
              contentContainerStyle={[
                styles.detailContent,
                ["scheduled", "emergency"].includes(
                  selectedJob.request_type?.trim().toLowerCase() ?? "",
                ) &&
                  styles.scheduledDetailContent,
              ]}
            >
              {["scheduled", "emergency"].includes(
                selectedJob.request_type?.trim().toLowerCase() ?? "",
              ) ? (
                <>
                  {selectedJob.latitude !== null &&
                  selectedJob.longitude !== null ? (
                    <MiniMapPreview
                      compact
                      mapHeight={Math.min(
                        270,
                        Math.max(190, Dimensions.get("window").height * 0.3),
                      )}
                      mechanicLocation={getMechanicCoordinatesForJob(selectedJob)}
                      customerLocation={{
                        latitude: selectedJob.latitude,
                        longitude: selectedJob.longitude,
                      }}
                      distanceLabel={formatTripDistance(
                        getMechanicCoordinatesForJob(selectedJob),
                        {
                          latitude: selectedJob.latitude,
                          longitude: selectedJob.longitude,
                        },
                      )}
                    />
                  ) : (
                    <Text style={styles.scheduledMapHint}>
                      Customer location is not available for this booking.
                    </Text>
                  )}
                  {locationTrackingError || scheduledLocationError ? (
                    <Text style={styles.scheduledMapHint}>
                      {locationTrackingError || scheduledLocationError}
                    </Text>
                  ) : null}
                  <Pressable
                    style={styles.scheduledAddress}
                    onPress={() => openCustomerLocation(selectedJob)}
                    disabled={
                      selectedJob.latitude === null ||
                      selectedJob.longitude === null
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Open customer address in a map app"
                  >
                    <Ionicons
                      name="location"
                      size={21}
                      color={
                        selectedJob.request_type?.trim().toLowerCase() ===
                        "emergency"
                          ? colors.sos
                          : colors.blue
                      }
                    />
                    <Text style={styles.scheduledAddressText} numberOfLines={2}>
                      {selectedJob.latitude !== null &&
                      selectedJob.longitude !== null
                        ? customerAddress?.key ===
                          `${selectedJob.latitude},${selectedJob.longitude}`
                          ? customerAddress.value
                          : "Tap to open directions"
                        : "Location not provided"}
                    </Text>
                    <Ionicons
                      name="open-outline"
                      size={18}
                      color={colors.textMuted}
                    />
                  </Pressable>
                  <View style={styles.scheduledBookingSummary}>
                    <View style={styles.scheduledBookingHeader}>
                      <View style={styles.scheduledBookingCustomer}>
                        <Text
                          style={[
                            styles.scheduledBookingEyebrow,
                            selectedJob.request_type?.trim().toLowerCase() ===
                              "emergency" && styles.emergencyBookingEyebrow,
                          ]}
                        >
                          {selectedJob.request_type?.trim().toLowerCase() ===
                          "emergency"
                            ? "EMERGENCY SOS"
                            : "SCHEDULED SERVICE"}
                        </Text>
                        <Text style={styles.scheduledCompactCustomer} numberOfLines={1}>
                          {selectedJob.customer_name}
                        </Text>
                      </View>
                      <View style={styles.scheduledDistanceBadge}>
                        <Ionicons
                          name="navigate-outline"
                          size={16}
                          color={colors.blue}
                        />
                        {selectedJob.latitude === null ||
                        selectedJob.longitude === null ||
                        scheduledLocationError ? (
                          <Text
                            style={styles.scheduledCompactDistance}
                            numberOfLines={1}
                          >
                            Distance unavailable
                          </Text>
                        ) : getMechanicCoordinatesForJob(selectedJob) ? (
                          <Text
                            style={styles.scheduledCompactDistance}
                            numberOfLines={1}
                          >
                            {formatDistanceAway(
                              getMechanicCoordinatesForJob(selectedJob),
                              {
                                latitude: selectedJob.latitude,
                                longitude: selectedJob.longitude,
                              },
                            )}
                          </Text>
                        ) : (
                          <ActivityIndicator
                            size="small"
                            color={colors.blue}
                            accessibilityLabel="Loading distance"
                          />
                        )}
                      </View>
                    </View>
                    <View style={styles.scheduledReferenceRow}>
                      <Text style={styles.scheduledReference}>
                        #{String(selectedJob.id).slice(0, 8).toUpperCase()}
                      </Text>
                      <Text style={styles.scheduledAmount}>
                        ₱{getPayableTotal(selectedJob).toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                        })}
                      </Text>
                    </View>
                    <View style={styles.scheduledDetailsCard}>
                      <View style={styles.scheduledDetailLine}>
                        <Ionicons
                          name="calendar-outline"
                          size={20}
                          color={
                            selectedJob.request_type?.trim().toLowerCase() ===
                            "emergency"
                              ? colors.sos
                              : colors.blue
                          }
                        />
                        <Text style={styles.scheduledDetailTextValue}>
                          {formatSchedule(
                            selectedJob.scheduled_at || selectedJob.created_at,
                          )}
                        </Text>
                      </View>
                      <View style={styles.scheduledDetailLine}>
                        <Ionicons
                          name="car-outline"
                          size={20}
                          color={
                            selectedJob.request_type?.trim().toLowerCase() ===
                            "emergency"
                              ? colors.sos
                              : colors.blue
                          }
                        />
                        <Text style={styles.scheduledDetailTextValue}>
                          {[selectedJob.vehicle_type, selectedJob.plate_number]
                            .filter(Boolean)
                            .join(" · ") || "Vehicle not provided"}
                        </Text>
                      </View>
                      <View style={styles.scheduledServiceDetail}>
                        <Text style={styles.scheduledDetailTextValue}>
                          {selectedJob.service_name ||
                            selectedJob.vehicle_issue ||
                            "No issue description provided."}
                        </Text>
                      </View>
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.detailType}>EMERGENCY</Text>
                  <View style={styles.detailBookingTopRow}>
                    <View>
                      <Text style={styles.detailReferenceLabel}>
                        BOOKING REFERENCE
                      </Text>
                      <Text style={styles.detailReference}>
                        #{String(selectedJob.id).slice(0, 8).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.detailAmount}>
                      <Text style={styles.detailAmountValue}>
                        ₱{getPayableTotal(selectedJob).toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                        })}
                      </Text>
                      <Text style={styles.detailAmountLabel}>Estimated</Text>
                    </View>
                  </View>
                  <Text style={styles.detailCustomer}>
                    {selectedJob.customer_name}
                  </Text>
                </>
              )}
              <View style={styles.receiptCard}>
                <ViewShot
                  ref={receiptCaptureRef}
                  options={{
                    format: "png",
                    fileName: `mechaniko-receipt-${selectedJob.id.slice(0, 8)}`,
                  }}
                  style={styles.receiptImage}
                >
                <View style={styles.receiptHeader}>
                  <View>
                    <Text style={styles.receiptEyebrow}>BOOKING REFERENCE</Text>
                    <Text style={styles.receiptTitle}>
                      #{selectedJob.id.slice(0, 8).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.receiptHeaderActionSpace} />
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Mechanic</Text>
                  <Text style={styles.receiptValue}>{mechanicName}</Text>
                </View>
                {getReceiptServiceBreakdown(
                  selectedJob,
                  mechanicServicePrices,
                ).map((item, index) => (
                  <View
                    key={`${item.service}-${index}`}
                    style={styles.receiptRow}
                  >
                    <Text style={styles.receiptLabel}>{item.service}</Text>
                    <Text style={styles.receiptValue}>
                      ₱{item.price.toFixed(2)}
                    </Text>
                  </View>
                ))}
                {Number(selectedJob.delivery_fee ?? 0) > 0 ? (
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Distance fee</Text>
                    <Text style={styles.receiptValue}>
                      ₱{Number(selectedJob.delivery_fee).toFixed(2)}
                    </Text>
                  </View>
                ) : null}
                {(selectedJob.additional_charges ?? []).map((charge) => (
                  <View key={charge.id} style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>{charge.description}</Text>
                    <Text style={[styles.receiptValue, charge.status === "pending" && styles.pendingCharge]}>
                      {charge.status === "rejected" ? "Declined" : `₱${Number(charge.amount).toFixed(2)}`}
                    </Text>
                  </View>
                ))}
                <View style={styles.receiptTotalRow}>
                  <Text style={styles.receiptTotalLabel}>Total</Text>
                  <Text style={styles.receiptTotal}>
                    ₱{getPayableTotal(selectedJob).toFixed(2)}
                  </Text>
                </View>
                </ViewShot>
                <Pressable
                  accessibilityLabel="Save receipt to gallery"
                  accessibilityRole="button"
                  disabled={downloadingReceipt}
                  onPress={() => void downloadReceipt(selectedJob)}
                  style={styles.receiptDownloadButton}
                >
                  {downloadingReceipt ? (
                    <ActivityIndicator size="small" color={colors.blue} />
                  ) : (
                    <Image
                      source={require("../../assets/images/downloads.png")}
                      style={styles.receiptDownloadIcon}
                      resizeMode="contain"
                    />
                  )}
                </Pressable>
                {selectedJob.status?.toLowerCase() !== "completed" &&
                selectedJob.status?.toLowerCase() !== "cancelled" ? (
                  <Pressable
                    style={styles.addChargeButton}
                    onPress={() => {
                      setChargeDescription("");
                      setChargeAmount("");
                      setChargeJob(selectedJob);
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={18} color={colors.blue} />
                    <Text style={styles.addChargeText}>Add repair charge for approval</Text>
                  </Pressable>
                ) : null}
              </View>
            </ScrollView>
            <View style={styles.detailActions}>
              <View style={styles.chatSupportSection}>
                <View style={styles.chatSupportRow}>
                  <Pressable
                    style={styles.chatButton}
                    onPress={() => void openCustomerChat(selectedJob)}
                  >
                    <Ionicons name="chatbubble-outline" size={19} color={colors.blue} />
                    <Text style={styles.chatText}>
                      {(unreadChatCounts[selectedJob.id] ?? 0) > 0
                        ? "New message"
                        : "Chat customer"}
                    </Text>
                    {(unreadChatCounts[selectedJob.id] ?? 0) > 0 ? (
                      <View style={styles.chatUnreadCount}>
                        <Text style={styles.chatUnreadCountText}>
                          {unreadChatCounts[selectedJob.id]}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                  <Pressable
                    style={styles.supportIconButton}
                    onPress={() => callCustomer(selectedJob)}
                    accessibilityLabel="Call customer"
                  >
                    <Image
                      source={require("../../assets/images/call.png")}
                      style={styles.headerActionImage}
                    />
                  </Pressable>
                  <Pressable
                    style={styles.supportIconButton}
                    onPress={() => openIssueReport(selectedJob)}
                    accessibilityLabel="Report issue or request cancellation"
                  >
                    <Image
                      source={require("../../assets/images/issue.png")}
                      style={styles.headerActionImage}
                    />
                  </Pressable>
                </View>
              </View>
              {selectedJob.status?.toLowerCase() === "arrived" ? (
                <Pressable
                  style={styles.completeButton}
                  onPress={() => void updateJobStatus(selectedJob.id, "in_progress")}
                  disabled={statusUpdatingJobId !== null || refreshing}
                >
                  <View style={styles.statusButtonContent}>
                    {statusUpdatingJobId === selectedJob.id ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : null}
                    <Text style={styles.completeText}>
                      {statusUpdatingJobId === selectedJob.id
                        ? "Updating status"
                        : "Start service"}
                    </Text>
                  </View>
                </Pressable>
              ) : selectedJob.status?.toLowerCase() === "in_progress" ? (
                <Pressable
                  style={styles.completeButton}
                  onPress={() => void updateJobStatus(selectedJob.id, "completed")}
                  disabled={statusUpdatingJobId !== null || refreshing}
                >
                  <View style={styles.statusButtonContent}>
                    {statusUpdatingJobId === selectedJob.id ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : null}
                    <Text style={styles.completeText}>
                      {statusUpdatingJobId === selectedJob.id
                        ? "Updating status"
                        : "Complete booking"}
                    </Text>
                  </View>
                </Pressable>
              ) : selectedJob.status?.toLowerCase() === "accepted" ? (
                <Pressable
                  style={styles.arrivedButton}
                  onPress={() => void updateJobStatus(selectedJob.id, "in_transit")}
                  disabled={statusUpdatingJobId !== null || refreshing}
                >
                  <View style={styles.statusButtonContent}>
                    {statusUpdatingJobId === selectedJob.id ? (
                      <ActivityIndicator size="small" color={colors.blue} />
                    ) : null}
                    <Text style={styles.arrivedText}>
                      {statusUpdatingJobId === selectedJob.id
                        ? "Updating status"
                        : "Start trip"}
                    </Text>
                  </View>
                </Pressable>
              ) : selectedJob.status?.toLowerCase() === "in_transit" ? (
                <Pressable
                  style={styles.arrivedButton}
                  onPress={() => void updateJobStatus(selectedJob.id, "arrived")}
                  disabled={statusUpdatingJobId !== null || refreshing}
                >
                  <View style={styles.statusButtonContent}>
                    {statusUpdatingJobId === selectedJob.id ? (
                      <ActivityIndicator size="small" color={colors.blue} />
                    ) : null}
                    <Text style={styles.arrivedText}>
                      {statusUpdatingJobId === selectedJob.id
                        ? "Updating status"
                        : "Arrived at pickup"}
                    </Text>
                  </View>
                </Pressable>
              ) : ["pending", "scheduled"].includes(
                  selectedJob.status?.toLowerCase() ?? "",
                ) ? (
                <Text style={styles.arrivedText}>
                  Waiting for mechanic acceptance
                </Text>
              ) : (
                <Text style={styles.arrivedText}>
                  This booking cannot be advanced from its current status.
                </Text>
              )}
            </View>
          </SafeAreaView>
        ) : null}
      </Modal>
      <Modal
        visible={mapChoice !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setMapChoice(null);
          setMapChoiceError(null);
        }}
      >
        <View style={styles.mapChoiceOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setMapChoice(null);
              setMapChoiceError(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Close map app selection"
          />
          <View style={styles.mapChoiceCard}>
            <View style={styles.mapChoiceHeading}>
              <View style={styles.mapChoiceIcon}>
                <Ionicons name="navigate" size={21} color={colors.blue} />
              </View>
              <View style={styles.mapChoiceHeadingText}>
                <Text style={styles.mapChoiceTitle}>Open directions</Text>
                <Text style={styles.mapChoiceSubtitle}>
                  Choose your preferred maps app
                </Text>
              </View>
            </View>
            {selectedJob &&
            selectedJob.latitude !== null &&
            selectedJob.longitude !== null ? (
              <Text style={styles.mapChoiceAddress} numberOfLines={2}>
                {customerAddress?.key ===
                `${selectedJob.latitude},${selectedJob.longitude}`
                  ? customerAddress.value
                  : "Customer address"}
              </Text>
            ) : null}
            {mapChoiceError ? (
              <Text style={styles.mapChoiceError}>{mapChoiceError}</Text>
            ) : null}
            <Pressable
              style={styles.mapChoiceOption}
              onPress={() => {
                if (mapChoice) void selectMapApp(mapChoice.googleMapsUrl);
              }}
              accessibilityRole="button"
            >
              <Image
                source={require("../../assets/images/googlemap.png")}
                style={styles.mapChoiceOptionIcon}
                resizeMode="contain"
                accessibilityLabel="Google Maps"
              />
              <View style={styles.mapChoiceOptionText}>
                <Text style={styles.mapChoiceOptionTitle}>Google Maps</Text>
                <Text style={styles.mapChoiceOptionHint}>
                  Open turn-by-turn directions
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={19}
                color={colors.textMuted}
              />
            </Pressable>
            <Pressable
              style={styles.mapChoiceOption}
              onPress={() => {
                if (mapChoice) void selectMapApp(mapChoice.wazeUrl);
              }}
              accessibilityRole="button"
            >
              <Image
                source={require("../../assets/images/waze.webp")}
                style={styles.mapChoiceOptionIcon}
                resizeMode="contain"
                accessibilityLabel="Waze"
              />
              <View style={styles.mapChoiceOptionText}>
                <Text style={styles.mapChoiceOptionTitle}>Waze</Text>
                <Text style={styles.mapChoiceOptionHint}>
                  Open live navigation
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={19}
                color={colors.textMuted}
              />
            </Pressable>
            <Pressable
              style={styles.mapChoiceCancel}
              onPress={() => {
                setMapChoice(null);
                setMapChoiceError(null);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.mapChoiceCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={chargeJob !== null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!chargeSubmitting) setChargeJob(null);
        }}
      >
        <KeyboardAvoidingView
          style={styles.chargeModalKeyboard}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.chargeModalOverlay}>
            <View
              style={[
                styles.chargeModalSheet,
                { paddingBottom: Math.max(insets.bottom, spacing.md) },
              ]}
            >
              <View style={styles.chargeModalHandle} />
              <View style={styles.chargeModalHeader}>
                <View style={styles.chargeModalIcon}>
                  <Ionicons name="construct-outline" size={23} color={colors.blue} />
                </View>
                <View style={styles.chargeModalHeading}>
                  <Text style={styles.chargeModalTitle}>Add repair charge</Text>
                  <Text style={styles.chargeModalSubtitle}>
                    Request approval for extra work
                  </Text>
                </View>
                <Pressable
                  style={styles.chargeModalClose}
                  onPress={() => {
                    if (!chargeSubmitting) setChargeJob(null);
                  }}
                  disabled={chargeSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Close add repair charge"
                >
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </Pressable>
              </View>

              {chargeJob ? (
                <View style={styles.chargeBookingSummary}>
                  <Ionicons name="receipt-outline" size={17} color={colors.textMuted} />
                  <Text style={styles.chargeBookingSummaryText} numberOfLines={1}>
                    Booking #{String(chargeJob.id).slice(0, 8).toUpperCase()}
                  </Text>
                  <Text style={styles.chargeBookingAmount}>
                    ₱{getPayableTotal(chargeJob).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.chargeModalHint}>
                The customer will review this request. It only affects the payable
                total after they approve it.
              </Text>

              <Text style={styles.chargeFieldLabel}>REPAIR OR PARTS NEEDED</Text>
              <TextInput
                value={chargeDescription}
                onChangeText={setChargeDescription}
                placeholder="e.g. Replacement battery"
                placeholderTextColor={colors.textDim}
                style={styles.chargeDescriptionInput}
                multiline
                maxLength={180}
                textAlignVertical="top"
                returnKeyType="done"
              />
              <Text style={styles.chargeCharacterCount}>
                {chargeDescription.length}/180
              </Text>

              <Text style={styles.chargeFieldLabel}>ADDITIONAL AMOUNT</Text>
              <View style={styles.chargeAmountInput}>
                <Text style={styles.chargeCurrency}>₱</Text>
                <TextInput
                  value={chargeAmount}
                  onChangeText={setChargeAmount}
                  placeholder="0.00"
                  placeholderTextColor={colors.textDim}
                  keyboardType="decimal-pad"
                  style={styles.chargeAmountTextInput}
                  accessibilityLabel="Additional charge amount in pesos"
                />
              </View>

              <View style={styles.chargeModalActions}>
                <Pressable
                  style={styles.chargeCancelButton}
                  onPress={() => setChargeJob(null)}
                  disabled={chargeSubmitting}
                >
                  <Text style={styles.chargeCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.chargeSubmitButton,
                    chargeSubmitting && styles.chargeSubmitButtonDisabled,
                  ]}
                  onPress={() => void submitAdditionalCharge()}
                  disabled={chargeSubmitting}
                >
                  {chargeSubmitting ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Ionicons name="paper-plane-outline" size={17} color={colors.white} />
                  )}
                  <Text style={styles.chargeSubmitText}>
                    {chargeSubmitting ? "Sending..." : "Send for approval"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        visible={issueJob !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setIssueJob(null)}
      >
        <KeyboardAvoidingView
          style={styles.issueModalKeyboard}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.issueModalOverlay}>
            <View style={styles.issueModalCard}>
              <ScrollView
                style={styles.issueModalContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.actionModalHandle} />
                <View style={styles.actionModalHeader}>
                  <View style={styles.issueModalIcon}>
                    <Ionicons
                      name={enteringOtherReason ? "create-outline" : "flag-outline"}
                      size={23}
                      color={colors.sos}
                    />
                  </View>
                  <View style={styles.actionModalHeading}>
                    <Text style={styles.issueModalTitle}>
                      {enteringOtherReason ? "Describe the issue" : "Report a booking issue"}
                    </Text>
                    <Text style={styles.actionModalSubtitle}>
                      {enteringOtherReason
                        ? "Add a short explanation for the customer"
                        : "Choose the reason you need to cancel"}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.actionModalClose}
                    onPress={() => {
                      setIssueJob(null);
                      setEnteringOtherReason(false);
                      setOtherIssueReason("");
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Close issue report"
                  >
                    <Ionicons name="close" size={21} color={colors.textMuted} />
                  </Pressable>
                </View>
                <Text style={styles.issueModalHint}>
                  {enteringOtherReason
                    ? "This will be shared with the customer when you confirm cancellation."
                    : "Select the reason so the customer understands the concern."}
                </Text>
                {enteringOtherReason ? (
                  <>
                    <TextInput
                      value={otherIssueReason}
                      onChangeText={setOtherIssueReason}
                      placeholder="Enter reason"
                      placeholderTextColor={colors.textDim}
                      style={styles.otherIssueInput}
                      multiline
                      maxLength={250}
                      textAlignVertical="top"
                      autoFocus
                    />
                    <Text style={styles.issueCharacterCount}>
                      {otherIssueReason.length}/250
                    </Text>
                  </>
                ) : (
                  <View style={styles.issueOptions}>
                    {issueOptions.map((reason) => (
                      <Pressable
                        key={reason}
                        style={styles.issueOption}
                        onPress={() => selectIssue(reason)}
                        accessibilityRole="button"
                      >
                        <Text style={styles.issueOptionText}>{reason}</Text>
                        <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
                      </Pressable>
                    ))}
                  </View>
                )}
              </ScrollView>
              <View style={styles.issueModalActions}>
                <Pressable
                  style={styles.issueCancelButton}
                  onPress={() => {
                    if (enteringOtherReason) {
                      setEnteringOtherReason(false);
                      setOtherIssueReason("");
                    } else {
                      setIssueJob(null);
                    }
                  }}
                >
                  <Text style={styles.issueCancelText}>
                    {enteringOtherReason ? "Back" : "Close"}
                  </Text>
                </Pressable>
                {enteringOtherReason ? (
                  <Pressable
                    style={[
                      styles.submitIssueButton,
                      !otherIssueReason.trim() && styles.actionButtonDisabled,
                    ]}
                    onPress={submitOtherIssue}
                    disabled={!otherIssueReason.trim()}
                  >
                    <Text style={styles.submitIssueText}>Continue</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        visible={pendingCancellationJob !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPendingCancellationJob(null);
          setPendingCancellationReason("");
        }}
      >
        <View style={styles.issueModalOverlay}>
          <View style={styles.cancelConfirmCard}>
            <View style={styles.cancelConfirmHeader}>
              <Text style={styles.cancelConfirmTitle}>Cancel Booking?</Text>
              <Pressable
                style={styles.cancelConfirmClose}
                onPress={() => {
                  setPendingCancellationJob(null);
                  setPendingCancellationReason("");
                }}
                disabled={refreshing}
                accessibilityRole="button"
                accessibilityLabel="Close cancellation confirmation"
              >
                <Ionicons name="close" size={18} color={colors.white} />
              </Pressable>
            </View>
            <View style={styles.cancelConfirmBody}>
              <Text style={styles.cancelConfirmMessage}>
                Are you sure you want to cancel the booking?
              </Text>
            </View>
            <View style={styles.cancelConfirmActions}>
              <Pressable
                style={styles.keepBookingButton}
                onPress={() => {
                  setPendingCancellationJob(null);
                  setPendingCancellationReason("");
                }}
                disabled={refreshing}
              >
                <Text style={styles.keepBookingText}>No, Don&apos;t Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.confirmCancellationButton,
                  pendingCancellationJob?.request_type?.trim().toLowerCase() ===
                    "emergency" &&
                    styles.confirmEmergencyCancellationButton,
                ]}
                onPress={() => {
                  if (pendingCancellationJob) {
                    void cancelJob(
                      pendingCancellationJob,
                      pendingCancellationReason,
                    );
                  }
                }}
                disabled={refreshing}
              >
                {refreshing ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : null}
                <Text style={styles.confirmCancellationText}>
                  {refreshing ? "Cancelling..." : "Yes, Cancel"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={cannotCancelBookingVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCannotCancelBookingVisible(false)}
      >
        <View style={styles.issueModalOverlay}>
          <View style={styles.cannotCancelCard}>
            <View style={styles.cannotCancelHeader}>
              <Text style={styles.cannotCancelTitle}>
                Unable to Cancel Booking
              </Text>
              <Pressable
                style={styles.cannotCancelClose}
                onPress={() => setCannotCancelBookingVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close message"
              >
                <Ionicons name="close" size={18} color={colors.white} />
              </Pressable>
            </View>
            <View style={styles.cannotCancelBody}>
              <Text style={styles.cannotCancelMessage}>
                You have already started the trip, so this booking can no
                longer be cancelled.
              </Text>
            </View>
            <View style={styles.cannotCancelActions}>
              <Pressable
                style={styles.cannotCancelButton}
                onPress={() => setCannotCancelBookingVisible(false)}
                accessibilityRole="button"
              >
                <Text style={styles.cannotCancelButtonText}>Understood</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={cancelSuccessVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelSuccessVisible(false)}
      >
        <View style={styles.issueModalOverlay}>
          <View style={styles.cancelSuccessCard}>
            <View style={styles.cancelSuccessIcon}>
              <Ionicons name="checkmark" size={30} color={colors.white} />
            </View>
            <Text style={styles.cancelSuccessTitle}>Booking cancelled</Text>
            <Text style={styles.cancelSuccessMessage}>
              The motorist has been notified that this booking was cancelled.
            </Text>
            <Pressable
              style={styles.cancelSuccessButton}
              onPress={() => setCancelSuccessVisible(false)}
            >
              <Text style={styles.submitIssueText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={chatJob !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setChatJob(null)}
      >
        {chatJob ? (
          <SafeAreaView style={styles.chatScreen} edges={["top", "bottom"]}>
            <View style={styles.chatHeader}>
              <Pressable
                onPress={() => setChatJob(null)}
                style={styles.chatBackButton}
                accessibilityRole="button"
                accessibilityLabel="Close customer chat"
              >
                <Ionicons name="arrow-back" size={22} color={colors.white} />
              </Pressable>
              <View style={styles.chatAvatar}>
                {chatJob.customer_avatar_url ? (
                  <ProfileAvatar
                    uri={chatJob.customer_avatar_url}
                    size={38}
                    backgroundColor="rgba(255,255,255,0.2)"
                  />
                ) : (
                  <Text style={styles.chatAvatarText}>
                    {chatJob.customer_name.trim().charAt(0).toUpperCase() || "C"}
                  </Text>
                )}
              </View>
              <View style={styles.chatHeaderText}>
                <Text style={styles.chatTitle} numberOfLines={1}>
                  {chatJob.customer_name}
                </Text>
              </View>
              <View style={styles.chatHeaderSpacer} />
            </View>
            <View style={styles.chatBookingBar}>
              <View style={styles.chatBookingIcon}>
                <Ionicons name="briefcase-outline" size={16} color={colors.blue} />
              </View>
              <View style={styles.chatBookingText}>
                <Text style={styles.chatBookingReference}>
                  #{String(chatJob.id).slice(0, 8).toUpperCase()}
                </Text>
              </View>
            </View>
            <KeyboardAvoidingView
              style={styles.chatKeyboardArea}
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
            >
              <FlatList
                key={chatJob.id}
                ref={chatListRef}
                data={chatMessages}
                keyExtractor={(message) => message.id}
                contentContainerStyle={styles.chatMessages}
                keyboardShouldPersistTaps="handled"
                scrollEventThrottle={16}
                onScroll={({ nativeEvent }) => {
                  const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
                  const distanceFromEnd =
                    contentSize.height -
                    layoutMeasurement.height -
                    contentOffset.y;
                  chatShouldScrollToEndRef.current = distanceFromEnd < 80;
                }}
                onContentSizeChange={() => {
                  if (
                    !chatHasInitiallyScrolledRef.current ||
                    chatShouldScrollToEndRef.current
                  ) {
                    chatListRef.current?.scrollToEnd({
                      animated: chatHasInitiallyScrolledRef.current,
                    });
                    chatHasInitiallyScrolledRef.current = true;
                  }
                }}
                ListEmptyComponent={
                  chatLoading ? (
                  <View style={styles.chatLoadingState}>
                    <ActivityIndicator color={colors.blue} />
                    <Text style={styles.chatLoadingText}>Loading messages...</Text>
                  </View>
                  ) : (
                  <View style={styles.chatEmptyState}>
                    <View style={styles.chatEmptyIcon}>
                      <Ionicons
                        name={
                          isChatActiveStatus(chatJob.status)
                            ? "chatbubbles-outline"
                            : "chatbubble-ellipses-outline"
                        }
                        size={28}
                        color={colors.blue}
                      />
                    </View>
                    <Text style={styles.chatEmptyTitle}>
                      {isChatActiveStatus(chatJob.status)
                        ? "Start the conversation"
                        : "No messages yet"}
                    </Text>
                    <Text style={styles.chatEmptyDescription}>
                      {isChatActiveStatus(chatJob.status)
                        ? "Coordinate with the customer about this booking here."
                        : "There are no messages recorded for this booking."}
                    </Text>
                  </View>
                  )
                }
                renderItem={({ item: message, index }) => {
                  return (
                    <View key={message.id}>
                      {startsNewChatDate(chatMessages, index) ? (
                        <View style={styles.chatDateSeparatorWrap}>
                          <Text style={styles.chatDateSeparator}>
                            {formatChatDate(message.created_at)}
                          </Text>
                        </View>
                      ) : null}
                      <View
                        style={[
                          styles.chatMessageRow,
                          message.sender_id === mechanicId &&
                            styles.chatMessageRowMine,
                        ]}
                      >
                        {message.image_url ? (
                          <View style={styles.chatImageMessage}>
                            {chatImageErrors[message.image_url] ? (
                              <Pressable
                                style={styles.chatImageError}
                                onPress={() =>
                                  void retryChatImage(message.id, message.image_url!)
                                }
                                accessibilityRole="button"
                                accessibilityLabel="Retry loading photo"
                              >
                                <Ionicons
                                  name="reload-circle-outline"
                                  size={22}
                                  color={colors.blue}
                                />
                                <Text style={styles.chatImageErrorText}>
                                  Photo unavailable · Tap to retry
                                </Text>
                              </Pressable>
                            ) : !chatImageSizes[message.image_url] ? (
                              <View style={styles.chatImageLoadingPlaceholder}>
                                <ActivityIndicator
                                  size="small"
                                  color={colors.blue}
                                />
                              </View>
                            ) : null}
                            {!chatImageErrors[message.image_url] ? (
                            <Pressable
                              onPress={() =>
                                setViewingChatImage(message.image_url ?? null)
                              }
                              accessibilityRole="button"
                              accessibilityLabel="View image"
                              style={[
                                styles.chatImagePreview,
                                chatImageSizes[message.image_url]
                                  ? getChatImageDisplaySize(
                                      chatImageSizes[message.image_url].width,
                                      chatImageSizes[message.image_url].height,
                                    )
                                  : styles.chatImagePreviewLoading,
                              ]}
                            >
                              <Image
                                source={{ uri: message.image_url }}
                                style={[
                                  styles.chatMessageImage,
                                  chatImageSizes[message.image_url]
                                    ? getChatImageDisplaySize(
                                        chatImageSizes[message.image_url].width,
                                        chatImageSizes[message.image_url].height,
                                      )
                                    : styles.chatMessageImageLoading,
                                ]}
                                resizeMode="contain"
                                onError={() =>
                                  void refreshChatImage(
                                    message.id,
                                    message.image_url!,
                                  )
                                }
                              />
                            </Pressable>
                            ) : null}
                            {message.body ? (
                              <View
                                style={[
                                  styles.messageBubble,
                                  message.sender_id === mechanicId &&
                                    styles.myMessageBubble,
                                ]}
                              >
                                <Text style={styles.messageBody}>{message.body}</Text>
                              </View>
                            ) : null}
                            <View
                              style={[
                                styles.messageMeta,
                                styles.chatImageMessageMeta,
                                message.sender_id === mechanicId &&
                                  styles.chatImageMessageMetaMine,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.messageTime,
                                  message.sender_id === mechanicId &&
                                    styles.myMessageTime,
                                ]}
                              >
                                {new Date(message.created_at).toLocaleTimeString([], {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </Text>
                              {message.sender_id === mechanicId ? (
                                <Ionicons
                                  name="checkmark-done"
                                  size={14}
                                  color={colors.blue}
                                />
                              ) : null}
                            </View>
                          </View>
                        ) : (
                          <View
                            style={[
                              styles.chatTextMessage,
                              message.sender_id === mechanicId &&
                                styles.chatTextMessageMine,
                            ]}
                          >
                            <View
                              style={[
                                styles.messageBubble,
                                message.sender_id === mechanicId &&
                                  styles.myMessageBubble,
                              ]}
                            >
                              {message.body ? (
                                <Text style={styles.messageBody}>{message.body}</Text>
                              ) : null}
                            </View>
                            <View style={styles.messageMeta}>
                              <Text
                                style={[
                                  styles.messageTime,
                                  message.sender_id === mechanicId &&
                                    styles.myMessageTime,
                                ]}
                              >
                                {new Date(message.created_at).toLocaleTimeString([], {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </Text>
                              {message.sender_id === mechanicId ? (
                                <Ionicons
                                  name="checkmark-done"
                                  size={14}
                                  color={colors.blue}
                                />
                              ) : null}
                            </View>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                }}
              />
              {isChatActiveStatus(chatJob.status) ? <View style={styles.chatComposer}>
                <View style={styles.chatComposerInner}>
                  <TextInput
                    value={chatText}
                    onChangeText={setChatText}
                    placeholder="Message the customer..."
                    placeholderTextColor={colors.textDim}
                    style={styles.chatInput}
                    multiline
                    accessibilityLabel="Message the customer"
                  />
                  <Pressable
                    style={styles.chatAttachButton}
                    onPress={chooseChatImage}
                    disabled={sendingMessage || chatUploadingImage}
                    accessibilityRole="button"
                    accessibilityLabel="Send photo"
                  >
                    {chatUploadingImage ? (
                      <ActivityIndicator size="small" color={colors.blue} />
                    ) : (
                      <Ionicons name="image-outline" size={21} color={colors.blue} />
                    )}
                  </Pressable>
                  <Pressable
                    style={[
                      styles.sendButton,
                      (sendingMessage ||
                        chatUploadingImage ||
                        !chatText.trim()) &&
                        styles.sendButtonDisabled,
                    ]}
                    onPress={() => void sendMessage()}
                    disabled={
                      sendingMessage || chatUploadingImage || !chatText.trim()
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Send message"
                  >
                    {sendingMessage ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Ionicons name="send" size={18} color={colors.white} />
                    )}
                  </Pressable>
                </View>
              </View> : null}
            </KeyboardAvoidingView>
          </SafeAreaView>
        ) : null}
      </Modal>
      <Modal
        visible={viewingChatImage !== null}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={() => setViewingChatImage(null)}
      >
        <View style={styles.chatImageViewer}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setViewingChatImage(null)}
            accessibilityRole="button"
            accessibilityLabel="Close image viewer"
          />
          {viewingChatImage ? (
            <Image
              source={{ uri: viewingChatImage }}
              style={styles.chatImageViewerImage}
              resizeMode="contain"
              accessibilityLabel="Expanded chat image"
            />
          ) : null}
          <Pressable
            style={[
              styles.chatImageViewerClose,
              { top: insets.top + spacing.md },
            ]}
            onPress={() => setViewingChatImage(null)}
            accessibilityRole="button"
            accessibilityLabel="Close image"
          >
            <Ionicons name="close" size={25} color={colors.white} />
          </Pressable>
        </View>
      </Modal>
      <Modal
        visible={chatPhotoPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setChatPhotoPickerVisible(false)}
      >
        <View style={styles.photoPickerOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setChatPhotoPickerVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close photo options"
          />
          <View
            style={[
              styles.photoPickerSheet,
              { paddingBottom: Math.max(insets.bottom, spacing.md) },
            ]}
          >
            <View style={styles.photoPickerHandle} />
            <View style={styles.photoPickerHeader}>
              <View style={styles.photoPickerHeaderText}>
                <Text style={styles.photoPickerTitle}>Send a photo</Text>
                <Text style={styles.photoPickerSubtitle}>
                  Choose how you want to add an image
                </Text>
              </View>
              <Pressable
                style={styles.photoPickerClose}
                onPress={() => setChatPhotoPickerVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close photo options"
              >
                <Ionicons name="close" size={21} color={colors.textMuted} />
              </Pressable>
            </View>
            <View style={styles.photoPickerOptions}>
              <Pressable
                style={styles.photoPickerOption}
                onPress={() => void selectChatPhotoSource("camera")}
                accessibilityRole="button"
              >
                <Image
                  source={require("../../assets/images/camera.png")}
                  style={styles.photoPickerOptionImage}
                  resizeMode="contain"
                />
                <View style={styles.photoPickerOptionCopy}>
                  <Text style={styles.photoPickerOptionTitle}>Take a photo</Text>
                  <Text style={styles.photoPickerOptionHint}>
                    Open the camera
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={19}
                  color={colors.textDim}
                />
              </Pressable>
              <Pressable
                style={styles.photoPickerOption}
                onPress={() => void selectChatPhotoSource("gallery")}
                accessibilityRole="button"
              >
                <Image
                  source={require("../../assets/images/gallery.png")}
                  style={styles.photoPickerOptionImage}
                  resizeMode="contain"
                />
                <View style={styles.photoPickerOptionCopy}>
                  <Text style={styles.photoPickerOptionTitle}>
                    Choose from gallery
                  </Text>
                  <Text style={styles.photoPickerOptionHint}>
                    Select an existing image
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={19}
                  color={colors.textDim}
                />
              </Pressable>
            </View>
            <Pressable
              style={styles.photoPickerCancel}
              onPress={() => setChatPhotoPickerVisible(false)}
            >
              <Text style={styles.photoPickerCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </MechanicScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 8, paddingBottom: spacing.xxl },
  toolbar: { marginBottom: spacing.md },
  filters: {
    flexDirection: "row",
    backgroundColor: colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterButton: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  filterButtonActive: { borderBottomColor: colors.amber },
  filterText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  filterTextActive: { color: colors.text, fontWeight: "700" },
  refreshButton: { alignSelf: "flex-end", flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  refreshText: { color: colors.amber, fontSize: 13, fontWeight: "700" },
  loader: { marginTop: spacing.xl },
  error: { color: colors.sos, marginBottom: spacing.md },
  jobSeparator: { height: 10 },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "rgba(210, 214, 224, 0.9)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 6,
    minHeight: 188,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 7,
  },
  ongoingCard: {
    borderColor: "rgba(210, 214, 224, 0.9)",
    backgroundColor: colors.white,
  },
  scheduledCard: {
    borderColor: "rgba(210, 214, 224, 0.9)",
    backgroundColor: colors.white,
  },
  emergencyCard: {
    borderColor: "rgba(210, 214, 224, 0.9)",
    backgroundColor: colors.white,
  },
  ongoingStatusCard: {
    borderColor: colors.amber,
  },
  resolvedStatusCard: {
    borderColor: colors.success,
  },
  droppedStatusCard: {
    borderColor: colors.sos,
  },
  bookingTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  bookingReferenceLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  bookingReference: {
    color: colors.blue,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 3,
  },
  bookingAmount: {
    alignItems: "flex-end",
  },
  bookingAmountValue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
  },
  bookingAmountLabel: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  bookingDate: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 5,
  },
  bookingCustomer: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 11,
  },
  bookingCustomerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  newMessageBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.success,
    marginTop: 11,
  },
  newMessageBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: "800",
  },
  bookingVehicle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
  },
  serviceStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.blueSoft,
    marginTop: 10,
  },
  serviceStripText: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  jobCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  jobCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  jobCardIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.blueSoft,
  },
  jobCardEmergencyIcon: {
    backgroundColor: colors.sosSoft,
  },
  jobCardTitleText: {
    flex: 1,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm, marginBottom: spacing.sm },
  recordHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  recordType: { flex: 1, fontSize: 15, fontWeight: "800" },
  recordDate: { color: colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  jobCardCustomer: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 14,
  },
  jobCardInfoRows: {
    gap: 7,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  jobCardInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  jobCardInfoText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  jobCardIssue: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  recordLocation: { color: colors.textMuted, fontSize: 13, marginTop: spacing.md },
  recordId: { color: colors.textDim, fontSize: 11, marginTop: spacing.sm },
  service: { color: colors.text, fontWeight: "800", flex: 1 },
  status: { color: colors.amber, fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  completedText: { color: colors.success },
  emergencyText: { color: colors.sos },
  scheduledText: { color: colors.blue },
  vehicle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  issue: { color: colors.textMuted, marginTop: 4, lineHeight: 20 },
  meta: { color: colors.textDim, fontSize: 12, marginTop: spacing.sm },
  customer: { color: colors.text, fontSize: 14, fontWeight: "700", marginTop: spacing.sm },
  compactCardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md },
  compactHint: { color: colors.blue, fontSize: 12, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 8, marginTop: spacing.md },
  actionButton: { flex: 1, minHeight: 40, borderRadius: 0, borderWidth: 1, borderColor: colors.border, flexDirection: "row", gap: 5, alignItems: "center", justifyContent: "center" },
  actionText: { color: colors.text, fontWeight: "700", fontSize: 12 },
  declineButton: { flex: 1, minHeight: 40, borderRadius: 0, borderWidth: 1, borderColor: colors.sos, alignItems: "center", justifyContent: "center" },
  declineText: { color: colors.sos, fontWeight: "800", fontSize: 12 },
  emptyState: { alignItems: "center", backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: 0, padding: spacing.xl },
  emptyText: { color: colors.text, fontWeight: "800", fontSize: 16, marginTop: spacing.sm },
  emptySubtext: { color: colors.textMuted, textAlign: "center", marginTop: spacing.xs },
  detailScreen: { flex: 1, backgroundColor: colors.bg },
  detailHeader: { minHeight: 64, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.amber },
  detailEmergencyHeader: { backgroundColor: colors.sos },
  detailScheduledHeader: { backgroundColor: colors.blue },
  backButton: { width: 42, height: 42, justifyContent: "center" },
  headerSpacer: { width: 42 },
  detailHeaderTitle: { color: colors.white, fontSize: 18, fontWeight: "800" },
  headerActionImage: { width: 27, height: 27, resizeMode: "contain" },
  issueModalKeyboard: { flex: 1, justifyContent: "center" },
  issueModalOverlay: { flex: 1, justifyContent: "center", padding: spacing.md, backgroundColor: "rgba(16, 24, 40, 0.58)" },
  issueModalCard: { maxHeight: "92%", padding: spacing.lg, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated, shadowColor: "#101828", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 12 },
  issueModalContent: { flexShrink: 1 },
  actionModalHandle: { width: 38, height: 4, alignSelf: "center", marginBottom: spacing.md, borderRadius: 2, backgroundColor: colors.border },
  actionModalHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  issueModalIcon: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.sosSoft },
  actionModalHeading: { flex: 1 },
  actionModalSubtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  actionModalClose: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: colors.bg },
  cancelConfirmCard: { overflow: "hidden", borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated, shadowColor: "#101828", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 20, elevation: 12 },
  cannotCancelCard: { alignSelf: "center", width: "80%", maxWidth: 320, overflow: "hidden", borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated, shadowColor: "#101828", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 20, elevation: 12 },
  cannotCancelHeader: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.bg },
  cannotCancelTitle: { color: "#C62828", fontSize: 17, fontWeight: "700" },
  cannotCancelClose: { position: "absolute", right: spacing.sm, top: 8, width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#D6D6D6" },
  cannotCancelBody: { alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  cannotCancelMessage: { maxWidth: 300, color: colors.text, fontSize: 15, lineHeight: 20, textAlign: "center" },
  cannotCancelActions: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  cannotCancelButton: { minHeight: 42, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: 14, backgroundColor: colors.blue },
  cannotCancelButtonText: { color: colors.white, fontSize: 14, fontWeight: "600" },
  cancelConfirmHeader: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.bg },
  cancelConfirmTitle: { color: "#C62828", fontSize: 19, fontWeight: "700" },
  cancelConfirmClose: { position: "absolute", right: spacing.sm, top: 9, width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#D6D6D6" },
  cancelConfirmBody: { minHeight: 124, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  cancelConfirmMessage: { maxWidth: 300, color: colors.text, fontSize: 16, lineHeight: 22, textAlign: "center" },
  cancelConfirmActions: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  keepBookingButton: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xs, borderWidth: 1, borderColor: "#087078", borderRadius: 17, backgroundColor: colors.bgElevated },
  keepBookingText: { color: "#087078", fontSize: 14, fontWeight: "600" },
  confirmCancellationButton: { flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingHorizontal: spacing.xs, borderRadius: 17, backgroundColor: colors.blue },
  confirmEmergencyCancellationButton: { backgroundColor: colors.sos },
  confirmCancellationText: { color: colors.white, fontSize: 14, fontWeight: "600" },
  cancelSuccessCard: { backgroundColor: colors.bgElevated, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  cancelSuccessIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  cancelSuccessTitle: { color: colors.text, fontSize: 20, fontWeight: "800", textAlign: "center" },
  cancelSuccessMessage: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: spacing.xs, marginBottom: spacing.lg },
  cancelSuccessButton: { width: "100%", minHeight: 44, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center" },
  issueModalTitle: { color: colors.text, fontSize: 19, lineHeight: 25, fontWeight: "800" },
  issueModalHint: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
  issueOptions: { gap: spacing.xs },
  issueOption: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.bgElevated },
  issueOptionText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "700" },
  otherIssueInput: { minHeight: 108, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.bg, color: colors.text, fontSize: 15, lineHeight: 21, textAlignVertical: "top" },
  issueCharacterCount: { alignSelf: "flex-end", color: colors.textDim, fontSize: 11, marginTop: 5 },
  submitIssueButton: { flex: 1, minHeight: 50, marginTop: spacing.sm, borderRadius: 12, backgroundColor: colors.sos, alignItems: "center", justifyContent: "center" },
  actionButtonDisabled: { opacity: 0.45 },
  submitIssueText: { color: colors.white, fontWeight: "800" },
  issueModalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  issueCancelButton: { flex: 1, minHeight: 50, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.bgElevated },
  issueCancelText: { color: colors.textMuted, fontWeight: "800" },
  mapChoiceOverlay: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.lg, backgroundColor: "rgba(16, 24, 40, 0.56)" },
  mapChoiceCard: { padding: spacing.lg, borderRadius: 22, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, shadowColor: "#101828", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 12 },
  mapChoiceHeading: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  mapChoiceIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.blueSoft },
  mapChoiceHeadingText: { flex: 1 },
  mapChoiceTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  mapChoiceSubtitle: { color: colors.textMuted, fontSize: 14, marginTop: 3 },
  mapChoiceAddress: { color: colors.textMuted, fontSize: 14, lineHeight: 19, padding: spacing.sm, marginBottom: spacing.sm, borderRadius: 10, backgroundColor: colors.bg },
  mapChoiceError: { color: colors.error, fontSize: 13, lineHeight: 18, marginBottom: spacing.sm },
  mapChoiceOption: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.sm, marginTop: spacing.xs, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  mapChoiceOptionIcon: { width: 42, height: 42, borderRadius: 12, overflow: "hidden" },
  mapChoiceOptionText: { flex: 1 },
  mapChoiceOptionTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  mapChoiceOptionHint: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  mapChoiceCancel: { minHeight: 46, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  mapChoiceCancelText: { color: colors.textMuted, fontSize: 15, fontWeight: "700" },
  chargeModalKeyboard: { flex: 1, justifyContent: "flex-end" },
  chargeModalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(16, 24, 40, 0.56)" },
  chargeModalSheet: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.bgElevated, borderTopLeftRadius: 26, borderTopRightRadius: 26, shadowColor: "#101828", shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.14, shadowRadius: 18, elevation: 16 },
  chargeModalHandle: { width: 38, height: 4, alignSelf: "center", marginBottom: spacing.md, borderRadius: 2, backgroundColor: colors.border },
  chargeModalHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  chargeModalIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.blueSoft },
  chargeModalHeading: { flex: 1 },
  chargeModalTitle: { color: colors.text, fontSize: 19, fontWeight: "800" },
  chargeModalSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 3 },
  chargeModalClose: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  chargeBookingSummary: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.md, paddingHorizontal: spacing.sm, borderRadius: 12, backgroundColor: colors.bg },
  chargeBookingSummaryText: { flex: 1, color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  chargeBookingAmount: { color: colors.text, fontSize: 13, fontWeight: "800" },
  chargeModalHint: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: spacing.md, marginBottom: spacing.md },
  chargeFieldLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginBottom: spacing.xs },
  chargeDescriptionInput: { minHeight: 86, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.bg, color: colors.text, fontSize: 15, lineHeight: 21 },
  chargeCharacterCount: { alignSelf: "flex-end", color: colors.textDim, fontSize: 11, marginTop: 4, marginBottom: spacing.md },
  chargeAmountInput: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.bg },
  chargeCurrency: { color: colors.textMuted, fontSize: 18, fontWeight: "800" },
  chargeAmountTextInput: { flex: 1, paddingVertical: spacing.sm, color: colors.text, fontSize: 18, fontWeight: "700" },
  chargeModalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  chargeCancelButton: { minHeight: 50, minWidth: 94, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.white },
  chargeCancelText: { color: colors.textMuted, fontSize: 14, fontWeight: "800" },
  chargeSubmitButton: { flex: 1, minHeight: 50, flexDirection: "row", gap: spacing.xs, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  chargeSubmitButtonDisabled: { opacity: 0.7 },
  chargeSubmitText: { color: colors.white, fontSize: 14, fontWeight: "800" },
  receiptCard: { marginTop: spacing.lg, padding: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  receiptImage: { backgroundColor: colors.white },
  receiptHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  receiptHeaderActionSpace: { width: 44, height: 44 },
  receiptDownloadButton: { position: "absolute", top: spacing.md, right: spacing.md, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  receiptDownloadIcon: { width: 24, height: 24 },
  receiptEyebrow: { color: colors.textMuted, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  receiptTitle: { color: colors.text, fontSize: 16, fontWeight: "800", marginTop: 2 },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm, paddingTop: spacing.sm },
  receiptLabel: { flex: 1, color: colors.textMuted, fontSize: 13 },
  receiptValue: { color: colors.text, fontSize: 13, fontWeight: "800" },
  pendingCharge: { color: colors.amber },
  receiptTotalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  receiptTotalLabel: { color: colors.text, fontSize: 14, fontWeight: "800" },
  receiptTotal: { color: colors.blue, fontSize: 17, fontWeight: "900" },
  addChargeButton: { minHeight: 42, marginTop: spacing.md, borderWidth: 1, borderColor: colors.blue, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  addChargeText: { color: colors.blue, fontSize: 13, fontWeight: "800" },
  detailContent: { padding: spacing.md, paddingBottom: spacing.lg },
  scheduledDetailContent: { paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.lg },
  detailType: { color: colors.amber, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  detailBookingTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: spacing.sm },
  detailReferenceLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 0.7 },
  detailReference: { color: colors.blue, fontSize: 17, fontWeight: "900", marginTop: 3 },
  detailAmount: { alignItems: "flex-end" },
  detailAmountValue: { color: colors.text, fontSize: 17, fontWeight: "900" },
  detailAmountLabel: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  detailCustomer: { color: colors.text, fontSize: 24, fontWeight: "800", marginTop: spacing.sm, marginBottom: spacing.md },
  scheduledAddress: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  scheduledMapHint: { color: colors.textMuted, fontSize: 13, lineHeight: 19, textAlign: "center" },
  scheduledAddressText: { flex: 1, color: colors.text, fontSize: 17, lineHeight: 23 },
  scheduledBookingSummary: { marginTop: spacing.xs },
  scheduledBookingHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginBottom: spacing.sm },
  scheduledBookingCustomer: { flex: 1 },
  scheduledBookingEyebrow: { color: colors.blue, fontSize: 12, fontWeight: "800", letterSpacing: 0.7, marginBottom: 2 },
  emergencyBookingEyebrow: { color: colors.sos },
  scheduledCompactCustomer: { color: colors.text, fontSize: 22, fontWeight: "800" },
  scheduledDistanceBadge: { maxWidth: "48%", minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: spacing.sm, borderRadius: 999, backgroundColor: colors.blueSoft },
  scheduledCompactDistance: { color: colors.blue, fontSize: 14, fontWeight: "800" },
  scheduledReferenceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  scheduledReference: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  scheduledAmount: { color: colors.text, fontSize: 17, fontWeight: "900" },
  scheduledDetailsCard: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated },
  scheduledDetailLine: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  scheduledDetailTextValue: { flex: 1, color: colors.text, fontSize: 16, lineHeight: 22 },
  scheduledServiceDetail: { paddingTop: spacing.sm },
  locationCard: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  locationText: { flex: 1 },
  locationLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  locationValue: { color: colors.text, fontSize: 16, lineHeight: 23, marginTop: 3 },
  locationHint: { color: colors.amber, fontSize: 12, fontWeight: "700", marginTop: spacing.xs },
  detailLabel: { color: colors.textDim, fontSize: 10, fontWeight: "800", letterSpacing: 0.8, marginTop: spacing.md },
  detailValue: { color: colors.text, fontSize: 15, lineHeight: 20, marginTop: 3 },
  detailActions: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md, backgroundColor: colors.bg, borderTopWidth: 2, borderTopColor: "#C9D2DF", shadowColor: "#101828", shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 8, width: "100%" },
  tripCard: { marginBottom: spacing.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.bgElevated },
  tripHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  tripCopy: { flex: 1 },
  tripTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  tripDistance: { color: colors.blue, fontSize: 12, fontWeight: "700", marginTop: 2 },
  tripHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  chatButton: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.blue, flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center" },
  chatUnreadCount: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.success },
  chatUnreadCountText: { color: colors.white, fontSize: 11, fontWeight: "800" },
  chatSupportRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  supportIconButton: { width: 48, height: 48, borderWidth: 1.5, borderColor: "#C9D2DF", borderRadius: 12, backgroundColor: colors.white, alignItems: "center", justifyContent: "center", shadowColor: "#101828", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  chatText: { color: colors.blue, fontWeight: "800", fontSize: 14 },
  chatSupportSection: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingTop: 2, paddingBottom: spacing.sm, gap: spacing.sm },
  supportTitle: { color: colors.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  arrivedButton: { minHeight: 48, borderWidth: 1, borderColor: colors.amber, alignItems: "center", justifyContent: "center" },
  statusButtonContent: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  arrivedText: { color: colors.amber, fontWeight: "800", fontSize: 14 },
  completeButton: { minHeight: 48, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  completeText: { color: colors.bg, fontWeight: "800", fontSize: 14 },
  chatScreen: { flex: 1, backgroundColor: colors.bg },
  chatKeyboardArea: { flex: 1 },
  chatHeader: { minHeight: 72, paddingHorizontal: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.blue },
  chatBackButton: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  chatAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)" },
  chatAvatarText: { color: colors.white, fontSize: 18, fontWeight: "800" },
  chatHeaderText: { flex: 1, justifyContent: "center" },
  chatTitle: { color: colors.white, fontSize: 16, fontWeight: "800" },
  chatHeaderSpacer: { width: 8 },
  chatBookingBar: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  chatBookingIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.blueSoft },
  chatBookingText: { flex: 1 },
  chatBookingReference: { color: colors.text, fontSize: 18, fontWeight: "900" },
  chatMessages: { flexGrow: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.sm, justifyContent: "flex-end" },
  chatLoadingState: { alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  chatLoadingText: { color: colors.textMuted, fontSize: 13 },
  chatEmptyState: { alignItems: "center", alignSelf: "center", width: "100%", maxWidth: 300, paddingHorizontal: spacing.md, paddingVertical: spacing.xl },
  chatEmptyIcon: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", marginBottom: spacing.md, backgroundColor: colors.blueSoft },
  chatEmptyTitle: { color: colors.text, fontSize: 17, fontWeight: "800", textAlign: "center" },
  chatEmptyDescription: { color: colors.textMuted, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: spacing.xs },
  chatDateSeparatorWrap: { alignSelf: "center", paddingHorizontal: spacing.md, paddingVertical: 6, marginVertical: spacing.sm, borderRadius: 999, backgroundColor: "#E9EDF3" },
  chatDateSeparator: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  chatMessageRow: { width: "100%", flexDirection: "row", justifyContent: "flex-start" },
  chatMessageRowMine: { justifyContent: "flex-end" },
  chatTextMessage: { maxWidth: "84%", alignItems: "flex-start" },
  chatTextMessageMine: { alignItems: "flex-end" },
  messageBubble: { maxWidth: "100%", paddingHorizontal: 13, paddingTop: 10, paddingBottom: 7, borderRadius: 18, borderBottomLeftRadius: 5, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, shadowColor: "#101828", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  myMessageBubble: { borderBottomLeftRadius: 18, borderBottomRightRadius: 5, backgroundColor: "#EAF1FF", borderColor: "#D4E2FF" },
  messageBody: { color: colors.text, fontSize: 15, lineHeight: 21 },
  messageMeta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 3, marginTop: 4 },
  messageTime: { color: colors.textDim, fontSize: 10, textAlign: "right" },
  myMessageTime: { color: "#5C78B8" },
  chatImageMessage: { maxWidth: "84%", alignItems: "flex-end" },
  chatImageMessageMeta: { marginTop: 3, paddingHorizontal: 2 },
  chatImageMessageMetaMine: { alignSelf: "flex-end" },
  chatComposer: { paddingHorizontal: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
  chatComposerInner: { flexDirection: "row", alignItems: "flex-end", gap: spacing.xs },
  chatInput: { flex: 1, minHeight: 46, maxHeight: 110, paddingHorizontal: spacing.md, paddingVertical: 11, color: colors.text, backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border, borderRadius: 23, fontSize: 15 },
  sendButton: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: colors.blue },
  sendButtonDisabled: { backgroundColor: "#A6BCEB" },
  chatAttachButton: { width: 40, height: 46, alignItems: "center", justifyContent: "center" },
  photoPickerOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(16, 24, 40, 0.56)" },
  photoPickerSheet: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.bgElevated, borderTopLeftRadius: 26, borderTopRightRadius: 26, shadowColor: "#101828", shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.16, shadowRadius: 20, elevation: 18 },
  photoPickerHandle: { width: 38, height: 4, alignSelf: "center", marginBottom: spacing.md, borderRadius: 2, backgroundColor: colors.border },
  photoPickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  photoPickerHeaderText: { flex: 1 },
  photoPickerTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  photoPickerSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  photoPickerClose: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  photoPickerOptions: { gap: spacing.sm },
  photoPickerOption: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.white },
  photoPickerOptionImage: { width: 42, height: 42 },
  photoPickerOptionCopy: { flex: 1 },
  photoPickerOptionTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  photoPickerOptionHint: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  photoPickerCancel: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: spacing.sm, borderRadius: 12 },
  photoPickerCancelText: { color: colors.textMuted, fontSize: 14, fontWeight: "800" },
  chatMessageImage: {
    borderRadius: 12,
  },
  chatImagePreview: { overflow: "hidden", borderRadius: 12 },
  chatImagePreviewLoading: { width: 44, height: 44 },
  chatImageLoadingPlaceholder: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#E9EDF3" },
  chatMessageImageLoading: { width: 44, height: 44, opacity: 0 },
  chatImageError: { width: 220, minHeight: 72, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: 12, backgroundColor: "#E9EDF3" },
  chatImageErrorText: { maxWidth: 160, color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  chatImageViewer: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.96)" },
  chatImageViewerImage: { position: "absolute", top: "8%", bottom: "8%", width: "100%" },
  chatImageViewerClose: { position: "absolute", right: spacing.md, zIndex: 1, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.18)" },
});
