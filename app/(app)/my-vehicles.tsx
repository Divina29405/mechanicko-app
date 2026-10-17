import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { listVehicles } from '@/services/vehicleService';
import type { Vehicle } from '@/types/vehicle';

export default function MyVehiclesScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { colors } = useAppTheme();
  
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isAdding, setIsAdding] = useState(false);
  const [type, setType] = useState<'car' | 'motorcycle'>('car');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [plate, setPlate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchVehicles = useCallback(async () => {
    if (!session?.user.id) {
      setLoading(false);
      return;
    }
    const { data, error } = await listVehicles(session.user.id);

    if (!error) setVehicles(data);
    setLoading(false);
  }, [session]);

<<<<<<< HEAD
  useFocusEffect(
    useCallback(() => {
      void fetchVehicles();
    }, [fetchVehicles]),
  );
=======
  const handlePlateFormat = (text: string) => {
    let formatted = text.toUpperCase().replace(/[^A-Z0-9\s-]/g, '');
    formatted = formatted.replace(/^([A-Z]{2,3})([0-9]{3,5})$/, '$1 $2');
    setPlate(formatted);
  };
>>>>>>> f238d7c77b686fad362aecc28e73dfb349a04671

  const handleAddVehicle = async () => {
    if (!make.trim() || !model.trim() || !year.trim() || !plate.trim()) {
      Alert.alert("Missing Details", "Please fill out all fields.");
      return;
    }

    const ltoRegex = /^([A-Z]{2,3}[-\s]?[0-9]{3,5}|[0-9]{4}[-\s]?[0-9]{5,7})$/;
    if (!ltoRegex.test(plate.trim())) {
      Alert.alert(
        "Invalid Plate Number", 
        "Please enter a valid LTO plate number (e.g., ABC 1234) or your temporary MV File number."
      );
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.from('vehicles').insert([{
      motorist_id: session?.user.id,
      type, make, model, year, plate_number: plate.toUpperCase()
    }]);

    setIsSubmitting(false);

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      setMake(''); setModel(''); setYear(''); setPlate('');
      setIsAdding(false);
      fetchVehicles();
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert("Remove Vehicle", "Are you sure you want to remove this vehicle from your garage?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
          await supabase.from('vehicles').delete().eq('id', id);
          fetchVehicles();
        } 
      }
    ]);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>My Garage</Text>
        <TouchableOpacity onPress={() => setIsAdding(true)} style={styles.addButton}>
          <Ionicons name="add-circle" size={28} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="car-sport-outline" size={60} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Garage is Empty</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>Add your car or motorcycle so mechanics know exactly what parts to bring.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.vehicleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.vehicleIcon, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                <Ionicons name={item.type === 'car' ? 'car' : 'bicycle'} size={24} color={colors.primary} />
              </View>
              <View style={styles.vehicleInfo}>
                <Text style={[styles.vehicleMakeModel, { color: colors.text }]}>{item.make} {item.model}</Text>
                <Text style={[styles.vehicleDetails, { color: colors.textMuted }]}>{item.year}  •  Plate: {item.plate_number}</Text>
              </View>
              <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteButton}>
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <Modal visible={isAdding} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={[styles.modalRoot, { backgroundColor: colors.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add Vehicle</Text>
            <TouchableOpacity onPress={() => setIsAdding(false)}>
              <Text style={[styles.modalCancel, { color: colors.textMuted }]}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.typeSelector}>
            <TouchableOpacity 
              style={[styles.typeButton, type === 'car' ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border }]} 
              onPress={() => setType('car')}>
              <Ionicons name="car" size={20} color={type === 'car' ? '#FFFFFF' : colors.text} />
              <Text style={[styles.typeText, { color: type === 'car' ? '#FFFFFF' : colors.text }]}>Car</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.typeButton, type === 'motorcycle' ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border }]} 
              onPress={() => setType('motorcycle')}>
              <Ionicons name="bicycle" size={20} color={type === 'motorcycle' ? '#FFFFFF' : colors.text} />
              <Text style={[styles.typeText, { color: type === 'motorcycle' ? '#FFFFFF' : colors.text }]}>Motorcycle</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.formGroup}>
            <TextInput style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]} placeholder="Make (e.g., Toyota, Yamaha)" placeholderTextColor={colors.textMuted} value={make} onChangeText={setMake} />
            <TextInput style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]} placeholder="Model (e.g., Vios, NMAX)" placeholderTextColor={colors.textMuted} value={model} onChangeText={setModel} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TextInput style={[styles.input, { flex: 1, backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]} placeholder="Year (e.g., 2021)" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={year} onChangeText={setYear} />
              <TextInput 
                style={[styles.input, { flex: 1, backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]} 
                placeholder="e.g. ABC 1234" 
                placeholderTextColor={colors.textMuted} 
                autoCapitalize="characters" 
                value={plate} 
                onChangeText={handlePlateFormat} 
                maxLength={15}
              />
            </View>
          </View>

          <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.primary }, isSubmitting && { opacity: 0.7 }]} onPress={handleAddVehicle} disabled={isSubmitting}>
            <Text style={styles.saveButtonText}>{isSubmitting ? 'Saving...' : 'Save Vehicle'}</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  addButton: { padding: 4 },
  listContent: { padding: 20 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 60, padding: 24 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  vehicleCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4 },
  vehicleIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 16, borderWidth: 1 },
  vehicleInfo: { flex: 1 },
  vehicleMakeModel: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  vehicleDetails: { fontSize: 13, fontWeight: '600' },
  deleteButton: { padding: 8, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 8 },
  
  modalRoot: { flex: 1, padding: 24, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  modalCancel: { fontSize: 16, fontWeight: '600' },
  typeSelector: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  typeButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1, gap: 8 },
  typeText: { fontSize: 15, fontWeight: 'bold' },
  formGroup: { gap: 12, marginBottom: 32 },
  input: { padding: 16, borderRadius: 12, fontSize: 16, borderWidth: 1 },
  saveButton: { paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
});