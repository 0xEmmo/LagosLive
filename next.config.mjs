/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      // Host-uploaded event cover images live in the Supabase Storage
      // 'event-images' public bucket (<project>.supabase.co/...). Without this
      // entry next/image refuses to render them, which silently "removes" every
      // uploaded cover from the app. Derive from env at build time so it always
      // matches the configured project ref.
      {
        protocol: 'https',
        hostname:
          process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https?:\/\//, '').replace(/\/.*$/, '') ??
          '**.supabase.co',
      },
    ],
  },
};

export default nextConfig;
