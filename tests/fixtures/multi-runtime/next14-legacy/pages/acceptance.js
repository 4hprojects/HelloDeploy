export async function getServerSideProps() {
  return { props: { rendered: true } };
}
export default function Acceptance({ rendered }) {
  return <main>{rendered ? 'next14-ssr-ok' : 'failed'}</main>;
}
