// Read-only, 2026-09-08: check every Store's recorded latitude/longitude
// before anyone trusts the clock-in distance column (ADR-0020).
//
// Until this release nothing read those columns, so a wrong value was
// invisible. Now every clock-in is measured against them, and a Store whose
// coordinates are a few kilometres out makes its whole team read as
// out-of-range every morning. The create form only checks the numeric range,
// the update route checks nothing, and prod's Stores were typed in by hand.
//
// Run from packages/server with DATABASE_URL_PROD in the environment:
//   bun run scripts/audit-store-coordinates.ts
//
// SELECT only. Prints the address beside the coordinates so a human can judge
// the cases arithmetic cannot: right city, wrong spot.
import { Pool } from "@neondatabase/serverless";
import { distanceKm } from "../src/utils/geo";

// Greater Jakarta, generously. A Store outside this is not a rounding error.
const JAKARTA_METRO = {
  latMin: -7.4,
  latMax: -5.8,
  lonMin: 106.3,
  lonMax: 107.4,
};

// Indonesia end to end, for telling "wrong spot" from "wrong planet".
const INDONESIA = { latMin: -11, latMax: 6, lonMin: 95, lonMax: 141 };

interface StoreRow {
  address: string;
  code: string;
  is_active: boolean;
  latitude: string;
  longitude: string;
  name: string;
}

function verdict(latitude: number, longitude: number) {
  if (latitude === 0 && longitude === 0) {
    return "NEVER SET (0,0 — Gulf of Guinea)";
  }

  const swapped =
    latitude < INDONESIA.latMin ||
    latitude > INDONESIA.latMax ||
    longitude < INDONESIA.lonMin ||
    longitude > INDONESIA.lonMax;

  if (swapped) {
    const wouldFit =
      longitude >= INDONESIA.latMin &&
      longitude <= INDONESIA.latMax &&
      latitude >= INDONESIA.lonMin &&
      latitude <= INDONESIA.lonMax;
    return wouldFit
      ? "SWAPPED (reads as Indonesia if the two are exchanged)"
      : "OUTSIDE INDONESIA";
  }

  const outsideMetro =
    latitude < JAKARTA_METRO.latMin ||
    latitude > JAKARTA_METRO.latMax ||
    longitude < JAKARTA_METRO.lonMin ||
    longitude > JAKARTA_METRO.lonMax;

  return outsideMetro ? "in Indonesia, outside Greater Jakarta" : "plausible";
}

const url = process.env.DATABASE_URL_PROD;
if (!url) {
  throw new Error("DATABASE_URL_PROD is not set");
}

const pool = new Pool({ connectionString: url });

try {
  const { rows } = await pool.query<StoreRow>(
    `SELECT code, name, address, latitude, longitude, is_active
       FROM stores
      ORDER BY code`
  );

  console.info(`${rows.length} stores\n`);

  for (const row of rows) {
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);

    console.info(
      `${row.code}  ${row.name}${row.is_active ? "" : "  [inactive]"}`
    );
    console.info(`  address   ${row.address}`);
    console.info(`  recorded  ${row.latitude}, ${row.longitude}`);
    console.info(`  verdict   ${verdict(latitude, longitude)}`);
    console.info(
      `  map       https://www.google.com/maps?q=${latitude},${longitude}`
    );
    console.info("");
  }

  // Two Stores sharing a spot means one was copied from the other.
  console.info("closest sibling, per store:");
  for (const row of rows) {
    const others = rows.filter((other) => other.code !== row.code);
    if (others.length === 0) {
      continue;
    }

    const [nearest] = others
      .map((other) => ({
        code: other.code,
        km: distanceKm(
          { latitude: Number(row.latitude), longitude: Number(row.longitude) },
          {
            latitude: Number(other.latitude),
            longitude: Number(other.longitude),
          }
        ),
      }))
      .sort((a, b) => a.km - b.km);

    const flag = nearest && nearest.km < 0.5 ? "   <-- same spot?" : "";
    console.info(
      `  ${row.code} -> ${nearest?.code} ${nearest?.km.toFixed(2)} km${flag}`
    );
  }
} finally {
  await pool.end();
}
