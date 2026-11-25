import { ImageResponse } from "next/og";
import { PIVORA_ACCENT, PIVORA_INK, PivoraMark } from "@/components/brand/PivoraLogo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iPhone home-screen icon (iOS rounds the corners itself). */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FFFFFF",
        }}
      >
        <PivoraMark ink={PIVORA_INK} accent={PIVORA_ACCENT} size={144} />
      </div>
    ),
    size
  );
}
