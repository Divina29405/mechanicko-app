import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, Text, TextInput, View, type ImageStyle, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import type { Dispatch, SetStateAction } from "react";

export type RideStepStyles = Record<
  string,
  StyleProp<ViewStyle & TextStyle & ImageStyle>
>;

const carIcon = require("../assets/images/car.png");
const motorcycleIcon = require("../assets/images/motorcycle.png");
const fuelIcon = require("../assets/images/gasoline-icon.png"); // Corrected asset filename
const electricIcon = require("../assets/images/electric-icon.png");

export function PrimaryRideSteps({
  styles,
  step,
  selectedVehicle,
  setSelectedVehicle,
  multipleVehicles,
  setMultipleVehicles,
  makeDropdownOpen,
  setMakeDropdownOpen,
  selectedMake,
  setSelectedMake,
  selectedFuel,
  setSelectedFuel,
  modelName,
  setModelName,
  vehicleYear,
  setVehicleYear,
  plateNumber,
  setPlateNumber,
}: {
  styles: RideStepStyles;
  step: number;
  selectedVehicle: string | null;
  setSelectedVehicle: Dispatch<SetStateAction<any>>;
  multipleVehicles: boolean;
  setMultipleVehicles: Dispatch<SetStateAction<boolean>>;
  makeDropdownOpen: boolean;
  setMakeDropdownOpen: Dispatch<SetStateAction<boolean>>;
  selectedMake: string | null;
  setSelectedMake: Dispatch<SetStateAction<any>>;
  selectedFuel: string | null;
  setSelectedFuel: Dispatch<SetStateAction<any>>;
  modelName: string;
  setModelName: Dispatch<SetStateAction<string>>;
  vehicleYear: string;
  setVehicleYear: Dispatch<SetStateAction<string>>;
  plateNumber: string;
  setPlateNumber: Dispatch<SetStateAction<string>>;
}) {
  const normalizedFuel = selectedFuel ? selectedFuel.toLowerCase() : "";

  return (
    <>
      <Text style={styles.stepLabel}>STEP {step} OF 2</Text>

      {step === 1 ? (
        <Animated.View entering={FadeInUp.duration(400)} exiting={FadeOutUp.duration(300)}>
          <View style={styles.categoryHeader}>
            <Text style={styles.categoryTitle}>Vehicle Category</Text>
            <Text style={styles.selectOne}>* SELECT ONE</Text>
          </View>

          <View style={styles.vehicleGrid}>
            <Pressable
              onPress={() => setSelectedVehicle("motorcycle")}
              style={[
                styles.vehicleCard,
                selectedVehicle === "motorcycle" && styles.vehicleCardSelected,
              ]}
            >
              <View
                style={[
                  styles.vehicleIcon,
                  selectedVehicle === "motorcycle" &&
                    styles.vehicleIconSelected,
                ]}
              >
                <Image
                  source={motorcycleIcon}
                  resizeMode="contain"
                  style={[
                    styles.vehicleImage,
                    { tintColor: selectedVehicle === "motorcycle" ? "#FFFFFF" : "#1E3A8A" }, 
                  ]}
                />
              </View>
              {selectedVehicle === "motorcycle" ? (
                <View style={styles.selectedCheck}>
                  <Ionicons name="checkmark" size={14} color="#24439A" />
                </View>
              ) : null}
              <Text
                style={[
                  styles.vehicleTitle,
                  selectedVehicle === "motorcycle" &&
                    styles.vehicleCardSelectedText,
                ]}
              >
                Motorcycle
              </Text>
              <Text
                style={[
                  styles.vehicleDescription,
                  selectedVehicle === "motorcycle"
                    ? styles.vehicleCardSelectedText
                    : null,
                ]}
              >
                Scooter / Underbone / Big Bike
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setSelectedVehicle("car")}
              style={[
                styles.vehicleCard,
                (selectedVehicle === "car" || selectedVehicle === "sedan") && styles.vehicleCardSelected,
              ]}
            >
              <View
                style={[
                  styles.vehicleIcon,
                  (selectedVehicle === "car" || selectedVehicle === "sedan") &&
                    styles.vehicleIconSelected,
                ]}
              >
                <Image
                  source={carIcon}
                  resizeMode="contain"
                  style={[
                    styles.vehicleImage,
                    { tintColor: (selectedVehicle === "car" || selectedVehicle === "sedan") ? "#FFFFFF" : "#1E3A8A" }, 
                  ]}
                />
              </View>
              {(selectedVehicle === "car" || selectedVehicle === "sedan") ? (
                <View style={styles.selectedCheck}>
                  <Ionicons name="checkmark" size={14} color="#24439A" />
                </View>
              ) : null}
              <Text
                style={[
                  styles.vehicleTitle,
                  (selectedVehicle === "car" || selectedVehicle === "sedan") &&
                    styles.vehicleCardSelectedText,
                ]}
              >
                Car / SUV
              </Text>
              <Text
                style={[
                  styles.vehicleDescription,
                  (selectedVehicle === "car" || selectedVehicle === "sedan")
                    ? styles.vehicleCardSelectedText
                    : null,
                ]}
              >
                Sedan / Hatchback / SUV
              </Text>
            </Pressable>
          </View>

          <Pressable
            style={styles.multipleRow}
            onPress={() => setMultipleVehicles(!multipleVehicles)}
          >
            <View
              style={[
                styles.checkbox,
                multipleVehicles && styles.checkboxSelected,
              ]}
            >
              {multipleVehicles ? (
                <Ionicons name="checkmark" size={12} color="#FFFFFF" />
              ) : null}
            </View>
            <Text style={styles.multipleText}>I have multiple rides</Text>
          </Pressable>

          {multipleVehicles ? (
            <Animated.View
              entering={FadeInUp.duration(400)}
              style={styles.multipleInfo}
            >
              <Image
                source={require("../assets/images/multiplerides.png")}
                resizeMode="contain"
                style={styles.multipleIcon}
              />
              <View style={styles.multipleCopy}>
                <Text style={styles.multipleTitle}>
                  Add other vehicles later
                </Text>
                <Text style={styles.multipleDescription}>
                  You can register additional vehicles inside your profile
                  garage after completing account setup.
                </Text>
              </View>
            </Animated.View>
          ) : null}
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInUp.duration(400)} exiting={FadeOutUp.duration(300)}>
          <Text style={styles.sectionTitle}>Basic Information</Text>
          <Text style={styles.sectionCopy}>
            Please fill out all the necessary fields
          </Text>

          <View style={styles.brandLabel}>
            <Image
              source={require("../assets/images/vehiclebrand.png")}
              style={styles.stepIcon}
            />
            <Text style={styles.fieldLabelText}>Vehicle Brand / Make</Text>
          </View>
          <View style={styles.makeDropdownContainer}>
            <Pressable
              style={styles.makeField}
              onPress={() => setMakeDropdownOpen(!makeDropdownOpen)}
            >
              <Text style={selectedMake ? styles.makeOptionText : styles.fieldPlaceholder}>
                {selectedMake || "Select Brand / Make"}
              </Text>
              <Ionicons
                name={makeDropdownOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color="#0F172A"
              />
            </Pressable>
            {makeDropdownOpen ? (
              <View style={styles.makeDropdown}>
                {["Honda", "Yamaha", "Toyota", "Mitsubishi", "Suzuki"].map(
                  (make) => (
                    <Pressable
                      key={make}
                      style={styles.makeOption}
                      onPress={() => {
                        setSelectedMake(make);
                        setMakeDropdownOpen(false);
                      }}
                    >
                      <Text style={styles.makeOptionText}>{make}</Text>
                    </Pressable>
                  ),
                )}
              </View>
            ) : null}
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.modelField}>
              <View style={styles.fieldLabel}>
                <Image
                  source={require("../assets/images/modelname.jpg")}
                  style={styles.stepIcon}
                />
                <Text style={styles.fieldLabelText}>Model Name</Text>
              </View>
              <TextInput
                style={styles.inputBoxText}
                placeholder="e.g NMAX"
                placeholderTextColor="#69707D"
                value={modelName}
                onChangeText={setModelName}
              />
            </View>
            <View style={styles.yearField}>
              <View style={styles.fieldLabel}>
                <Image
                  source={require("../assets/images/year.jpg")}
                  style={styles.stepIcon}
                />
                <Text style={styles.fieldLabelText}>Year</Text>
              </View>
              <TextInput
                style={styles.inputBoxText}
                placeholder="0000"
                placeholderTextColor="#69707D"
                keyboardType="numeric"
                maxLength={4}
                value={vehicleYear}
                onChangeText={setVehicleYear}
              />
            </View>
          </View>

          <View style={styles.plateHeader}>
            <View style={styles.fieldLabel}>
              <Image
                source={require("../assets/images/vehiclebrand.png")}
                style={styles.stepIcon}
              />
              <Text style={styles.fieldLabelText}>License Plate</Text>
            </View>
            <Text style={styles.exampleLabel}>e.g. MV-File Number</Text>
          </View>

          <View style={styles.plateField}>
            <View style={styles.phBadge}>
              <Text style={styles.phBadgeText}>PH</Text>
            </View>
            <TextInput
              style={styles.plateText}
              placeholder="000 - ABC"
              placeholderTextColor="#69707D"
              autoCapitalize="characters"
              value={plateNumber}
              onChangeText={setPlateNumber}
            />
          </View>

          <View style={styles.fieldLabel}>
            <Image
              source={require("../assets/images/vehiclebrand.png")}
              style={styles.stepIcon}
            />
            <Text style={styles.fieldLabelText}>Fuel Type</Text>
          </View>
          <View style={styles.fuelRow}>
            <Pressable
              onPress={() => setSelectedFuel("Gasoline")}
              style={[
                styles.fuelOption,
                (normalizedFuel === "gasoline" || normalizedFuel === "diesel") && styles.fuelOptionSelected,
              ]}
            >
              <Image
                source={fuelIcon}
                style={[
                  styles.fuelIcon,
                  (normalizedFuel === "gasoline" || normalizedFuel === "diesel") && styles.fuelIconSelected,
                ]}
              />
              <Text
                style={[
                  styles.fuelText,
                  (normalizedFuel === "gasoline" || normalizedFuel === "diesel") && styles.fuelTextSelected,
                ]}
              >
                Gasoline / Diesel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSelectedFuel("Electric")}
              style={[
                styles.fuelOption,
                normalizedFuel === "electric" && styles.fuelOptionSelected,
              ]}
            >
              <Image
                source={electricIcon}
                style={[
                  styles.fuelIcon,
                  normalizedFuel === "electric" && styles.fuelIconSelected,
                ]}
              />
              <Text
                style={[
                  styles.fuelText,
                  normalizedFuel === "electric" && styles.fuelTextSelected,
                ]}
              >
                Electric
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
    </>
  );
}