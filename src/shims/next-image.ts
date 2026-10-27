// Stand-in for Next.js's image type. In Vite an imported .png is just its URL string.
export type StaticImageData = string;
export default function Image(): null {
  return null;
}
