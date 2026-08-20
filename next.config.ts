module.exports = {
  images: {
    remotePatterns: [new URL("https://gkpctbvyswcfccogoepl.supabase.co/**")],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};
