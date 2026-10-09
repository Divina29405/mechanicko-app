import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Emergency Assessment</Text>
        <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>Select the symptoms you are experiencing. This helps mechanics bring the right tools to your location.</Text>

        <View style={styles.checklistContainer}>
          {COMMON_SYMPTOMS.map((symptom, index) => {
            const isSelected = selectedSymptoms.includes(symptom);
            return (
              <TouchableOpacity 
                key={index} 
                style={[
                  styles.checklistItem, 
                  { backgroundColor: colors.card, borderColor: colors.border },
                  isSelected && { borderColor: colors.primary, backgroundColor: 'rgba(255, 107, 0, 0.05)' }
                ]} 
                onPress={() => toggleSymptom(symptom)}
                activeOpacity={0.7}
              >
                <Text style={[styles.checklistText, { color: isSelected ? colors.primary : colors.text }]}>
                  {isSelected ? '✅ ' : '⬜ '} {symptom}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { color: colors.text }]}>Detailed Description & Location (Required)</Text>
        
        <TouchableOpacity style={[styles.mockInputButton, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => setIsEditingNotes(true)} activeOpacity={0.8}>
          <Text style={[styles.mockInputText, { color: additionalNotes ? colors.text : colors.textMuted }]}>
            {additionalNotes ? additionalNotes : "Tap here to type your exact location and situation..."}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.confirmButton, isSubmitting && { opacity: 0.7 }]} onPress={handleSubmitEmergency} disabled={isSubmitting}>
          <Text style={styles.confirmButtonText}>{isSubmitting ? 'Dispatching...' : '🚨 Dispatch Mechanic Now'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()} disabled={isSubmitting}>
          <Text style={[styles.cancelButtonText, { color: colors.textMuted }]}>Cancel Emergency</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={isEditingNotes} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={[styles.modalContainer, { backgroundColor: colors.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Your Location & Situation</Text>
            <TouchableOpacity onPress={() => setIsEditingNotes(false)}>
              <Text style={[styles.modalCloseText, { color: colors.primary }]}>Done</Text>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, flexGrow: 1, justifyContent: 'center' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 6, marginTop: 20 },
  headerSubtitle: { fontSize: 14, marginBottom: 24, lineHeight: 20 },
  checklistContainer: { marginBottom: 24 },
  checklistItem: { padding: 16, borderRadius: 12, marginBottom: 10, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  checklistText: { fontSize: 15, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  mockInputButton: { padding: 16, borderRadius: 12, minHeight: 80, marginBottom: 24, borderWidth: 1, justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  mockInputText: { fontSize: 16, lineHeight: 22 },
  confirmButton: { backgroundColor: '#FF3800', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12, elevation: 5, shadowColor: '#FF3800', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },
  confirmButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16, letterSpacing: 0.5 },
  cancelButton: { paddingVertical: 12, alignItems: 'center' },
  cancelButtonText: { fontWeight: 'bold', fontSize: 15 },
  modalContainer: { flex: 1, padding: 24, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  modalCloseText: { fontSize: 18, fontWeight: 'bold' },
  fullScreenInput: { flex: 1, padding: 20, borderRadius: 16, fontSize: 18, lineHeight: 28, textAlignVertical: 'top', borderWidth: 1, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  modalSaveButton: { paddingVertical: 18, borderRadius: 12, alignItems: 'center', marginBottom: Platform.OS === 'ios' ? 20 : 0 },
  modalSaveButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 18 },
});