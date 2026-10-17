import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, LayoutAnimation } from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

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
    if (!session?.user.id) {
      Alert.alert("Account session unavailable", "Please sign in again before saving your primary ride.");
      return;
    }
    if (!selectedVehicle || !selectedMake || !modelName.trim() || !vehicleYear.trim() || !plateNumber.trim() || !selectedFuel) {
      Alert.alert("Incomplete vehicle details", "Please complete the vehicle category, make, model, year, plate number, and fuel type.");
      return;
    }
    setSaving(true);
    const vehicleRecord = {
      type: selectedVehicle, make: selectedMake, model: modelName.trim(),
      year: vehicleYear.trim(), plate_number: plateNumber.trim().toUpperCase(),
      fuel_type: selectedFuel, is_primary: true,
      mechanic_id: role === "mechanic" ? session.user.id : null,
      motorist_id: role === "mechanic" ? null : session.user.id,
    };
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
