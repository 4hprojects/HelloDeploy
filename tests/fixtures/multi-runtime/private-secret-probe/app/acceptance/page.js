export const dynamic = 'force-dynamic';

export default function Acceptance() {
  return (
    <main>
      {process.env.ACCEPTANCE_PRIVATE_CANARY
        ? 'runtime-private-canary-present'
        : 'runtime-private-canary-missing'}
    </main>
  );
}
