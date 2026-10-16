export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('first\n'));
      setTimeout(() => {
        controller.enqueue(encoder.encode('last\n'));
        controller.close();
      }, 750);
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/plain' } });
}
