import {
  getVehiclePricingCategory,
  type Vehicle,
  type VehiclePricingCategory,
} from "@/types/vehicle";

const BOOKING_DISTANCE_FEES: Record<
  VehiclePricingCategory,
  { firstKm: number; additionalKm: number }
> = {
  motorcycle: { firstKm: 100, additionalKm: 10 },
  four_wheel: { firstKm: 150, additionalKm: 15 },
};

export function getBookingDistanceFee(
  distanceKm: number,
  vehicleType: Vehicle["type"] | null | undefined,
): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new RangeError("Distance must be a finite, non-negative number.");
  }

  const category = vehicleType
    ? getVehiclePricingCategory(vehicleType)
    : "motorcycle";
  const rates = BOOKING_DISTANCE_FEES[category];
  return (
    rates.firstKm +
    Math.max(0, Math.ceil(distanceKm) - 1) * rates.additionalKm
  );
}

export function getDistanceKmBetweenCoordinates(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  if (
    !Number.isFinite(latitudeA) ||
    !Number.isFinite(longitudeA) ||
    !Number.isFinite(latitudeB) ||
    !Number.isFinite(longitudeB) ||
    latitudeA < -90 ||
    latitudeA > 90 ||
    latitudeB < -90 ||
    latitudeB > 90 ||
    longitudeA < -180 ||
    longitudeA > 180 ||
    longitudeB < -180 ||
    longitudeB > 180
  ) {
    throw new RangeError("Coordinates must be valid latitude/longitude pairs.");
  }

  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

export function parseMaintenancePrice(value: unknown): number | null {
  const normalized = String(value ?? "").replace(/[₱,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const price = Number(normalized);
  return Number.isFinite(price) && price > 0 ? price : null;
}
