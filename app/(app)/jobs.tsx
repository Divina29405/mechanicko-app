import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MechanicScreen } from "@/components/mechanic/MechanicScreen";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { colors, spacing } from "@/lib/theme";

const callIcon = require("../../assets/images/issue-icon.png");
const issueIcon = require("../../assets/images/call-icon.png");

type JobStatus = "ongoing" | "resolved" | "dropped";

type ServiceRequest = {
  id: string;
  motorist_id: string;
  mechanic_id: string | null;
  vehicle_type: string | null;
  vehicle_issue: string | null;
  request_type: string | null;
  status: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  scheduled_at: string | null;
  customer_name: string;
  customer_contact: string;
};

type ChatMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

function getJobStatus(status: string | null): JobStatus | null {
  const normalized = status?.toLowerCase();
  if (normalized === "declined") {
    return null;
  }
  if (normalized === "completed" || normalized === "done" || normalized === "resolved") {
    return "resolved";
  }
  if (normalized === "cancelled" || normalized === "canceled" || normalized === "rejected" || normalized === "dropped") {
    return "dropped";
  }
  return "ongoing";
}

function formatDate(value: string | null) {
  if (!value) return "Time not specified";
  return new Date(value).toLocaleString();
}

function openDirections(job: ServiceRequest) {
  if (job.latitude === null || job.longitude === null) return;
  void Linking.openURL(
    `https://www.google.com/maps/dir/?api=1&destination=${job.latitude},${job.longitude}`,
  );
}

