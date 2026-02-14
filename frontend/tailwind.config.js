/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Serendie-inspired palette
        serendie: {
          gray: {
            50: '#f8f9fa',
            100: '#f1f3f5',
            200: '#e9ecef',
            300: '#dee2e6',
            400: '#ced4da',
            500: '#adb5bd',
            600: '#868e96',
            700: '#495057',
            800: '#343a40',
            900: '#212529',
          },
          blue: {
            50: '#e7f5ff',
            100: '#d0ebff',
            200: '#a5d8ff',
            300: '#74c0fc',
            400: '#4dabf7',
            500: '#339af0',
            600: '#228be6',
            700: '#1c7ed6',
            800: '#1971c2',
            900: '#1864ab',
          },
          accent: '#6C5CE7',
          success: '#00B894',
          warning: '#FDCB6E',
          danger: '#E17055',
        },
      },
      animation: {
        'float-up': 'floatUp 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'weave': 'weave 3s ease-in-out infinite',
      },
      keyframes: {
        floatUp: {
          '0%': { transform: 'translateY(4px)', opacity: '0.7' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        weave: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
    },
  },
  plugins: [],
};
