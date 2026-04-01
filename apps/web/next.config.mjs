/** @type {import('next').NextConfig} */
const config = {
  output: "standalone",
  experimental: { serverActions: { allowedOrigins: ["localhost:3000"] } },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  transpilePackages: ["@mailwarm/shared", "@mailwarm/database"],
};

export default config;
