export const VEHICLE_TYPES = [
  "car",
  "motorcycle",
  "sedan",
  "suv",
  "van",
] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number];

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