export default function JobsScreen() {
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
  const [chatLoading, setChatLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [issueJob, setIssueJob] = useState<ServiceRequest | null>(null);

  const issueOptions = [
    "Vehicle or service issue changed",
    "Customer is unavailable",
    "Unsafe pickup location",
    "Unable to reach the customer",
    "Other booking concern",
  ];

  const loadJobs = useCallback(async (showRefreshState = false) => {
    if (!mechanicId) return;
    if (showRefreshState) setRefreshing(true);
    else setLoading(true);

    const { data, error: queryError } = await supabase
      .from("service_requests")
      .select(
        "id,motorist_id,mechanic_id,vehicle_type,vehicle_issue,request_type,status,latitude,longitude,created_at,scheduled_at",
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
      const { data: profiles } = motoristIds.length
        ? await supabase
            .from("profiles")
            .select("id,full_name,mobile_number,email")
            .in("id", motoristIds)
        : { data: [] };
      const profileMap = new Map(
        (profiles ?? []).map((profile) => [
          profile.id,
          {
            name: profile.full_name || "Customer",
            contact: profile.mobile_number || "Not provided",
          },
        ]),
      );
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

  useEffect(() => {
    if (!chatJob || !mechanicId) return;
    const chatJobId = chatJob.id;
    let active = true;
    async function loadMessages() {
      setChatLoading(true);
      const { data, error: queryError } = await supabase
        .from("chat_messages")
        .select("id,sender_id,body,created_at")
        .eq("service_request_id", chatJobId)
        .order("created_at", { ascending: true });
      if (!active) return;
      if (queryError) setError(queryError.message);
      else setChatMessages((data ?? []) as ChatMessage[]);
      setChatLoading(false);
    }
    void loadMessages();
    return () => {
      active = false;
    };
  }, [chatJob, mechanicId]);

  async function sendMessage() {
    const body = chatText.trim();
    if (!body || !mechanicId || !chatJob) return;
    setSendingMessage(true);
    const { data, error: insertError } = await supabase
      .from("chat_messages")
      .insert({
        service_request_id: chatJob.id,
        sender_id: mechanicId,
        recipient_id: chatJob.motorist_id,
        body,
      })
      .select("id,sender_id,body,created_at")
      .single();
    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      setChatMessages((messages) => [...messages, data as ChatMessage]);
      setChatText("");
    }
    setSendingMessage(false);
  }

  async function updateJobStatus(id: string, status: "arrived" | "completed") {
    if (!mechanicId) return;
    setRefreshing(true);
    const { error: updateError } = await supabase
      .from("service_requests")
      .update({ status })
      .eq("id", id)
      .eq("mechanic_id", mechanicId);
    if (updateError) {
      setError(updateError.message);
    } else {
      setSelectedJob(null);
    }
    await loadJobs(true);
  }

  function callCustomer(job: ServiceRequest) {
    if (!job.customer_contact || job.customer_contact === "Not provided") {
      setError("Customer contact number is not available.");
      return;
    }
    const phoneNumber = job.customer_contact.replace(/[^\d+]/g, "");
    void Linking.openURL(`tel:${phoneNumber}`);
  }

  function selectIssue(reason: string) {
    if (!issueJob) return;
    setChatText(
      `Hi, I need to report an issue with this booking: ${reason}. Can we discuss the next steps or cancellation?`,
    );
    setChatJob(issueJob);
    setIssueJob(null);
  }

  const visibleJobs = jobs.filter(
    (job) =>
      job.mechanic_id === mechanicId &&
      getJobStatus(job.status) === activeFilter,
  );

  return (
    <MechanicScreen title="Jobs" subtitle="Live service requests assigned to you">
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
              const isResolved = activeFilter === "resolved";
              const recordContent = (
                <>
                  <View style={styles.cardHeader}>
                    <Text
                      style={[
                        styles.service,
                        job.request_type === "emergency"
                          ? styles.emergencyText
                          : styles.scheduledText,
                      ]}
                    >
                      {job.request_type === "emergency" ? "Emergency request" : "Scheduled service"}
                    </Text>
                    <Text
                      style={[
                        styles.status,
                        isResolved ? styles.completedText : (
                          job.request_type === "emergency"
                            ? styles.emergencyText
                            : styles.scheduledText
                        ),
                      ]}
                    >
                      {isResolved ? "Completed" : (job.status ?? "pending")}
                    </Text>
                  </View>
                  <Text style={styles.vehicle}>{job.vehicle_type || "Vehicle details unavailable"}</Text>
                  <Text style={styles.customer}>{job.customer_name}</Text>
                  <Text style={styles.issue}>{job.vehicle_issue || "No issue description provided."}</Text>
                  <Text style={styles.meta}>
                    {isResolved ? "Completed: " : "Requested: "}
                    {formatDate(job.scheduled_at || job.created_at)}
                  </Text>
                  {!isResolved ? (
                    <View style={styles.compactCardFooter}>
                      <Text style={styles.compactHint}>Tap to view booking</Text>
                      <Ionicons name="chevron-forward" size={18} color={colors.amber} />
                    </View>
                  ) : null}
                </>
              );

              return (
                isResolved ? (
                  <View key={job.id} style={styles.card}>
                    {recordContent}
                  </View>
                ) : (
                  <Pressable key={job.id} style={styles.card} onPress={() => setSelectedJob(job)}>
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
                <Ionicons name="arrow-back" size={24} color={colors.white} />
              </Pressable>
              <Text style={styles.detailHeaderTitle}>Ongoing booking</Text>
              <View style={styles.detailHeaderActions}>
                <Pressable
                  style={styles.headerIconButton}
                  onPress={() => callCustomer(selectedJob)}
                  accessibilityLabel="Call customer"
                >
                  <Image source={callIcon} style={styles.headerActionImage} />
                </Pressable>
                <Pressable
                  style={styles.headerIssueButton}
                  onPress={() => {
                    setIssueJob(selectedJob);
                  }}
                  accessibilityLabel="Report issue or request cancellation"
                >
                  <Image source={issueIcon} style={styles.headerActionImage} />
                </Pressable>
              </View>
            </View>
            <ScrollView contentContainerStyle={styles.detailContent}>
              <Text style={styles.detailType}>
                {selectedJob.request_type === "emergency" ? "EMERGENCY" : "SCHEDULED SERVICE"}
              </Text>
              <Text style={styles.detailCustomer}>{selectedJob.customer_name}</Text>
              <Pressable
                style={styles.locationCard}
                onPress={() => openDirections(selectedJob)}
                disabled={selectedJob.latitude === null || selectedJob.longitude === null}
              >
                <Ionicons name="location" size={22} color={colors.amber} />
                <View style={styles.locationText}>
                  <Text style={styles.locationLabel}>Customer location</Text>
                  <Text style={styles.locationValue}>
                    {selectedJob.latitude !== null && selectedJob.longitude !== null
                      ? `${selectedJob.latitude.toFixed(5)}, ${selectedJob.longitude.toFixed(5)}`
                      : "Location not provided"}
                  </Text>
                  <Text style={styles.locationHint}>Tap to open Google Maps directions</Text>
                </View>
                <Ionicons name="open-outline" size={19} color={colors.amber} />
              </Pressable>
              <Text style={styles.detailLabel}>CONTACT NO.</Text>
              <Text style={styles.detailValue}>{selectedJob.customer_contact}</Text>
              <Text style={styles.detailLabel}>DATE SCHEDULED</Text>
              <Text style={styles.detailValue}>{formatDate(selectedJob.scheduled_at || selectedJob.created_at)}</Text>
              <Text style={styles.detailLabel}>VEHICLE</Text>
              <Text style={styles.detailValue}>{selectedJob.vehicle_type || "Not provided"}</Text>
              <Text style={styles.detailLabel}>SERVICE DETAILS</Text>
              <Text style={styles.detailValue}>{selectedJob.vehicle_issue || "No issue description provided."}</Text>
            </ScrollView>
            <View style={styles.detailActions}>
              <View style={styles.chatSupportSection}>
                <Text style={styles.supportTitle}>Customer support</Text>
                <Pressable
                  style={styles.chatButton}
                  onPress={() => setChatJob(selectedJob)}
                >
                  <Ionicons name="chatbubble-outline" size={19} color={colors.blue} />
                  <Text style={styles.chatText}>Chat customer</Text>
                </Pressable>
              </View>
              {selectedJob.status?.toLowerCase() === "arrived" ? (
                <Pressable
                  style={styles.completeButton}
                  onPress={() => void updateJobStatus(selectedJob.id, "completed")}
                  disabled={refreshing}
                >
                  <Text style={styles.completeText}>{refreshing ? "Saving..." : "Complete booking"}</Text>
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
        visible={issueJob !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setIssueJob(null)}
      >
        <View style={styles.issueModalOverlay}>
          <View style={styles.issueModalCard}>
            <Text style={styles.issueModalTitle}>Report booking issue</Text>
            <Text style={styles.issueModalHint}>
              Select the reason so the customer understands the concern.
            </Text>
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
            <Pressable
              style={styles.issueCancelButton}
              onPress={() => setIssueJob(null)}
            >
              <Text style={styles.issueCancelText}>Cancel</Text>
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
                <Ionicons name="arrow-back" size={24} color={colors.white} />
              </Pressable>
              <View style={styles.chatHeaderText}>
                <Text style={styles.chatTitle}>Chat customer</Text>
                <Text style={styles.chatSubtitle}>{chatJob.customer_name}</Text>
              </View>
              <View style={styles.headerSpacer} />
            </View>
            <ScrollView contentContainerStyle={styles.chatMessages}>
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
                    <Text style={styles.messageBody}>{message.body}</Text>
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
            <View style={styles.chatComposer}>
              <TextInput
                value={chatText}
                onChangeText={setChatText}
                placeholder="Write a message..."
                placeholderTextColor={colors.textDim}
                style={styles.chatInput}
                multiline
              />
              <Pressable
                style={styles.sendButton}
                onPress={() => void sendMessage()}
                disabled={sendingMessage || !chatText.trim()}
              >
                <Ionicons name="send" size={19} color={colors.white} />
              </Pressable>
            </View>
          </SafeAreaView>
        ) : null}
      </Modal>
    </MechanicScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.sm, paddingBottom: spacing.xxl },
  toolbar: { marginBottom: spacing.md },
  filters: { flexDirection: "row", gap: 8 },
  filterButton: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 0,
  },
  filterButtonActive: { backgroundColor: colors.amber, borderColor: colors.amber },
  filterText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  filterTextActive: { color: colors.bg },
  refreshButton: { alignSelf: "flex-end", flexDirection: "row", gap: 6, alignItems: "center", paddingVertical: spacing.sm },
  refreshText: { color: colors.amber, fontSize: 13, fontWeight: "700" },
  loader: { marginTop: spacing.xl },
  error: { color: colors.sos, marginBottom: spacing.md },
  stack: { gap: 10 },
  card: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: 0, padding: spacing.md },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm, marginBottom: spacing.sm },
  service: { color: colors.text, fontWeight: "800", flex: 1 },
  status: { color: colors.amber, fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  completedText: { color: colors.success },
  emergencyText: { color: colors.sos },
  scheduledText: { color: colors.amber },
  vehicle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  issue: { color: colors.textMuted, marginTop: 4, lineHeight: 20 },
  meta: { color: colors.textDim, fontSize: 12, marginTop: spacing.sm },
  customer: { color: colors.text, fontSize: 14, fontWeight: "700", marginTop: spacing.sm },
  compactCardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md },
  compactHint: { color: colors.amber, fontSize: 12, fontWeight: "700" },
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
  detailHeaderActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerIconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerIssueButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerActionImage: { width: 27, height: 27, resizeMode: "contain" },
  issueModalOverlay: { flex: 1, justifyContent: "center", padding: spacing.md, backgroundColor: "rgba(0,0,0,0.5)" },
  issueModalCard: { backgroundColor: colors.bgElevated, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  issueModalTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  issueModalHint: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: spacing.xs, marginBottom: spacing.md },
  issueOptions: { gap: spacing.xs },
  issueOption: { minHeight: 48, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  issueOptionText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "700" },
  issueCancelButton: { minHeight: 44, marginTop: spacing.md, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  issueCancelText: { color: colors.textMuted, fontWeight: "800" },
  detailContent: { padding: spacing.lg, paddingBottom: spacing.xl },
  detailType: { color: colors.amber, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  detailCustomer: { color: colors.text, fontSize: 28, fontWeight: "800", marginTop: spacing.sm, marginBottom: spacing.lg },
  locationCard: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: spacing.lg, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  locationText: { flex: 1 },
  locationLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  locationValue: { color: colors.text, fontSize: 16, lineHeight: 23, marginTop: 3 },
  locationHint: { color: colors.amber, fontSize: 12, fontWeight: "700", marginTop: spacing.sm },
  detailLabel: { color: colors.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 0.8, marginTop: spacing.lg },
  detailValue: { color: colors.text, fontSize: 16, lineHeight: 22, marginTop: 4 },
  detailActions: { gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgElevated },
  chatButton: { minHeight: 48, borderWidth: 1, borderColor: colors.blue, flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center" },
  chatText: { color: colors.blue, fontWeight: "800", fontSize: 14 },
  chatSupportSection: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, gap: spacing.sm },
  supportTitle: { color: colors.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  arrivedButton: { minHeight: 48, borderWidth: 1, borderColor: colors.amber, alignItems: "center", justifyContent: "center" },
  arrivedText: { color: colors.amber, fontWeight: "800", fontSize: 14 },
  completeButton: { minHeight: 48, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  completeText: { color: colors.bg, fontWeight: "800", fontSize: 14 },
  chatScreen: { flex: 1, backgroundColor: colors.bg },
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
});
