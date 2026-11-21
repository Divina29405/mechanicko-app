import type { VehiclePricingCategory } from "@/types/vehicle";

export const EMERGENCY_DISPATCH_BASE_FEES: Record<
  VehiclePricingCategory,
  number
> = {
  motorcycle: 350,
  four_wheel: 500,
};
