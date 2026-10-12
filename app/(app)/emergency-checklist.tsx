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
  container: { padding: 20, paddingBottom: 32 },
  checklistContainer: { marginBottom: 26, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  checklistItem: { minHeight: 66, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  symptomIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  checklistText: { flex: 1, fontSize: 14, fontWeight: '700' },
  label: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  fieldHint: { fontSize: 12, marginBottom: 10 },
  mockInputButton: { minHeight: 76, flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 14, borderWidth: 1, gap: 12 },
  mockInputText: { flex: 1, fontSize: 14, lineHeight: 20 },
  confirmButton: { minHeight: 54, flexDirection: 'row', gap: 10, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  disabledButton: { opacity: 0.65 },
  confirmButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  modalContainer: { flex: 1, padding: 20, paddingTop: Platform.OS === 'ios' ? 24 : 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, marginBottom: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 19, fontWeight: '800' },
  modalCloseText: { fontSize: 15, fontWeight: '800' },
  fullScreenInput: { flex: 1, padding: 16, borderRadius: 12, fontSize: 16, lineHeight: 24, textAlignVertical: 'top', borderWidth: 1, marginBottom: 16 },
  modalSaveButton: { paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: Platform.OS === 'ios' ? 20 : 0 },
  modalSaveButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
});