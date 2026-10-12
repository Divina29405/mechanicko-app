import { Ionicons } from "@expo/vector-icons";
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  type MapPressEvent,
  type Region,
} from "react-native-maps";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, radii, spacing } from "@/lib/theme";

export type PinnedLocation = {
  address: string;
  latitude: number;
  longitude: number;
};

type Props = {
  initialLocation: PinnedLocation | null;
  onSelect: (location: PinnedLocation) => void;
  onConfirm: () => void;
  confirming?: boolean;
};

const DEFAULT_REGION: Region = {
  latitude: 14.5995,
  longitude: 120.9842,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

const googleMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export function GoogleLocationPicker({
  initialLocation,
  onSelect,
  onConfirm,
  confirming = false,
}: Props) {
  const [region, setRegion] = useState<Region>(
    initialLocation
      ? { ...initialLocation, latitudeDelta: 0.01, longitudeDelta: 0.01 }
      : DEFAULT_REGION,
  );
  const [pin, setPin] = useState<PinnedLocation | null>(initialLocation);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  async function reverseGeocode(latitude: number, longitude: number) {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${encodeURIComponent(googleMapsKey ?? "")}`,
      );
      const result = await response.json();
      return result.results?.[0]?.formatted_address as string | undefined;
    } catch {
      return undefined;
    }
  }

  async function selectCoordinate(latitude: number, longitude: number, address?: string) {
    const selected = {
      latitude,
      longitude,
      address: address ?? (await reverseGeocode(latitude, longitude)) ?? `Pinned location (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`,
    };
    setPin(selected);
    onSelect(selected);
    setRegion((current) => ({ ...current, latitude, longitude }));
  }

  async function searchAddress() {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (!googleMapsKey) {
      Alert.alert("Google Maps setup required", "Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY to your environment.");
      return;
    }
    setSearching(true);
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(trimmed)}&components=country:PH&key=${encodeURIComponent(googleMapsKey)}`,
      );
      const result = await response.json();
      const first = result.results?.[0];
      if (!first) {
        Alert.alert("Address not found", "Try a more specific address.");
        return;
      }
      const { lat, lng } = first.geometry.location;
      await selectCoordinate(lat, lng, first.formatted_address);
    } catch {
      Alert.alert("Search failed", "Check your connection and try again.");
    } finally {
      setSearching(false);
    }
  }

  function handleMapPress(event: MapPressEvent) {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    void selectCoordinate(latitude, longitude);
  }

  return (
    <View style={styles.root}>
      <MapView
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        mapType="standard"
        region={region}
        onRegionChangeComplete={setRegion}
        onPress={handleMapPress}
        loadingEnabled
        loadingIndicatorColor={colors.amber}
        showsUserLocation
        showsMyLocationButton
      >
        {pin ? (
          <Marker
            coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
            title="Selected home address"
            description={pin.address}
          />
        ) : null}
      </MapView>
      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void searchAddress()}
          placeholder="Search home address"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
        />
        <Pressable onPress={() => void searchAddress()} style={styles.searchButton}>
          {searching ? <ActivityIndicator color={colors.white} /> : <Ionicons name="search" size={20} color={colors.white} />}
        </Pressable>
      </View>
      <View style={styles.hint}>
        <Text style={styles.hintText}>Search an address or tap the exact spot on the map.</Text>
      </View>
      <Pressable
        onPress={onConfirm}
        disabled={!pin || confirming}
        style={[styles.confirmButton, (!pin || confirming) && styles.disabled]}
      >
        <Text style={styles.confirmText}>{confirming ? "Saving location..." : "Use this location"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  searchRow: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    color: colors.text,
    fontSize: 15,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  searchButton: {
    width: 48,
    borderRadius: radii.md,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: 88,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: "rgba(16,24,40,0.86)",
  },
  hintText: { color: colors.white, textAlign: "center", fontSize: 13 },
  confirmButton: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    minHeight: 52,
    borderRadius: radii.md,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmText: { color: colors.white, fontSize: 15, fontWeight: "800" },
  disabled: { opacity: 0.55 },
});
