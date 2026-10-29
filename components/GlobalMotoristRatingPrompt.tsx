import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
import { normalizeText } from "@/lib/typography";

const COMPLETED_BOOKING_STATUSES = ["completed", "done", "resolved"];
const RATING_FEEDBACK_TAGS = [
  "On time",
  "Proper tools",
  "Responsive",
  "Careful work",
  "Good communication",
  "Professional",
];

type PendingRating = {
  id: string;
  mechanicId: string;
  mechanicName: string;
};

export function GlobalMotoristRatingPrompt() {
  const { session } = useAuth();
  const { colors } = useAppTheme();
  const [pendingRatingState, setPendingRatingState] = useState<{
    motoristId: string | undefined;
    ratings: PendingRating[];
  }>({ motoristId: undefined, ratings: [] });
  const [ratingForm, setRatingForm] = useState<{
    bookingId: string | null;
    rating: number;
    review: string;
    selectedFeedback: string[];
  }>({
    bookingId: null,
    rating: 5,
    review: "",
    selectedFeedback: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [submittedVisible, setSubmittedVisible] = useState(false);
  const pendingRatingsRef = useRef(new Map<string, PendingRating>());
  const motoristId = session?.user.id;
  const pendingRatings =
    pendingRatingState.motoristId === motoristId
      ? pendingRatingState.ratings
      : [];
  const currentRating = pendingRatings[0];
  const rating =
    ratingForm.bookingId === currentRating?.id ? ratingForm.rating : 5;
  const review =
    ratingForm.bookingId === currentRating?.id ? ratingForm.review : "";
  const selectedFeedback =
    ratingForm.bookingId === currentRating?.id
      ? ratingForm.selectedFeedback
      : [];

  useEffect(() => {
    const pendingRatingsById = new Map<string, PendingRating>();
    pendingRatingsRef.current = pendingRatingsById;
    if (!motoristId) return;

    let active = true;
    const checkingRatingIds = new Set<string>();
    const publishPendingRatings = () => {
      if (active) {
        setPendingRatingState({
          motoristId,
          ratings: Array.from(pendingRatingsById.values()),
        });
      }
    };
    const enqueueRating = async (
      bookingId: string,
      mechanicId: string | null,
      checkForExistingRating: boolean,
    ) => {
      if (
        !mechanicId ||
        pendingRatingsById.has(bookingId) ||
        checkingRatingIds.has(bookingId)
      ) {
        return;
      }

      if (checkForExistingRating) {
        checkingRatingIds.add(bookingId);
        const { data: existingRating, error } = await supabase
          .from("mechanic_ratings")
          .select("id")
          .eq("service_request_id", bookingId)
          .maybeSingle();
        checkingRatingIds.delete(bookingId);
        if (!active) return;
        if (error) {
          console.warn(
            "Could not check whether the completed booking was rated:",
            error.message,
          );
        } else if (existingRating) {
          return;
        }
      }

      const pendingRating = {
        id: bookingId,
        mechanicId,
        mechanicName: "your mechanic",
      };
      pendingRatingsById.set(bookingId, pendingRating);
      publishPendingRatings();

      const { data: mechanic, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", mechanicId)
        .maybeSingle();
      if (!active) return;
      if (error) {
        console.warn("Could not load mechanic name for rating:", error.message);
        return;
      }
      const queuedRating = pendingRatingsById.get(bookingId);
      if (!queuedRating) return;
      pendingRatingsById.set(bookingId, {
        ...queuedRating,
        mechanicName: mechanic?.full_name || "your mechanic",
      });
      publishPendingRatings();
    };

    const loadPendingRatings = async () => {
      const { data: bookings, error: bookingsError } = await supabase
        .from("service_requests")
        .select("id, mechanic_id")
        .eq("motorist_id", motoristId)
        .in("status", COMPLETED_BOOKING_STATUSES);
      if (!active) return;
      if (bookingsError) {
        console.warn(
          "Could not load completed bookings for rating:",
          bookingsError.message,
        );
        return;
      }
      if (!bookings?.length) return;

      const bookingIds = bookings.map((booking) => booking.id);
      const { data: existingRatings, error: ratingsError } = await supabase
        .from("mechanic_ratings")
        .select("service_request_id")
        .in("service_request_id", bookingIds);
      if (!active) return;
      if (ratingsError) {
        console.warn(
          "Could not check completed booking ratings:",
          ratingsError.message,
        );
        return;
      }

      const ratedBookingIds = new Set(
        existingRatings?.map((item) => item.service_request_id) ?? [],
      );
      bookings.forEach((booking) => {
        if (!ratedBookingIds.has(booking.id)) {
          void enqueueRating(booking.id, booking.mechanic_id, false);
        }
      });
    };

    const channel = supabase
      .channel(`global-motorist-rating-${motoristId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "service_requests",
          filter: `motorist_id=eq.${motoristId}`,
        },
        (payload) => {
          const booking = payload.new as {
            id?: string;
            mechanic_id?: string | null;
            status?: string;
          };
          if (
            booking.id &&
            COMPLETED_BOOKING_STATUSES.includes(
              String(booking.status ?? "").toLowerCase(),
            )
          ) {
            void enqueueRating(booking.id, booking.mechanic_id ?? null, true);
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void loadPendingRatings();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(
            `Rating prompt realtime subscription ${status.toLowerCase()}.`,
          );
        }
      });

    return () => {
      active = false;
      pendingRatingsById.clear();
      void supabase.removeChannel(channel);
    };
  }, [motoristId]);

  const submitRating = async () => {
    if (!currentRating || !motoristId || submitting) return;

    setSubmitting(true);
    const reviewDetails = [
      selectedFeedback.length ? `Feedback: ${selectedFeedback.join(", ")}` : "",
      review.trim() ? `Comment: ${review.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const { error: ratingError } = await supabase.rpc(
      "submit_mechanic_rating",
      {
        p_service_request_id: currentRating.id,
        p_mechanic_id: currentRating.mechanicId,
        p_rating: rating,
        p_review: reviewDetails || null,
      },
    );
    if (ratingError) {
      setSubmitting(false);
      Alert.alert("Rating Failed", ratingError.message);
      return;
    }

    pendingRatingsRef.current.delete(currentRating.id);
    setPendingRatingState({
      motoristId,
      ratings: Array.from(pendingRatingsRef.current.values()),
    });
    setRatingForm({
      bookingId: null,
      rating: 5,
      review: "",
      selectedFeedback: [],
    });

    const { error: closeError } = await supabase
      .from("service_requests")
      .update({ status: "closed" })
      .eq("id", currentRating.id)
      .eq("motorist_id", motoristId);
    setSubmitting(false);
    setSubmittedVisible(true);
    if (closeError) {
      console.warn("Could not close the rated booking:", closeError.message);
      Alert.alert(
        "Rating Submitted",
        "Your rating was saved, but the booking could not be closed. Please try again later.",
      );
    }
  };

  useEffect(() => {
    if (!submittedVisible) return;
    const timeout = setTimeout(() => setSubmittedVisible(false), 2200);
    return () => clearTimeout(timeout);
  }, [submittedVisible]);

  return (
    <>
      <Modal
        visible={!!currentRating}
        animationType="slide"
        transparent
        onRequestClose={() => undefined}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalBody}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.title, { color: colors.text }]}>
                How was your service?
              </Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                Share feedback about {currentRating?.mechanicName || "your mechanic"}.
              </Text>

              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() =>
                      setRatingForm((current) => ({
                        bookingId: currentRating?.id ?? null,
                        rating: star,
                        review:
                          current.bookingId === currentRating?.id
                            ? current.review
                            : "",
                        selectedFeedback:
                          current.bookingId === currentRating?.id
                            ? current.selectedFeedback
                            : [],
                      }))
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Rate ${star} out of 5 stars`}
                    accessibilityState={{ selected: star === rating }}
                    hitSlop={6}
                  >
                    <Ionicons
                      name="star"
                      size={30}
                      color={star <= rating ? "#F5A623" : colors.border}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.feedbackHeading, { color: colors.text }]}>
                What went well?
              </Text>
              <View style={styles.feedbackTags}>
                {RATING_FEEDBACK_TAGS.map((tag) => {
                  const isSelected = selectedFeedback.includes(tag);
                  return (
                    <TouchableOpacity
                      key={tag}
                      style={[
                        styles.feedbackTag,
                        {
                          backgroundColor: isSelected
                            ? `${colors.primary}18`
                            : colors.bg,
                          borderColor: isSelected
                            ? colors.primary
                            : colors.border,
                        },
                      ]}
                      onPress={() =>
                      setRatingForm((current) => {
                        const existing =
                          current.bookingId === currentRating?.id
                            ? current.selectedFeedback
                            : [];
                        return {
                          bookingId: currentRating?.id ?? null,
                          rating:
                            current.bookingId === currentRating?.id
                              ? current.rating
                              : 5,
                          review:
                            current.bookingId === currentRating?.id
                              ? current.review
                              : "",
                          selectedFeedback: isSelected
                            ? existing.filter((value) => value !== tag)
                            : [...existing, tag],
                        };
                      })
                      }
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Text
                        style={[
                          styles.feedbackTagText,
                          { color: isSelected ? colors.primary : colors.text },
                        ]}
                      >
                        {tag}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TextInput
                style={[
                  styles.commentInput,
                  {
                    backgroundColor: colors.bg,
                    color: colors.text,
                    borderColor: colors.border,
                  },
                ]}
                placeholder="Add a comment (optional)"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={120}
                value={review}
                onChangeText={(text) =>
                  setRatingForm((current) => ({
                    bookingId: currentRating?.id ?? null,
                    rating:
                      current.bookingId === currentRating?.id
                        ? current.rating
                        : 5,
                    review: text,
                    selectedFeedback:
                      current.bookingId === currentRating?.id
                        ? current.selectedFeedback
                        : [],
                  }))
                }
              />
              <Text style={[styles.commentCounter, { color: colors.textMuted }]}>
                {review.length}/120
              </Text>
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  { backgroundColor: colors.primary },
                  submitting && { opacity: 0.6 },
                ]}
                onPress={submitRating}
                disabled={submitting}
                accessibilityRole="button"
              >
                <Text style={styles.submitButtonText}>
                  {submitting ? "Submitting..." : "Submit"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {submittedVisible ? (
        <View
          style={[
            styles.submittedToast,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Ionicons name="checkmark-circle" size={18} color="#18A957" />
          <Text style={[styles.submittedText, { color: colors.text }]}>
            Submitted
          </Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 22,
  },
  modalContent: {
    width: "100%",
    maxHeight: "78%",
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  modalScroll: { width: "100%" },
  modalBody: { padding: 18, alignItems: "stretch" },
  title: {
    fontSize: normalizeText(20),
    lineHeight: normalizeText(25),
    fontWeight: "900",
  },
  subtitle: {
    fontSize: normalizeText(13),
    lineHeight: normalizeText(18),
    marginTop: 3,
  },
  starsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },
  feedbackHeading: {
    fontSize: normalizeText(14),
    fontWeight: "800",
    marginTop: 15,
    marginBottom: 8,
  },
  feedbackTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  feedbackTag: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: 11,
    borderRadius: 16,
    borderWidth: 1,
  },
  feedbackTagText: {
    fontSize: normalizeText(12),
    fontWeight: "700",
  },
  commentInput: {
    width: "100%",
    borderRadius: 11,
    padding: 11,
    height: 64,
    textAlignVertical: "top",
    marginTop: 13,
    borderWidth: 1,
    fontSize: normalizeText(13),
  },
  commentCounter: {
    alignSelf: "flex-end",
    fontSize: normalizeText(11),
    marginTop: 3,
  },
  submitButton: {
    width: "100%",
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 15,
    marginTop: 12,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: normalizeText(15),
    fontWeight: "800",
  },
  submittedToast: {
    position: "absolute",
    bottom: 18,
    alignSelf: "center",
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 20,
    elevation: 8,
  },
  submittedText: {
    fontSize: normalizeText(13),
    fontWeight: "700",
  },
});
