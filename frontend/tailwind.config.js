/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg:       '#0e0e14',
        bg2:      '#13131c',
        bg3:      '#1a1a28',
        bg4:      '#20202f',
        card:     '#181825',
        card2:    '#1e1e2e',
        dborder:  '#2a2a3d',
        dborder2: '#35354f',
        t1:       '#e8e6f0',
        t2:       '#9390b0',
        t3:       '#5c5a78',
        accent:   '#7c6af8',
        accent2:  '#9d8eff',
        teal:     '#2dd4a0',
        gg:       '#4ade80',
        amber:    '#fbbf24',
        coral:    '#fb7185',
        purple:   '#a78bfa',
        blue:     '#60a5fa',
      },
      fontFamily: {
        sora: ['Sora', 'Inter', 'sans-serif'],
        dm:   ['DM Sans', 'Inter', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
        sm:   '9px',
      },
    },
  },
  plugins: [],
};
