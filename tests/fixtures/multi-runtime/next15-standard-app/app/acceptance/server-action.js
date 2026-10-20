'use server';
import { redirect } from 'next/navigation';
export async function action() {
  redirect('/acceptance/action-complete');
}
