import { action } from './server-action.js';
export const dynamic = 'force-dynamic';
export default function Acceptance() {
  return (
    <main>
      <p>next15-rsc-ssr-ok</p>
      <form action={action}>
        <button type="submit">Run server action</button>
      </form>
    </main>
  );
}
