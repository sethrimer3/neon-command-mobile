# Speed of Light RTS

A real-time strategy game built with React, TypeScript, and Vite.

## Setup Instructions

Before running the game for the first time, you must install the dependencies:

```bash
npm install
```

## Development

To start the development server:

```bash
npm run dev
```

The game will be available at `http://localhost:5000/SoL-RTS/`

## Building

To build the game for production:

```bash
npm run build
```

## Other Commands

- `npm run lint` - Run ESLint to check code quality
- `npm run preview` - Preview the production build locally

## Troubleshooting

### "vite: not found" or similar errors

If you see errors about missing commands, make sure you've run `npm install` first to install all dependencies.

### Spark authentication errors in console

The game uses GitHub Spark for optional user authentication. If you see "Failed to fetch user data" errors in the browser console, this is expected in local development and the game will work fine with a generated user ID.
