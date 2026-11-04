import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/contexts/ThemeContext';
import { normalizeText } from '@/lib/typography';

export default function PaymentMethodsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  
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
          onPress={() => router.replace("/(app)/motorist-settings")}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to profile settings"
        >
          <Ionicons name="arrow-back" size={26} color={colors.text} />
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
              <View style={[styles.defaultBadge, { backgroundColor: colors.softCard }]}>
                <Text style={[styles.defaultText, { color: colors.primary }]}>Default</Text>
              </View>
            ) : item.type !== 'cash' ? (
              <TouchableOpacity onPress={() => handleDelete(item.id, item.name)} style={styles.deleteButton}>
                <Ionicons name="trash-outline" size={22} color="#EF4444" />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        )}
      />

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: 22 + insets.bottom,
          },
        ]}
      >
        <TouchableOpacity style={[styles.addButton, { backgroundColor: '#0037B0' }]} onPress={() => setIsAdding(true)}>
          <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add Payment Method</Text>
        </TouchableOpacity>
      </View>

      {/* ADD PAYMENT MODAL */}
      <Modal
        visible={isAdding}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setIsAdding(false)}
      >
        <SafeAreaView
          style={[styles.modalSafeArea, { backgroundColor: colors.bg }]}
          edges={['top', 'bottom']}
        >
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => setIsAdding(false)}
                style={[styles.modalCloseButton, { backgroundColor: colors.card }]}
                accessibilityRole="button"
                accessibilityLabel="Back to payment methods"
              >
                <Ionicons name="arrow-back" size={23} color={colors.text} />
              </TouchableOpacity>
              <View style={styles.modalHeaderCopy}>
                <Text style={[styles.modalEyebrow, { color: colors.primary }]}>
                  PAYMENT SETTINGS
                </Text>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Add payment method
                </Text>
              </View>
              <View style={styles.modalHeaderSpacer} />
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.formHeading, { color: colors.text }]}>
                Choose a payment type
              </Text>
              <Text style={[styles.formDescription, { color: colors.textMuted }]}>
                Select the account you want to link.
              </Text>

              <View style={styles.typeSelector}>
                {([
                  {
                    type: 'gcash',
                    title: 'GCash',
                    description: 'Mobile wallet',
                    icon: 'phone-portrait-outline',
                  },
                  {
                    type: 'card',
                    title: 'Card',
                    description: 'Credit or debit',
                    icon: 'card-outline',
                  },
                ] as const).map((option) => {
                  const selected = newType === option.type;
                  return (
                    <TouchableOpacity
                      key={option.type}
                      style={[
                        styles.typeButton,
                        {
                          backgroundColor: selected ? colors.softCard : colors.card,
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => setNewType(option.type)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <View
                        style={[
                          styles.typeIcon,
                          { backgroundColor: selected ? colors.primary : colors.bg },
                        ]}
                      >
                        <Ionicons
                          name={option.icon}
                          size={23}
                          color={selected ? '#FFFFFF' : colors.textMuted}
                        />
                      </View>
                      <Text style={[styles.typeText, { color: colors.text }]}>
                        {option.title}
                      </Text>
                      <Text style={[styles.typeDescription, { color: colors.textMuted }]}>
                        {option.description}
                      </Text>
                      {selected ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={19}
                          color={colors.primary}
                          style={styles.typeSelectedIcon}
                        />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  {newType === 'gcash' ? 'GCash mobile number' : 'Card number'}
                </Text>
                <View
                  style={[
                    styles.inputContainer,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <Ionicons
                    name={newType === 'gcash' ? 'phone-portrait-outline' : 'card-outline'}
                    size={21}
                    color={colors.textMuted}
                  />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder={newType === 'gcash' ? '09XX XXX XXXX' : 'XXXX XXXX XXXX XXXX'}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    value={accountDetails}
                    onChangeText={setAccountDetails}
                    maxLength={newType === 'gcash' ? 11 : 16}
                    accessibilityLabel={newType === 'gcash' ? 'GCash mobile number' : 'Card number'}
                  />
                </View>
                <Text style={[styles.inputHint, { color: colors.textMuted }]}>
                  {newType === 'gcash'
                    ? 'Enter the mobile number registered to GCash.'
                    : 'Your card details are kept private.'}
                </Text>
              </View>
            </ScrollView>

            <View
              style={[
                styles.modalFooter,
                { backgroundColor: colors.bg, borderTopColor: colors.border },
              ]}
            >
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: colors.primary }]}
                onPress={handleAddPayment}
                accessibilityRole="button"
              >
                <Text style={styles.saveButtonText}>Link Account</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
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

  modalSafeArea: { flex: 1 },
  modalKeyboard: { flex: 1 },
  modalHeader: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalHeaderCopy: { flex: 1, gap: 3 },
  modalHeaderSpacer: { width: 42 },
  modalEyebrow: { fontSize: normalizeText(11), fontWeight: '800', letterSpacing: 1.1 },
  modalTitle: { fontSize: normalizeText(21), fontWeight: '800' },
  modalCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: { flex: 1 },
  modalContent: { padding: 24, paddingBottom: 28 },
  formHeading: { fontSize: normalizeText(19), fontWeight: '800' },
  formDescription: { marginTop: 6, fontSize: normalizeText(14), lineHeight: 20 },
  typeSelector: { flexDirection: 'row', gap: 12, marginTop: 22, marginBottom: 30 },
  typeButton: {
    flex: 1,
    minHeight: 132,
    padding: 15,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  typeText: { fontSize: normalizeText(16), fontWeight: '800' },
  typeDescription: { marginTop: 3, fontSize: normalizeText(12) },
  typeSelectedIcon: { position: 'absolute', top: 12, right: 12 },
  formGroup: { marginBottom: 12 },
  inputLabel: { fontSize: normalizeText(15), fontWeight: '700', marginBottom: 10 },
  inputContainer: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  input: { flex: 1, minHeight: 54, fontSize: normalizeText(17), letterSpacing: 0.5 },
  inputHint: { marginTop: 9, fontSize: normalizeText(12), lineHeight: 17 },
  modalFooter: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveButton: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
  },
  saveButtonText: { color: '#FFFFFF', fontSize: normalizeText(16), fontWeight: '800' },
});