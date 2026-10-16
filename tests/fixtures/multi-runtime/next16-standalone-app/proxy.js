import { NextResponse } from 'next/server';
export function proxy() {
  const response = NextResponse.next();
  response.headers.set('x-fixture-proxy', 'next16');
  return response;
}
export const config = { matcher: '/acceptance/:path*' };
