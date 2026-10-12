/** @type {import('tailwindcss').Config} */
// Replaces the runtime `cdn.tailwindcss.com` script that used to generate these
// utilities in the browser on every launch. The CDN scanned the live DOM, so it
// needed no content globs and no config; a build-time pass has to be told where
// the class names live instead.
//
// Pinned to Tailwind 3.x on purpose. The CDN serves v3, and every class in this
// app was written against v3 semantics. Moving to v4 (which `breeding-app-breeder`
// uses) changes defaults that would silently restyle this app -- bare `border`
// picks up currentColor instead of gray-200, `ring` drops from 3px to 1px, and
// `shadow-sm`/`rounded-sm`/`outline-none` are renamed. That is a separate,
// verifiable change; this one is meant to alter nothing you can see.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
