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
        bg2:      '#f8f9fc',
        bg3:      '#f1f3f9',
        bg4:      '#e8ebf5',
        card:     '#ffffff',
        card2:    '#fafbfd',
        dborder:  '#e2e6f0',
        dborder2: '#cbd2e0',
        t1:       '#111827',
        t2:       '#4b5563',
        t3:       '#9ca3af',
        accent:   '#2563eb',
        accent2:  '#1d4ed8',
        teal:     '#0d9e74',
        gg:       '#16a34a',
        amber:    '#d97706',
        coral:    '#dc2626',
        purple:   '#7c3aed',
        blue:     '#2563eb',
      },
      fontFamily: {
        sora: ['Inter', 'Sora', 'sans-serif'],
        dm:   ['Inter', 'DM Sans', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
        sm:   '8px',
      },
      boxShadow: {
        card:  '0 1px 3px 0 rgba(0,0,0,0.07), 0 1px 2px -1px rgba(0,0,0,0.05)',
        card2: '0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)',
        menu:  '0 10px 15px -3px rgba(0,0,0,0.10), 0 4px 6px -4px rgba(0,0,0,0.05)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
