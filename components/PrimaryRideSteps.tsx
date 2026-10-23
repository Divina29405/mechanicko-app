import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, Text, TextInput, type ImageStyle, type StyleProp, type TextStyle, type ViewStyle, View } from "react-native";

import type { FuelType, VehicleType } from "@/hooks/usePrimaryRideForm";

type RideStepStyles = Record<string, StyleProp<ViewStyle & TextStyle & ImageStyle>>;

const vehicleOptions: { type: VehicleType; image: number; title: string; description: string }[] = [
  { type: "motorcycle", image: require("../assets/images/motorcycle.png"), title: "Motorcycle", description: "Scooter / Underbone" },
  { type: "sedan", image: require("../assets/images/sedan.png"), title: "Sedan / Hatch", description: "City Cars & Compacts" },
  { type: "suv", image: require("../assets/images/suv.png"), title: "SUV / Crossover", description: "4x4 & Mid-size" },
  { type: "van", image: require("../assets/images/van.png"), title: "Van / Utility", description: "Trucks & Commercial" },
];

export function PrimaryRideSteps({
  styles, step, selectedVehicle, setSelectedVehicle, multipleVehicles, setMultipleVehicles,
  makeDropdownOpen, setMakeDropdownOpen, selectedMake, setSelectedMake, selectedFuel,
  setSelectedFuel, modelName, setModelName, vehicleYear, setVehicleYear, plateNumber,
  setPlateNumber,
}: {
  styles: RideStepStyles;
  step: 1 | 2;
  selectedVehicle: VehicleType | null;
  setSelectedVehicle: (value: VehicleType) => void;
  multipleVehicles: boolean;
  setMultipleVehicles: (value: boolean | ((current: boolean) => boolean)) => void;
  makeDropdownOpen: boolean;
  setMakeDropdownOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  selectedMake: string | null;
  setSelectedMake: (value: string | null) => void;
  selectedFuel: FuelType | null;
  setSelectedFuel: (value: FuelType) => void;
  modelName: string; setModelName: (value: string) => void;
  vehicleYear: string; setVehicleYear: (value: string) => void;
  plateNumber: string; setPlateNumber: (value: string) => void;
}) {
  return (
    <>
      {step === 1 ? (
              <>
                <Text style={styles.stepLabel}>STEP 1 OF 2</Text>
                <Text style={styles.sectionTitle}>Tell us what you drive</Text>
                <Text style={styles.sectionCopy}>
                  We match you with mechanics specialized in your exact vehicle
                  make and model.
                </Text>

                <View style={styles.categoryHeader}>
                  <Text style={styles.categoryTitle}>Vehicle Category</Text>
                  <Text style={styles.selectOne}>Select one</Text>
                </View>

                <View style={styles.vehicleGrid}>
                  {vehicleOptions.map((vehicle) => (
                    <Pressable
                      key={vehicle.type}
                      onPress={() => setSelectedVehicle(vehicle.type)}
                      style={[
                        styles.vehicleCard,
                        selectedVehicle === vehicle.type &&
                          styles.vehicleCardSelected,
                      ]}
                    >
                      <View
                        style={[
                          styles.vehicleIcon,
                          selectedVehicle === vehicle.type &&
                            styles.vehicleIconSelected,
                        ]}
                      >
                        <Image
                          source={vehicle.image}
                          resizeMode="contain"
                          style={[
                            styles.vehicleImage,
                            selectedVehicle === vehicle.type &&
                              styles.vehicleImageSelected,
                          ]}
                        />
                      </View>
                      {selectedVehicle === vehicle.type ? (
                        <View style={styles.selectedCheck}>
                          <Ionicons
                            name="checkmark"
                            size={11}
                            color="#24439A"
                          />
                        </View>
                      ) : null}
                      <Text
                        style={[
                          styles.vehicleTitle,
                          selectedVehicle === vehicle.type &&
                            styles.vehicleCardSelectedText,
                        ]}
                      >
                        {vehicle.title}
                      </Text>
                      <Text
                        style={[
                          styles.vehicleDescription,
                          selectedVehicle === vehicle.type &&
                            styles.vehicleCardSelectedText,
                        ]}
                      >
                        {vehicle.description}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable
                  onPress={() => setMultipleVehicles((current) => !current)}
                  style={styles.multipleRow}
                >
                  <View
                    style={[
                      styles.checkbox,
                      multipleVehicles && styles.checkboxSelected,
                    ]}
                  >
                    {multipleVehicles ? (
                      <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                    ) : null}
                  </View>
                  <Text style={styles.multipleText}>
                    I have more than one vehicle
                  </Text>
                </Pressable>

                <View style={styles.multipleInfo}>
                  <Image
                    source={require("../assets/images/multiplerides.png")}
                    resizeMode="contain"
                    style={styles.multipleIcon}
                  />
                  <View style={styles.multipleCopy}>
                    <Text style={styles.multipleTitle}>Multiple rides?</Text>
                    <Text style={styles.multipleDescription}>
                      You can register additional family vehicles{"\n"}
                      delivery fleets, or spare bikes anytime in your{"\n"}
                      garage settings.
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.stepLabel}>STEP 2 OF 2</Text>
                <Text style={styles.sectionTitle}>Tell us what you drive</Text>
                <Text style={styles.sectionCopy}>
                  We match you with mechanics specialized in your exact vehicle
                  {"\n"}
                  make and model.
                </Text>
                <View style={styles.brandLabel}>
                  <Image
                    source={require("../assets/images/vehiclebrand.png")}
                    style={styles.stepIcon}
                  />
                  <Text style={styles.fieldLabelText}>
                    Vehicle Brand / Make
                  </Text>
                </View>
                <View style={styles.makeDropdownContainer}>
                  <Pressable
                    onPress={() => setMakeDropdownOpen((current) => !current)}
                    style={styles.makeField}
                  >
                    <Text style={styles.fieldPlaceholder}>
                      {selectedMake ??
                        "Select Make (e.g. Honda, Yamaha, Toyota)"}
                    </Text>
                    <Ionicons
                      name={makeDropdownOpen ? "chevron-up" : "chevron-down"}
                      size={18}
                      color="#263238"
                    />
                  </Pressable>
                  {makeDropdownOpen ? (
                    <View style={styles.makeDropdown}>
                      {["Honda", "Yamaha", "Toyota", "Suzuki"].map((make) => (
                        <Pressable
                          key={make}
                          onPress={() => {
                            setSelectedMake(make);
                            setMakeDropdownOpen(false);
                          }}
                          style={styles.makeOption}
                        >
                          <Text style={styles.makeOptionText}>{make}</Text>
                        </Pressable>
                      ))}
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
                      value={modelName}
                      onChangeText={setModelName}
                      placeholder="e.g. Click 125i, Vios"
                      placeholderTextColor="#7B8494"
                      style={styles.inputBoxText}
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
                      value={vehicleYear}
                      onChangeText={setVehicleYear}
                      placeholder="2022"
                      placeholderTextColor="#7B8494"
                      keyboardType="number-pad"
                      style={styles.inputBoxText}
                    />
                  </View>
                </View>
                <View style={styles.plateHeader}>
                  <View style={styles.fieldLabel}>
                    <Image
                      source={require("../assets/images/conductionsticker.jpg")}
                      style={styles.stepIcon}
                    />
                    <Text style={styles.fieldLabelText}>
                      Plate / Conduction Sticker
                    </Text>
                  </View>
                  <Text style={styles.exampleLabel}>e.g. NQ 4821</Text>
                </View>
                <View style={styles.plateField}>
                  <View style={styles.phBadge}>
                    <Text style={styles.phBadgeText}>PH</Text>
                  </View>
                  <TextInput
                    value={plateNumber}
                    onChangeText={setPlateNumber}
                    placeholder="ABC 1234 OR MV FILE NO."
                    placeholderTextColor="#7B8494"
                    autoCapitalize="characters"
                    style={styles.plateText}
                  />
                </View>
                <View style={styles.fieldLabel}>
                  <Image
                  source={require("../assets/images/gasoline-icon.png")}
                    style={styles.stepIcon}
                  />
                  <Text style={styles.fieldLabelText}>Fuel / Engine Type</Text>
                </View>
                <View style={styles.fuelRow}>
                  {[
                    ["Gasoline", require("../assets/images/gasoline-icon.png")],
                    ["Diesel", require("../assets/images/diesel-icon.png")],
                    ["Electric", require("../assets/images/electric-icon.png")],
                  ].map(([fuel, icon]) => (
                    <Pressable
                      key={fuel as string}
                      onPress={() => setSelectedFuel(fuel as FuelType)}
                      style={[
                        styles.fuelOption,
                        selectedFuel === fuel && styles.fuelOptionSelected,
                      ]}
                    >
                      <Image
                        source={icon}
                        style={[
                          styles.fuelIcon,
                          selectedFuel === fuel && styles.fuelIconSelected,
                        ]}
                      />
                      <Text
                        style={[
                          styles.fuelText,
                          selectedFuel === fuel && styles.fuelTextSelected,
                        ]}
                      >
                        {fuel as string}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
    </>
  );
}