import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/contexts/ThemeContext';
import { listVehicles } from '@/services/vehicleService';
import type { Vehicle } from '@/types/vehicle';
import { isValidPlateNumber } from '@/lib/plateNumber';

const COMMON_SYMPTOMS = [
  'Flat Tire / Puncture',
  'Dead Battery',
  'Engine Won\'t Start',
  'Engine Overheating',
  'Brake Failure',
  'Out of Fuel',
  'Electrical Issue',
  'Others',
];

const SYMPTOM_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  'Flat Tire / Puncture': 'ellipse-outline',
  'Dead Battery': 'battery-dead-outline',
  'Engine Won\'t Start': 'power-outline',
  'Engine Overheating': 'thermometer-outline',
  'Brake Failure': 'warning-outline',
  'Out of Fuel': 'water-outline',
  'Electrical Issue': 'flash-outline',
  Others: 'ellipsis-horizontal-circle-outline',
};

const EMERGENCY_PRIMARY = '#2450D8';

type EmergencyChecklistProps = {
  embedded?: boolean;
  initialLocation?: { lat: number; lng: number };
  initialVehicle?: Vehicle | null;
  onSubmitted?: (request: Record<string, unknown>) => void;
  onClose?: () => void;
};

export default function EmergencyChecklistScreen({
  embedded = false,
  initialLocation,
  initialVehicle,
  onSubmitted,
  onClose,
}: EmergencyChecklistProps = {}) {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors: themeColors } = useAppTheme();
  const colors = { ...themeColors, primary: EMERGENCY_PRIMARY };
  const closeScreen = () => {
    if (embedded) {
      onClose?.();
      return;
    }
    router.back();
  };
  const locationParams = {
    lat: initialLocation?.lat ?? (Number(params.lat) || 14.5794),
    lng: initialLocation?.lng ?? (Number(params.lng) || 121.0359),
  };

  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [vehicleType, setVehicleType] = useState(
    initialVehicle
      ? `${initialVehicle.make} ${initialVehicle.model}`.trim()
      : "",
  );
  const [plateNumber, setPlateNumber] = useState(
    initialVehicle?.plate_number ?? "",
  );
  const [availableVehicles, setAvailableVehicles] = useState<Vehicle[]>(
    initialVehicle ? [initialVehicle] : [],
  );
  const [vehiclePickerVisible, setVehiclePickerVisible] = useState(false);
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sosSentVisible, setSosSentVisible] = useState(false);
  const [validationNotice, setValidationNotice] = useState<{
    title: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    const loadPrimaryVehicle = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user.id) return;
      const { data, error } = await listVehicles(session.user.id);
      if (error) {
        Alert.alert('Unable to load vehicle', error);
        return;
      }
      setAvailableVehicles(data);
      if (initialVehicle) return;
      const primaryVehicle: Vehicle | undefined = data.find((vehicle) => vehicle.is_primary) ?? data[0];
      if (!primaryVehicle) return;
      setVehicleType(`${primaryVehicle.make} ${primaryVehicle.model}`.trim());
      setPlateNumber(primaryVehicle.plate_number);
    };
    void loadPrimaryVehicle();
  }, [initialVehicle]);

  const openNotesEditor = () => {
    setNotesDraft(additionalNotes);
    setIsEditingNotes(true);
  };

  const saveNotesDraft = () => {
    setAdditionalNotes(notesDraft.trim());
    setIsEditingNotes(false);
  };

  const chooseVehicle = () => {
    if (availableVehicles.length < 2) {
      Alert.alert(
        "No other vehicles",
        "Add another vehicle in Profile > My Garage to switch vehicles.",
      );
      return;
    }
    setVehiclePickerVisible(true);
  };

  const selectVehicle = (vehicle: Vehicle) => {
    setVehicleType(`${vehicle.make} ${vehicle.model}`.trim());
    setPlateNumber(vehicle.plate_number);
    setVehiclePickerVisible(false);
  };

  const toggleSymptom = (symptom: string) => {
    if (selectedSymptoms.includes(symptom)) {
      setSelectedSymptoms(selectedSymptoms.filter(s => s !== symptom));
    } else {
      setSelectedSymptoms([...selectedSymptoms, symptom]);
    }
  };

  const handleSubmitEmergency = async () => {
    if (selectedSymptoms.length === 0) {
      setValidationNotice({
        title: "Assessment Required",
        message: "Please select at least one symptom.",
      });
      return;
    }
    if (!additionalNotes.trim()) {
      setValidationNotice({
        title: "Details Required",
        message: "Please provide your situation and location.",
      });
      return;
    }
    if (!vehicleType.trim() || !plateNumber.trim()) {
      Alert.alert("Vehicle Details Required", "Please enter your vehicle model and plate number.");
      return;
    }
    if (!isValidPlateNumber(plateNumber.trim())) {
      Alert.alert(
        "Invalid Plate Number",
        "Use up to 7 letters or numbers, with at most one space.",
      );
      return;
    }
    setIsSubmitting(true);
    
    const issueDescription = `Symptoms: ${selectedSymptoms.join(', ')}.\nNotes: ${additionalNotes}`;
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session ? session.user.id : 'guest_motorist';

    if (session?.user.id) {
      const { data: ongoingRequest, error: ongoingRequestError } = await supabase
        .from('service_requests')
        .select('id')
        .eq('motorist_id', session.user.id)
        .in('status', [
          'pending',
          'scheduled',
          'accepted',
          'in_transit',
          'arrived',
          'in_progress',
        ])
        .limit(1)
        .maybeSingle();
      if (ongoingRequestError) {
        setIsSubmitting(false);
        Alert.alert('Unable to verify booking', ongoingRequestError.message);
        return;
      }
      if (ongoingRequest) {
        setIsSubmitting(false);
        Alert.alert(
          'Ongoing order in progress',
          'You cannot send a new Emergency SOS while you have an ongoing order. Please use your current booking or wait until it is finished.',
        );
        return;
      }
    }

    const { data: request, error } = await supabase
      .from('service_requests')
      .insert([{ 
          motorist_id: userId,
          latitude: locationParams.lat,
          longitude: locationParams.lng,
          status: 'pending',
          request_type: 'emergency',
          search_radius_km: 5,
          service_price: 350,
          service_name: 'Emergency SOS Dispatch',
          delivery_fee: 0,
          estimated_total: 350,
          vehicle_type: vehicleType.trim(),
          plate_number: plateNumber.trim().toUpperCase(),
          vehicle_issue: issueDescription
      }])
      .select()
      .single();

    setIsSubmitting(false);

    if (error) {
      Alert.alert("Dispatch Error", error.message);
    } else {
      onSubmitted?.(request);
      setSosSentVisible(true);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.titleRow}>
            <TouchableOpacity onPress={closeScreen} style={styles.titleBackButton} accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.pageTitle, { color: colors.text }]}>EMERGENCY SOS FORM</Text>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.text }]}>YOUR VEHICLE</Text>
          <TouchableOpacity style={[styles.vehicleCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={chooseVehicle} activeOpacity={0.8}>
            <View style={[styles.vehicleIcon, { backgroundColor: colors.softCard }]}><Ionicons name="car" size={25} color={colors.primary} /></View>
            <View style={styles.vehicleCopy}>
              <View style={styles.vehicleMetaRow}>
                <Text style={[styles.vehicleBadge, { color: colors.primary, backgroundColor: colors.softCard }]}>GARAGE DEFAULT</Text>
                <Text style={[styles.vehicleYear, { color: colors.textMuted }]}>Primary vehicle</Text>
              </View>
              <Text style={[styles.vehicleName, { color: colors.text }]}>{vehicleType || 'Primary vehicle not set'}</Text>
              <Text style={[styles.vehiclePlate, { color: colors.textMuted }]}>PLATE: {plateNumber || 'NOT SET'}</Text>
            </View>
            <Ionicons name="checkmark-circle" size={23} color={colors.primary} />
          </TouchableOpacity>

          <View style={styles.issueHeading}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>SELECT VEHICLE ISSUE</Text>
            <Text style={styles.dispatchHint}>1-TAP FAST DISPATCH</Text>
          </View>
          <View style={styles.issueGrid}>
            {COMMON_SYMPTOMS.map((symptom) => {
              const isSelected = selectedSymptoms.includes(symptom);
              return (
                <TouchableOpacity key={symptom} style={[styles.issueCard, { backgroundColor: colors.card, borderColor: colors.border }, isSelected && { borderColor: colors.primary, borderLeftColor: colors.primary, backgroundColor: colors.softCard }]} onPress={() => toggleSymptom(symptom)} activeOpacity={0.8}>
                  <View style={styles.issueCardTop}>
                    <Ionicons name={SYMPTOM_ICONS[symptom]} size={23} color={isSelected ? colors.primary : colors.textMuted} />
                    <Ionicons name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} size={23} color={isSelected ? colors.primary : colors.border} />
                  </View>
                  <Text style={[styles.issueTitle, { color: isSelected ? colors.primary : colors.text }]}>{symptom.replace(' / ', ' /\\n')}</Text>
                  <Text style={[styles.issueSubtitle, { color: colors.textMuted }]}>{isSelected ? 'Selected for dispatch' : 'Tap to select'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={[styles.locationCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={openNotesEditor} activeOpacity={0.8}>
            <Ionicons name="location-outline" size={22} color={colors.primary} />
            <View style={styles.locationCopy}><Text style={[styles.locationTitle, { color: colors.text }]}>BREAKDOWN LOCATION & DETAILS</Text><Text style={[styles.locationValue, { color: colors.textMuted }]}>{additionalNotes || 'Add your exact location and what you need help with'}</Text></View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={[styles.feeCard, { backgroundColor: colors.softCard }]}>
            <View style={styles.feeHeader}><Text style={[styles.feeTitle, { color: colors.text }]}><Ionicons name="shield-checkmark-outline" size={19} color={colors.primary} /> Standard Roadside Guarantee</Text><Text style={[styles.fixedBadge, { color: colors.primary, backgroundColor: colors.btnSecondary }]}>FIXED DISPATCH</Text></View>
            <View style={styles.feeRow}><View><Text style={[styles.feeAmount, { color: colors.text }]}>₱350.00</Text><Text style={[styles.feeCaption, { color: colors.textMuted }]}>Base emergency dispatch fee</Text></View><View><Text style={[styles.cashText, { color: colors.primary }]}>Cash</Text><Text style={[styles.feeCaption, { color: colors.textMuted }]}>Paid directly upon arrival</Text></View></View>
            <Text style={[styles.feeNote, { color: colors.textMuted }]}><Ionicons name="information-circle-outline" size={16} color={colors.primary} /> Parts and replacement labor are assessed & approved on-site before work begins.</Text>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.backAction, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={closeScreen}><Text style={[styles.backActionText, { color: colors.textMuted }]}>Back</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.submitAction, isSubmitting && styles.disabledButton]} onPress={handleSubmitEmergency} disabled={isSubmitting}><Text style={styles.submitActionText}>{isSubmitting ? 'Dispatching...' : 'Submit Dispatch'}</Text><Ionicons name="arrow-forward-circle-outline" size={21} color="#FFFFFF" /></TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={isEditingNotes}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={saveNotesDraft}
      >
        <KeyboardAvoidingView style={[styles.modalContainer, { backgroundColor: colors.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={saveNotesDraft} style={styles.modalCloseButton} accessibilityLabel="Back to emergency form">
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Your location & situation</Text>
            <View style={styles.modalHeaderSpacer} />
          </View>

          <ScrollView
            contentContainerStyle={styles.notesEditorContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.notesIntro, { backgroundColor: colors.primary }]}>
              <View style={styles.notesIntroIcon}>
                <Ionicons name="location" size={22} color={colors.primary} />
              </View>
              <View style={styles.notesIntroCopy}>
                <Text style={styles.notesIntroTitle}>Help us find you faster</Text>
                <Text style={styles.notesIntroText}>
                  Tell the mechanic where you are and what is happening.
                </Text>
              </View>
            </View>

            <Text style={[styles.notesLabel, { color: colors.text }]}>LOCATION & SITUATION</Text>
            <Text style={[styles.notesHint, { color: colors.textMuted }]}>
              Include a landmark, road direction, and the issue you are experiencing.
            </Text>
            <View style={[styles.notesInputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="create-outline" size={20} color={colors.primary} style={styles.notesInputIcon} />
              <TextInput
                style={[styles.fullScreenInput, { color: colors.text }]}
                placeholder="Example: Parked on the right shoulder before the overpass. The engine will not start."
                placeholderTextColor={colors.textMuted}
                multiline
                autoFocus={true}
                textAlignVertical="top"
                value={notesDraft}
                onChangeText={setNotesDraft}
              />
            </View>
            <Text style={[styles.notesCharacterHint, { color: colors.textMuted }]}>
              {notesDraft.length} characters
            </Text>
          </ScrollView>

          <TouchableOpacity style={[styles.modalSaveButton, { backgroundColor: colors.primary }]} onPress={saveNotesDraft} activeOpacity={0.85}>
            <Ionicons name="checkmark-circle-outline" size={21} color="#FFFFFF" />
            <Text style={styles.modalSaveButtonText}>Save details</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={vehiclePickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setVehiclePickerVisible(false)}
      >
        <View style={styles.vehiclePickerOverlay}>
          <View style={[styles.vehiclePickerCard, { backgroundColor: colors.card }]}>
            <View style={styles.vehiclePickerHeader}>
              <View style={styles.vehiclePickerTitleCopy}>
                <Text style={[styles.vehiclePickerTitle, { color: colors.text }]}>Choose a vehicle</Text>
                <Text style={[styles.vehiclePickerSubtitle, { color: colors.textMuted }]}>
                  Select the vehicle for this emergency request
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setVehiclePickerVisible(false)}
                style={[styles.vehiclePickerClose, { backgroundColor: colors.btnSecondary }]}
                accessibilityLabel="Close vehicle picker"
              >
                <Ionicons name="close" size={22} color={colors.text} />
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
                      { backgroundColor: isSelected ? colors.softCard : colors.card, borderColor: isSelected ? colors.primary : colors.border },
                    ]}
                    onPress={() => selectVehicle(vehicle)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.vehiclePickerIcon, { backgroundColor: colors.softCard }]}>
                      <Ionicons name="car" size={22} color={colors.primary} />
                    </View>
                    <View style={styles.vehiclePickerOptionCopy}>
                      <View style={styles.vehiclePickerMeta}>
                        <Text style={[styles.vehiclePickerBadge, { color: colors.primary }]}>
                          {vehicle.is_primary ? "PRIMARY" : "GARAGE"}
                        </Text>
                        {vehicle.is_primary ? (
                          <Text style={[styles.vehiclePickerDefault, { color: colors.textMuted }]}>Garage default</Text>
                        ) : null}
                      </View>
                      <Text style={[styles.vehiclePickerName, { color: colors.text }]}>
                        {vehicle.make} {vehicle.model}
                      </Text>
                      <Text style={[styles.vehiclePickerPlate, { color: colors.textMuted }]}>
                        PLATE: {vehicle.plate_number}
                      </Text>
                    </View>
                    <Ionicons
                      name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                      size={23}
                      color={isSelected ? colors.primary : colors.textMuted}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={validationNotice !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setValidationNotice(null)}
      >
        <View style={styles.detailsRequiredOverlay}>
          <View
            style={[
              styles.detailsRequiredCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            accessibilityRole="alert"
          >
            <Text
              style={[
                styles.detailsRequiredTitle,
                { color: colors.text },
              ]}
            >
              {validationNotice?.title}
            </Text>
            <Text
              style={[
                styles.detailsRequiredMessage,
                { color: colors.textMuted },
              ]}
            >
              {validationNotice?.message}
            </Text>
            <TouchableOpacity
              style={[
                styles.detailsRequiredButton,
                { backgroundColor: colors.primary },
              ]}
              onPress={() => setValidationNotice(null)}
              accessibilityRole="button"
            >
              <Text style={styles.detailsRequiredButtonText}>Understood</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={sosSentVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSosSentVisible(false);
          closeScreen();
        }}
      >
        <View style={styles.successOverlay}>
          <View
            style={[
              styles.successCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            accessibilityRole="alert"
          >
            <View
              style={[
                styles.successIconWrap,
                { backgroundColor: colors.softCard },
              ]}
            >
              <Ionicons name="checkmark" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.successTitle, { color: colors.text }]}>
              SOS request sent
            </Text>
            <Text style={[styles.successMessage, { color: colors.textMuted }]}>
              Nearby mechanics have been notified. We&apos;ll let you know when
              someone accepts your request.
            </Text>
            <TouchableOpacity
              style={[
                styles.successButton,
                { backgroundColor: "#FF3800" },
              ]}
              onPress={() => {
                setSosSentVisible(false);
                closeScreen();
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.successButtonText}>View map</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  keyboard: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 10 },
  titleBackButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { color: '#30323D', fontSize: 19, fontWeight: '900', letterSpacing: 0.5 },
  sectionTitle: { color: '#30323D', fontSize: 13, fontWeight: '900', letterSpacing: 0.7 },
  vehicleCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 24, borderWidth: 1, borderColor: '#E4E5EC', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 5, elevation: 2 },
  vehicleIcon: { width: 54, height: 54, borderRadius: 12, backgroundColor: '#E8ECFF', alignItems: 'center', justifyContent: 'center', marginRight: 13 },
  vehicleCopy: { flex: 1 },
  vehicleMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  vehicleBadge: { color: '#24439A', backgroundColor: '#E1E7FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, fontSize: 10, fontWeight: '900' },
  vehicleYear: { color: '#7D8295', fontSize: 12, fontWeight: '700' },
  vehicleName: { color: '#192038', fontSize: 18, fontWeight: '900' },
  vehiclePlate: { color: '#7D8295', fontSize: 12, fontWeight: '700', marginTop: 3, letterSpacing: 0.7 },
  vehiclePickerOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 50, 0.45)', justifyContent: 'flex-end' },
  vehiclePickerCard: { maxHeight: '82%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: Platform.OS === 'ios' ? 30 : 20 },
  vehiclePickerHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 },
  vehiclePickerTitleCopy: { flex: 1 },
  vehiclePickerTitle: { color: '#30323D', fontSize: 20, fontWeight: '900' },
  vehiclePickerSubtitle: { color: '#7D8295', fontSize: 13, marginTop: 4 },
  vehiclePickerClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F2F8' },
  vehiclePickerOption: { minHeight: 88, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4E5EC', borderRadius: 16, padding: 13, flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  vehiclePickerOptionSelected: { backgroundColor: '#F0F3FF', borderColor: '#24439A', borderLeftWidth: 4 },
  vehiclePickerIcon: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#E8ECFF', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  vehiclePickerOptionCopy: { flex: 1 },
  vehiclePickerMeta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 3 },
  vehiclePickerBadge: { color: '#24439A', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  vehiclePickerDefault: { color: '#7D8295', fontSize: 11 },
  vehiclePickerName: { color: '#30323D', fontSize: 16, fontWeight: '900' },
  vehiclePickerPlate: { color: '#7D8295', fontSize: 11, fontWeight: '700', letterSpacing: 0.7, marginTop: 3 },
  issueHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  dispatchHint: { color: '#2450D8', fontSize: 11, fontWeight: '900' },
  issueGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  issueCard: { width: '48.5%', minHeight: 132, backgroundColor: '#FFFFFF', borderRadius: 15, padding: 14, justifyContent: 'space-between', borderWidth: 1, borderColor: '#E4E5EC', shadowColor: '#172B66', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  issueCardSelected: { backgroundColor: '#FFFFFF', borderColor: '#E4E5EC', borderLeftColor: '#24439A', borderLeftWidth: 4 },
  issueCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  issueTitle: { color: '#20263C', fontSize: 14, lineHeight: 18, fontWeight: '800' },
  issueTitleSelected: { color: '#24439A' },
  issueSubtitle: { color: '#7D8295', fontSize: 11, lineHeight: 14 },
  assessmentCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#ECECF1', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 5, elevation: 1 },
  assessmentTitle: { color: '#20263C', fontSize: 16, fontWeight: '900', marginBottom: 12 },
  assessmentQuestion: { color: '#30323D', fontSize: 12, fontWeight: '600', marginBottom: 12 },
  safetyRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  safetyOption: { flex: 1, minHeight: 55, borderRadius: 11, backgroundColor: '#E0E6FF', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10 },
  safetySelectedText: { color: '#202A54', fontSize: 12, fontWeight: '900', flex: 1 },
  safetyText: { color: '#7D8295', fontSize: 12, fontWeight: '700', flex: 1 },
  locationCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, borderWidth: 1, borderColor: '#E4E5EC' },
  locationCopy: { flex: 1 },
  locationTitle: { color: '#30323D', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  locationValue: { color: '#7D8295', fontSize: 12, lineHeight: 17, marginTop: 4 },
  feeCard: { backgroundColor: '#E0E6FF', borderRadius: 16, padding: 16, marginBottom: 18 },
  feeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  feeTitle: { color: '#20263C', fontSize: 14, fontWeight: '900', flex: 1 },
  fixedBadge: { color: '#24439A', backgroundColor: '#C7D4FF', paddingHorizontal: 7, paddingVertical: 5, borderRadius: 5, fontSize: 10, fontWeight: '900' },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  feeAmount: { color: '#20263C', fontSize: 22, fontWeight: '900' },
  feeCaption: { color: '#69718A', fontSize: 11, marginTop: 3 },
  cashText: { color: '#24439A', fontSize: 18, fontWeight: '900', textAlign: 'right' },
  feeNote: { color: '#4C5368', fontSize: 11, lineHeight: 16, marginTop: 18 },
  actionRow: { flexDirection: 'row', gap: 10, paddingBottom: 12 },
  backAction: { width: 96, minHeight: 52, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE0EA', alignItems: 'center', justifyContent: 'center' },
  backActionText: { color: '#536078', fontSize: 15, fontWeight: '800' },
  submitAction: { flex: 1, minHeight: 52, borderRadius: 15, backgroundColor: '#FF3800', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 7, elevation: 3 },
  submitActionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  header: { minHeight: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerSpacer: { width: 40 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800' },
  container: { padding: 16, paddingBottom: 28 },
  vehicleRow: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 12 },
  vehicleInput: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, fontSize: 13 },
  checklistContainer: { marginBottom: 16, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  checklistItem: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1 },
  symptomIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  checklistText: { flex: 1, fontSize: 14, fontWeight: '700' },
  label: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  fieldHint: { fontSize: 12, marginBottom: 7 },
  mockInputButton: { minHeight: 60, flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, marginBottom: 12, borderWidth: 1, gap: 10 },
  mockInputText: { flex: 1, fontSize: 13, lineHeight: 18 },
  confirmButton: { minHeight: 48, flexDirection: 'row', gap: 8, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  disabledButton: { opacity: 0.65 },
  confirmButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  modalContainer: { flex: 1, padding: 20, paddingTop: Platform.OS === 'ios' ? 24 : 20 },
  modalHeader: { minHeight: 52, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 14, marginBottom: 18, borderBottomWidth: 1 },
  modalCloseButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  modalHeaderSpacer: { width: 36 },
  modalTitle: { fontSize: 18, fontWeight: '900', textTransform: 'capitalize' },
  modalCloseText: { fontSize: 15, fontWeight: '800' },
  notesEditorContent: { paddingBottom: 20 },
  notesIntro: { borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 26 },
  notesIntroIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  notesIntroCopy: { flex: 1 },
  notesIntroTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', marginBottom: 4 },
  notesIntroText: { color: '#E8EEFF', fontSize: 12, lineHeight: 17 },
  notesLabel: { fontSize: 13, fontWeight: '900', letterSpacing: 0.8, marginBottom: 6 },
  notesHint: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  notesInputCard: { minHeight: 210, borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'flex-start' },
  notesInputIcon: { marginTop: 2, marginRight: 10 },
  fullScreenInput: { flex: 1, minHeight: 180, padding: 0, fontSize: 15, lineHeight: 22 },
  notesCharacterHint: { textAlign: 'right', fontSize: 11, marginTop: 7 },
  modalSaveButton: { paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginBottom: Platform.OS === 'ios' ? 20 : 0 },
  modalSaveButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  detailsRequiredOverlay: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: 'rgba(16, 24, 40, 0.58)' },
  detailsRequiredCard: { padding: 22, borderWidth: 1, borderRadius: 22, shadowColor: '#101828', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 22, elevation: 12 },
  detailsRequiredTitle: { fontSize: 20, lineHeight: 26, fontWeight: '800' },
  detailsRequiredMessage: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  detailsRequiredButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 22, borderRadius: 13 },
  detailsRequiredButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  successOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.52)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  successCard: { width: '100%', maxWidth: 360, alignItems: 'center', padding: 24, borderRadius: 22, borderWidth: 1, elevation: 12, shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  successIconWrap: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  successTitle: { fontSize: 21, fontWeight: '900', textAlign: 'center' },
  successMessage: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8, marginBottom: 22 },
  successButton: { width: '100%', minHeight: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  successButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});