/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#f3f6f4',
        ink: '#1a1f1c',
        muted: '#5f6b64',
        line: '#d0d8d3',
        surface: '#ffffff',
        accent: '#0f7a6a',
        'accent-soft': '#d8efe9',
        danger: '#c43c2c',
        warning: '#c46a1b',
        // Fun chart / UI accents (avoid purple bias)
        coral: '#e85d4c',
        'coral-soft': '#fde8e4',
        amber: '#e8a317',
        'amber-soft': '#fff3d6',
        sky: '#2a9bb5',
        'sky-soft': '#d9f1f6',
        lime: '#5a9e3e',
        'lime-soft': '#e4f3da',
        rose: '#d4537e',
        'rose-soft': '#fce4ec',
        navy: '#2c4a6e',
        'navy-soft': '#e4ebf3',
        peach: '#e8916a',
        'peach-soft': '#fceee6',
        mint: '#2d9f8a',
        'mint-soft': '#d9f5ef',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 8px 24px -12px rgba(26, 31, 28, 0.18)',
      },
    },
  },
  plugins: [],
};
