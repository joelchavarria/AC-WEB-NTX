/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cgfknfvshndoktxxdwxz.supabase.co",
      },
    ],
  },
};

module.exports = nextConfig;
