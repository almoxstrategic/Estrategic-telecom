export type LocationData = {
  latitude: number | null;
  longitude: number | null;
  address: string;
  city: string;
  displayName: string;
};

const GEO_TIMEOUT_MS = 12_000;
const NOMINATIM_TIMEOUT_MS = 8_000;

function emptyLocation(): LocationData {
  return {
    latitude: null,
    longitude: null,
    address: "",
    city: "",
    displayName: "",
  };
}

function readPosition(): Promise<GeolocationPosition | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: GEO_TIMEOUT_MS,
        maximumAge: 60_000,
      },
    );
  });
}

function pickAddressParts(raw: Record<string, unknown>): Pick<
  LocationData,
  "address" | "city" | "displayName"
> {
  const addressObj =
    raw.address && typeof raw.address === "object"
      ? (raw.address as Record<string, unknown>)
      : {};

  const road = String(addressObj.road ?? addressObj.pedestrian ?? addressObj.path ?? "").trim();
  const suburb = String(
    addressObj.suburb ?? addressObj.neighbourhood ?? addressObj.quarter ?? "",
  ).trim();
  const city = String(
    addressObj.city ??
      addressObj.town ??
      addressObj.village ??
      addressObj.municipality ??
      addressObj.county ??
      "",
  ).trim();
  const house = String(addressObj.house_number ?? "").trim();
  const street = [road, house].filter(Boolean).join(", ");
  const address = [street, suburb].filter(Boolean).join(" — ");
  const displayName = String(raw.display_name ?? "").trim();

  return {
    address: address || displayName.split(",").slice(0, 2).join(",").trim(),
    city,
    displayName,
  };
}

async function reverseGeocode(lat: number, lon: number): Promise<Partial<LocationData>> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "json");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");

    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });
    if (!res.ok) return {};
    const json = (await res.json()) as Record<string, unknown>;
    return pickAddressParts(json);
  } catch {
    return {};
  } finally {
    globalThis.clearTimeout(timer);
  }
}

/** Obtém GPS + endereço (Nominatim). Em falha, retorna campos vazios/nulos sem lançar. */
export async function getLocationData(): Promise<LocationData> {
  const fallback = emptyLocation();
  try {
    const position = await readPosition();
    if (!position) return fallback;

    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return fallback;

    const geo = await reverseGeocode(latitude, longitude);
    return {
      latitude,
      longitude,
      address: geo.address ?? "",
      city: geo.city ?? "",
      displayName: geo.displayName ?? "",
    };
  } catch {
    return fallback;
  }
}
