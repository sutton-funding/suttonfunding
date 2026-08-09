/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './working-capital/index.html',
    './term-loans/index.html',
    './business-line-of-credit/index.html',
    './how-it-works/index.html',
    './about/index.html',
    './contact/index.html',
    './disclosures/index.html'
  ],
  theme: {
    extend: {
      colors: {
        gold: { 400: '#FACC15', 500: '#EAB308', 600: '#CA8A04' },
        slate: { 850: '#151e32', 900: '#0f172a', 950: '#020617' }
      },
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
        serif: ['Playfair Display', 'serif']
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        tilt: 'tilt 10s infinite linear',
        marquee: 'marquee 40s linear infinite'
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' }
        },
        tilt: {
          '0%, 50%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(0.5deg)' },
          '75%': { transform: 'rotate(-0.5deg)' }
        },
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-100%)' }
        }
      }
    }
  },
  plugins: []
};
