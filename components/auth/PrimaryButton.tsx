import {
    ActivityIndicator,
    Image,
    Pressable,
    StyleSheet,
    Text,
    type ImageSourcePropType,
} from "react-native";

import { colors, radii } from "@/lib/theme";

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: ImageSourcePropType;
  variant?: "amber" | "blue" | "login";
};

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  icon,
  variant = "amber",
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === "blue" && styles.blueButton,
        variant === "login" && styles.loginButton,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.bg} />
      ) : (
        <>
          <Text
            style={[
              styles.label,
              variant === "blue" && styles.blueLabel,
              variant === "login" && styles.loginLabel,
            ]}
          >
            {label}
          </Text>
          {icon ? (
            <Image
              source={icon}
              style={[styles.icon, variant === "blue" && styles.blueIcon]}
            />
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.amber,
    minHeight: 54,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  blueButton: {
    backgroundColor: "#24439A",
    minHeight: 42,
    paddingHorizontal: 18,
    borderRadius: 11,
    shadowColor: "#132D73",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  blueLabel: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  loginButton: {
    backgroundColor: "#24439A",
    minHeight: 48,
    borderRadius: 10,
  },
  loginLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
  pressed: {
    backgroundColor: colors.amberMuted,
  },
  disabled: {
    opacity: 0.55,
  },
  label: {
    color: colors.bg,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  icon: {
    width: 18,
    height: 18,
    marginLeft: 8,
    resizeMode: "contain",
  },
  blueIcon: {
    tintColor: "#FFFFFF",
  },
});
