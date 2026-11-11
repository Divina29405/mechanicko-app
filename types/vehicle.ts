export const VEHICLE_TYPES = [
  "car",
  "motorcycle",
  "sedan",
  "suv",
  "van",
  "pickup",
] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number];
export type VehiclePricingCategory = "motorcycle" | "four_wheel";

export function getVehicleTypeLabel(type: VehicleType): string {
  switch (type) {
    case "car":
      return "Car";
    case "motorcycle":
      return "Motorcycle";
    case "sedan":
      return "Sedan / Hatchback";
    case "suv":
      return "SUV";
    case "van":
      return "Van";
    case "pickup":
      return "Pickup";
  }
}

export function getVehiclePricingCategory(
  type: VehicleType | null | undefined,
): VehiclePricingCategory {
  return type === "motorcycle" ? "motorcycle" : "four_wheel";
}

export function getVehiclePricingCategoryForService(
  category: unknown,
): VehiclePricingCategory {
  return category === "four_wheel" ? "four_wheel" : "motorcycle";
}

export const FUEL_TYPES = ["Gasoline", "Diesel", "Electric"] as const;

export type FuelType = (typeof FUEL_TYPES)[number];

export type Vehicle = {
  id: string;
  motorist_id: string | null;
  mechanic_id: string | null;
  type: VehicleType;
  make: string;
  model: string;
  year: string;
  plate_number: string;
  engine_type: string | null;
  fuel_type: FuelType;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateVehicleInput = {
  ownerId: string;
  ownerRole: "customer" | "mechanic";
  type: VehicleType;
  make: string;
  model: string;
  year: string;
  plateNumber: string;
  fuelType: FuelType;
  isPrimary?: boolean;
};
