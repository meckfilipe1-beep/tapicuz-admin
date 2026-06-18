import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  distDir: "out", // <-- Adicione essa linha para forçar o nome e local da pasta!
  images: {
    unoptimized: true,
  },
};

export default nextConfig;