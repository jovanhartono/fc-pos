import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BadRequestException } from "@/errors";

const DEFAULT_PRESIGNED_EXPIRES_SECONDS = 300;

function getS3Config() {
  const region = process.env.AWS_S3_REGION;
  const bucket = process.env.AWS_S3_BUCKET;

  if (!(region && bucket)) {
    throw new BadRequestException(
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

export function buildS3ObjectUrl(key: string) {
  const { bucket, region } = getS3Config();
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
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
