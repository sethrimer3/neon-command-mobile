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

The game optionally uses GitHub Spark (https://githubnext.com/projects/spark) for cloud features like user authentication and online multiplayer. If you see "Failed to fetch user data" errors in the browser console during local development, this is expected behavior. The game automatically falls back to using a locally generated user ID, and all features will work normally in single-player and local modes.
