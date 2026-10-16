export async function getServerSideProps() {
  return { props: { renderedAt: Date.now() } };
}
export default function Acceptance({ renderedAt }) {
  return <main>next16-pages-ssr-ok:{renderedAt}</main>;
}
