import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dufiofw14',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadAvatar(
  base64Image: string,
  playerId: string,
): Promise<string> {
  const result = await cloudinary.uploader.upload(base64Image, {
    folder: 'ctg-avatars',
    public_id: `player-${playerId}`,
    overwrite: true,
    transformation: [
      { width: 400, height: 400, crop: 'fill', gravity: 'face' },
      { quality: 'auto', fetch_format: 'auto' },
    ],
  });

  return result.secure_url;
}

export async function deleteAvatar(playerId: string): Promise<void> {
  await cloudinary.uploader.destroy(`ctg-avatars/player-${playerId}`);
}
