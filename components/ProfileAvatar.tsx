import { Image, StyleSheet, View } from "react-native";
import { useState } from "react";

type ProfileAvatarProps = {
  uri?: string | null;
  name?: string | null;
  size: number;
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
};

export function ProfileAvatar({
  uri,
  size,
  backgroundColor = "#FFF1D6",
  borderColor,
}: ProfileAvatarProps) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const validUri = uri || null;
  const [displayedUri, setDisplayedUri] = useState<string | null>(validUri);
  const radius = size / 2;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor,
          borderColor,
          borderWidth: borderColor ? 1 : 0,
        },
      ]}
    >
      {displayedUri ? (
        <Image
          source={{ uri: displayedUri }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        />
      ) : null}
      {validUri && validUri !== failedUri && validUri !== displayedUri ? (
        <Image
          source={{ uri: validUri }}
          onLoad={() => setDisplayedUri(validUri)}
          onError={() => {
            setFailedUri(validUri);
          }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius, opacity: 0 }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});