import type { MetadataRoute } from "next";
import { getAppName } from "@/lib/utils";

/** Lets Android (Chrome) and iPhone (Safari → "Add to Home Screen") install the site like an app. */
export default function manifest(): MetadataRoute.Manifest {
  const name = getAppName();
  return {
    name,
    short_name: name,
    start_url: "/",
    display: "standalone",
    background_color: "#F8F9FF",
    theme_color: "#4F46E5",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
