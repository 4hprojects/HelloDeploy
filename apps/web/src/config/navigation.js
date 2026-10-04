// One source for desktop navigation and the mobile drawer.
export const publicNavigation = Object.freeze([
  { label: 'Product', href: '/#product' },
  { label: 'How It Works', href: '/#how-it-works' },
  { label: 'Docs', href: '/docs' },
  { label: 'Supported Apps', href: '/supported-apps' },
  { label: 'Sign In', href: '/auth/sign-in' },
  { label: 'Create Account', href: '/auth/create-account', primary: true },
]);
export const appNavigation = Object.freeze([
  { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  { label: 'Projects', href: '/projects', icon: 'projects' },
  { label: 'Docs', href: '/docs', icon: 'projects' },
]);
export function navigationFor(user, path) {
  return (user ? appNavigation : publicNavigation).map((item) => ({
    ...item,
    active: !item.href.includes('#') && (path === item.href || path.startsWith(`${item.href}/`)),
  }));
}
