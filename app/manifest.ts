import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jev Chess",
    short_name: "Jev Chess",
    description: "One minute blitz against Jev, a decision model.",
    start_url: "/",
    display: "standalone",
    background_color: "#262421",
    theme_color: "#262421",
    orientation: "portrait",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
