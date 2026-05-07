import { NextResponse } from "next/server";
import { authedDonor } from "@/lib/api-auth";
import { signCloudinaryUpload } from "@/lib/cloudinary";

export const runtime = "nodejs";

// POST /api/donor/me/profile-photo/upload-signature
//
// Returns the parameters the client needs to POST a file directly to
// Cloudinary's upload endpoint. The API secret never leaves this server;
// the signature locks the upload to the parameters we specify (folder +
// timestamp), so a leaked signature can only be used once and only for a
// donor-profile-photos upload.
//
// Allowed for all signed-in donors regardless of approval state.
export async function POST() {
  const auth = await authedDonor({ requireApproved: false });
  if ("response" in auth) return auth.response;

  const timestamp = Math.floor(Date.now() / 1000);
  const signed = signCloudinaryUpload({ timestamp });
  if (!signed) {
    return NextResponse.json(
      {
        error:
          "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env.local.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    cloudName: signed.cloudName,
    apiKey: signed.apiKey,
    timestamp: signed.timestamp,
    folder: signed.folder,
    signature: signed.signature,
  });
}
