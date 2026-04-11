/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        tennis: {
          green: '#2d6a4f',
          'green-light': '#52b788',
          'green-dark': '#1b4332',
          yellow: '#d4e157',
          'yellow-light': '#f9f7d9',
          court: '#8db570',
        }
      }
    }
  },
  plugins: [],
}
