import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Alert, Dimensions, Image, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { MechanicScreen } from "@/components/mechanic/MechanicScreen";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { imageAssetToBytes } from "@/lib/chatMedia";
import { colors, spacing } from "@/lib/theme";

const issueIcon = require("../../assets/images/issue-icon.png");

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

function getPayableTotal(job: Pick<ServiceRequest, "estimated_total" | "service_price" | "additional_charges">) {
  const approvedCharges = (job.additional_charges ?? [])
    .filter((charge) => charge.status === "approved")
    .reduce((sum, charge) => sum + Number(charge.amount || 0), 0);
  return Number(job.estimated_total ?? job.service_price ?? 0) + approvedCharges;
}

function getJobStatus(status: string | null): JobStatus | null {
  const normalized = status?.trim().toLowerCase();
  if (["pending", "scheduled", "accepted", "arrived", "in_transit", "in_progress", "ongoing"].includes(normalized ?? "")) {
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
  if (normalized === "cancelled" || normalized === "canceled" || normalized === "rejected" || normalized === "dropped") {
    return "dropped";
  }
  return null;
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
  const [jobs, setJobs] = useState<ServiceRequest[]>([]);
  const [activeFilter, setActiveFilter] = useState<JobStatus>("ongoing");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mechanicId = session?.user.id;
  const [chatJob, setChatJob] = useState<ServiceRequest | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatUploadingImage, setChatUploadingImage] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [issueJob, setIssueJob] = useState<ServiceRequest | null>(null);
  const [chargeJob, setChargeJob] = useState<ServiceRequest | null>(null);
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [otherIssueReason, setOtherIssueReason] = useState("");
  const [enteringOtherReason, setEnteringOtherReason] = useState(false);
  const [pendingCancellationJob, setPendingCancellationJob] =
    useState<ServiceRequest | null>(null);
  const [pendingCancellationReason, setPendingCancellationReason] = useState("");
  const [cancelSuccessVisible, setCancelSuccessVisible] = useState(false);
  const [customerAddress, setCustomerAddress] = useState<{
    key: string;
    value: string;
  } | null>(null);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", (event) => {
      const screenHeight = Dimensions.get("screen").height;
      setKeyboardHeight(
        Math.max(
          0,
          screenHeight - insets.bottom - event.endCoordinates.screenY,
        ),
      );
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom]);

  const issueOptions = [
    "Vehicle or service issue changed",
    "Customer is unavailable",
    "Unsafe pickup location",
    "Unable to reach the customer",
    "Others",
  ];

  const loadJobs = useCallback(async (showRefreshState = false) => {
    if (!mechanicId) return;
    if (showRefreshState) setRefreshing(true);
    else setLoading(true);

    const { data, error: queryError } = await supabase
      .from("service_requests")
      .select(
        "id,motorist_id,mechanic_id,vehicle_type,plate_number,vehicle_issue,service_name,service_price,estimated_total,additional_charges,request_type,status,cancelled_by,latitude,longitude,mechanic_latitude,mechanic_longitude,created_at,scheduled_at",
      )
      .or(`mechanic_id.is.null,mechanic_id.eq.${mechanicId}`)
      .order("created_at", { ascending: false });

    if (queryError) {
      setError(queryError.message);
    } else {
      const requests = (data ?? []) as Omit<
        ServiceRequest,
        "customer_name" | "customer_contact"
      >[];
      const motoristIds = [...new Set(requests.map((job) => job.motorist_id))];
      const profileIds = motoristIds.filter(isUuid);
      const { data: profiles, error: profilesError } = profileIds.length
        ? await supabase
            .from("profiles")
            .select("id,full_name,mobile_number,email")
            .in("id", profileIds)
        : { data: [], error: null };
      if (profilesError) {
        setError(profilesError.message);
      }
      const { data: contactRows, error: contactError } = profileIds.length
        ? await supabase.rpc("get_customer_mobile_numbers", {
            p_customer_ids: profileIds,
          })
        : { data: [], error: null };
      if (contactError) {
        setError(contactError.message);
      }
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
          },
        ]),
      );
      for (const contact of typedContactRows) {
        if (!profileMap.has(contact.customer_id)) {
          profileMap.set(contact.customer_id, {
            name: "Customer",
            contact: contact.mobile_number || "Not provided",
          });
        }
      }
      setJobs(
        requests.map((job) => ({
          ...job,
          customer_name: profileMap.get(job.motorist_id)?.name || "Customer",
          customer_contact:
            profileMap.get(job.motorist_id)?.contact || "Not provided",
        })),
      );
      setError(null);
    }
    setLoading(false);
    setRefreshing(false);
  }, [mechanicId]);

  useFocusEffect(
    useCallback(() => {
      void loadJobs();
    }, [loadJobs]),
  );

  const [selectedJob, setSelectedJob] = useState<ServiceRequest | null>(null);
  const trackingJobId = useRef<string | null>(null);
  const selectedJobId = selectedJob?.id;
  const selectedJobStatus = selectedJob?.status;

  useEffect(() => {
    if (
      !selectedJobId ||
      selectedJobStatus?.toLowerCase() !== "in_transit" ||
      !mechanicId
    ) {
      trackingJobId.current = null;
      return;
    }

    const jobId = selectedJobId;
    trackingJobId.current = jobId;
    let active = true;
    let locationSubscription: Location.LocationSubscription | null = null;

    const publishLocation = async (nextLocation: Location.LocationObject) => {
      if (!active || trackingJobId.current !== jobId) return;
      const { error: locationError } = await supabase
        .from("service_requests")
        .update({
          mechanic_latitude: nextLocation.coords.latitude,
          mechanic_longitude: nextLocation.coords.longitude,
        })
        .eq("id", jobId)
        .eq("mechanic_id", mechanicId);
      if (locationError) {
        setError(locationError.message);
      }
    };

    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!active || status !== "granted") {
        if (active) {
          setError("Location permission is required to share your trip location.");
        }
        return;
      }

      try {
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
          setError(
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
      if (trackingJobId.current === jobId) trackingJobId.current = null;
    };
  }, [mechanicId, selectedJobId, selectedJobStatus]);

  useEffect(() => {
    if (!chatJob || !mechanicId) return;
    const chatJobId = chatJob.id;
    let active = true;
    async function loadMessages() {
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
      else setChatMessages((data ?? []) as ChatMessage[]);
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
  }, [chatJob, mechanicId]);

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
    if (!body || !mechanicId || !chatJob) return;
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
    if (!mechanicId || !chatJob || chatUploadingImage) return;
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
      if (data) setChatMessages((messages) => [...messages, data as ChatMessage]);
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : "Unable to send the image.");
    } finally {
      setChatUploadingImage(false);
    }
  }

  function chooseChatImage() {
    Alert.alert("Send photo", "Choose a photo source.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Camera",
        onPress: () => void (async () => {
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.8,
            base64: true,
          });
          if (!result.canceled && result.assets[0]) await sendChatImage(result.assets[0]);
        })(),
      },
      {
        text: "Gallery",
        onPress: () => void (async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.8,
            base64: true,
          });
          if (!result.canceled && result.assets[0]) await sendChatImage(result.assets[0]);
        })(),
      },
    ]);
  }

  async function updateJobStatus(id: string, status: "in_transit" | "arrived" | "in_progress" | "completed" | "cancelled") {
    if (!mechanicId) return;
    setRefreshing(true);
    const updatePayload =
      status === "completed"
        ? { status, completed_at: new Date().toISOString() }
        : { status };
    const { error: updateError } = await supabase
      .from("service_requests")
      .update(updatePayload)
      .eq("id", id)
      .eq("mechanic_id", mechanicId);
    if (updateError) {
      setError(updateError.message);
    } else if (status === "completed" || status === "cancelled") {
      setSelectedJob(null);
    } else {
      setSelectedJob((job) => (job ? { ...job, status } : job));
    }
    await loadJobs(true);
  }

  async function submitAdditionalCharge() {
    if (!chargeJob || !mechanicId) return;
    const description = chargeDescription.trim();
    const amount = Number(chargeAmount);
    if (!description || !Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Invalid charge", "Enter a description and a valid amount.");
      return;
    }
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
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${job.latitude},${job.longitude}`;
    void Linking.openURL(mapsUrl).catch(() => {
      setError("Unable to open maps.");
    });
  }

  async function cancelJob(job: ServiceRequest, reason: string) {
    if (!mechanicId || !reason.trim()) return;
    setRefreshing(true);
    const { error: updateError } = await supabase
      .from("service_requests")
      .update({
        status: "cancelled",
        cancelled_by: "mechanic",
        cancellation_reason: reason.trim(),
      })
      .eq("id", job.id)
      .eq("mechanic_id", mechanicId);

    if (updateError) {
      setError(updateError.message);
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

  const visibleJobs = jobs.filter(
    (job) =>
      job.mechanic_id === mechanicId &&
      getJobStatus(job.status) === activeFilter,
  );

  return (
    <MechanicScreen back title="Jobs" profileHeader>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={undefined}
      >
        <View style={styles.toolbar}>
          <View style={styles.filters}>
            {([
              ["ongoing", "Ongoing"],
              ["resolved", "Resolved"],
              ["dropped", "Dropped"],
            ] as const).map(([value, label]) => (
              <Pressable
                key={value}
                onPress={() => setActiveFilter(value)}
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
        {loading ? (
          <ActivityIndicator color={colors.amber} style={styles.loader} />
        ) : visibleJobs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="briefcase-outline" size={34} color={colors.textDim} />
            <Text style={styles.emptyText}>No {activeFilter} jobs yet.</Text>
            <Text style={styles.emptySubtext}>Jobs from customer service requests will appear here.</Text>
          </View>
        ) : (
          <View style={styles.stack}>
            {visibleJobs.map((job) => {
              const isReadOnly = activeFilter !== "ongoing";
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
                        {amount === null
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
                  <Text style={styles.bookingCustomer}>{job.customer_name}</Text>
                  <Text style={styles.bookingVehicle}>
                    {[job.vehicle_type, job.plate_number]
                      .filter(Boolean)
                      .join(" • ") || "Vehicle details unavailable"}
                  </Text>
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

              return (
                isReadOnly ? (
                  <View
                    key={job.id}
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
                    key={job.id}
                    style={[
                      styles.card,
                      styles.ongoingCard,
                      job.request_type === "emergency"
                        ? styles.emergencyCard
                        : styles.scheduledCard,
                      styles.ongoingStatusCard,
                    ]}
                    onPress={() => setSelectedJob(job)}
                  >
                    {recordContent}
                  </Pressable>
                )
              );
            })}
          </View>
        )}
      </ScrollView>
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
                selectedJob.request_type === "emergency" && styles.detailEmergencyHeader,
              ]}
            >
              <Pressable
                onPress={() => setSelectedJob(null)}
                style={styles.backButton}
                accessibilityLabel="Close booking details"
              >
                <Ionicons name="arrow-back" size={24} color="#000000" />
              </Pressable>
              <Text style={styles.detailHeaderTitle}>Ongoing booking</Text>
              <View style={styles.headerSpacer} />
            </View>
            <ScrollView contentContainerStyle={styles.detailContent}>
              <Text style={styles.detailType}>
                {selectedJob.request_type === "emergency" ? "EMERGENCY" : "SCHEDULED SERVICE"}
              </Text>
              <View style={styles.detailBookingTopRow}>
                <View>
                  <Text style={styles.detailReferenceLabel}>BOOKING REFERENCE</Text>
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
              <Text style={styles.detailCustomer}>{selectedJob.customer_name}</Text>
              <Pressable
                style={styles.locationCard}
                onPress={() => openCustomerLocation(selectedJob)}
                disabled={selectedJob.latitude === null || selectedJob.longitude === null}
                accessibilityRole="button"
                accessibilityLabel="View customer location on map"
              >
                <Ionicons name="location" size={22} color={colors.amber} />
                <View style={styles.locationText}>
                  <Text style={styles.locationLabel}>Customer location</Text>
                  <Text style={styles.locationValue}>
                    {selectedJob.latitude !== null &&
                    selectedJob.longitude !== null
                      ? customerAddress?.key ===
                        `${selectedJob.latitude},${selectedJob.longitude}`
                        ? customerAddress.value
                        : "Loading address..."
                      : "Location not provided"}
                  </Text>
                  <Text style={styles.locationHint}>
                    {selectedJob.latitude !== null && selectedJob.longitude !== null
                      ? "Tap to open in maps"
                      : "Location not available"}
                  </Text>
                </View>
              </Pressable>
              <Text style={styles.detailLabel}>MOBILE NUMBER</Text>
              <Text style={styles.detailValue}>{selectedJob.customer_contact}</Text>
              <Text style={styles.detailLabel}>DATE SCHEDULED</Text>
              <Text style={styles.detailValue}>
                {formatSchedule(selectedJob.scheduled_at || selectedJob.created_at)}
              </Text>
              <Text style={styles.detailLabel}>VEHICLE</Text>
              <Text style={styles.detailValue}>{selectedJob.vehicle_type || "Not provided"}</Text>
              <Text style={styles.detailLabel}>PLATE NUMBER</Text>
              <Text style={styles.detailValue}>{selectedJob.plate_number || "Not provided"}</Text>
              <Text style={styles.detailLabel}>SERVICE DETAILS</Text>
              <Text style={styles.detailValue}>{selectedJob.vehicle_issue || "No issue description provided."}</Text>
              <View style={styles.receiptCard}>
                <View style={styles.receiptHeader}>
                  <View>
                    <Text style={styles.receiptEyebrow}>LIVE RECEIPT</Text>
                    <Text style={styles.receiptTitle}>Customer payment</Text>
                  </View>
                  <Ionicons name="receipt-outline" size={22} color={colors.blue} />
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Base service</Text>
                  <Text style={styles.receiptValue}>
                    ₱{getPayableTotal(selectedJob).toFixed(2)}
                  </Text>
                </View>
                {(selectedJob.additional_charges ?? []).map((charge) => (
                  <View key={charge.id} style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>{charge.description}</Text>
                    <Text style={[styles.receiptValue, charge.status === "pending" && styles.pendingCharge]}>
                      {charge.status === "rejected" ? "Declined" : `₱${Number(charge.amount).toFixed(2)}`}
                    </Text>
                  </View>
                ))}
                <View style={styles.receiptTotalRow}>
                  <Text style={styles.receiptTotalLabel}>Approved total</Text>
                  <Text style={styles.receiptTotal}>
                    ₱{getPayableTotal(selectedJob).toFixed(2)}
                  </Text>
                </View>
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
                    onPress={() => setChatJob(selectedJob)}
                  >
                    <Ionicons name="chatbubble-outline" size={19} color={colors.blue} />
                    <Text style={styles.chatText}>Chat customer</Text>
                  </Pressable>
                  <Pressable
                    style={styles.supportIconButton}
                    onPress={() => callCustomer(selectedJob)}
                    accessibilityLabel="Call customer"
                  >
                    <Ionicons name="call" size={24} color={colors.success} />
                  </Pressable>
                  <Pressable
                    style={styles.supportIconButton}
                    onPress={() => setIssueJob(selectedJob)}
                    accessibilityLabel="Report issue or request cancellation"
                  >
                    <Image source={issueIcon} style={styles.headerActionImage} />
                  </Pressable>
                </View>
              </View>
              {selectedJob.status?.toLowerCase() === "arrived" ? (
                <Pressable
                  style={styles.completeButton}
                  onPress={() => void updateJobStatus(selectedJob.id, "in_progress")}
                  disabled={refreshing}
                >
                  <Text style={styles.completeText}>{refreshing ? "Saving..." : "Start service"}</Text>
                </Pressable>
              ) : selectedJob.status?.toLowerCase() === "in_progress" ? (
                <Pressable
                  style={styles.completeButton}
                  onPress={() => void updateJobStatus(selectedJob.id, "completed")}
                  disabled={refreshing}
                >
                  <Text style={styles.completeText}>{refreshing ? "Saving..." : "Complete booking"}</Text>
                </Pressable>
              ) : selectedJob.status?.toLowerCase() === "accepted" ? (
                <Pressable
                  style={styles.arrivedButton}
                  onPress={() => void updateJobStatus(selectedJob.id, "in_transit")}
                  disabled={refreshing}
                >
                  <Text style={styles.arrivedText}>{refreshing ? "Saving..." : "Start trip"}</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={styles.arrivedButton}
                  onPress={() => void updateJobStatus(selectedJob.id, "arrived")}
                  disabled={refreshing}
                >
                  <Text style={styles.arrivedText}>{refreshing ? "Saving..." : "Arrived at pickup"}</Text>
                </Pressable>
              )}
            </View>
          </SafeAreaView>
        ) : null}
      </Modal>
      <Modal
        visible={chargeJob !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setChargeJob(null)}
      >
        <View style={styles.issueModalOverlay}>
          <View style={styles.issueModalCard}>
            <Text style={styles.issueModalTitle}>Add repair charge</Text>
            <Text style={styles.issueModalHint}>
              The motorist must approve this charge before it is added to the payable total.
            </Text>
            <TextInput
              value={chargeDescription}
              onChangeText={setChargeDescription}
              placeholder="What additional repair is needed?"
              placeholderTextColor={colors.textDim}
              style={styles.otherIssueInput}
            />
            <TextInput
              value={chargeAmount}
              onChangeText={setChargeAmount}
              placeholder="Amount (₱)"
              placeholderTextColor={colors.textDim}
              keyboardType="decimal-pad"
              style={styles.otherIssueInput}
            />
            <View style={styles.issueModalActions}>
              <Pressable style={styles.cancelIssueButton} onPress={() => setChargeJob(null)}>
                <Text style={styles.cancelIssueText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.chargeSubmitButton} onPress={() => void submitAdditionalCharge()}>
                <Text style={styles.submitIssueText}>Send for approval</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={issueJob !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setIssueJob(null)}
      >
        <View style={styles.issueModalOverlay}>
          <View style={styles.issueModalCard}>
            <Text style={styles.issueModalTitle}>Report booking issue</Text>
            <Text style={styles.issueModalHint}>
              {enteringOtherReason
                ? "Please explain the issue before continuing."
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
                  autoFocus
                />
                <Pressable style={styles.submitIssueButton} onPress={submitOtherIssue}>
                  <Text style={styles.submitIssueText}>Continue</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.issueOptions}>
                {issueOptions.map((reason) => (
                  <Pressable
                    key={reason}
                    style={styles.issueOption}
                    onPress={() => selectIssue(reason)}
                  >
                    <Text style={styles.issueOptionText}>{reason}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.sos} />
                  </Pressable>
                ))}
              </View>
            )}
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
              <Text style={styles.issueCancelText}>{enteringOtherReason ? "Back" : "Cancel"}</Text>
            </Pressable>
          </View>
        </View>
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
          <View style={styles.issueModalCard}>
            <View style={styles.cancelConfirmIcon}>
              <Ionicons name="alert-circle-outline" size={28} color={colors.sos} />
            </View>
            <Text style={styles.issueModalTitle}>Cancel this booking?</Text>
            <Text style={styles.issueModalHint}>
              This will notify the motorist that you can no longer take this booking.
            </Text>
            <View style={styles.cancelReasonSummary}>
              <Text style={styles.cancelReasonLabel}>Reason</Text>
              <Text style={styles.cancelReasonValue}>{pendingCancellationReason}</Text>
            </View>
            <View style={styles.issueModalActions}>
              <Pressable
                style={styles.cancelIssueButton}
                onPress={() => {
                  setPendingCancellationJob(null);
                  setPendingCancellationReason("");
                }}
                disabled={refreshing}
              >
                <Text style={styles.cancelIssueText}>Go back</Text>
              </Pressable>
              <Pressable
                style={styles.confirmMechanicCancelButton}
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
                <Text style={styles.submitIssueText}>
                  {refreshing ? "Cancelling..." : "Confirm cancel"}
                </Text>
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
              <Pressable onPress={() => setChatJob(null)} style={styles.backButton}>
                <Ionicons name="arrow-back" size={24} color="#000000" />
              </Pressable>
              <View style={styles.chatHeaderText}>
                <Text style={styles.chatTitle}>Chat customer</Text>
                <Text style={styles.chatSubtitle}>{chatJob.customer_name}</Text>
              </View>
              <View style={styles.headerSpacer} />
            </View>
            <KeyboardAvoidingView
              style={styles.chatKeyboardArea}
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
            >
              <ScrollView
                contentContainerStyle={styles.chatMessages}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets
              >
                <Text style={styles.chatPurpose}>
                  Use this chat to coordinate with the customer about this booking.
                </Text>
                {chatLoading ? (
                  <ActivityIndicator color={colors.blue} />
                ) : chatMessages.length === 0 ? (
                  <Text style={styles.emptyChat}>No messages yet. Start the conversation.</Text>
                ) : (
                  chatMessages.map((message) => (
                    <View
                      key={message.id}
                      style={[
                        styles.messageBubble,
                        message.sender_id === mechanicId && styles.myMessageBubble,
                      ]}
                    >
                      {message.image_url ? (
                        <Image source={{ uri: message.image_url }} style={styles.chatMessageImage} />
                      ) : null}
                      {message.body ? <Text style={styles.messageBody}>{message.body}</Text> : null}
                      <Text style={styles.messageTime}>
                        {new Date(message.created_at).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </Text>
                    </View>
                  ))
                )}
              </ScrollView>
              <View
                style={[
                  styles.chatComposer,
                  Platform.OS === "android" && keyboardHeight > 0 && {
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: keyboardHeight,
                  },
                ]}
              >
                <TextInput
                  value={chatText}
                  onChangeText={setChatText}
                  placeholder="Write a message..."
                  placeholderTextColor={colors.textDim}
                  style={styles.chatInput}
                  multiline
                />
                <Pressable
                  style={styles.chatAttachButton}
                  onPress={chooseChatImage}
                  disabled={sendingMessage || chatUploadingImage}
                  accessibilityLabel="Send photo"
                >
                  {chatUploadingImage ? <ActivityIndicator size="small" color={colors.blue} /> : <Ionicons name="camera-outline" size={22} color={colors.blue} />}
                </Pressable>
                <Pressable
                  style={styles.sendButton}
                  onPress={() => void sendMessage()}
                  disabled={sendingMessage || chatUploadingImage || !chatText.trim()}
                >
                  <Ionicons name="send" size={19} color={colors.white} />
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        ) : null}
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
  stack: { gap: 10 },
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
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 11,
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
  backButton: { width: 42, height: 42, justifyContent: "center" },
  headerSpacer: { width: 42 },
  detailHeaderTitle: { color: colors.white, fontSize: 18, fontWeight: "800" },
  headerActionImage: { width: 27, height: 27, resizeMode: "contain" },
  issueModalOverlay: { flex: 1, justifyContent: "center", padding: spacing.md, backgroundColor: "rgba(0,0,0,0.5)" },
  issueModalCard: { backgroundColor: colors.bgElevated, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  cancelConfirmIcon: { alignSelf: "center", marginBottom: spacing.sm },
  cancelReasonSummary: { padding: spacing.sm, marginBottom: spacing.sm, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  cancelReasonLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  cancelReasonValue: { color: colors.text, fontSize: 14, fontWeight: "700", marginTop: 3 },
  confirmMechanicCancelButton: { flex: 1, minHeight: 44, backgroundColor: colors.sos, alignItems: "center", justifyContent: "center" },
  cancelSuccessCard: { backgroundColor: colors.bgElevated, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  cancelSuccessIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  cancelSuccessTitle: { color: colors.text, fontSize: 20, fontWeight: "800", textAlign: "center" },
  cancelSuccessMessage: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: spacing.xs, marginBottom: spacing.lg },
  cancelSuccessButton: { width: "100%", minHeight: 44, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center" },
  issueModalTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  issueModalHint: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: spacing.xs, marginBottom: spacing.md },
  issueOptions: { gap: spacing.xs },
  otherIssueInput: { minHeight: 96, borderWidth: 1, borderColor: colors.border, color: colors.text, padding: spacing.sm, textAlignVertical: "top" },
  submitIssueButton: { minHeight: 44, marginTop: spacing.sm, backgroundColor: colors.sos, alignItems: "center", justifyContent: "center" },
  submitIssueText: { color: colors.white, fontWeight: "800" },
  issueModalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  cancelIssueButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  cancelIssueText: { color: colors.textMuted, fontWeight: "800" },
  chargeSubmitButton: { flex: 1, minHeight: 44, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center" },
  receiptCard: { marginTop: spacing.lg, padding: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  receiptHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
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
  issueOption: { minHeight: 48, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  issueOptionText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "700" },
  issueCancelButton: { minHeight: 44, marginTop: spacing.md, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  issueCancelText: { color: colors.textMuted, fontWeight: "800" },
  detailContent: { padding: spacing.md, paddingBottom: spacing.lg },
  detailType: { color: colors.amber, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  detailBookingTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: spacing.sm },
  detailReferenceLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 0.7 },
  detailReference: { color: colors.blue, fontSize: 17, fontWeight: "900", marginTop: 3 },
  detailAmount: { alignItems: "flex-end" },
  detailAmountValue: { color: colors.text, fontSize: 17, fontWeight: "900" },
  detailAmountLabel: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  detailCustomer: { color: colors.text, fontSize: 24, fontWeight: "800", marginTop: spacing.sm, marginBottom: spacing.md },
  locationCard: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  locationText: { flex: 1 },
  locationLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  locationValue: { color: colors.text, fontSize: 16, lineHeight: 23, marginTop: 3 },
  locationHint: { color: colors.amber, fontSize: 12, fontWeight: "700", marginTop: spacing.xs },
  detailLabel: { color: colors.textDim, fontSize: 10, fontWeight: "800", letterSpacing: 0.8, marginTop: spacing.md },
  detailValue: { color: colors.text, fontSize: 15, lineHeight: 20, marginTop: 3 },
  detailActions: { gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgElevated },
  chatButton: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.blue, flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center" },
  chatSupportRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  supportIconButton: { width: 48, height: 48, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  chatText: { color: colors.blue, fontWeight: "800", fontSize: 14 },
  chatSupportSection: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, gap: spacing.sm },
  supportTitle: { color: colors.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  arrivedButton: { minHeight: 48, borderWidth: 1, borderColor: colors.amber, alignItems: "center", justifyContent: "center" },
  arrivedText: { color: colors.amber, fontWeight: "800", fontSize: 14 },
  completeButton: { minHeight: 48, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  completeText: { color: colors.bg, fontWeight: "800", fontSize: 14 },
  chatScreen: { flex: 1, backgroundColor: colors.bg },
  chatKeyboardArea: { flex: 1 },
  chatHeader: { minHeight: 64, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", backgroundColor: colors.blue },
  chatHeaderText: { flex: 1, alignItems: "center" },
  chatTitle: { color: colors.white, fontSize: 18, fontWeight: "800" },
  chatSubtitle: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 2 },
  chatMessages: { flexGrow: 1, padding: spacing.md, gap: spacing.sm, justifyContent: "flex-end" },
  emptyChat: { color: colors.textMuted, textAlign: "center", marginBottom: spacing.lg },
  chatPurpose: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: "center", marginBottom: spacing.sm },
  messageBubble: { alignSelf: "flex-start", maxWidth: "82%", backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  myMessageBubble: { alignSelf: "flex-end", backgroundColor: colors.blueSoft, borderColor: colors.blue },
  messageBody: { color: colors.text, fontSize: 15, lineHeight: 21 },
  messageTime: { color: colors.textDim, fontSize: 10, marginTop: 4, textAlign: "right" },
  chatComposer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgElevated },
  chatInput: { flex: 1, minHeight: 44, maxHeight: 110, paddingHorizontal: spacing.sm, paddingVertical: 10, color: colors.text, backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border },
  sendButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", backgroundColor: colors.blue },
  chatAttachButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  chatMessageImage: {
    width: 220,
    height: 165,
    borderRadius: 12,
    marginBottom: 6,
  },
});
