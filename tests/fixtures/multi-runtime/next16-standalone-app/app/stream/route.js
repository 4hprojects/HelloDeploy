export async function GET() {
  const e = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(e.encode('first\n'));
        setTimeout(() => {
          c.enqueue(e.encode('last\n'));
          c.close();
        }, 750);
      },
    }),
  );
}
