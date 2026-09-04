import QRCode from "qrcode";

/** Inline SVG string — transparent background, ink-coloured modules. */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    margin: 1,
    color: { dark: "#262119", light: "#0000" },
  });
}

/** PNG data URL for download / print — solid white background. */
export function qrPng(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    margin: 2,
    width: 720,
    color: { dark: "#1c1712", light: "#ffffff" },
  });
}
