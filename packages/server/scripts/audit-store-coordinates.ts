// Read-only. A store's pin decides who may clock in there (ADR-0020), so a
// fat-fingered edit locks that branch's whole team out until someone notices.
// Run before shipping the gate and after any coordinate edit.
//
// From packages/server, against either environment:
//   bun run scripts/audit-store-coordinates.ts prod
import { Pool } from "@neondatabase/serverless";
import { CLOCK_IN_RADIUS_KM } from "@/modules/shifts/shift.schema";
import { distanceKm } from "@/utils/geo";

// Rough box around Indonesia. A pin outside it is a typo, not a branch.
const BOUNDS = { east: 141, north: 6, south: -11, west: 95 };

const env = process.argv[2] === "prod" ? "PROD" : "DEV";
const url = process.env[`DATABASE_URL_${env}`];
if (!url) {
  throw new Error(`DATABASE_URL_${env} is not set`);
}
console.log(`stores in ${env.toLowerCase()}:\n`);
const pool = new Pool({ connectionString: url });

interface Row {
  code: string;
  id: number;
  is_active: boolean;
  latitude: string | null;
  longitude: string | null;
  name: string;
}

try {
  const stores: Row[] = (
    await pool.query(
      "select id, code, name, is_active, latitude, longitude from stores order by code"
    )
  ).rows;

  const problems: string[] = [];

  for (const store of stores) {
    const label = `${store.code} (${store.name})`;
    const lat = Number(store.latitude);
    const lng = Number(store.longitude);

    if (store.latitude === null || store.longitude === null) {
      problems.push(`${label}: no pin`);
      continue;
    }
    if (lat === 0 && lng === 0) {
      problems.push(`${label}: pinned at 0,0`);
      continue;
    }
    if (
      lat < BOUNDS.south ||
      lat > BOUNDS.north ||
      lng < BOUNDS.west ||
      lng > BOUNDS.east
    ) {
      problems.push(`${label}: ${lat}, ${lng} is outside Indonesia`);
      continue;
    }
    console.log(
      `${label}${store.is_active ? "" : " [inactive]"}: ${lat}, ${lng}` +
        `  https://www.google.com/maps?q=${lat},${lng}`
    );
  }

  const pinned = stores.filter(
    (store) => store.latitude !== null && store.longitude !== null
  );

  console.log(`\nPairs closer than ${2 * CLOCK_IN_RADIUS_KM} km:`);
  let overlaps = 0;
  for (const [index, a] of pinned.entries()) {
    for (const b of pinned.slice(index + 1)) {
      const km = distanceKm(
        { latitude: Number(a.latitude), longitude: Number(a.longitude) },
        { latitude: Number(b.latitude), longitude: Number(b.longitude) }
      );
      // Inside both rings, a worker at either counter can open a Shift against
      // the wrong branch, and the gate cannot tell them apart.
      if (km < 2 * CLOCK_IN_RADIUS_KM) {
        overlaps += 1;
        console.log(`  ${a.code} - ${b.code}: ${km.toFixed(2)} km`);
      }
    }
  }
  if (overlaps === 0) {
    console.log("  none");
  }

  if (problems.length > 0) {
    console.log("\nFIX BEFORE SHIPPING:");
    for (const line of problems) {
      console.log(`  ${line}`);
    }
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
