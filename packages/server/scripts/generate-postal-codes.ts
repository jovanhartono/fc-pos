// Regenerates src/db/seed/postal-codes.json — the reference data behind
// orders.origin_postal_code (ADR-0020).
//
//   bun run scripts/generate-postal-codes.ts
//
// Source is kode-wilayah-id (MIT), which carries BPS and Kemendagri codes and
// the Pos Indonesia code on each village. It is deliberately NOT a dependency:
// the shop needs this data once, and a vendored file keeps the diff reviewable
// and the seed independent of the registry. Bump SOURCE_VERSION to refresh.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SOURCE_VERSION = "1.2.0";
const SOURCE_TARBALL = `https://registry.npmjs.org/kode-wilayah-id/-/kode-wilayah-id-${SOURCE_VERSION}.tgz`;
const OUT = new URL("../src/db/seed/postal-codes.json", import.meta.url);

interface Village {
  bps_district_code: string;
  postal_code: string | null;
}
interface District {
  bps_code: string;
  bps_regency_code: string;
  name: string;
}
interface Regency {
  bps_code: string;
  bps_province_code: string;
  name: string;
}
interface Province {
  bps_code: string;
  name: string;
}

async function fetchSource(workDir: string) {
  const res = await fetch(SOURCE_TARBALL);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${SOURCE_TARBALL}`);
  }
  await Bun.write(join(workDir, "src.tgz"), await res.arrayBuffer());
  const tar = Bun.spawnSync(["tar", "xzf", "src.tgz"], { cwd: workDir });
  if (tar.exitCode !== 0) {
    throw new Error(`tar failed: ${tar.stderr.toString()}`);
  }
  const dist = join(workDir, "package", "dist");
  const load = async <T>(name: string, exportName: string): Promise<T[]> => {
    const mod = await import(join(dist, name));
    return mod[exportName]() as T[];
  };
  return {
    districts: await load<District>("districts.js", "getDistricts"),
    provinces: await load<Province>("provinces.js", "getProvinces"),
    regencies: await load<Regency>("regencies.js", "getRegencies"),
    villages: await load<Village>("villages.js", "getVillages"),
  };
}

const dir = await mkdtemp(join(tmpdir(), "kode-wilayah-"));
try {
  const { districts, provinces, regencies, villages } = await fetchSource(dir);

  const districtByCode = new Map(districts.map((d) => [d.bps_code, d]));
  const regencyByCode = new Map(regencies.map((r) => [r.bps_code, r]));
  const provinceByCode = new Map(provinces.map((p) => [p.bps_code, p.name]));

  // One bucket per postal code. Regency is counted, not collected: 69 codes
  // straddle two of them and the ranking has to name exactly one.
  const buckets = new Map<
    string,
    { districts: Set<string>; province: string; regencies: Map<string, number> }
  >();

  for (const village of villages) {
    const code = village.postal_code;
    if (!code) {
      continue;
    }
    const district = districtByCode.get(village.bps_district_code);
    const regency = district && regencyByCode.get(district.bps_regency_code);
    if (!(district && regency)) {
      continue;
    }
    let bucket = buckets.get(code);
    if (!bucket) {
      bucket = {
        districts: new Set(),
        province: provinceByCode.get(regency.bps_province_code) ?? "",
        regencies: new Map(),
      };
      buckets.set(code, bucket);
    }
    bucket.districts.add(district.name);
    bucket.regencies.set(
      regency.name,
      (bucket.regencies.get(regency.name) ?? 0) + 1
    );
  }

  let straddling = 0;
  const rows = [...buckets.entries()]
    .map(([code, bucket]) => {
      const ranked = [...bucket.regencies].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
      );
      if (ranked.length > 1) {
        straddling += 1;
      }
      return {
        city: ranked[0][0],
        code,
        districts: [...bucket.districts].sort().join(", "),
        province: bucket.province,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  await Bun.write(OUT, `${JSON.stringify(rows, null, 0)}\n`);
  process.stdout.write(
    `${rows.length} postal codes written (${straddling} assigned to their majority kota/kabupaten)\n`
  );
} finally {
  await rm(dir, { force: true, recursive: true });
}
