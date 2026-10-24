import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '@/contexts/ThemeContext';
import { normalizeText } from '@/lib/typography';

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
          <Ionicons name="arrow-back" size={26} color="#000000" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Saved Locations</Text>
        <View style={{ width: 26 }} />
      </View>

      <FlatList
        data={locations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="map-outline" size={64} color={colors.border} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Saved Locations</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>Add your home or work addresses for faster SOS dispatching.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.locationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.iconBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Ionicons name={item.icon as any} size={26} color={colors.primary} />
            </View>
            <View style={styles.locationInfo}>
              <Text style={[styles.locationLabel, { color: colors.text }]}>{item.label}</Text>
              <Text style={[styles.locationAddress, { color: colors.textMuted }]} numberOfLines={2}>{item.address}</Text>
            </View>
            <TouchableOpacity onPress={() => handleDelete(item.id, item.label)} style={styles.deleteButton}>
              <Ionicons name="trash-outline" size={22} color="#EF4444" />
            </TouchableOpacity>
          </View>
        )}
      />

      <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <TouchableOpacity style={[styles.addButton, { backgroundColor: colors.primary }]} onPress={() => setIsAdding(true)}>
          <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
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
              <Ionicons name="home-outline" size={20} color={newLabel === 'Home' ? '#FFFFFF' : colors.text} />
              <Text style={[styles.typeText, { color: newLabel === 'Home' ? '#FFFFFF' : colors.text }]}>Home</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.typeButton, newLabel === 'Work' ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border }]} 
              onPress={() => setNewLabel('Work')}>
              <Ionicons name="briefcase-outline" size={20} color={newLabel === 'Work' ? '#FFFFFF' : colors.text} />
              <Text style={[styles.typeText, { color: newLabel === 'Work' ? '#FFFFFF' : colors.text }]}>Work</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.typeButton, newLabel === 'Other' ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border }]} 
              onPress={() => setNewLabel('Other')}>
              <Ionicons name="location-outline" size={20} color={newLabel === 'Other' ? '#FFFFFF' : colors.text} />
              <Text style={[styles.typeText, { color: newLabel === 'Other' ? '#FFFFFF' : colors.text }]}>Other</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.formGroup}>
            {newLabel === 'Other' && (
              <TextInput 
                style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border, marginBottom: 14 }]} 
                placeholder="Label (e.g., Gym, Partner's House)" 
                placeholderTextColor={colors.textMuted} 
                value={customLabel} 
                onChangeText={setCustomLabel} 
              />
            )}
            <TextInput 
              style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border, height: 90, textAlignVertical: 'top' }]} 
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: normalizeText(20), fontWeight: '800' },
  
  listContent: { padding: 22, paddingBottom: 110 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 60, padding: 24 },
  emptyTitle: { fontSize: normalizeText(22), fontWeight: 'bold', marginTop: 18, marginBottom: 10 },
  emptySubtitle: { fontSize: normalizeText(16), textAlign: 'center', lineHeight: normalizeText(22) },
  
  locationCard: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 16, borderWidth: 1, marginBottom: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4 },
  iconBox: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginRight: 16, borderWidth: 1 },
  locationInfo: { flex: 1, paddingRight: 10 },
  locationLabel: { fontSize: normalizeText(18), fontWeight: 'bold', marginBottom: 6 },
  locationAddress: { fontSize: normalizeText(15), fontWeight: '500', lineHeight: normalizeText(20) },
  deleteButton: { padding: 8, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 10 },

  footer: { position: 'absolute', bottom: 0, width: '100%', padding: 22, borderTopWidth: 1 },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 12, gap: 8 },
  addButtonText: { color: '#FFFFFF', fontSize: normalizeText(18), fontWeight: 'bold' },

  modalRoot: { flex: 1, padding: 24, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  modalTitle: { fontSize: normalizeText(22), fontWeight: 'bold' },
  modalCancel: { fontSize: normalizeText(18), fontWeight: '600' },
  
  typeSelector: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  typeButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 12, borderWidth: 1, gap: 8 },
  typeText: { fontSize: normalizeText(16), fontWeight: 'bold' },
  
  formGroup: { marginBottom: 36 },
  input: { padding: 18, borderRadius: 12, fontSize: normalizeText(17), borderWidth: 1 },
  
  saveButton: { paddingVertical: 18, borderRadius: 12, alignItems: 'center' },
  saveButtonText: { color: '#FFFFFF', fontSize: normalizeText(18), fontWeight: 'bold' },
});