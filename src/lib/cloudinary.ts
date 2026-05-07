import crypto from "node:crypto";

// Minimal Cloudinary signed-upload helper. We only need the signature
// generation server-side; the actual upload runs client-side directly to
// Cloudinary's REST endpoint, so the API secret never leaves this process.
//
// Required env vars:
//   CLOUDINARY_CLOUD_NAME   — e.g. "orphangive"
//   CLOUDINARY_API_KEY      — public, embedded in the upload params
//   CLOUDINARY_API_SECRET   — server-only, used to sign uploads

export type CloudinarySignParams = {
  // Subset of Cloudinary upload params we need to include in the signature.
  // Must match the params the client posts to Cloudinary (everything except
  // file, api_key, signature).
  timestamp: number;
  folder?: string;
};

export type CloudinarySignedUpload = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
};

export function getCloudinaryConfig(): {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
} | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}

// Cloudinary's signing rule: alphabetically-sorted "key=value" pairs joined
// by &, then SHA1(joined + api_secret). See
// https://cloudinary.com/documentation/signatures.
export function signCloudinaryUpload(
  params: CloudinarySignParams,
): CloudinarySignedUpload | null {
  const config = getCloudinaryConfig();
  if (!config) return null;

  const folder = params.folder ?? "donor-profile-photos";

  // Only the params that Cloudinary requires us to sign go in here.
  // file, api_key, signature, resource_type, cloud_name are NOT signed.
  const toSign: Record<string, string> = {
    folder,
    timestamp: String(params.timestamp),
  };

  const canonical = Object.keys(toSign)
    .sort()
    .map((k) => `${k}=${toSign[k]}`)
    .join("&");

  const signature = crypto
    .createHash("sha1")
    .update(canonical + config.apiSecret)
    .digest("hex");

  return {
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    timestamp: params.timestamp,
    folder,
    signature,
  };
}
