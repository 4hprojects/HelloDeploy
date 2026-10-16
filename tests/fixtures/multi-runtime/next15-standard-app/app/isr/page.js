export const revalidate = 2;
export default function Isr() {
  return <main id="isr-value">{Date.now()}</main>;
}
