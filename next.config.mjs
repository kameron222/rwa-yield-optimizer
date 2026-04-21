/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tree-shake large packages to reduce chunk sizes
  experimental: {
    optimizePackageImports: ["recharts", "lucide-react"],
  },
  // Suppress noisy build warnings from WalletConnect/wagmi CJS builds
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
