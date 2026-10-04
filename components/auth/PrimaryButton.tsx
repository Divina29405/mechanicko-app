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
};

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  icon,
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.bg} />
      ) : (
        <>
          <Text style={styles.label}>{label}</Text>
          {icon ? <Image source={icon} style={styles.icon} /> : null}
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
});
