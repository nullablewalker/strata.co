/**
 * PostCSS configuration for Tailwind CSS v4.
 *
 * Tailwind v4 uses a CSS-first configuration model — design tokens and theme
 * customizations live in src/client/styles/index.css via @theme, not in a
 * tailwind.config file. The only PostCSS plugin needed is the official
 * @tailwindcss/postcss bridge, which handles the CSS transformation pipeline.
 */
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
