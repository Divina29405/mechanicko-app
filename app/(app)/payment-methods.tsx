import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '@/contexts/ThemeContext';

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
        <TouchableOpacity onPress={() => router.replace('/motorist-profile')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Payment Methods</Text>
        <View style={{ width: 24 }} />
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
            style={[styles.paymentCard, { backgroundColor: colors.card, borderColor: item.isDefault ? colors.primary : colors.border }]}
            onPress={() => handleSetDefault(item.id)}
          >
            <View style={[styles.iconBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Ionicons name={getIconForType(item.type)} size={24} color={colors.primary} />
            </View>
            <View style={styles.paymentInfo}>
              <Text style={[styles.paymentName, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.paymentDetails, { color: colors.textMuted }]}>{item.details}</Text>
            </View>
            
            {item.isDefault ? (
              <View style={[styles.defaultBadge, { backgroundColor: 'rgba(255, 107, 0, 0.1)' }]}>
                <Text style={[styles.defaultText, { color: colors.primary }]}>Default</Text>
              </View>
            ) : item.type !== 'cash' ? (
              <TouchableOpacity onPress={() => handleDelete(item.id, item.name)} style={styles.deleteButton}>
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        )}
      />

      <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <TouchableOpacity style={[styles.addButton, { backgroundColor: colors.primary }]} onPress={() => setIsAdding(true)}>
          <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
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
              style={[styles.typeButton, newType === 'gcash' ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border }]} 
              onPress={() => setNewType('gcash')}>
              <Ionicons name="phone-portrait-outline" size={20} color={newType === 'gcash' ? '#FFFFFF' : colors.text} />
              <Text style={[styles.typeText, { color: newType === 'gcash' ? '#FFFFFF' : colors.text }]}>GCash</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.typeButton, newType === 'card' ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border }]} 
              onPress={() => setNewType('card')}>
              <Ionicons name="card-outline" size={20} color={newType === 'card' ? '#FFFFFF' : colors.text} />
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

          <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.primary }]} onPress={handleAddPayment}>
            <Text style={styles.saveButtonText}>Link Account</Text>
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
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  
  paymentCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 2, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4 },
  iconBox: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 16, borderWidth: 1 },
  paymentInfo: { flex: 1 },
  paymentName: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  paymentDetails: { fontSize: 13, fontWeight: '600' },
  
  defaultBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  defaultText: { fontSize: 12, fontWeight: 'bold' },
  deleteButton: { padding: 8 },

  footer: { position: 'absolute', bottom: 0, width: '100%', padding: 20, borderTopWidth: 1 },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 12, gap: 8 },
  addButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },

  modalRoot: { flex: 1, padding: 24, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  modalCancel: { fontSize: 16, fontWeight: '600' },
  
  typeSelector: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  typeButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 12, borderWidth: 1, gap: 8 },
  typeText: { fontSize: 15, fontWeight: 'bold' },
  
  formGroup: { marginBottom: 32 },
  inputLabel: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  input: { padding: 16, borderRadius: 12, fontSize: 16, borderWidth: 1, letterSpacing: 1 },
  
  saveButton: { paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
});