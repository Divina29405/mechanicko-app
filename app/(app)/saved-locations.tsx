import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '@/contexts/ThemeContext';

export default function SavedLocationsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  
  // Using local state for a safe, database-free capstone demo
  const [locations, setLocations] = useState([
    { id: 'loc-1', label: 'Home', address: '123 C. Arellano St, Malabon, Metro Manila', icon: 'home-outline' },
    { id: 'loc-2', label: 'Work', address: 'City of Malabon University, Maya-maya St', icon: 'briefcase-outline' }
  ]);
  
  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState<'Home' | 'Work' | 'Other'>('Other');
  const [customLabel, setCustomLabel] = useState('');
  const [newAddress, setNewAddress] = useState('');

  const handleAddLocation = () => {
    if (!newAddress.trim()) {
      Alert.alert("Missing Address", "Please enter the exact location address.");
      return;
    }
    
    const finalLabel = newLabel === 'Other' ? (customLabel.trim() || 'Saved Place') : newLabel;

    const newLoc = {
      id: Date.now().toString(),
      label: finalLabel,
      address: newAddress,
      icon: newLabel === 'Home' ? 'home-outline' : newLabel === 'Work' ? 'briefcase-outline' : 'location-outline'
    };

    setLocations([...locations, newLoc]);
    setIsAdding(false);
    setNewAddress('');
    setCustomLabel('');
    setNewLabel('Other');
    Alert.alert("Success", `${finalLabel} successfully saved to your locations.`);
  };

  const handleDelete = (id: string, label: string) => {
    Alert.alert("Remove Location", `Are you sure you want to remove ${label} from your saved places?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
          setLocations(locations.filter(l => l.id !== id));
        }
      }
    ]);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.replace('/motorist-profile')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000000" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Saved Locations</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={locations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="map-outline" size={60} color={colors.border} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Saved Locations</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>Add your home or work addresses for faster SOS dispatching.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.locationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.iconBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Ionicons name={item.icon as any} size={24} color={colors.primary} />
            </View>
            <View style={styles.locationInfo}>
              <Text style={[styles.locationLabel, { color: colors.text }]}>{item.label}</Text>
              <Text style={[styles.locationAddress, { color: colors.textMuted }]} numberOfLines={2}>{item.address}</Text>
            </View>
            <TouchableOpacity onPress={() => handleDelete(item.id, item.label)} style={styles.deleteButton}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            </TouchableOpacity>
          </View>
        )}
      />

      <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <TouchableOpacity style={[styles.addButton, { backgroundColor: colors.primary }]} onPress={() => setIsAdding(true)}>
          <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add New Location</Text>
        </TouchableOpacity>
      </View>

      {/* ADD LOCATION MODAL */}
      <Modal visible={isAdding} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={[styles.modalRoot, { backgroundColor: colors.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add New Location</Text>
            <TouchableOpacity onPress={() => setIsAdding(false)}>
              <Text style={[styles.modalCancel, { color: colors.textMuted }]}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.typeSelector}>
            <TouchableOpacity 
              style={[styles.typeButton, newLabel === 'Home' ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border }]} 
              onPress={() => setNewLabel('Home')}>
              <Ionicons name="home-outline" size={18} color={newLabel === 'Home' ? '#FFFFFF' : colors.text} />
              <Text style={[styles.typeText, { color: newLabel === 'Home' ? '#FFFFFF' : colors.text }]}>Home</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.typeButton, newLabel === 'Work' ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border }]} 
              onPress={() => setNewLabel('Work')}>
              <Ionicons name="briefcase-outline" size={18} color={newLabel === 'Work' ? '#FFFFFF' : colors.text} />
              <Text style={[styles.typeText, { color: newLabel === 'Work' ? '#FFFFFF' : colors.text }]}>Work</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.typeButton, newLabel === 'Other' ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border }]} 
              onPress={() => setNewLabel('Other')}>
              <Ionicons name="location-outline" size={18} color={newLabel === 'Other' ? '#FFFFFF' : colors.text} />
              <Text style={[styles.typeText, { color: newLabel === 'Other' ? '#FFFFFF' : colors.text }]}>Other</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.formGroup}>
            {newLabel === 'Other' && (
              <TextInput 
                style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border, marginBottom: 12 }]} 
                placeholder="Label (e.g., Gym, Partner's House)" 
                placeholderTextColor={colors.textMuted} 
                value={customLabel} 
                onChangeText={setCustomLabel} 
              />
            )}
            <TextInput 
              style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border, height: 80, textAlignVertical: 'top' }]} 
              placeholder="Full Address Details" 
              placeholderTextColor={colors.textMuted} 
              multiline
              value={newAddress} 
              onChangeText={setNewAddress} 
            />
          </View>

          <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.primary }]} onPress={handleAddLocation}>
            <Text style={styles.saveButtonText}>Save Location</Text>
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
  
  listContent: { padding: 20, paddingBottom: 100 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 60, padding: 24 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  
  locationCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4 },
  iconBox: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 16, borderWidth: 1 },
  locationInfo: { flex: 1, paddingRight: 10 },
  locationLabel: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  locationAddress: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  deleteButton: { padding: 8, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 8 },

  footer: { position: 'absolute', bottom: 0, width: '100%', padding: 20, borderTopWidth: 1 },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 12, gap: 8 },
  addButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },

  modalRoot: { flex: 1, padding: 24, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  modalCancel: { fontSize: 16, fontWeight: '600' },
  
  typeSelector: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  typeButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1, gap: 6 },
  typeText: { fontSize: 14, fontWeight: 'bold' },
  
  formGroup: { marginBottom: 32 },
  input: { padding: 16, borderRadius: 12, fontSize: 15, borderWidth: 1 },
  
  saveButton: { paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
});