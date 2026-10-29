import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, LayoutAnimation } from "react-native";
import * as SecureStore from "expo-secure-store";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { isValidPlateNumber, sanitizePlateNumber } from "@/lib/plateNumber";

export type VehicleType = "motorcycle" | "sedan" | "suv" | "van";
export type FuelType = "Gasoline" | "Diesel" | "Electric";

export function usePrimaryRideForm() {
  const { role } = useLocalSearchParams<{ role?: string }>();
  const { session } = useAuth();
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType | null>(null);
  const [multipleVehicles, setMultipleVehicles] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [makeDropdownOpen, setMakeDropdownOpen] = useState(false);
  const [selectedMake, setSelectedMake] = useState<string | null>(null);
  const [selectedFuel, setSelectedFuel] = useState<FuelType | null>(null);
  const [modelName, setModelName] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAlmostDone, setShowAlmostDone] = useState(false);

  function animateUiChange() {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.scaleXY),
    );
  }

  async function continueSetup() {
    const normalizedPlateNumber = sanitizePlateNumber(plateNumber).trim();
    if (plateNumber.trim() && !isValidPlateNumber(normalizedPlateNumber)) {
      Alert.alert(
        "Invalid Plate Number",
        "Use up to 7 letters or numbers, with at most one space.",
      );
      return;
    }
    const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
    const activeSession = session ?? sessionResult.session;
    const hasVehicleDetails =
      !!selectedVehicle &&
      !!selectedMake &&
      !!modelName.trim() &&
      !!vehicleYear.trim() &&
      !!plateNumber.trim() &&
      !!selectedFuel;

    if (!hasVehicleDetails) {
      await SecureStore.setItemAsync(
        "pending_primary_ride",
        JSON.stringify({ role, skipped: true }),
      );
      router.push({
        pathname: "/quick-account-setup",
        params: { role: role === "mechanic" ? "mechanic" : "customer", completed: "2" },
      });
      return;
    }
    const vehicleRecord = {
      type: selectedVehicle, make: selectedMake, model: modelName.trim(),
      year: vehicleYear.trim(), plate_number: normalizedPlateNumber,
      fuel_type: selectedFuel, is_primary: true,
      mechanic_id: role === "mechanic" ? activeSession?.user.id ?? null : null,
      motorist_id: role === "mechanic" ? null : activeSession?.user.id ?? null,
    };
    if (sessionError || !activeSession?.user.id) {
      await SecureStore.setItemAsync(
        "pending_primary_ride",
        JSON.stringify({ ...vehicleRecord, role }),
      );
      router.push({
        pathname: "/quick-account-setup",
        params: { role: role === "mechanic" ? "mechanic" : "customer", completed: "2" },
      });
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("vehicles").insert(vehicleRecord);
    setSaving(false);
    if (error) {
      Alert.alert("Could not save vehicle", error.message);
      return;
    }
    router.push({
      pathname: "/quick-account-setup",
      params: { role: role === "mechanic" ? "mechanic" : "customer", completed: "2" },
    });
  }

  return {
    selectedVehicle, setSelectedVehicle, multipleVehicles, setMultipleVehicles, step,
    setStep, makeDropdownOpen, setMakeDropdownOpen, selectedMake, setSelectedMake,
    selectedFuel, setSelectedFuel, modelName, setModelName, vehicleYear, setVehicleYear,
    plateNumber, setPlateNumber, saving, showAlmostDone, setShowAlmostDone, animateUiChange,
    continueSetup,
  };
}
