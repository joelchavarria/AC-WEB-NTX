/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
      { key: "Strict-Transport-Security", value: "max-age=31536000" },
    ] }];
  },
  images: {
    // Uploaded photos have immutable filenames. Keep transformed variants for
    // at least 31 days and only create the sizes this storefront displays.
    minimumCacheTTL: 2678400,
    deviceSizes: [640, 960, 1280],
    imageSizes: [32, 64, 96, 128, 256, 384],
    qualities: [75],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "qynzrunfsflfppczghhj.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "cgfknfvshndoktxxdwxz.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

module.exports = nextConfig;
