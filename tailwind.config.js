/** @type {import('tailwindcss').Config} */
const cor = (nome) => `rgb(var(--${nome}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./desktop-*.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        fundo: cor("fundo"),
        superficie: cor("superficie"),
        elevado: cor("elevado"),
        borda: cor("borda"),
        texto: cor("texto"),
        suave: cor("suave"),
        marca: cor("marca"),
        magenta: cor("magenta"),
        azul: cor("azul"),
        "marca-texto": cor("marca-texto"),
        ok: cor("ok"),
        alerta: cor("alerta"),
        perigo: cor("perigo"),
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: { cartao: "10px" },
    },
  },
  plugins: [],
};
