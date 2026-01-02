/** @type {import('next').NextConfig} */
const nextConfig = {
  // Asegurar que los archivos estáticos se sirvan correctamente
  async headers() {
    return [
      {
        source: '/fonts/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig

