import { ImageResponse } from "next/og";
import { PIVORA_ACCENT, PIVORA_INK, PivoraMark } from "@/components/brand/PivoraLogo";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** Favicon / Android install icon: Pivora mark on a white rounded tile. */
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
          borderRadius: 112,
        }}
      >
        <PivoraMark ink={PIVORA_INK} accent={PIVORA_ACCENT} size={400} />
      </div>
    ),
    size
  );
}
