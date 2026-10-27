import { supabase } from "@/lib/supabase";
import type { CreateVehicleInput, Vehicle } from "@/types/vehicle";

export async function createVehicle(
  input: CreateVehicleInput,
): Promise<{ data: Vehicle | null; error: string | null }> {
  const record = {
    motorist_id: input.ownerRole === "customer" ? input.ownerId : null,
    mechanic_id: input.ownerRole === "mechanic" ? input.ownerId : null,
    type: input.type,
    make: input.make.trim(),
    model: input.model.trim(),
    year: input.year.trim(),
    plate_number: input.plateNumber.trim().toUpperCase(),
    fuel_type: input.fuelType,
    is_primary: input.isPrimary ?? false,
  };

  const { data, error } = await supabase
    .from("vehicles")
    .insert(record)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as Vehicle, error: null };
}

export async function listVehicles(
  ownerId: string,
): Promise<{ data: Vehicle[]; error: string | null }> {
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .or(`motorist_id.eq.${ownerId},mechanic_id.eq.${ownerId}`)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as Vehicle[], error: null };
}

export async function setPrimaryVehicle(
  ownerId: string,
  vehicleId: string,
  ownerRole: "customer" | "mechanic" = "customer",
): Promise<{ error: string | null }> {
  const ownerColumn = ownerRole === "mechanic" ? "mechanic_id" : "motorist_id";
  const { error: clearError } = await supabase
    .from("vehicles")
    .update({ is_primary: false })
    .eq(ownerColumn, ownerId);

  if (clearError) {
    return { error: clearError.message };
  }

  const { error: primaryError } = await supabase
    .from("vehicles")
    .update({ is_primary: true })
    .eq("id", vehicleId)
    .eq(ownerColumn, ownerId);

  return { error: primaryError?.message ?? null };
}
