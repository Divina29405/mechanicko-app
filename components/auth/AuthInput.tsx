import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { colors, radii, spacing } from '@/lib/theme';

type Props = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  error?: string | null;
  isPassword?: boolean;
  variant?: "default" | "mechanic" | "customer";
  keyboardType?: KeyboardTypeOptions;
  fieldStyle?: StyleProp<ViewStyle>;
  iconStyle?: StyleProp<TextStyle>;
  iconImage?: ImageSourcePropType;
  iconImageStyle?: StyleProp<ImageStyle>;
  inputStyle?: StyleProp<TextStyle>;
} & Pick<TextInputProps, 'value' | 'onChangeText' | 'autoCapitalize' | 'autoComplete' | 'textContentType' | 'returnKeyType' | 'onSubmitEditing'>;

export function AuthInput({
  label,
  icon,
  error,
  isPassword,
  variant = "default",
  keyboardType,
  fieldStyle,
  iconStyle,
  iconImage,
  iconImageStyle,
  inputStyle,
  ...inputProps
}: Props) {
  const isMechanic = variant === "mechanic";
  const isCustomer = variant === "customer";
  const [hidden, setHidden] = useState(isPassword ?? false);
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.wrap,
        isMechanic && styles.mechanicWrap,
        isCustomer && styles.customerWrap,
      ]}
    >
      <Text
        style={[
          styles.label,
          isMechanic && styles.mechanicLabel,
          isCustomer && styles.customerLabel,
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.field,
          (isMechanic || isCustomer) && styles.mechanicField,
          focused && styles.fieldFocused,
          error ? styles.fieldError : null,
          fieldStyle,
        ]}>
        {iconImage ? (
          <Image
            source={iconImage}
            resizeMode="contain"
            style={[styles.imageIcon, iconImageStyle]}
          />
        ) : (
          <Ionicons
            name={icon}
            size={isMechanic ? 16 : 20}
            color={focused ? colors.amber : colors.textDim}
            style={iconStyle}
          />
        )}
        <TextInput
          {...inputProps}
          style={[
            styles.input,
            (isMechanic || isCustomer) && styles.mechanicInput,
            inputStyle,
          ]}
          placeholderTextColor={colors.textDim}
          keyboardType={keyboardType}
          secureTextEntry={hidden}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {isPassword ? (
          <Pressable onPress={() => setHidden((v) => !v)} hitSlop={10}>
            <Ionicons
              name={hidden ? "eye-outline" : "eye-off-outline"}
              size={isMechanic || isCustomer ? 16 : 20}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text
          style={[
            styles.error,
            isMechanic && styles.mechanicError,
            isCustomer && styles.customerError,
          ]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  mechanicWrap: {
    marginBottom: 7,
  },
  customerWrap: {
    marginBottom: 7,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
  mechanicLabel: {
    color: "#2C2F35",
    fontSize: 11,
    fontWeight: "400",
    lineHeight: 14,
    marginBottom: 3,
  },
  customerLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
    marginBottom: 3,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bgInput,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    minHeight: 54,
  },
  fieldFocused: {
    borderColor: colors.amber,
  },
  fieldError: {
    borderColor: colors.error,
  },
  mechanicField: {
    minHeight: 42,
    borderWidth: 0,
    borderRadius: 10,
    paddingHorizontal: 10,
    gap: 8,
  },
  imageIcon: {
    width: 20,
    height: 20,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: 12,
  },
  mechanicInput: {
    fontSize: 13,
    paddingVertical: 9,
  },
  error: {
    marginTop: 6,
    color: colors.error,
    fontSize: 12,
  },
  mechanicError: {
    marginTop: 4,
    fontSize: 10,
  },
  customerError: {
    marginTop: 4,
    fontSize: 10,
  },
});
