// chat-config.js

// Public delivery identifiers only. Upload signatures and Cloudinary secrets
// come from authenticated Supabase Edge Functions.
export const CLOUDINARY_CLOUD = 'jgkwrktm';
// Emergency Cloudinary is used only after Supabase health checks fail.
export const EMERGENCY_CLOUDINARY_CLOUD = 'xzmmkpjl';

export const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
export const PAGE_SIZE = 40;                 // ek baar me kitne msgs load hon
export const CHAT_ARCHIVE_BATCH_SIZE = 10;
export const CHAT_ARCHIVE_KEEP_RECENT = 10;
export const CHAT_ARCHIVE_AGE_MS = 24 * 60 * 60 * 1000;
export const ENABLE_PRESENCE = true;              // Online/Offline dot (false karne par Realtime load kam hota hai)
