import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';
import { supabase } from '@/lib/supabase'; // Adjust this path if needed

export default function ScheduleFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [vehicleType, setVehicleType] = useState('');
  const [vehicleIssue, setVehicleIssue] = useState('');
  
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      const updatedDate = new Date(date);
      updatedDate.setFullYear(selectedDate.getFullYear());
      updatedDate.setMonth(selectedDate.getMonth());
      updatedDate.setDate(selectedDate.getDate());
      setDate(updatedDate);
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      const updatedDate = new Date(date);
      updatedDate.setHours(selectedTime.getHours());
      updatedDate.setMinutes(selectedTime.getMinutes());
      setDate(updatedDate);
    }
  };

  const handleSubmitSchedule = async () => {
    if (!vehicleType || !vehicleIssue) {
      Alert.alert("Missing Fields", "Please enter your vehicle type and issue description.");
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session ? session.user.id : 'guest_motorist';

    const { error } = await supabase
      .from('service_requests')
      .insert([
        { 
          motorist_id: userId,
          latitude: parseFloat(params.lat as string) || 14.5794, 
          longitude: parseFloat(params.lng as string) || 121.0359,
          status: 'scheduled',
          request_type: 'scheduled',
          scheduled_at: date.toISOString(),
          vehicle_type: vehicleType,
          vehicle_issue: vehicleIssue,
        }
      ]);

    if (error) {
      Alert.alert("Database Error", error.message);
    } else {
      Alert.alert("Success!", "Your appointment has been booked.", [
        { text: "OK", onPress: () => router.back() }
      ]);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.headerTitle}>Schedule Mechanic</Text>
      <Text style={styles.headerSubtitle}>Enter your vehicle information and appointment time.</Text>

      <Text style={styles.label}>Vehicle Type / Model</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., Yamaha Mio, Honda Click"
        placeholderTextColor="#888"
        value={vehicleType}
        onChangeText={setVehicleType}
      />

      <Text style={styles.label}>Describe Issue / Service Needed</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="e.g., General tune-up, oil change"
        placeholderTextColor="#888"
        multiline
        numberOfLines={3}
        value={vehicleIssue}
        onChangeText={setVehicleIssue}
      />

      <Text style={styles.label}>Preferred Date & Time</Text>
      
      <TouchableOpacity style={styles.pickerButton} onPress={() => setShowDatePicker(true)}>
        <Text style={styles.pickerButtonText}>📅 Date: {date.toLocaleDateString()}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.pickerButton} onPress={() => setShowTimePicker(true)}>
        <Text style={styles.pickerButtonText}>⏰ Time: {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      </TouchableOpacity>

      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display="default"
          onValueChange={handleDateChange}
        />
      )}

      {showTimePicker && (
        <DateTimePicker
          value={date}
          mode="time"
          display="default"
          onValueChange={handleTimeChange}
        />
      )}

      <TouchableOpacity style={styles.confirmButton} onPress={handleSubmitSchedule}>
        <Text style={styles.confirmButtonText}>Confirm Schedule</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
        <Text style={styles.cancelButtonText}>Cancel & Go Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#121212',
    flexGrow: 1,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#aaaaaa',
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#cccccc',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#1e1e1e',
    color: '#ffffff',
    padding: 14,
    borderRadius: 12,
    fontSize: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  textArea: {
    height: 90,
    textAlignVertical: 'top',
  },
  pickerButton: {
    backgroundColor: '#1e1e1e',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  pickerButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  confirmButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#ef4444',
    fontWeight: 'bold',
    fontSize: 15,
  },
});