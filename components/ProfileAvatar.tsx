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
  const imageUris = [
    ...(validUri && displayedUri && displayedUri !== failedUri
      ? [displayedUri]
      : []),
    ...(validUri && validUri !== displayedUri && validUri !== failedUri
      ? [validUri]
      : []),
  ];

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
      {imageUris.map((imageUri) => (
        <Image
          key={imageUri}
          source={{ uri: imageUri }}
          fadeDuration={0}
          onLoad={() => {
            if (validUri === imageUri) {
              setDisplayedUri(imageUri);
            }
          }}
          onError={() => {
            if (validUri === imageUri) {
              setFailedUri(imageUri);
            }
            if (validUri === imageUri && displayedUri === imageUri) {
              setDisplayedUri(null);
            }
          }}
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: radius,
              opacity: imageUri === displayedUri ? 1 : 0,
            },
          ]}
        />
      ))}
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