/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg:       '#ffffff',
        bg2:      '#f8f8fc',
        bg3:      '#f2f2f8',
        bg4:      '#eaeaf2',
        card:     '#ffffff',
        card2:    '#fafafa',
        dborder:  '#e2e2ee',
        dborder2: '#d0d0e4',
        t1:       '#18181c',
        t2:       '#52525e',
        t3:       '#9898b0',
        accent:   '#6c5cf7',
        accent2:  '#8471ff',
        teal:     '#0d9e74',
        gg:       '#16a34a',
        amber:    '#d97706',
        coral:    '#e63755',
        purple:   '#7c3aed',
        blue:     '#2563eb',
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
  plugins: [require('@tailwindcss/typography')],
};
