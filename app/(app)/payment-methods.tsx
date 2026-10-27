import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '@/contexts/ThemeContext';
import { normalizeText } from '@/lib/typography';

export default function PaymentMethodsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  
  // Using local state for a safe, database-free capstone demo
  const [methods, setMethods] = useState([
    { id: 'cash-1', type: 'cash', name: 'Cash', details: 'Pay mechanic directly after service', isDefault: true }
  ]);
  
  const [isAdding, setIsAdding] = useState(false);
  const [newType, setNewType] = useState<'gcash' | 'card'>('gcash');
  const [accountDetails, setAccountDetails] = useState('');

  const handleAddPayment = () => {
    if (!accountDetails.trim()) {
      Alert.alert("Missing Details", "Please enter your account information.");
      return;
    }

    const newMethod = {
      id: Date.now().toString(),
      type: newType,
      name: newType === 'gcash' ? 'GCash' : 'Credit/Debit Card',
      details: newType === 'gcash' ? `Linked to ${accountDetails}` : `**** **** **** ${accountDetails.slice(-4) || '0000'}`,
      isDefault: false
    };

    setMethods([...methods, newMethod]);
    setIsAdding(false);
    setAccountDetails('');
    Alert.alert("Success", `${newMethod.name} successfully linked to your account.`);
  };

  const handleSetDefault = (id: string) => {
    setMethods(methods.map(m => ({ ...m, isDefault: m.id === id })));
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert("Remove Payment Method", `Are you sure you want to remove this ${name}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
          setMethods(methods.filter(m => m.id !== id));
        }
      }
    ]);
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'cash': return 'cash-outline';
      case 'gcash': return 'phone-portrait-outline';
      case 'card': return 'card-outline';
      default: return 'wallet-outline';
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={26} color="#000000" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Payment Methods</Text>
        <View style={{ width: 26 }} />
      </View>

      <FlatList
        data={methods}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Linked Methods</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={[styles.paymentCard, { backgroundColor: colors.card, borderColor: item.isDefault ? '#0037B0' : colors.border }]}
            onPress={() => handleSetDefault(item.id)}
          >
            <View style={[styles.iconBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Ionicons name={getIconForType(item.type)} size={26} color="#0037B0" />
            </View>
            <View style={styles.paymentInfo}>
              <Text style={[styles.paymentName, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.paymentDetails, { color: colors.textMuted }]}>{item.details}</Text>
            </View>
            
            {item.isDefault ? (
              <View style={[styles.defaultBadge, { backgroundColor: 'rgba(255, 107, 0, 0.1)' }]}>
                <Text style={[styles.defaultText, { color: '#0037B0' }]}>Default</Text>
              </View>
            ) : item.type !== 'cash' ? (
              <TouchableOpacity onPress={() => handleDelete(item.id, item.name)} style={styles.deleteButton}>
                <Ionicons name="trash-outline" size={22} color="#EF4444" />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        )}
      />

      <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <TouchableOpacity style={[styles.addButton, { backgroundColor: '#0037B0' }]} onPress={() => setIsAdding(true)}>
          <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add Payment Method</Text>
        </TouchableOpacity>
      </View>

      {/* ADD PAYMENT MODAL */}
      <Modal visible={isAdding} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={[styles.modalRoot, { backgroundColor: colors.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add Payment Method</Text>
            <TouchableOpacity onPress={() => setIsAdding(false)}>
              <Text style={[styles.modalCancel, { color: colors.textMuted }]}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.typeSelector}>
            <TouchableOpacity 
              style={[styles.typeButton, newType === 'gcash' ? { backgroundColor: '#0037B0', borderColor: '#0037B0' } : { backgroundColor: colors.card, borderColor: colors.border }]} 
              onPress={() => setNewType('gcash')}>
              <Ionicons name="phone-portrait-outline" size={22} color={newType === 'gcash' ? '#FFFFFF' : colors.text} />
              <Text style={[styles.typeText, { color: newType === 'gcash' ? '#FFFFFF' : colors.text }]}>GCash</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.typeButton, newType === 'card' ? { backgroundColor: '#0037B0', borderColor: '#0037B0' } : { backgroundColor: colors.card, borderColor: colors.border }]} 
              onPress={() => setNewType('card')}>
              <Ionicons name="card-outline" size={22} color={newType === 'card' ? '#FFFFFF' : colors.text} />
              <Text style={[styles.typeText, { color: newType === 'card' ? '#FFFFFF' : colors.text }]}>Card</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>
              {newType === 'gcash' ? 'GCash Mobile Number' : 'Card Number'}
            </Text>
            <TextInput 
              style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]} 
              placeholder={newType === 'gcash' ? "09XX XXX XXXX" : "XXXX XXXX XXXX XXXX"} 
              placeholderTextColor={colors.textMuted} 
              keyboardType="numeric" 
              value={accountDetails} 
              onChangeText={setAccountDetails} 
              maxLength={newType === 'gcash' ? 11 : 16}
            />
          </View>

          <TouchableOpacity style={[styles.saveButton, { backgroundColor: '#0037B0' }]} onPress={handleAddPayment}>
            <Text style={styles.saveButtonText}>Link Account</Text>
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
  sectionTitle: { fontSize: normalizeText(15), fontWeight: '700', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  
  paymentCard: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 16, borderWidth: 2, marginBottom: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4 },
  iconBox: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginRight: 16, borderWidth: 1 },
  paymentInfo: { flex: 1 },
  paymentName: { fontSize: normalizeText(18), fontWeight: 'bold', marginBottom: 6 },
  paymentDetails: { fontSize: normalizeText(15), fontWeight: '600' },
  
  defaultBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  defaultText: { fontSize: normalizeText(14), fontWeight: 'bold' },
  deleteButton: { padding: 8 },

  footer: { position: 'absolute', bottom: 0, width: '100%', padding: 22, borderTopWidth: 1 },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 12, gap: 8 },
  addButtonText: { color: '#FFFFFF', fontSize: normalizeText(18), fontWeight: 'bold' },

  modalRoot: { flex: 1, padding: 24, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  modalTitle: { fontSize: normalizeText(22), fontWeight: 'bold' },
  modalCancel: { fontSize: normalizeText(18), fontWeight: '600' },
  
  typeSelector: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  typeButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 12, borderWidth: 1, gap: 8 },
  typeText: { fontSize: normalizeText(17), fontWeight: 'bold' },
  
  formGroup: { marginBottom: 36 },
  inputLabel: { fontSize: normalizeText(16), fontWeight: '700', marginBottom: 10 },
  input: { padding: 18, borderRadius: 12, fontSize: normalizeText(18), borderWidth: 1, letterSpacing: 1 },
  
  saveButton: { paddingVertical: 18, borderRadius: 12, alignItems: 'center' },
  saveButtonText: { color: '#FFFFFF', fontSize: normalizeText(18), fontWeight: 'bold' },
});