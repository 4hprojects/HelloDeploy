import Image from 'next/image';
export default function Home() {
  return (
    <main id="acceptance-marker">
      next15-standard-app-ok
      <Image src="/fixture.svg" alt="fixture" width={32} height={32} />
    </main>
  );
}
