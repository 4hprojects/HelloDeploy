import { NextResponse } from 'next/server';
export function middleware(_request) {
  const response = NextResponse.next();
  response.headers.set('x-fixture-middleware', 'next15');
  return response;
}
export const config = { matcher: '/acceptance/:path*' };
