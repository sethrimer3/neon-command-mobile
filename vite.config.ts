import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, PluginOption } from "vite";
import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

import sparkPlugin from "@github/spark/spark-vite-plugin";
import createIconImportProxy from "@github/spark/vitePhosphorIconProxyPlugin";
import { resolve } from 'path'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname

// Custom plugin to copy ASSETS directory to dist
function copyAssetsPlugin(): PluginOption {
  return {
    name: 'copy-assets',
    closeBundle() {
      const assetsSource = resolve(projectRoot, 'ASSETS');
      const assetsDest = resolve(projectRoot, 'dist', 'ASSETS');
      
      // Check if source directory exists
      if (!existsSync(assetsSource)) {
        console.warn('⚠ ASSETS directory not found, skipping copy');
        return;
      }
      
      function copyRecursive(src: string, dest: string) {
        mkdirSync(dest, { recursive: true });
        const entries = readdirSync(src);
        
        for (const entry of entries) {
          const srcPath = join(src, entry);
          const destPath = join(dest, entry);
          const stat = statSync(srcPath);
          
          if (stat.isDirectory()) {
            copyRecursive(srcPath, destPath);
          } else {
            copyFileSync(srcPath, destPath);
          }
        }
      }
      
      try {
        copyRecursive(assetsSource, assetsDest);
        console.log('✓ Copied ASSETS directory to dist');
      } catch (error) {
        console.error('✗ Failed to copy ASSETS directory:', error);
        throw error;
      }
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: '/SoL-RTS/',
  plugins: [
    react(),
    tailwindcss(),
    // DO NOT REMOVE
    createIconImportProxy() as PluginOption,
    sparkPlugin() as PluginOption,
    copyAssetsPlugin(),
  ],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src')
    }
  },
});
