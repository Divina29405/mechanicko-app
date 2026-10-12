import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/contexts/ThemeContext';

const COMMON_SYMPTOMS = [
  'Flat Tire / Puncture',
  'Dead Battery',
  'Engine Won\'t Start',
  'Engine Overheating',
  'Brake Failure',
  'Out of Fuel',
  'Electrical Issue'
];

const SYMPTOM_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  'Flat Tire / Puncture': 'ellipse-outline',
  'Dead Battery': 'battery-dead-outline',
  'Engine Won\'t Start': 'power-outline',
  'Engine Overheating': 'thermometer-outline',
  'Brake Failure': 'warning-outline',
  'Out of Fuel': 'water-outline',
  'Electrical Issue': 'flash-outline',
};

export default function EmergencyChecklistScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors } = useAppTheme();

  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [vehicleType, setVehicleType] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    const { error } = await supabase
      .from('service_requests')
      .insert([{ 
          motorist_id: userId,
          latitude: parseFloat(params.lat as string) || 14.5794, 
          longitude: parseFloat(params.lng as string) || 121.0359,
          status: 'pending',
          request_type: 'emergency',
          search_radius_km: 5,
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
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={23} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Emergency Assessment</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={[styles.label, { color: colors.text }]}>Vehicle information</Text>
          <View style={styles.vehicleRow}>
            <TextInput
              style={[styles.vehicleInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
              placeholder="Vehicle model"
              placeholderTextColor={colors.textMuted}
              value={vehicleType}
              onChangeText={setVehicleType}
            />
            <TextInput
              style={[styles.vehicleInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
              placeholder="Plate number"
              placeholderTextColor={colors.textMuted}
              value={plateNumber}
              onChangeText={setPlateNumber}
              autoCapitalize="characters"
            />
          </View>
          <View style={[styles.checklistContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {COMMON_SYMPTOMS.map((symptom) => {
              const isSelected = selectedSymptoms.includes(symptom);
              return (
                <TouchableOpacity
                  key={symptom}
                  style={[
                    styles.checklistItem,
                    { borderBottomColor: colors.border },
                    isSelected && { backgroundColor: 'rgba(240, 162, 2, 0.12)' },
                  ]}
                  onPress={() => toggleSymptom(symptom)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.symptomIcon, { backgroundColor: isSelected ? colors.primary : colors.bg }]}>
                    <Ionicons
                      name={SYMPTOM_ICONS[symptom]}
                      size={20}
                      color={isSelected ? '#FFFFFF' : colors.textMuted}
                    />
                  </View>
                  <Text style={[styles.checklistText, { color: colors.text }]}>{symptom}</Text>
                  <Ionicons
                    name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={isSelected ? colors.primary : '#98A2B3'}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.label, { color: colors.text }]}>Location and situation</Text>
          <Text style={[styles.fieldHint, { color: colors.textMuted }]}>Required for emergency dispatch</Text>
        
          <TouchableOpacity style={[styles.mockInputButton, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => setIsEditingNotes(true)} activeOpacity={0.8}>
            <Ionicons name="location-outline" size={22} color={colors.primary} />
            <Text style={[styles.mockInputText, { color: additionalNotes ? colors.text : colors.textMuted }]}>
              {additionalNotes || 'Add your exact location and what you need help with'}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.confirmButton, { backgroundColor: '#FF4D4F' }, isSubmitting && styles.disabledButton]} onPress={handleSubmitEmergency} disabled={isSubmitting}>
            <Ionicons name="radio-outline" size={21} color="#FFFFFF" />
            <Text style={styles.confirmButtonText}>{isSubmitting ? 'Dispatching...' : 'Request emergency assistance'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={isEditingNotes} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={[styles.modalContainer, { backgroundColor: colors.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Your Location & Situation</Text>
            <TouchableOpacity onPress={() => setIsEditingNotes(false)}>
              <Text style={[styles.modalCloseText, { color: colors.primary }]}>Save</Text>
            </TouchableOpacity>
          </View>
          
          <TextInput
            style={[styles.fullScreenInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            placeholder="e.g., Parked on the right shoulder before the overpass..."
            placeholderTextColor={colors.textMuted}
            multiline
            autoFocus={true}
            value={additionalNotes}
            onChangeText={setAdditionalNotes}
          />
          
          <TouchableOpacity style={[styles.modalSaveButton, { backgroundColor: colors.primary }]} onPress={() => setIsEditingNotes(false)}>
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
  header: { minHeight: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerSpacer: { width: 40 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800' },
  container: { padding: 16, paddingBottom: 24 },
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