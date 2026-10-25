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
import { normalizeText } from '@/lib/typography';

type Props = {
  label: string;
  required?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  error?: string | null;
  isPassword?: boolean;
  variant?: "default" | "mechanic" | "customer";
  keyboardType?: KeyboardTypeOptions;
  fieldStyle?: StyleProp<ViewStyle>;
  iconStyle?: StyleProp<TextStyle>;
  iconImage?: ImageSourcePropType;
  iconImageStyle?: StyleProp<ImageStyle>;
  labelStyle?: StyleProp<TextStyle>;
  inputStyle?: StyleProp<TextStyle>;
} & Pick<TextInputProps, 'value' | 'onChangeText' | 'autoCapitalize' | 'autoComplete' | 'textContentType' | 'returnKeyType' | 'onSubmitEditing' | 'onBlur'>;

export function AuthInput({
  label,
  required = false,
  icon,
  error,
  isPassword,
  variant = "default",
  keyboardType,
  fieldStyle,
  iconStyle,
  iconImage,
  iconImageStyle,
  labelStyle,
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
          labelStyle,
        ]}
      >
        {label}{required ? " *" : ""}
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
            size={isMechanic ? normalizeText(20) : normalizeText(20)}
            color={focused ? colors.amber : colors.textDim}
            style={iconStyle}
          />
        )}
        <TextInput
          {...inputProps}
          onFocus={() => setFocused(true)}
          onBlur={(event) => {
            setFocused(false);
            inputProps.onBlur?.(event);
          }}
          style={[
            styles.input,
            (isMechanic || isCustomer) && styles.mechanicInput,
            inputStyle,
          ]}
          placeholderTextColor={colors.textDim}
          keyboardType={keyboardType}
          secureTextEntry={hidden}
        />
        {isPassword ? (
          <Pressable onPress={() => setHidden((v) => !v)} hitSlop={10}>
            <Ionicons
              name={hidden ? "eye-outline" : "eye-off-outline"}
              size={isMechanic || isCustomer ? normalizeText(20) : normalizeText(20)}
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
    marginBottom: 8,
  },
  customerWrap: {
    marginBottom: 8,
  },
  label: {
    color: colors.textMuted,
    fontSize: normalizeText(14),
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
  mechanicLabel: {
    color: "#2C2F35",
    fontSize: normalizeText(13),
    fontWeight: "500",
    lineHeight: normalizeText(18),
    marginBottom: 4,
  },
  customerLabel: {
    color: colors.text,
    fontSize: normalizeText(14),
    fontWeight: "500",
    lineHeight: normalizeText(18),
    marginBottom: 4,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgInput,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  fieldFocused: {
    borderColor: colors.amber,
  },
  fieldError: {
    borderColor: colors.error,
  },
  mechanicField: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  imageIcon: {
    width: 22,
    height: 22,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: normalizeText(16),
    paddingVertical: 14,
  },
  mechanicInput: {
    fontSize: normalizeText(16),
    paddingVertical: 10,
  },
  error: {
    marginTop: 6,
    color: colors.error,
    fontSize: normalizeText(13),
  },
  mechanicError: {
    marginTop: 4,
    fontSize: normalizeText(12),
  },
  customerError: {
    marginTop: 4,
    fontSize: normalizeText(12),
  },
});