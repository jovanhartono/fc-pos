import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const DEFAULT_PRESIGNED_EXPIRES_SECONDS = 300;

function getS3Config() {
  const region = process.env.AWS_S3_REGION;
  const bucket = process.env.AWS_S3_BUCKET;

  if (!(region && bucket)) {
    throw new Error(
      "Missing AWS S3 configuration: AWS_S3_REGION and AWS_S3_BUCKET"
    );
  }

  return { bucket, region };
}

let cachedClient: S3Client | null = null;

function getS3Client() {
  if (cachedClient) {
    return cachedClient;
  }

  const { region } = getS3Config();

  cachedClient = new S3Client({
    region,
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });

  return cachedClient;
}

export function buildMediaUrl(path: string): string;
export function buildMediaUrl(path: null | undefined): null;
export function buildMediaUrl(path: string | null | undefined): string | null;
export function buildMediaUrl(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }

  const base = process.env.CDN_BASE_URL;
  if (!base) {
    throw new Error("Missing CDN_BASE_URL configuration");
  }

  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  // biome-ignore lint/performance/useTopLevelRegex: <i dont care>
  const normalizedPath = path.replace(/^\/+/, "");
  return new URL(normalizedPath, normalizedBase).toString();
}

interface CreatePresignedUploadInput {
  contentType: string;
  key: string;
}

export async function createPresignedUploadUrl({
  contentType,
  key,
}: CreatePresignedUploadInput) {
  const { bucket } = getS3Config();
  const client = getS3Client();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: DEFAULT_PRESIGNED_EXPIRES_SECONDS,
  });

  return {
    upload_url: uploadUrl,
    key,
    expires_in_seconds: DEFAULT_PRESIGNED_EXPIRES_SECONDS,
  };
}
