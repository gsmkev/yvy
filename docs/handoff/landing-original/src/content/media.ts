import heroPoster from "@/assets/hero.jpg";
import ctaPoster from "@/assets/cta.jpg";
import satellite from "@/assets/satellite.jpg";
import a1 from "@/assets/aud-1.jpg";
import a2 from "@/assets/aud-2.jpg";
import a3 from "@/assets/aud-3.jpg";
import a4 from "@/assets/aud-4.jpg";
import a5 from "@/assets/aud-5.jpg";

// Empty video src = poster + code layers carry the design on their own.
export const media = {
  hero: { video: "", poster: heroPoster },
  cta: { video: "", poster: ctaPoster },
  satellite,
  audiences: [a1, a2, a3, a4, a5],
};
