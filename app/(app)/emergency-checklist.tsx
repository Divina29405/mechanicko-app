import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/contexts/ThemeContext';
import { listVehicles } from '@/services/vehicleService';
import type { Vehicle } from '@/types/vehicle';

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

export default function EmergencyChecklistScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors } = useAppTheme();

  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [vehicleType, setVehicleType] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadPrimaryVehicle = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user.id) return;
      const { data, error } = await listVehicles(session.user.id);
      if (error) {
        Alert.alert('Unable to load vehicle', error);
        return;
      }
      const primaryVehicle: Vehicle | undefined = data.find((vehicle) => vehicle.is_primary);
      if (!primaryVehicle) return;
      setVehicleType(`${primaryVehicle.make} ${primaryVehicle.model}`.trim());
      setPlateNumber(primaryVehicle.plate_number);
    };
    void loadPrimaryVehicle();
  }, []);

  const openNotesEditor = () => {
    setNotesDraft(additionalNotes);
    setIsEditingNotes(true);
  };

  const saveNotesDraft = () => {
    setAdditionalNotes(notesDraft.trim());
    setIsEditingNotes(false);
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
      Alert.alert("Assessment Required", "Please select at least one symptom.");
      return;
    }
    if (!additionalNotes.trim()) {
      Alert.alert("Details Required", "Please provide your situation and location.");
      return;
    }
    if (!vehicleType.trim() || !plateNumber.trim()) {
      Alert.alert("Vehicle Details Required", "Please enter your vehicle model and plate number.");
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

    const { error } = await supabase
      .from('service_requests')
      .insert([{ 
          motorist_id: userId,
          latitude: parseFloat(params.lat as string) || 14.5794, 
          longitude: parseFloat(params.lng as string) || 121.0359,
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
      }]);

    setIsSubmitting(false);

    if (error) {
      Alert.alert("Dispatch Error", error.message);
    } else {
      Alert.alert("SOS Sent!", "Your emergency request has been dispatched.", [
        { text: "View Map", onPress: () => router.back() }
      ]);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: '#F8F8FC' }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.titleRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.titleBackButton} accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={24} color="#30323D" />
            </TouchableOpacity>
            <Text style={styles.pageTitle}>EMERGENCY SOS FORM</Text>
          </View>

          <Text style={styles.sectionTitle}>YOUR VEHICLE</Text>
          <View style={styles.vehicleCard}>
            <View style={styles.vehicleIcon}><Ionicons name="car" size={25} color="#24439A" /></View>
            <View style={styles.vehicleCopy}>
              <View style={styles.vehicleMetaRow}>
                <Text style={styles.vehicleBadge}>GARAGE DEFAULT</Text>
                <Text style={styles.vehicleYear}>Primary vehicle</Text>
              </View>
              <Text style={styles.vehicleName}>{vehicleType || 'Primary vehicle not set'}</Text>
              <Text style={styles.vehiclePlate}>PLATE: {plateNumber || 'NOT SET'}</Text>
            </View>
            <Ionicons name="checkmark-circle" size={23} color="#24439A" />
          </View>

          <View style={styles.issueHeading}>
            <Text style={styles.sectionTitle}>SELECT VEHICLE ISSUE</Text>
            <Text style={styles.dispatchHint}>1-TAP FAST DISPATCH</Text>
          </View>
          <View style={styles.issueGrid}>
            {COMMON_SYMPTOMS.map((symptom) => {
              const isSelected = selectedSymptoms.includes(symptom);
              return (
                <TouchableOpacity key={symptom} style={[styles.issueCard, isSelected && styles.issueCardSelected]} onPress={() => toggleSymptom(symptom)} activeOpacity={0.8}>
                  <View style={styles.issueCardTop}>
                    <Ionicons name={SYMPTOM_ICONS[symptom]} size={23} color={isSelected ? '#24439A' : '#7D8295'} />
                    <Ionicons name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} size={23} color={isSelected ? '#24439A' : '#C5C8D5'} />
                  </View>
                  <Text style={[styles.issueTitle, isSelected && styles.issueTitleSelected]}>{symptom.replace(' / ', ' /\\n')}</Text>
                  <Text style={styles.issueSubtitle}>{isSelected ? 'Selected for dispatch' : 'Tap to select'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.locationCard} onPress={openNotesEditor} activeOpacity={0.8}>
            <Ionicons name="location-outline" size={22} color="#24439A" />
            <View style={styles.locationCopy}><Text style={styles.locationTitle}>BREAKDOWN LOCATION & DETAILS</Text><Text style={styles.locationValue}>{additionalNotes || 'Add your exact location and what you need help with'}</Text></View>
            <Ionicons name="chevron-forward" size={20} color="#7D8295" />
          </TouchableOpacity>

          <View style={styles.feeCard}>
            <View style={styles.feeHeader}><Text style={styles.feeTitle}><Ionicons name="shield-checkmark-outline" size={19} color="#24439A" /> Standard Roadside Guarantee</Text><Text style={styles.fixedBadge}>FIXED DISPATCH</Text></View>
            <View style={styles.feeRow}><View><Text style={styles.feeAmount}>₱350.00</Text><Text style={styles.feeCaption}>Base emergency dispatch fee</Text></View><View><Text style={styles.cashText}>Cash</Text><Text style={styles.feeCaption}>Paid directly upon arrival</Text></View></View>
            <Text style={styles.feeNote}><Ionicons name="information-circle-outline" size={16} color="#F08A00" /> Parts and replacement labor are assessed & approved on-site before work begins.</Text>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.backAction} onPress={() => router.back()}><Text style={styles.backActionText}>Back</Text></TouchableOpacity>
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
            <Text style={[styles.modalTitle, { color: colors.text }]}>Your Location & Situation</Text>
            <TouchableOpacity onPress={saveNotesDraft}>
              <Text style={[styles.modalCloseText, { color: colors.primary }]}>Save</Text>
            </TouchableOpacity>
          </View>
          
          <TextInput
            style={[styles.fullScreenInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            placeholder="e.g., Parked on the right shoulder before the overpass..."
            placeholderTextColor={colors.textMuted}
            multiline
            autoFocus={true}
            value={notesDraft}
            onChangeText={setNotesDraft}
          />
          
          <TouchableOpacity style={[styles.modalSaveButton, { backgroundColor: colors.primary }]} onPress={saveNotesDraft}>
            <Text style={styles.modalSaveButtonText}>Save Details</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
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
  issueHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  dispatchHint: { color: '#C44A00', fontSize: 11, fontWeight: '900' },
  issueGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  issueCard: { width: '48.5%', minHeight: 132, backgroundColor: '#EEF0FF', borderRadius: 15, padding: 14, justifyContent: 'space-between', borderWidth: 1, borderColor: '#DCE1FA', shadowColor: '#172B66', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  issueCardSelected: { backgroundColor: '#D8E1FF', borderColor: '#24439A', borderWidth: 2 },
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
  submitAction: { flex: 1, minHeight: 52, borderRadius: 15, backgroundColor: '#E52C28', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: '#E52C28', shadowOpacity: 0.25, shadowRadius: 7, elevation: 3 },
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
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, marginBottom: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 19, fontWeight: '800' },
  modalCloseText: { fontSize: 15, fontWeight: '800' },
  fullScreenInput: { flex: 1, padding: 16, borderRadius: 12, fontSize: 16, lineHeight: 24, textAlignVertical: 'top', borderWidth: 1, marginBottom: 16 },
  modalSaveButton: { paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: Platform.OS === 'ios' ? 20 : 0 },
  modalSaveButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
});